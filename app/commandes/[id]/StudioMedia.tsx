/* Médias Studio liés à la commande + page du site (Journal) — gestion dans /studio. */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Clapperboard, FileText, ExternalLink } from "lucide-react";

export default async function StudioMedia({ orderId }: { orderId: string }) {
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
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Médias Studio</p>
      {assets.length === 0 ? (
        <p className="text-[13px] text-zinc-400">
          Aucun clip lié — ajoute-les dans <Link href="/studio" className="underline">Studio</Link> (ils nourriront les pages du site et les publications).
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {assets.map((a) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={a.id} src={`/api/studio/media/${a.thumbPath || a.filePath}`} alt="" className="h-20 w-14 rounded-lg border border-zinc-200 object-cover" title={a.kind === "VIDEO" ? `Clip ${Math.round(a.durationSec ?? 0)}s` : "Photo"} />
          ))}
          <Link href="/studio" className="inline-flex h-20 w-14 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600">
            <Clapperboard className="size-4" />
            <span className="text-[10px]">Studio</span>
          </Link>
        </div>
      )}
      <div className="mt-3">
        {page ? (
          <span className="inline-flex flex-wrap items-center gap-2 text-[13px]">
            <FileText className="size-4 text-zinc-400" />
            <span className="text-zinc-600">
              Page du site : <b>{page.title || page.slug}</b> —{" "}
              {page.status === "PUBLIEE" ? "en ligne" : page.status === "PROGRAMMEE" ? "programmée" : "brouillon"}
            </span>
            {page.status === "PUBLIEE" && siteBase && (
              <a href={`${siteBase}/${page.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-(--color-brand) hover:underline">
                Voir <ExternalLink className="size-3.5" />
              </a>
            )}
            <Link href="/studio?tab=pages" className="font-medium text-zinc-500 underline hover:text-zinc-800">Gérer</Link>
          </span>
        ) : order.status === "LIVRE" ? (
          <Link href={`/studio?page=${orderId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-(--color-brand) px-3 py-1.5 text-[13px] font-medium text-(--color-brand) hover:bg-(--color-brand-soft)">
            <FileText className="size-4" /> Créer la page du site (Journal)
          </Link>
        ) : (
          <p className="text-[12px] text-zinc-400">📰 Une fois livrée, cette commande pourra devenir une page du site (Journal).</p>
        )}
      </div>
    </div>
  );
}
