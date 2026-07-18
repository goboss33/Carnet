import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { studioUsage } from "@/lib/studio/storage";
import Shell from "@/app/components/Shell";
import StudioClient, { type AssetRow } from "./StudioClient";
import { fmtDate } from "@/lib/statuts";

export const dynamic = "force-dynamic";

export default async function Studio() {
  const tenant = await currentTenant();
  const s = await getSettings(tenant.id);
  if (!s.studioEnabled) {
    return (
      <Shell>
        <div className="mx-auto max-w-md py-20 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">Studio est désactivé</h1>
          <p className="mt-2 text-sm text-zinc-500">Active-le dans Réglages → Personnalisation pour gérer tes contenus réseaux sociaux.</p>
        </div>
      </Shell>
    );
  }

  const [assets, usage, orders] = await Promise.all([
    prisma.studioAsset.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    studioUsage(tenant.id),
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION", "LIVRE"] } },
      include: { contact: true },
      orderBy: { eventDate: "desc" },
      take: 30,
    }),
  ]);

  const assetRows: AssetRow[] = assets.map((a) => ({
    id: a.id,
    kind: a.kind,
    thumb: `/api/studio/media/${a.thumbPath || a.filePath}`,
    file: `/api/studio/media/${a.filePath}`,
    durationSec: a.durationSec,
    sizeBytes: a.sizeBytes,
    note: a.note,
    orderId: a.orderId,
    createdAt: a.createdAt.toISOString(),
  }));

  const orderOptions = orders.map((o) => ({
    id: o.id,
    label: `${o.contact.firstName} ${o.contact.lastName} — ${o.occasion || "?"}${o.eventDate ? ` (${fmtDate(o.eventDate)})` : ""}`.trim(),
  }));

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Studio</h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            {usage.count} média{usage.count > 1 ? "s" : ""} · {(usage.bytes / 1e9).toFixed(2)} Go
          </p>
        </div>
      </div>
      <StudioClient assets={assetRows} orders={orderOptions} />
    </Shell>
  );
}
