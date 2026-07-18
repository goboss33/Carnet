"use client";

/* Journal — onglet « Pages du site » : liste + parcours guidé en 4 étapes.
   Suggéré partout (IA), validé toujours (Annie). */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Sparkles, ExternalLink, Trash2, Pencil, EyeOff,
  ChevronLeft, ChevronRight, Star, Loader2, X, Play, Images, Upload, Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/table-kit";
import { cn } from "@/lib/ui";
import type { AssetRow } from "./StudioClient";
import {
  suggestEntryAction, suggestStoryAction, suggestAltsAction, checkSlugAction, findKeywordsAction,
  saveJournalEntry, unpublishJournalEntry, deleteJournalEntry, type JournalPayload,
} from "./journal-actions";

export type EntryRow = {
  id: string; type: "CREATION" | "ARTICLE"; status: "BROUILLON" | "PROGRAMMEE" | "PUBLIEE";
  format: "ARTICLE" | "VIDEO" | "DIAPORAMA"; videoAssetId: string; youtubeUrl: string;
  category: string; orderId: string | null; slug: string; title: string;
  metaTitle: string; metaDescription: string; keywords: string[]; story: string;
  coverAssetId: string; images: { assetId: string; alt: string }[];
  scheduledFor: string | null; publishedAt: string | null; updatedAt: string;
};
export type OrderOption = { id: string; label: string; livre: boolean };

const CATEGORIES = [
  { id: "ANNIVERSAIRE", label: "Anniversaire" },
  { id: "MARIAGE", label: "Mariage" },
  { id: "CUPCAKES", label: "Cupcakes" },
  { id: "CONSEILS", label: "Conseils" },
  { id: "ATELIER", label: "Atelier" },
];

const STATUS_BADGE: Record<EntryRow["status"], { label: string; variant: "default" | "warning" | "success" }> = {
  BROUILLON: { label: "Brouillon", variant: "default" },
  PROGRAMMEE: { label: "Programmée", variant: "warning" },
  PUBLIEE: { label: "En ligne", variant: "success" },
};

const fmtDT = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" }) : "";

