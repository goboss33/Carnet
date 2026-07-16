"use client";

/* Studio — onglets Publications & Bibliothèque. */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clapperboard, Images, Upload, Trash2, Link2, Film, RefreshCw,
  CheckCircle2, CalendarClock, Sparkles, Play, X,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/table-kit";
import { cn } from "@/lib/ui";
import {
  createStudioPost, rerenderStudioPost, saveStudioPost, regenStudioCaption,
  markStudioPublished, deleteStudioPost, deleteStudioAsset, linkStudioAsset, purgeStudioAssets,
} from "./actions";

export type AssetRow = {
  id: string; kind: "VIDEO" | "PHOTO"; thumb: string; file: string;
  durationSec: number | null; sizeBytes: number; note: string;
  orderId: string | null; used: boolean; createdAt: string;
};
export type PostRow = {
  id: string; title: string; template: string; status: string;
  caption: string; hashtags: string; output: string | null; renderError: string;
  scheduledFor: string | null; publishedAt: string | null; thumbs: string[];
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "info" | "warning" | "brand" | "success" | "danger" }> = {
  BROUILLON: { label: "Brouillon", variant: "default" },
  MONTAGE: { label: "Montage…", variant: "info" },
  MONTEE: { label: "Montée", variant: "brand" },
  PROGRAMMEE: { label: "Programmée", variant: "warning" },
  PUBLIEE: { label: "Publiée", variant: "success" },
  ERREUR: { label: "Erreur", variant: "danger" },
};

const fmtDur = (s: number | null) => (s ? `${Math.round(s)}s` : "");
const fmtMb = (b: number) => `${(b / 1e6).toFixed(1)} Mo`;

