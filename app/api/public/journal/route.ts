/* Journal — liste publique des pages publiées (consommée par le site, ISR). */
import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import type { JournalImage } from "@/lib/journal";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenant = await currentTenant();
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 60) || 60));
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId: tenant.id, status: "PUBLIEE", ...(category ? { category: category as never } : {}) },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  const assetIds = entries.map((e) => e.coverAssetId).filter(Boolean);
  const assets = await prisma.studioAsset.findMany({ where: { id: { in: assetIds } } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  return NextResponse.json({
    entries: entries.map((e) => {
      const cover = byId.get(e.coverAssetId);
      const imgs = (e.images as JournalImage[] | null) ?? [];
      return {
        slug: e.slug,
        type: e.type,
        category: e.category,
        title: e.title,
        metaDescription: e.metaDescription,
        publishedAt: e.publishedAt,
        cover: cover
          ? { path: `/api/public/journal-media/${cover.thumbPath || cover.filePath}`, alt: imgs.find((i) => i.assetId === cover.id)?.alt ?? e.title, width: cover.width, height: cover.height }
          : null,
      };
    }),
  });
}
