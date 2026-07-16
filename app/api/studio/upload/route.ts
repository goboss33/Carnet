/* Upload de médias Studio (multipart) — accepte plusieurs fichiers, compressés à l'ingestion. */
import { NextRequest, NextResponse } from "next/server";
import { currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { ingestAsset } from "@/lib/studio/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const tenant = await currentTenant();
  const s = await getSettings(tenant.id);
  if (!s.studioEnabled) return NextResponse.json({ error: "Studio désactivé." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide (fichier trop lourd pour le proxy ?)" }, { status: 400 });
  const orderId = String(form.get("orderId") ?? "") || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "Aucun fichier." }, { status: 400 });

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const f of files.slice(0, 12)) {
    const buf = Buffer.from(await f.arrayBuffer());
    const r = await ingestAsset({ tenantId: tenant.id, tenantSlug: tenant.slug, buf, filename: f.name, orderId, source: "web" });
    results.push({ name: f.name, ok: !("error" in r), error: "error" in r ? r.error : undefined });
  }
  return NextResponse.json({ ok: true, results });
}
