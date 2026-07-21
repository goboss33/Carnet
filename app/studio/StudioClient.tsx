"use client";

/* Studio — onglets Bibliothèque & Publications (à venir). */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, FileText, Images, Upload, Trash2, Link2, X, Wand2, LayoutGrid, List, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/table-kit";
import { cn } from "@/lib/ui";
import { deleteStudioAsset, linkStudioAssets } from "./actions";
import JournalSection, { type EntryRow, type OrderOption } from "./JournalSection";
import PhotoEditor from "./PhotoEditor";
import { MediaTile, TileAction } from "./MediaTile";

export type AssetRow = {
  id: string; kind: "VIDEO" | "PHOTO"; thumb: string; file: string;
  durationSec: number | null; sizeBytes: number; note: string;
  orderId: string | null; createdAt: string; search: string;
};

const fmtDur = (s: number | null) => (s ? `${Math.round(s)}s` : "");
const fmtMb = (b: number) => `${(b / 1e6).toFixed(1)} Mo`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "2-digit" });

/* Sélecteur de commande cherchable (bulk « lier à une commande »). */
function OrderPicker({ orders, value, onChange }: { orders: OrderOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = orders.find((o) => o.id === value);
  const filtered = orders.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-52 max-w-full items-center justify-between gap-1 rounded-lg border border-zinc-300 bg-white px-2 text-[13px] text-zinc-600 hover:border-zinc-400">
        <span className="truncate">{current ? current.label : "Lier à une commande…"}</span>
        <ChevronDown className="size-3.5 shrink-0 text-zinc-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-100 p-1.5">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une commande…" className="h-8 w-full rounded-md border border-zinc-200 px-2 text-[13px] outline-none focus:border-(--color-brand)" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="block w-full px-3 py-1.5 text-left text-[13px] text-zinc-500 hover:bg-zinc-50">— Ne pas lier —</button>
            {filtered.map((o) => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                className={cn("block w-full truncate px-3 py-1.5 text-left text-[13px] hover:bg-zinc-50", o.id === value ? "font-medium text-zinc-900" : "text-zinc-600")}>{o.label}</button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-[12px] text-zinc-400">Aucune commande.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => assets.filter((a) =>
      (fKind === "all" || a.kind === fKind) &&
      (fLink === "all" || (fLink === "linked" ? !!a.orderId : !a.orderId)) &&
      (q.trim() === "" || a.search.includes(q.trim().toLowerCase()))
    ),
    [assets, fKind, fLink, q]
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
        {/* ligne 1 : ajouter (gauche) + bascule de vue (droite) */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload /> {uploading ? "Compression…" : "Ajouter des médias"}
          </Button>
          <input ref={fileInput} type="file" accept="video/*,image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <div className="flex shrink-0 rounded-lg border border-zinc-200 p-0.5">
            <button type="button" title="Mosaïque" aria-label="Mosaïque" onClick={() => chooseView("grid")} className={cn("rounded-md p-1.5 transition-colors", view === "grid" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}><LayoutGrid className="size-4" /></button>
            <button type="button" title="Liste" aria-label="Liste" onClick={() => chooseView("list")} className={cn("rounded-md p-1.5 transition-colors", view === "list" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}><List className="size-4" /></button>
          </div>
        </div>

        {/* ligne 2 : recherche pleine largeur */}
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une photo (cliente, thème, occasion…)" className="h-9 w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-(--color-brand)" />
        </div>

        {/* ligne 3 : filtres */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={fKind} onChange={(e) => setFKind(e.target.value as typeof fKind)} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-[13px]">
            <option value="all">Tous types</option>
            <option value="PHOTO">Photos</option>
            <option value="VIDEO">Vidéos</option>
          </select>
          <select value={fLink} onChange={(e) => setFLink(e.target.value as typeof fLink)} className="h-8 rounded-lg border border-zinc-300 bg-white px-2 text-[13px]">
            <option value="all">Liés + non liés</option>
            <option value="linked">Liés</option>
            <option value="unlinked">Non liés</option>
          </select>
        </div>

        {/* barre d'actions groupées — minimaliste */}
        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-(--color-line) bg-white px-3 py-2 shadow-sm">
            <span className="text-[13px] font-medium text-zinc-700">{selected.length} sélectionné{selected.length > 1 ? "s" : ""}</span>
            <div className="ml-auto flex items-center gap-1">
              <OrderPicker
                orders={orders}
                value={selected.length === 1 ? (selected[0].orderId ?? null) : null}
                onChange={(v) => start(async () => { await linkStudioAssets(selected.map((a) => a.id), v); toast.success("Liaison mise à jour."); router.refresh(); })}
              />
              {onlyPhoto && <Button size="icon-sm" variant="ghost" title="Retoucher" aria-label="Retoucher" onClick={() => setEditId(selected[0].id)}><Wand2 /></Button>}
              <Button size="icon-sm" variant="ghost" title="Supprimer" aria-label="Supprimer" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={pending} onClick={bulkDelete}><Trash2 /></Button>
              <Button size="icon-sm" variant="ghost" title="Annuler la sélection" aria-label="Annuler" onClick={() => setSel({})}><X /></Button>
            </div>
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
