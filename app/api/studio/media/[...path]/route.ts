/* Sert les médias Studio (vignettes, sources, rendus) — vérifie la propriété en DB. */
import { NextRequest, NextResponse } from "next/server";
import { currentTenant } from "@/lib/db";
import { readAssetFile } from "@/lib/studio/storage";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = { mp4: "video/mp4", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await ctx.params;
  const rel = parts.join("/");
  const tenant = await currentTenant();
  const buf = await readAssetFile(tenant.id, rel);
  if (!buf) return new NextResponse("introuvable", { status: 404 });
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