export default function StudioClient({ assets, posts, orders }: { assets: AssetRow[]; posts: PostRow[]; orders: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, node } = useConfirm();
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PostRow | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const selected = useMemo(() => assets.filter((a) => sel[a.id]), [assets, sel]);

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

  /* -------------------------------------------------------- création */
  const [tpl, setTpl] = useState("transformation");
  const [title, setTitle] = useState("");
  const doCreate = () =>
    start(async () => {
      const r = await createStudioPost({ template: tpl, title, assetIds: selected.map((a) => a.id) });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Publication créée — montage lancé, légende en cours d'écriture.");
        setCreating(false);
        setSel({});
        setTitle("");
        router.refresh();
      }
    });

  return (
    <Tabs defaultValue="posts">
      {node}
      <TabsList>
        <TabsTrigger value="posts"><Clapperboard /> Publications</TabsTrigger>
        <TabsTrigger value="library"><Images /> Bibliothèque</TabsTrigger>
      </TabsList>

      {/* ============================================== PUBLICATIONS */}
      <TabsContent value="posts" className="pt-5">
        {posts.length === 0 ? (
          <EmptyState icon={<Clapperboard />} title="Aucune publication" hint="Va dans Bibliothèque, sélectionne des médias et crée ta première publication." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {posts.map((p) => {
              const b = STATUS_BADGE[p.status] ?? STATUS_BADGE.BROUILLON;
              return (
                <div key={p.id} className="rounded-xl border border-(--color-line) bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{p.title || "(sans titre)"}</p>
                    <Badge variant={b.variant}>{b.label}</Badge>
                  </div>
                  <div className="mb-3 flex gap-1">
                    {p.thumbs.map((t, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={t} alt="" className="h-14 w-10 rounded object-cover" />
                    ))}
                    <span className="ml-auto self-end text-[11px] text-zinc-400">{p.template}</span>
                  </div>
                  {p.status === "ERREUR" && <p className="mb-2 text-xs text-red-600">{p.renderError}</p>}
                  {p.scheduledFor && p.status !== "PUBLIEE" && (
                    <p className="mb-2 text-xs text-zinc-500">📅 prévu : {new Date(p.scheduledFor).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {p.output && (
                      <Button size="sm" variant="outline" onClick={() => setPreview(p.output)}>
                        <Play /> Voir
                      </Button>
                    )}
                    {p.output && (
                      <a href={p.output} download={`${p.title || p.id}.mp4`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 text-[13px] font-medium text-zinc-700 hover:border-zinc-400 [&_svg]:size-3.5">
                        <Film /> mp4
                      </a>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Légende & date</Button>
                    {(p.status === "ERREUR" || p.status === "MONTEE") && (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await rerenderStudioPost(p.id); toast.success("Montage relancé."); router.refresh(); })}>
                        <RefreshCw />
                      </Button>
                    )}
                    {p.status !== "PUBLIEE" && p.output && (
                      <Button size="sm" variant="brand" disabled={pending} onClick={() => start(async () => { await markStudioPublished(p.id); toast.success("Marquée publiée 🎉"); router.refresh(); })}>
                        <CheckCircle2 /> Publiée
                      </Button>
                    )}
                    <Button
                      size="sm" variant="ghost" className="text-red-600" disabled={pending}
                      onClick={() => confirm({ title: `Supprimer « ${p.title || "publication"} »`, desc: "Le montage est supprimé, les médias restent en bibliothèque.", confirmLabel: "Supprimer", action: async () => { await deleteStudioPost(p.id); router.refresh(); } })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      {/* ============================================== BIBLIOTHÈQUE */}
      <TabsContent value="library" className="pt-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "Compression…" : "Ajouter des médias"}
          </Button>
          <input ref={fileInput} type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          {selected.length > 0 && (
            <>
              <Badge variant="brand">{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</Badge>
              <Button size="sm" variant="brand" onClick={() => setCreating(true)}>
                <Clapperboard /> Créer une publication
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSel({})}><X /> Annuler</Button>
            </>
          )}
          <Button
            size="sm" variant="ghost" className="ml-auto" disabled={pending}
            onClick={() => confirm({ title: "Purger les médias inutilisés de plus de 6 mois", desc: "Les médias liés à une publication sont conservés.", confirmLabel: "Purger", action: async () => { const r = await purgeStudioAssets(); toast.success(`${r.purged ?? 0} média(s) purgé(s).`); router.refresh(); } })}
          >
            Purge 6 mois+
          </Button>
        </div>

        {assets.length === 0 ? (
          <EmptyState icon={<Images />} title="Bibliothèque vide" hint="Ajoute les clips et photos d'Annie — ils sont compressés automatiquement à l'entrée." />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSel((s) => ({ ...s, [a.id]: !s[a.id] }))}
                className={cn(
                  "group relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-zinc-100 text-left",
                  sel[a.id] ? "border-(--color-brand)" : "border-transparent hover:border-zinc-300"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumb} alt="" className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 flex items-center gap-1">
                  {a.kind === "VIDEO" && <Badge variant="default" className="bg-black/60 text-white">{fmtDur(a.durationSec)}</Badge>}
                  {a.orderId && <span title="Lié à une commande" className="rounded bg-black/60 p-0.5 text-white"><Link2 className="size-3" /></span>}
                  {a.used && <span title="Utilisé dans une publication" className="rounded bg-emerald-600/80 p-0.5 text-white"><Clapperboard className="size-3" /></span>}
                </span>
                <span className="absolute bottom-1 right-1 hidden rounded bg-black/60 px-1 text-[10px] text-white group-hover:block">{fmtMb(a.sizeBytes)}</span>
                {sel[a.id] && <span className="absolute inset-0 bg-(--color-brand)/15" />}
              </button>
            ))}
          </div>
        )}

        {selected.length === 1 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-(--color-line) bg-white px-4 py-2.5">
            <span className="text-[13px] text-zinc-600">Média sélectionné :</span>
            <select
              className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-[13px]"
              defaultValue={selected[0].orderId ?? ""}
              onChange={(e) => start(async () => { await linkStudioAsset(selected[0].id, e.target.value || null); toast.success("Liaison mise à jour."); router.refresh(); })}
            >
              <option value="">— non lié à une commande —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <Button
              size="sm" variant="destructive-outline" disabled={pending || selected[0].used}
              title={selected[0].used ? "Utilisé dans une publication" : undefined}
              onClick={() => confirm({ title: "Supprimer ce média", desc: "Définitif.", confirmLabel: "Supprimer", action: async () => { const r = await deleteStudioAsset(selected[0].id); if (r.error) toast.error(r.error); setSel({}); router.refresh(); } })}
            >
              <Trash2 /> Supprimer
            </Button>
          </div>
        )}
      </TabsContent>

      {/* ------------------------------------------------ dialog création */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        {creating && (
          <DialogContent title="Créer une publication" desc={`${selected.length} média(s) — l'ordre de sélection devient l'ordre de montage.`}>
            <div className="space-y-4">
              <div>
                <Label>Template</Label>
                <div className="flex gap-2">
                  {[
                    { id: "transformation", label: "Transformation", hint: "hook → process ×2 → reveal" },
                    { id: "compilation", label: "Compilation", hint: "diaporama animé (photos)" },
                  ].map((t) => (
                    <button key={t.id} type="button" onClick={() => setTpl(t.id)} className={cn("flex-1 rounded-lg border px-3 py-2 text-left text-[13px]", tpl === t.id ? "border-(--color-brand) bg-(--color-brand-soft)" : "border-zinc-200 hover:border-zinc-300")}>
                      <span className="font-medium text-zinc-900">{t.label}</span>
                      <span className="block text-[11px] text-zinc-500">{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Titre interne</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Axolotl de Zelda — transformation" />
              </div>
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-[12px] text-zinc-500">
                <Sparkles className="mr-1 inline size-3.5" /> Montage automatique (muet — musique et texte s'ajoutent dans Instagram/YouTube à la publication) et légende générée depuis la commande liée.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Annuler</Button>
                <Button variant="brand" size="sm" disabled={pending || !selected.length} onClick={doCreate}>{pending ? "…" : "Créer & monter"}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* ------------------------------------------------ dialog édition */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing.title || "Publication"} desc="Légende, hashtags et date prévue." className="max-w-lg">
            <form
              action={async (fd) => {
                const r = await saveStudioPost(editing.id, fd);
                if (r.error) toast.error(r.error);
                else { toast.success("Enregistré."); setEditing(null); router.refresh(); }
              }}
              className="space-y-3"
            >
              <div><Label>Titre</Label><Input name="title" defaultValue={editing.title} /></div>
              <div>
                <div className="flex items-center justify-between"><Label>Légende</Label>
                  <button type="button" className="text-[11px] font-medium text-(--color-brand)" onClick={() => start(async () => { await regenStudioCaption(editing.id); toast.success("Légende régénérée."); setEditing(null); router.refresh(); })}>
                    <Sparkles className="mr-0.5 inline size-3" /> Régénérer
                  </button>
                </div>
                <Textarea name="caption" rows={5} defaultValue={editing.caption} />
              </div>
              <div><Label>Hashtags</Label><Textarea name="hashtags" rows={2} defaultValue={editing.hashtags} /></div>
              <div>
                <Label><CalendarClock className="mr-1 inline size-3.5" />Prévu pour</Label>
                <Input name="scheduledFor" type="datetime-local" defaultValue={editing.scheduledFor ? editing.scheduledFor.slice(0, 16) : ""} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>Fermer</Button>
                <Button size="sm">Enregistrer</Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* ------------------------------------------------ preview vidéo */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        {preview && (
          <DialogContent title="Aperçu" className="max-w-sm">
            <video src={preview} controls autoPlay className="max-h-[70vh] w-full rounded-lg bg-black" />
          </DialogContent>
        )}
      </Dialog>
    </Tabs>
  );
}
