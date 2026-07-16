/* Upload de médias Studio — parsing multipart en STREAMING (busboy) :
   le parseur formData intégré de Next refuse les gros fichiers. */
import { NextRequest, NextResponse } from "next/server";
import Busboy from "busboy";
import { cookies } from "next/headers";
import { currentTenant } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ingestAsset } from "@/lib/studio/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE = 200 * 1024 * 1024; // 200 Mo par fichier

type Incoming = { filename: string; buf: Buffer; truncated: boolean };

function parseMultipart(req: NextRequest): Promise<{ files: Incoming[]; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) return reject(new Error("multipart attendu"));
    const bb = Busboy({ headers: { "content-type": ct }, limits: { fileSize: MAX_FILE, files: 12, fields: 10 } });
    const files: Incoming[] = [];
    const fields: Record<string, string> = {};
    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("limit", () => { truncated = true; });
      stream.on("close", () => files.push({ filename: info.filename ?? "fichier", buf: Buffer.concat(chunks), truncated }));
    });
    bb.on("field", (name, val) => { fields[name] = val; });
    bb.on("error", reject);
    bb.on("close", () => resolve({ files, fields }));
    if (!req.body) return reject(new Error("body vide"));
    // pompe manuelle du flux web vers busboy (Readable.fromWeb est neutralisé par le bundler)
    const reader = (req.body as ReadableStream<Uint8Array>).getReader();
    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) bb.write(Buffer.from(value));
        }
        bb.end();
      } catch (e) {
        bb.destroy(e as Error);
      }
    })();
  });
}

export async function POST(req: NextRequest) {
  // auth manuelle : cette route est hors middleware (limite body 10 Mo contournée)
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token))) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const tenant = await currentTenant();
  const s = await getSettings(tenant.id);
  if (!s.studioEnabled) return NextResponse.json({ error: "Studio désactivé." }, { status: 403 });

  let parsed: Awaited<ReturnType<typeof parseMultipart>>;
  try {
    parsed = await parseMultipart(req);
  } catch (e) {
    console.error("studio upload (busboy):", e, `content-length=${req.headers.get("content-length")}`);
    return NextResponse.json({ error: "Lecture du fichier impossible — regarde les logs (« studio upload »)." }, { status: 400 });
  }
  if (!parsed.files.length) return NextResponse.json({ error: "Aucun fichier." }, { status: 400 });
  const orderId = parsed.fields.orderId || null;

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const f of parsed.files) {
    if (f.truncated) {
      results.push({ name: f.filename, ok: false, error: "Fichier > 200 Mo (tronqué)." });
      continue;
    }
    const r = await ingestAsset({ tenantId: tenant.id, tenantSlug: tenant.slug, buf: f.buf, filename: f.filename, orderId, source: "web" });
    results.push({ name: f.filename, ok: !("error" in r), error: "error" in r ? r.error : undefined });
  }
  return NextResponse.json({ ok: true, results });
}
