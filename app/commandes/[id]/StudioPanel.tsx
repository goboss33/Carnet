/* Carte latérale « Contenu & Journal » — médias liés à la commande (upload
   direct) + état de la page du site. Gestion complète dans /studio. */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Clapperboard, FileText, ExternalLink } from "lucide-react";
import StudioUploader from "./StudioUploader";

export default async function StudioPanel({ orderId }: { orderId: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { tenantId: true, status: true } });
  if (!order) return null;
  const s = await getSettings(order.tenantId);
  if (!s.studioEnabled) return null;
  const [assets, page] = await Promise.all([
    prisma.studioAsset.findMany({ where: { orderId }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.journalEntry.findFirst({ where: { tenantId: order.tenantId, orderId } }),
  ]);
  const siteBase = s.siteUrl ? `${s.siteUrl}/${s.sitePathPrefix}` : null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Contenu & Journal</p>
        <Link href="/studio" className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">Contenu →</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {assets.map((a) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={a.id}
            src={`/api/studio/media/${a.thumbPath || a.filePath}`}
            alt=""
            className="h-20 w-14 rounded-lg border border-zinc-200 object-cover"
            title={a.kind === "VIDEO" ? `Clip ${Math.round(a.durationSec ?? 0)}s` : "Photo"}
          />
        ))}
        <StudioUploader orderId={orderId} />
      </div>
      {assets.length === 0 && (
        <p className="mt-2 text-[12px] text-zinc-400">Photos du gâteau fini, clips d'atelier — compressés à l'entrée, liés à cette commande.</p>
      )}

      <div className="mt-4 border-t border-zinc-100 pt-3">
        {page ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <FileText className="size-4 shrink-0 text-zinc-400" />
            <span className="min-w-0 flex-1 truncate text-zinc-600" title={page.title || page.slug}>
              {page.title || page.slug}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${page.status === "PUBLIEE" ? "bg-emerald-50 text-emerald-700" : page.status === "PROGRAMMEE" ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500"}`}>
              {page.status === "PUBLIEE" ? "En ligne" : page.status === "PROGRAMMEE" ? "Programmée" : "Brouillon"}
            </span>
            {page.status === "PUBLIEE" && siteBase && (
              <a href={`${siteBase}/${page.slug}`} target="_blank" rel="noreferrer" title="Voir la page" className="text-(--color-brand) hover:opacity-75">
                <ExternalLink className="size-4" />
              </a>
            )}
            <Link href="/studio?tab=pages" className="text-xs font-semibold text-zinc-500 underline hover:text-zinc-800">Gérer</Link>
          </div>
        ) : order.status === "LIVRE" ? (
          <Link href={`/studio?page=${orderId}`} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-(--color-brand) px-3 py-2 text-[13px] font-medium text-(--color-brand) hover:bg-(--color-brand-soft)">
            <FileText className="size-4" /> Créer la page du site (Journal)
          </Link>
        ) : (
          <p className="flex items-center gap-1.5 text-[12px] text-zinc-400"><Clapperboard className="size-3.5" /> Une fois livrée, cette commande pourra devenir une page du site.</p>
        )}
      </div>
    </div>
  );
}
