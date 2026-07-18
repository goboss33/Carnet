/* Journal — sert UNIQUEMENT les médias référencés par une page publiée. */
import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { readAssetFile } from "@/lib/studio/storage";
import { publishedAssetIds } from "@/lib/journal";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  const tenant = await currentTenant();
  const asset = await prisma.studioAsset.findFirst({
    where: { tenantId: tenant.id, OR: [{ filePath: rel }, { thumbPath: rel }] },
    select: { id: true },
  });
  if (!asset || !(await publishedAssetIds(tenant.id)).has(asset.id)) return new NextResponse("introuvable", { status: 404 });
  const buf = await readAssetFile(tenant.id, rel);
  if (!buf) return new NextResponse("introuvable", { status: 404 });
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
