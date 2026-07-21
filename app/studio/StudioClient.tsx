"use client";

/* Studio — onglets Bibliothèque & Publications (à venir). */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, FileText, Images, Upload, Trash2, Link2, X, Wand2, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/table-kit";
import { cn } from "@/lib/ui";
import { deleteStudioAsset, linkStudioAssets, purgeStudioAssets } from "./actions";
import JournalSection, { type EntryRow, type OrderOption } from "./JournalSection";
import PhotoEditor from "./PhotoEditor";
import { MediaTile, TileAction } from "./MediaTile";

export type AssetRow = {
  id: string; kind: "VIDEO" | "PHOTO"; thumb: string; file: string;
  durationSec: number | null; sizeBytes: number; note: string;
  orderId: string | null; createdAt: string;
};

const fmtDur = (s: number | null) => (s ? `${Math.round(s)}s` : "");
const fmtMb = (b: number) => `${(b / 1e6).toFixed(1)} Mo`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" });

export default function StudioClient({
  assets, orders, entries, siteBase, initialTab, pageOrderId,
}: {
  assets: AssetRow[];
  orders: OrderOption[];
  entries: EntryRow[];
  siteBase: string | null;
  initialTab: string;
  pageOrderId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, node } = useConfirm();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const selected = useMemo(() => assets.filter((a) => sel[a.id]), [assets, sel]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [fKind, setFKind] = useState<"all" | "PHOTO" | "VIDEO">("all");
  const [fLink, setFLink] = useState<"all" | "linked" | "unlinked">("all");
  useEffect(() => { const v = localStorage.getItem("studioView"); if (v === "grid" || v === "list") setView(v); }, []);
  const chooseView = (v: "grid" | "list") => { setView(v); try { localStorage.setItem("studioView", v); } catch { /* ignore */ } };
  const shown = useMemo(
    () => assets.filter((a) => (fKind === "all" || a.kind === fKind) && (fLink === "all" || (fLink === "linked" ? !!a.orderId : !a.orderId))),
    [assets, fKind, fLink]
  );
  const onlyPhoto = selected.length === 1 && selected[0].kind === "PHOTO";
  const bulkDelete = () => confirm({
    title: `Supprimer ${selected.length} média${selected.length > 1 ? "s" : ""}`,
    desc: "Définitif. Les médias utilisés dans une page seront ignorés.",
    confirmLabel: "Supprimer",
    action: async () => {
      let ko = 0;
      for (const a of selected) { const r = await deleteStudioAsset(a.id); if (r.error) ko++; }
      if (ko) toast.error(`${ko} média(s) non supprimé(s) (utilisés dans une page).`);
      else toast.success("Média(s) supprimé(s).");
      setSel({}); router.refresh();
    },
  });

  /* --------------------------------------------------------- upload */
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      const res = await fetch("/api/studio/upload", { method: "POST", body: fd });
      if (res.status === 413) throw new Error("Le proxy refuse la taille du fichier — vérifie client_max_body_size dans Nginx Proxy Manager (host carnet).");
      const raw = await res.text();
      let j: { error?: string; results?: { ok: boolean; name: string; error?: string }[] };
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error(`Le proxy a intercepté la requête (réponse non-JSON, statut ${res.status}) — vérifie la config Advanced du host dans NPM.`);
      }
      if (!res.ok) throw new Error(j.error ?? "Échec de l'upload");
      const ko = (j.results ?? []).filter((r) => !r.ok);
      if (ko.length) toast.error(`${ko.length} fichier(s) refusé(s) : ${ko[0].error ?? ""}`);
      else toast.success(`${(j.results ?? []).length} média(s) ajouté(s) — compressés et prêts.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'upload (fichier trop lourd pour le proxy ?)");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Tabs defaultValue={initialTab}>
      {node}
      <TabsList>
        <TabsTrigger value="library"><Images /> Bibliothèque</TabsTrigger>
        <TabsTrigger value="pages"><FileText /> Pages du site</TabsTrigger>
        <TabsTrigger value="posts"><Clapperboard /> Publications</TabsTrigger>
      </TabsList>

      {/* ============================================== PAGES DU SITE */}
      <TabsContent value="pages" className="pt-5">
        <JournalSection
          entries={entries}
          orders={orders}
          photos={assets.filter((a) => a.kind === "PHOTO")}
          siteBase={siteBase}
          openWizardForOrder={pageOrderId}
        />
      </TabsContent>

      {/* ============================================== BIBLIOTHÈQUE */}
      <TabsContent value="library" className="pt-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "Compression…" : "Ajouter des médias"}
          </Button>
          <input ref={fileInput} type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <select value={fKind} onChange={(e) => setFKind(e.target.value as typeof fKind)} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-[13px]">
            <option value="all">Tous types</option>
            <option value="PHOTO">Photos</option>
            <option value="VIDEO">Vidéos</option>
          </select>
          <select value={fLink} onChange={(e) => setFLink(e.target.value as typeof fLink)} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-[13px]">
            <option value="all">Liés + non liés</option>
            <option value="linked">Liés à une commande</option>
            <option value="unlinked">Non liés</option>
          </select>
          <div className="ml-auto flex items-center gap-1">
            <div className="flex rounded-lg border border-zinc-200 p-0.5">
              <button type="button" title="Mosaïque" aria-label="Mosaïque" onClick={() => chooseView("grid")} className={cn("rounded-md p-1.5 transition-colors", view === "grid" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}><LayoutGrid className="size-4" /></button>
              <button type="button" title="Liste" aria-label="Liste" onClick={() => chooseView("list")} className={cn("rounded-md p-1.5 transition-colors", view === "list" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}><List className="size-4" /></button>
            </div>
            <Button
              size="sm" variant="ghost" disabled={pending}
              onClick={() => confirm({ title: "Purger les médias inutilisés de plus de 6 mois", desc: "Les médias liés à une commande ou utilisés dans une page sont conservés.", confirmLabel: "Purger", action: async () => { const r = await purgeStudioAssets(); toast.success(`${r.purged ?? 0} média(s) purgé(s).`); router.refresh(); } })}
            >
              Purge 6 mois+
            </Button>
          </div>
        </div>

        {/* barre d'actions groupées */}
        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-(--color-brand)/40 bg-(--color-brand-soft) px-3 py-2">
            <Badge variant="brand">{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</Badge>
            <span className="text-[13px] text-zinc-600">Lier à :</span>
            <select
              className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-[13px] sm:max-w-xs sm:flex-none"
              value={selected.length === 1 ? (selected[0].orderId ?? "") : ""}
              onChange={(e) => { const v = e.target.value || null; start(async () => { await linkStudioAssets(selected.map((a) => a.id), v); toast.success("Liaison mise à jour."); router.refresh(); }); }}
            >
              <option value="">— commande —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {onlyPhoto && <Button size="sm" variant="outline" onClick={() => setEditId(selected[0].id)}><Wand2 /> Retoucher</Button>}
            <Button size="sm" variant="destructive-outline" disabled={pending} onClick={bulkDelete}><Trash2 /> Supprimer</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel({})}><X /> Annuler</Button>
          </div>
        )}

        {shown.length === 0 ? (
          <EmptyState
            icon={<Images />}
            title={assets.length === 0 ? "Bibliothèque vide" : "Aucun média pour ce filtre"}
            hint={assets.length === 0 ? "Ajoute les clips et photos d'Annie — ils sont compressés automatiquement à l'entrée." : "Change de filtre pour voir d'autres médias."}
          />
        ) : view === "grid" ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {shown.map((a) => (
              <MediaTile
                key={a.id}
                thumb={a.thumb}
                selected={sel[a.id]}
                onClick={() => setSel((s) => ({ ...s, [a.id]: !s[a.id] }))}
                className="aspect-[3/4]"
                badge={
                  <>
                    {a.kind === "VIDEO" && <Badge variant="default" className="bg-black/60 text-white">{fmtDur(a.durationSec)}</Badge>}
                    {a.orderId && <span title="Lié à une commande" className="rounded bg-black/60 p-0.5 text-white"><Link2 className="size-3" /></span>}
                  </>
                }
                footer={<span className="hidden rounded bg-black/60 px-1 text-[10px] text-white group-hover:block">{fmtMb(a.sizeBytes)}</span>}
                actions={
                  <>
                    {a.kind === "PHOTO" && <TileAction icon={<Wand2 />} label="Retoucher" tone="brand" onClick={() => setEditId(a.id)} />}
                    <TileAction icon={<Trash2 />} label="Supprimer" tone="danger"
                      onClick={() => confirm({ title: "Supprimer ce média", desc: "Définitif.", confirmLabel: "Supprimer", action: async () => { const r = await deleteStudioAsset(a.id); if (r.error) toast.error(r.error); setSel((s) => { const n = { ...s }; delete n[a.id]; return n; }); router.refresh(); } })} />
                  </>
                }
              />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-(--color-line) overflow-hidden rounded-xl border border-(--color-line)">
            {shown.map((a) => (
              <div key={a.id} className={cn("flex items-center gap-3 px-3 py-2 transition-colors hover:bg-zinc-50", sel[a.id] && "bg-(--color-brand-soft)")}>
                <input type="checkbox" checked={!!sel[a.id]} onChange={() => setSel((s) => ({ ...s, [a.id]: !s[a.id] }))} className="size-4 shrink-0 accent-(--color-brand)" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumb} alt="" className="h-12 w-9 shrink-0 rounded-md border border-zinc-200 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-800">{a.note || (a.kind === "VIDEO" ? "Clip vidéo" : "Photo")}</p>
                  <p className="text-[11px] text-zinc-400">
                    {a.kind === "VIDEO" ? `Vidéo ${fmtDur(a.durationSec)}` : "Photo"} · {fmtMb(a.sizeBytes)} · {fmtDate(a.createdAt)}{a.orderId ? " · liée" : ""}
                  </p>
                </div>
                {a.kind === "PHOTO" && (
                  <button type="button" title="Retoucher" onClick={() => setEditId(a.id)} className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-(--color-brand)"><Wand2 className="size-4" /></button>
                )}
                <button type="button" title="Supprimer" onClick={() => confirm({ title: "Supprimer ce média", desc: "Définitif.", confirmLabel: "Supprimer", action: async () => { const r = await deleteStudioAsset(a.id); if (r.error) toast.error(r.error); setSel((s) => { const n = { ...s }; delete n[a.id]; return n; }); router.refresh(); } })} className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:text-red-500"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ============================================== PUBLICATIONS (à venir) */}
      <TabsContent value="posts" className="pt-5">
        <EmptyState
          icon={<Clapperboard />}
          title="Publications réseaux sociaux"
          hint="Bientôt : composer un reel depuis la bibliothèque et le publier sur Instagram, YouTube et Facebook."
        />
        <div className="mt-4 flex justify-center">
          <Button disabled title="En préparation — le montage arrive dans une prochaine version">
            <Clapperboard /> Créer une publication
          </Button>
        </div>
      </TabsContent>

      {editId && (() => {
        const a = assets.find((x) => x.id === editId);
        return a ? (
          <PhotoEditor asset={a} onClose={() => setEditId(null)} onKept={() => { setEditId(null); router.refresh(); }} />
        ) : null;
      })()}
    </Tabs>
  );
}