/* ------------------------------------------------- aperçu markdown minimal */
function inline(s: string) {
  const out: React.ReactNode[] = [];
  s.split(/==(.+?)==/g).forEach((p, i) => {
    if (i % 2) out.push(<span key={`h${i}`} className="rounded-sm bg-pink-200/70 px-0.5">{p}</span>);
    else p.split(/\*\*(.+?)\*\*/g).forEach((q, j) => out.push(j % 2 ? <b key={`b${i}-${j}`}>{q}</b> : q));
  });
  return out;
}
function MdPreview({ md, photoThumbs = [] }: { md: string; photoThumbs?: string[] }) {
  // marqueur posé en tête de paragraphe → bloc isolé (même tolérance que le site)
  const normalized = md.replace(/^[ \t]*(\[\[photo:\d+(?:\|(?:left|right))?\]\])[ \t]*$/gm, "\n$1\n");
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
      {normalized.split(/\n{2,}/).map((b, i) => {
        const t = b.trim();
        const ph = t.match(/^\[\[photo:(\d+)(?:\|(left|right))?\]\]$/);
        if (ph) {
          const src = photoThumbs[Number(ph[1]) - 1];
          if (!src) return <p key={i} className="text-center text-[11px] text-zinc-400">📷 photo {ph[1]} (retirée)</p>;
          const pos = ph[2];
          // eslint-disable-next-line @next/next/no-img-element
          if (pos) return <img key={i} src={src} alt="" className={`my-1 w-2/5 rounded-lg ${pos === "left" ? "float-left mr-3" : "float-right ml-3"}`} />;
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={src} alt="" className="mx-auto max-h-56 rounded-lg" />;
        }
        if (t.startsWith("> ")) {
          return <div key={i} className="clear-both rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px]">✨ {inline(t.replace(/^>\s?/, ""))}</div>;
        }
        if (t.startsWith("## ")) return <h3 key={i} className="pt-1 text-sm font-semibold text-zinc-900">{t.slice(3)}</h3>;
        if (/^[-*] /m.test(t))
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {t.split(/\n/).filter((l) => /^[-*] /.test(l)).map((l, k) => <li key={k}>{inline(l.slice(2))}</li>)}
            </ul>
          );
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

/* ============================================================= section */
export default function JournalSection({
  entries, orders, photos, videos, siteBase, openWizardForOrder,
}: {
  entries: EntryRow[];
  orders: OrderOption[];
  photos: AssetRow[];
  videos: AssetRow[];
  siteBase: string | null; // ex. https://mamangateau.ch/creations
  openWizardForOrder: string | null; // ?page=<orderId> → wizard ouvert pré-rempli
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, node } = useConfirm();
  const [wizard, setWizard] = useState<{ entry: EntryRow | null; orderId: string | null; subject?: string } | null>(
    openWizardForOrder ? { entry: null, orderId: openWizardForOrder } : null
  );

  return (
    <div>
      {node}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setWizard({ entry: null, orderId: null })}><Plus /> Nouvelle page</Button>
        {siteBase && (
          <a href={siteBase} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-zinc-500 hover:text-zinc-800">
            Voir le journal sur le site <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Aucune page pour l'instant"
          hint="Chaque création livrée peut devenir une page du site — et chaque question fréquente un article. C'est ça qui nourrit Google."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-(--color-line) bg-white">
          {entries.map((e, i) => {
            const b = STATUS_BADGE[e.status];
            return (
              <div key={e.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", i > 0 && "border-t border-zinc-100")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{e.title || "(sans titre)"}</p>
                  <p className="truncate text-[12px] text-zinc-400">
                    /{e.slug} · {CATEGORIES.find((c) => c.id === e.category)?.label ?? e.category}
                    {e.status === "PUBLIEE" && e.publishedAt ? ` · en ligne depuis le ${fmtDT(e.publishedAt).split(",")[0]}` : ""}
                    {e.status === "PROGRAMMEE" && e.scheduledFor ? ` · publication le ${fmtDT(e.scheduledFor)}` : ""}
                  </p>
                </div>
                <Badge variant={e.type === "CREATION" ? "brand" : "info"}>{e.type === "CREATION" ? "Création" : "Conseil"}</Badge>
                <Badge variant={b.variant}>{b.label}</Badge>
                <div className="flex items-center gap-1">
                  {e.status === "PUBLIEE" && siteBase && (
                    <a href={`${siteBase}/${e.slug}`} target="_blank" rel="noreferrer" className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" title="Voir la page">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => setWizard({ entry: e, orderId: null })} className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" title="Modifier">
                    <Pencil className="size-4" />
                  </button>
                  {(e.status === "PUBLIEE" || e.status === "PROGRAMMEE") && (
                    <button
                      type="button" disabled={pending} title={e.status === "PUBLIEE" ? "Retirer du site" : "Annuler la programmation"}
                      onClick={() => confirm({
                        title: e.status === "PUBLIEE" ? `Retirer « ${e.title} » du site` : "Annuler la programmation",
                        desc: e.status === "PUBLIEE" ? "La page repasse en brouillon et disparaît du site (elle n'est pas supprimée)." : "La page repasse en brouillon.",
                        confirmLabel: "Confirmer",
                        action: async () => { const r = await unpublishJournalEntry(e.id); if (r.error) toast.error(r.error); else toast.success("Repassée en brouillon."); router.refresh(); },
                      })}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    >
                      <EyeOff className="size-4" />
                    </button>
                  )}
                  <button
                    type="button" disabled={pending} title="Supprimer"
                    onClick={() => confirm({
                      title: `Supprimer « ${e.title || e.slug} »`,
                      desc: e.status === "PUBLIEE" ? "La page est EN LIGNE — elle disparaîtra du site. Définitif." : "Définitif.",
                      confirmLabel: "Supprimer",
                      action: async () => { const r = await deleteJournalEntry(e.id); if (r.error) toast.error(r.error); else toast.success("Supprimée."); router.refresh(); },
                    })}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {wizard && (
        <Wizard
          entry={wizard.entry}
          defaultOrderId={wizard.orderId}
          defaultSubject={wizard.subject ?? null}
          orders={orders}
          photos={photos}
          videos={videos}
          siteBase={siteBase}
          onClose={(refresh) => { setWizard(null); if (refresh) router.refresh(); }}
        />
      )}
    </div>
  );
}

/* ============================================================= wizard */
const STEPS = ["Sujet", "Photos", "Récit", "Publication"] as const;

function Wizard({
  entry, defaultOrderId, defaultSubject, orders, photos, videos, siteBase, onClose,
}: {
  entry: EntryRow | null;
  defaultOrderId: string | null;
  defaultSubject: string | null;
  orders: OrderOption[];
  photos: AssetRow[];
  videos: AssetRow[];
  siteBase: string | null;
  onClose: (refresh: boolean) => void;
}) {
  const isPublished = entry?.status === "PUBLIEE";
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [ai, setAi] = useState<null | "entry" | "story">(null);

  const [type, setType] = useState<"CREATION" | "ARTICLE">(entry?.type ?? (defaultSubject ? "ARTICLE" : "CREATION"));
  const [format, setFormat] = useState<"ARTICLE" | "VIDEO" | "DIAPORAMA">(entry?.format ?? "ARTICLE");
  const [videoAssetId, setVideoAssetId] = useState(entry?.videoAssetId ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(entry?.youtubeUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [orderId, setOrderId] = useState<string | null>(entry?.orderId ?? defaultOrderId);
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [slug, setSlug] = useState(entry?.slug ?? "");
  const [slugState, setSlugState] = useState<"idle" | "checking" | "free" | "taken">(entry ? "free" : "idle");
  const [category, setCategory] = useState(entry?.category ?? "ANNIVERSAIRE");
  const [keywords, setKeywords] = useState<string[]>(entry?.keywords ?? []);
  const [kwInput, setKwInput] = useState("");
  const addKw = (raw: string) => {
    const parts = raw.split(",").map((k) => k.trim()).filter(Boolean);
    if (parts.length) setKeywords((ks) => [...new Set([...ks, ...parts])].slice(0, 8));
    setKwInput("");
  };
  const [story, setStory] = useState(entry?.story ?? "");
  const [selected, setSelected] = useState<string[]>(entry?.images.map((i) => i.assetId) ?? []);
  const [alts, setAlts] = useState<Record<string, string>>(Object.fromEntries((entry?.images ?? []).map((i) => [i.assetId, i.alt])));
  const [cover, setCover] = useState(entry?.coverAssetId ?? "");
  const [altIdeas, setAltIdeas] = useState<string[]>([]);
  const [kwFindings, setKwFindings] = useState<{ specific: { keyword: string; volume: number }[]; local: { keyword: string; volume: number }[]; advice: string | null } | null>(null);
  const [metaTitle, setMetaTitle] = useState(entry?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(entry?.metaDescription ?? "");
  const [publishMode, setPublishMode] = useState<"draft" | "now" | "schedule">(entry?.status === "PROGRAMMEE" ? "schedule" : "draft");
  const [scheduledFor, setScheduledFor] = useState(entry?.scheduledFor ? entry.scheduledFor.slice(0, 16) : "");
  const [showPreview, setShowPreview] = useState(false);

  // vérification du slug en direct (sauf page publiée : adresse figée)
  useEffect(() => {
    if (isPublished || !slug.trim()) { if (!slug.trim()) setSlugState("idle"); return; }
    setSlugState("checking");
    const t = setTimeout(async () => {
      const r = await checkSlugAction(slug, entry?.id);
      setSlug(r.slug);
      setSlugState(r.free ? "free" : "taken");
    }, 500);
    return () => clearTimeout(t);
  }, [slug, isPublished, entry?.id]);

  // photos : celles de la commande d'abord
  const sortedPhotos = useMemo(() => {
    const linked = photos.filter((p) => orderId && p.orderId === orderId);
    const rest = photos.filter((p) => !orderId || p.orderId !== orderId);
    return [...linked, ...rest];
  }, [photos, orderId]);

  const doSuggest = () =>
    start(async () => {
      setAi("entry");
      const r = await suggestEntryAction({ type, orderId: type === "CREATION" ? orderId : null, subject, keywords });
      setAi(null);
      if ("error" in r) { toast.error(r.error); return; }
      setTitle(r.title);
      if (r.slug) setSlug(r.slug);
      setCategory(r.category);
      setMetaTitle(r.metaTitle);
      setMetaDescription(r.metaDescription);
      setAltIdeas(r.altIdeas);
      toast.success("Suggestions prêtes — tout reste modifiable.");
    });

  const doFindKeywords = () =>
    start(async () => {
      setAi("entry");
      const r = await findKeywordsAction({ type, orderId: type === "CREATION" ? orderId : null, subject });
      setAi(null);
      if ("error" in r) { toast.error(r.error); return; }
      setKwFindings(r.findings);
      if (!r.findings.specific.length && !r.findings.local.length) toast("Aucune idée renvoyée — la niche est très locale, tes mots-clés manuels feront l'affaire.");
    });

  const doStory = () =>
    start(async () => {
      setAi("story");
      const body = selected.filter((id) => id !== cover);
      const r = await suggestStoryAction({
        type, format, orderId, subject, title, keywords,
        coverAlt: alts[cover] ?? "",
        photos: body.map((id) => ({ assetId: id, alt: alts[id] ?? "" })),
      });
      setAi(null);
      if (typeof r !== "string") { toast.error(r.error); return; }
      setStory(r);
      toast.success("Brouillon écrit — relis et ajuste avec tes mots.");
    });

  const toggle = (id: string) => {
    setSelected((s) => {
      const has = s.includes(id);
      const next = has ? s.filter((x) => x !== id) : [...s, id];
      if (!has && !alts[id]) setAlts((a) => ({ ...a, [id]: altIdeas[next.length - 1] ?? "" }));
      if (has && cover === id) setCover(next[0] ?? "");
      if (!has && next.length === 1) setCover(id);
      return next;
    });
  };

  const save = () =>
    start(async () => {
      const payload: JournalPayload = {
        id: entry?.id,
        type, format, videoAssetId, youtubeUrl,
        orderId, title, slug, category: category as JournalPayload["category"],
        keywords,
        story,
        coverAssetId: cover,
        images: selected.map((assetId) => ({ assetId, alt: alts[assetId] ?? title })),
        metaTitle, metaDescription,
        publishMode: isPublished ? "now" : publishMode,
        scheduledFor: scheduledFor || null,
      };
      const r = await saveJournalEntry(payload);
      if (r.error) { toast.error(r.error); return; }
      if (isPublished) toast.success("Page mise à jour — le site se rafraîchit.");
      else if (publishMode === "now") toast.success(r.url ? `Publiée 🎉 ${r.url}` : "Publiée 🎉");
      else if (publishMode === "schedule") toast.success("Programmée — le bot te préviendra à la publication.");
      else toast.success("Brouillon enregistré.");
      onClose(true);
    });

  const stepOk = [
    type === "ARTICLE" ? (subject.trim().length > 2 || title.trim().length > 2) : !!orderId,
    format !== "VIDEO" || !!videoAssetId, // vidéo : le clip principal est requis
    true,
    !!title.trim() && !!slug.trim() && slugState !== "taken",
  ][step];

  const saveLabel = isPublished ? "Mettre à jour le site" : publishMode === "now" ? "Publier maintenant" : publishMode === "schedule" ? "Programmer" : "Enregistrer le brouillon";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent title={entry ? `Modifier « ${entry.title || entry.slug} »` : "Nouvelle page du site"} desc="Tout est suggéré, rien ne part sans ta validation." className="max-w-2xl">
        {/* étapes */}
        <div className="mb-4 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s} type="button" onClick={() => i < step && setStep(i)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide",
                i === step ? "bg-(--color-brand) text-white" : i < step ? "bg-(--color-brand-soft) text-(--color-brand)" : "bg-zinc-100 text-zinc-400"
              )}
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {/* ---------------------------------------------- étape 1 : sujet */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {([["CREATION", "Création réalisée", "Le récit d'une commande livrée — galerie en avant"], ["ARTICLE", "Article conseil", "Une question fréquente → une page qui répond"]] as const).map(([id, label, hint]) => (
                <button key={id} type="button" disabled={!!entry} onClick={() => setType(id)} className={cn("flex-1 rounded-lg border px-3 py-2 text-left text-[13px] disabled:opacity-60", type === id ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-zinc-200 hover:border-zinc-300")}>
                  <span className="font-medium text-zinc-900">{label}</span>
                  <span className="block text-[11px] text-zinc-500">{hint}</span>
                </button>
              ))}
            </div>
            <div>
              <Label>Format de la page</Label>
              <div className="flex gap-2">
                {([["ARTICLE", "Article illustré", "photos dans le récit", FileText], ["VIDEO", "Vidéo + texte", "le clip en vedette", Play], ["DIAPORAMA", "Diaporama", "la galerie d'abord", Images]] as const).map(([id, label, hint, Icon]) => (
                  <button key={id} type="button" onClick={() => setFormat(id)} className={cn("flex-1 rounded-lg border px-3 py-2 text-left text-[13px]", format === id ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-zinc-200 hover:border-zinc-300")}>
                    <span className="flex items-center gap-1.5 font-medium text-zinc-900"><Icon className="size-3.5" /> {label}</span>
                    <span className="block text-[11px] text-zinc-500">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            {type === "CREATION" ? (
              <div>
                <Label>Commande source</Label>
                <select value={orderId ?? ""} onChange={(e) => setOrderId(e.target.value || null)} className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-[13px]">
                  <option value="">— choisis la commande —</option>
                  {orders.map((o) => <option key={o.id} value={o.id}>{o.livre ? "✓ " : ""}{o.label}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <Label>Sujet de l'article</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. Combien de parts prévoir pour 25 invités ?" />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={pending || (type === "CREATION" ? !orderId : subject.trim().length < 3)} onClick={doFindKeywords}>
                {ai === "entry" ? <Loader2 className="animate-spin" /> : <Search />} Trouver les mots-clés (volumes)
              </Button>
              <Button variant="outline" size="sm" disabled={pending || (type === "CREATION" ? !orderId : subject.trim().length < 3)} onClick={doSuggest}>
                {ai === "story" ? <Loader2 className="animate-spin" /> : <Sparkles />} Suggérer titre & SEO
              </Button>
            </div>
            {kwFindings && (kwFindings.specific.length > 0 || kwFindings.local.length > 0) && (
              <div className="space-y-2.5 rounded-xl border border-zinc-200 bg-zinc-50/60 px-3 py-2.5">
                {kwFindings.advice && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">💡 {kwFindings.advice}</p>
                )}
                {([["Spécifiques au sujet", kwFindings.specific], ["Génériques & villes (gros volumes)", kwFindings.local]] as const).map(([label, list]) =>
                  list.length ? (
                    <div key={label}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label} — volumes /mois (Suisse), clique pour ajouter</p>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((i) => {
                          const active = keywords.includes(i.keyword);
                          return (
                            <button
                              key={i.keyword} type="button"
                              onClick={() => setKeywords((ks) => (active ? ks.filter((k) => k !== i.keyword) : [...ks, i.keyword].slice(0, 8)))}
                              className={cn(
                                "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                                active ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)" : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400"
                              )}
                            >
                              {i.keyword} <span className={active ? "opacity-70" : "text-zinc-400"}>· {i.volume || "<10"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            )}
            <div>
              <Label>Titre de la page</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Gâteau licorne arc-en-ciel pour les 5 ans de Zelda, à Pully" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Catégorie</Label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2.5 text-[13px]">
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label>Mots-clés visés</Label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2 py-1.5">
                  {keywords.map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 rounded-full bg-(--color-brand-soft) py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-(--color-brand)">
                      {k}
                      <button type="button" aria-label={`Retirer ${k}`} onClick={() => setKeywords((ks) => ks.filter((x) => x !== k))} className="rounded-full p-0.5 hover:bg-black/10">
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={kwInput}
                    onChange={(e) => setKwInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addKw(kwInput); }
                      else if (e.key === "Backspace" && !kwInput) setKeywords((ks) => ks.slice(0, -1));
                    }}
                    onBlur={() => kwInput.trim() && addKw(kwInput)}
                    placeholder={keywords.length ? "Ajouter…" : "gâteau licorne Lausanne…"}
                    className="h-7 min-w-28 flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------------------------------------------- étape 2 : photos */}
        {step === 1 && (
          <div className="space-y-3">
            {format === "VIDEO" && (
              <div>
                <Label>Clip principal (en tête de page)</Label>
                {videos.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-3 text-[13px] text-zinc-400">Aucun clip en bibliothèque — ajoute-le ci-dessous (bouton Ajouter, vidéo acceptée).</p>
                ) : (
                  <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                    {[...videos.filter((v) => orderId && v.orderId === orderId), ...videos.filter((v) => !orderId || v.orderId !== orderId)].map((v) => (
                      <button key={v.id} type="button" onClick={() => setVideoAssetId(videoAssetId === v.id ? "" : v.id)} className={cn("relative aspect-square overflow-hidden rounded-lg border-2 bg-zinc-100", videoAssetId === v.id ? "border-(--color-brand)" : "border-transparent hover:border-zinc-300")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.thumb} alt="" className="h-full w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center"><Play className="size-5 text-white drop-shadow" /></span>
                        {v.durationSec ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{Math.round(v.durationSec)}s</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[12px] text-zinc-500">
                {format === "VIDEO" ? "Photos d'accompagnement (optionnel) — la ★ marque la couverture (l'affiche de la vidéo)." : "Choisis les photos dans l'ordre d'affichage — la ★ marque la couverture."} {orderId ? "Celles de la commande sont en premier." : ""}
              </p>
              <Button size="sm" variant="outline" disabled={uploading} onClick={() => uploadRef.current?.click()}>
                <Upload /> {uploading ? "Envoi…" : "Ajouter"}
              </Button>
              <input
                ref={uploadRef} type="file" multiple className="hidden"
                accept={format === "VIDEO" ? "video/*,image/*" : "image/*"}
                onChange={async (e) => {
                  const files = e.target.files;
                  if (!files?.length) return;
                  setUploading(true);
                  const fd = new FormData();
                  if (orderId) fd.append("orderId", orderId);
                  for (const f of Array.from(files)) fd.append("files", f);
                  try {
                    const res = await fetch("/api/studio/upload", { method: "POST", body: fd });
                    const j = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(j?.error ?? "Échec de l'upload");
                    toast.success("Média(s) ajouté(s) — compressés, la grille se met à jour.");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Échec de l'upload.");
                  } finally {
                    setUploading(false);
                    if (uploadRef.current) uploadRef.current.value = "";
                  }
                }}
              />
              {selected.length > 0 && (
                <Button
                  size="sm" variant="outline" disabled={pending}
                  onClick={() => start(async () => {
                    setAi("entry");
                    const r = await suggestAltsAction(selected);
                    setAi(null);
                    if ("error" in r) { toast.error(String(r.error)); return; }
                    setAlts((a) => {
                      const next = { ...a };
                      for (const [id, alt] of Object.entries(r)) if (!next[id]?.trim()) next[id] = alt;
                      return next;
                    });
                    toast.success("Descriptions suggérées — celles que tu as écrites sont conservées.");
                  })}
                >
                  {ai === "entry" ? <Loader2 className="animate-spin" /> : <Sparkles />} Décrire les photos
                </Button>
              )}
            </div>
            {sortedPhotos.length === 0 ? (
              <EmptyState icon={<FileText />} title="Aucune photo en bibliothèque" hint="Ajoute d'abord les photos dans l'onglet Bibliothèque (compressées automatiquement)." />
            ) : (
              <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {sortedPhotos.map((p) => {
                  const idx = selected.indexOf(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)} className={cn("relative aspect-square overflow-hidden rounded-lg border-2 bg-zinc-100", idx >= 0 ? "border-(--color-brand)" : "border-transparent hover:border-zinc-300")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" />
                      {idx >= 0 && <span className="absolute left-1 top-1 rounded bg-(--color-brand) px-1.5 text-[11px] font-bold text-white">{idx + 1}</span>}
                      {cover === p.id && <Star className="absolute right-1 top-1 size-4 fill-amber-400 text-amber-400" />}
                      {p.orderId === orderId && orderId && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">commande</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {selected.length > 0 && (
              <div className="space-y-2 rounded-xl border border-zinc-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Texte alternatif (description pour Google) — suggéré, à valider</p>
                {selected.map((id) => {
                  const p = photos.find((x) => x.id === id);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p && <img src={p.thumb} alt="" className="size-9 shrink-0 rounded object-cover" />}
                      <Input value={alts[id] ?? ""} onChange={(e) => setAlts((a) => ({ ...a, [id]: e.target.value }))} placeholder="Ex. gâteau licorne pâte à sucre rose et doré" />
                      <button type="button" title="Définir comme couverture" onClick={() => setCover(id)} className={cn("shrink-0 rounded-lg p-1.5", cover === id ? "text-amber-500" : "text-zinc-300 hover:text-zinc-500")}>
                        <Star className={cn("size-4", cover === id && "fill-amber-400")} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------- étape 3 : récit */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Récit de la page (markdown simple : ## pour un sous-titre, **gras**)</Label>
              <Button variant="outline" size="sm" disabled={pending || !title.trim()} onClick={doStory}>
                {ai === "story" ? <Loader2 className="animate-spin" /> : <Sparkles />} {story ? "Réécrire" : "Écrire le brouillon"}
              </Button>
            </div>
            <Textarea rows={12} value={story} onChange={(e) => setStory(e.target.value)} placeholder="Le récit s'écrit ici — ou laisse l'IA proposer un premier jet depuis la commande, puis mets-y tes mots." />
            <button type="button" className="text-[12px] font-medium text-(--color-brand)" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? "Masquer l'aperçu" : "Voir l'aperçu"}
            </button>
            {showPreview && story && <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"><MdPreview md={story} photoThumbs={selected.filter((id) => id !== cover).map((id) => photos.find((p) => p.id === id)?.thumb ?? "")} /></div>}
          </div>
        )}

        {/* ------------------------------------------ étape 4 : publication */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label>Adresse de la page {isPublished && <span className="ml-1 text-[11px] font-normal text-zinc-400">(figée — la page est indexée)</span>}</Label>
              <Input value={slug} readOnly={isPublished} onChange={(e) => setSlug(e.target.value)} className={cn(slugState === "taken" && "border-red-400")} />
              <p className={cn("mt-1 text-[11px]", slugState === "taken" ? "font-medium text-red-600" : "text-zinc-400")}>
                {slugState === "checking" && "Vérification…"}
                {slugState === "free" && `${siteBase ?? "…"}/${slug}`}
                {slugState === "taken" && "Déjà prise — différencie par un angle réel (âge, thème, commune), jamais par un numéro."}
                {slugState === "idle" && "En minuscules avec des tirets — inclut le mot-clé et la localité."}
              </p>
            </div>
            <div>
              <Label>Titre pour Google <span className="font-normal text-zinc-400">({metaTitle.length}/60)</span></Label>
              <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
            </div>
            <div>
              <Label>Description pour Google <span className="font-normal text-zinc-400">({metaDescription.length}/155)</span></Label>
              <Textarea rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
            </div>
            {format === "VIDEO" && (
              <div>
                <Label>URL YouTube <span className="font-normal text-zinc-400">(optionnel — remplace le lecteur natif par la vidéo YouTube)</span></Label>
                <Input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtu.be/…" />
              </div>
            )}
            {isPublished ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">La page est en ligne — « Mettre à jour le site » applique tes modifications immédiatement.</p>
            ) : (
              <div className="space-y-2">
                {([["draft", "Enregistrer en brouillon", "Rien ne part sur le site"], ["now", "Publier maintenant", "La page apparaît tout de suite"], ["schedule", "Programmer", "Le bot publie à l'heure choisie et t'envoie le lien"]] as const).map(([id, label, hint]) => (
                  <label key={id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2", publishMode === id ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-zinc-200")}>
                    <input type="radio" name="pubmode" checked={publishMode === id} onChange={() => setPublishMode(id)} className="accent-(--color-brand)" />
                    <span className="text-[13px] font-medium text-zinc-900">{label}</span>
                    <span className="ml-auto text-[11px] text-zinc-400">{hint}</span>
                  </label>
                ))}
                {publishMode === "schedule" && (
                  <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                )}
              </div>
            )}
          </div>
        )}

        {/* footer */}
        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft /> Précédent</Button>
          {step < 3 ? (
            <Button size="sm" disabled={!stepOk} onClick={() => setStep((s) => s + 1)}>Suivant <ChevronRight /></Button>
          ) : (
            <Button variant="brand" size="sm" disabled={pending || !stepOk} onClick={save}>{pending ? "…" : saveLabel}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
