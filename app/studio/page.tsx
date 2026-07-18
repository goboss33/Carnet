import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { studioUsage } from "@/lib/studio/storage";
import Shell from "@/app/components/Shell";
import StudioClient, { type AssetRow } from "./StudioClient";
import type { EntryRow } from "./JournalSection";
import type { JournalImage } from "@/lib/journal";
import { fmtDate } from "@/lib/statuts";

export const dynamic = "force-dynamic";

export default async function Studio({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const sp = await searchParams;
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

  const [assets, usage, orders, journal] = await Promise.all([
    prisma.studioAsset.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    studioUsage(tenant.id),
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION", "LIVRE"] } },
      include: { contact: true },
      orderBy: { eventDate: "desc" },
      take: 60,
    }),
    prisma.journalEntry.findMany({ where: { tenantId: tenant.id }, orderBy: { updatedAt: "desc" }, take: 100 }),
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
    livre: o.status === "LIVRE",
  }));

  const entryRows: EntryRow[] = journal.map((e) => ({
    id: e.id,
    type: e.type,
    status: e.status,
    category: e.category,
    orderId: e.orderId,
    slug: e.slug,
    title: e.title,
    metaTitle: e.metaTitle,
    metaDescription: e.metaDescription,
    keywords: e.keywords,
    story: e.story,
    coverAssetId: e.coverAssetId,
    images: ((e.images as JournalImage[] | null) ?? []).map((i) => ({ assetId: i.assetId, alt: i.alt ?? "" })),
    scheduledFor: e.scheduledFor ? e.scheduledFor.toISOString() : null,
    publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
    updatedAt: e.updatedAt.toISOString(),
  }));

  const siteBase = s.siteUrl ? `${s.siteUrl}/${s.sitePathPrefix}` : null;
  const initialTab = sp.page ? "pages" : sp.tab === "pages" ? "pages" : sp.tab === "posts" ? "posts" : "library";

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
      <StudioClient assets={assetRows} orders={orderOptions} entries={entryRows} siteBase={siteBase} initialTab={initialTab} pageOrderId={sp.page ?? null} />
    </Shell>
  );
}
