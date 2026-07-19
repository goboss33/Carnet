/* Journal — sert UNIQUEMENT les médias référencés par une page publiée. */
import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { readAssetFile } from "@/lib/studio/storage";
import { publishedAssetIds } from "@/lib/journal";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", mp4: "video/mp4" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
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
  const base = {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    "Accept-Ranges": "bytes",
  };
  // Range (seek vidéo) : réponse partielle 206
  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, buf.length - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
    if (isNaN(start) || start >= buf.length || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${buf.length}` } });
    }
    return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(new Uint8Array(buf), { headers: { ...base, "Content-Length": String(buf.length) } });
}
