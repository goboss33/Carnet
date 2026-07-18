/* Médias Studio liés à la commande (serveur, lecture) — gestion dans /studio. */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Clapperboard } from "lucide-react";

export default async function StudioMedia({ orderId }: { orderId: string }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { tenantId: true } });
  if (!order) return null;
  const s = await getSettings(order.tenantId);
  if (!s.studioEnabled) return null;
  const assets = await prisma.studioAsset.findMany({ where: { orderId }, orderBy: { createdAt: "desc" }, take: 12 });
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Médias Studio</p>
      {assets.length === 0 ? (
        <p className="text-[13px] text-zinc-400">
          Aucun clip lié — ajoute-les dans <Link href="/studio" className="underline">Studio</Link> (ils nourriront les publications).
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
    </div>
  );
}
