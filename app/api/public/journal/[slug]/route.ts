/* Journal — détail public d'une page publiée (consommée par le site, ISR). */
import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import type { JournalImage } from "@/lib/journal";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const tenant = await currentTenant();
  const e = await prisma.journalEntry.findFirst({ where: { tenantId: tenant.id, slug, status: "PUBLIEE" } });
  if (!e) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const imgs = (e.images as JournalImage[] | null) ?? [];
  const ids = [e.coverAssetId, ...imgs.map((i) => i.assetId)].filter(Boolean);
  const assets = await prisma.studioAsset.findMany({ where: { id: { in: ids }, kind: "PHOTO" } });
  const video = e.videoAssetId
    ? await prisma.studioAsset.findFirst({ where: { id: e.videoAssetId, tenantId: tenant.id, kind: "VIDEO" } })
    : null;
  const byId = new Map(assets.map((a) => [a.id, a]));
  const toImg = (assetId: string, alt: string) => {
    const a = byId.get(assetId);
    return a ? { path: `/api/public/journal-media/${a.filePath}`, thumbPath: `/api/public/journal-media/${a.thumbPath || a.filePath}`, alt, width: a.width, height: a.height } : null;
  };
  return NextResponse.json({
    slug: e.slug,
    type: e.type,
    format: e.format,
    youtubeUrl: e.youtubeUrl,
    video: video
      ? { path: `/api/public/journal-media/${video.filePath}`, width: video.width, height: video.height, durationSec: video.durationSec }
      : null,
    category: e.category,
    title: e.title,
    metaTitle: e.metaTitle,
    metaDescription: e.metaDescription,
    keywords: e.keywords,
    story: e.story,
    publishedAt: e.publishedAt,
    updatedAt: e.updatedAt,
    cover: e.coverAssetId ? toImg(e.coverAssetId, imgs.find((i) => i.assetId === e.coverAssetId)?.alt ?? e.title) : null,
    images: imgs.map((i) => toImg(i.assetId, i.alt)).filter(Boolean),
  });
}
