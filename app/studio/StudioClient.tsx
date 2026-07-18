"use client";

/* Studio — onglets Bibliothèque & Publications (à venir). */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, FileText, Images, Upload, Trash2, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/table-kit";
import { cn } from "@/lib/ui";
import { deleteStudioAsset, linkStudioAsset, purgeStudioAssets } from "./actions";
import JournalSection, { type EntryRow, type OrderOption } from "./JournalSection";

export type AssetRow = {
  id: string; kind: "VIDEO" | "PHOTO"; thumb: string; file: string;
  durationSec: number | null; sizeBytes: number; note: string;
  orderId: string | null; createdAt: string;
};

const fmtDur = (s: number | null) => (s ? `${Math.round(s)}s` : "");
const fmtMb = (b: number) => `${(b / 1e6).toFixed(1)} Mo`;

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
          videos={assets.filter((a) => a.kind === "VIDEO")}
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
          {selected.length > 0 && (
            <>
              <Badge variant="brand">{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</Badge>
              <Button size="sm" variant="ghost" onClick={() => setSel({})}><X /> Annuler</Button>
            </>
          )}
          <Button
            size="sm" variant="ghost" className="ml-auto" disabled={pending}
            onClick={() => confirm({ title: "Purger les médias inutilisés de plus de 6 mois", desc: "Les médias liés à une commande ou utilisés dans une page sont conservés.", confirmLabel: "Purger", action: async () => { const r = await purgeStudioAssets(); toast.success(`${r.purged ?? 0} média(s) purgé(s).`); router.refresh(); } })}
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
              size="sm" variant="destructive-outline" disabled={pending}
              onClick={() => confirm({ title: "Supprimer ce média", desc: "Définitif.", confirmLabel: "Supprimer", action: async () => { const r = await deleteStudioAsset(selected[0].id); if (r.error) toast.error(r.error); setSel({}); router.refresh(); } })}
            >
              <Trash2 /> Supprimer
            </Button>
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
    </Tabs>
  );
}
