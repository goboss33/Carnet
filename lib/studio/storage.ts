/* ---------------------------------------------------------------------------
   Studio — stockage des médias : ingestion (compression 1080p à l'entrée,
   l'original n'est PAS conservé), vignettes, mesure d'espace, purge.
--------------------------------------------------------------------------- */
import path from "path";
import { mkdir, writeFile, unlink, stat, readFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export const studioDir = () => path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

async function probe(abs: string): Promise<{ durationSec: number | null; width: number | null; height: number | null }> {
  try {
    const { stdout } = await exec(FFPROBE, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json", abs,
    ]);
    const j = JSON.parse(stdout);
    return {
      durationSec: j.format?.duration ? Number(j.format.duration) : null,
      width: j.streams?.[0]?.width ?? null,
      height: j.streams?.[0]?.height ?? null,
    };
  } catch {
    return { durationSec: null, width: null, height: null };
  }
}

/** Ingestion d'un média (Buffer brut du téléphone) → compressé + vignette + ligne DB. */
export async function ingestAsset(opts: {
  tenantId: string;
  tenantSlug: string;
  buf: Buffer;
  filename: string;
  orderId?: string | null;
  source?: string;
  note?: string;
}): Promise<{ id: string } | { error: string }> {
  const isVideo = /\.(mp4|mov|m4v|webm|avi|mkv|3gp)$/i.test(opts.filename);
  const isPhoto = /\.(jpe?g|png|webp|heic|heif)$/i.test(opts.filename);
  if (!isVideo && !isPhoto) return { error: "Format non pris en charge (vidéo mp4/mov ou photo jpg/png/webp)." };
  if (opts.buf.length > 500_000_000) return { error: "Fichier trop lourd (max 500 Mo)." };

  const dir = studioDir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // chemins relatifs stockés en base : TOUJOURS en POSIX (slashs), sinon Windows
  // écrit des antislashs que l'URL du navigateur normalise en slashs → 404.
  const base = path.posix.join("studio", opts.tenantSlug, "assets");
  const tmpAbs = path.join(dir, base, `tmp-${id}${path.extname(opts.filename).toLowerCase() || ".bin"}`);
  await mkdir(path.dirname(tmpAbs), { recursive: true });
  await writeFile(tmpAbs, opts.buf);

  try {
    if (isVideo) {
      const rel = path.posix.join(base, `${id}.mp4`);
      const abs = path.join(dir, rel);
      // normalisation 1080p vertical-friendly : on limite la plus grande dimension à 1920
      await exec(FFMPEG, [
        "-y", "-i", tmpAbs,
        "-vf", "scale='if(gt(iw,ih),min(iw,1920),-2)':'if(gt(iw,ih),-2,min(ih,1920))',fps=30",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        abs,
      ], { timeout: 300_000 });
      const thumbRel = path.posix.join(base, `${id}.jpg`);
      await exec(FFMPEG, ["-y", "-ss", "0.5", "-i", abs, "-frames:v", "1", "-vf", "scale=480:-2", path.join(dir, thumbRel)], { timeout: 60_000 });
      const meta = await probe(abs);
      const size = (await stat(abs)).size;
      const a = await prisma.studioAsset.create({
        data: {
          tenantId: opts.tenantId, kind: "VIDEO", filePath: rel, thumbPath: thumbRel,
          durationSec: meta.durationSec, width: meta.width, height: meta.height,
          sizeBytes: size, orderId: opts.orderId ?? null, source: opts.source ?? "web", note: opts.note ?? "",
        },
      });
      return { id: a.id };
    } else {
      const sharp = (await import("sharp")).default;
      const rel = path.posix.join(base, `${id}.webp`);
      const abs = path.join(dir, rel);
      const out = await sharp(opts.buf).rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      await writeFile(abs, out);
      const thumbRel = path.posix.join(base, `${id}-t.webp`);
      await writeFile(path.join(dir, thumbRel), await sharp(out).resize(480, 480, { fit: "inside" }).webp({ quality: 75 }).toBuffer());
      const meta = await sharp(out).metadata();
      const a = await prisma.studioAsset.create({
        data: {
          tenantId: opts.tenantId, kind: "PHOTO", filePath: rel, thumbPath: thumbRel,
          width: meta.width ?? null, height: meta.height ?? null,
          sizeBytes: out.length, orderId: opts.orderId ?? null, source: opts.source ?? "web", note: opts.note ?? "",
        },
      });
      return { id: a.id };
    }
  } catch (e) {
    console.error("studio ingest:", e);
    return { error: "Conversion impossible — le fichier est peut-être corrompu." };
  } finally {
    await unlink(tmpAbs).catch(() => null);
  }
}

export async function deleteAsset(tenantId: string, assetId: string): Promise<{ error?: string }> {
  const a = await prisma.studioAsset.findFirst({ where: { id: assetId, tenantId } });
  if (!a) return { error: "Média introuvable." };
  const { journalAssetIds } = await import("@/lib/journal");
  if ((await journalAssetIds(tenantId)).has(a.id)) return { error: "Utilisé dans une page du site — retire-le d'abord de la page." };
  const dir = studioDir();
  await unlink(path.join(dir, a.filePath)).catch(() => null);
  if (a.thumbPath) await unlink(path.join(dir, a.thumbPath)).catch(() => null);
  await prisma.studioAsset.delete({ where: { id: a.id } });
  return {};
}

/** Espace occupé + purge des médias jamais utilisés plus vieux que N mois. */
export async function studioUsage(tenantId: string) {
  const assets = await prisma.studioAsset.aggregate({ where: { tenantId }, _sum: { sizeBytes: true }, _count: true });
  return { bytes: assets._sum.sizeBytes ?? 0, count: assets._count };
}

export async function purgeUnused(tenantId: string, months = 6): Promise<number> {
  const cutoff = new Date(Date.now() - months * 30 * 86400000);
  const { journalAssetIds } = await import("@/lib/journal");
  const inJournal = await journalAssetIds(tenantId);
  const olds = (await prisma.studioAsset.findMany({
    where: { tenantId, createdAt: { lt: cutoff }, orderId: null },
  })).filter((a) => !inJournal.has(a.id));
  for (const a of olds) await deleteAsset(tenantId, a.id).catch(() => null);
  return olds.length;
}

export async function readAssetFile(tenantId: string, rel: string): Promise<Buffer | null> {
  // sécurité : le chemin doit rester sous studio/ et exister en DB
  if (rel.includes("..")) return null;
  const owned = await prisma.studioAsset.findFirst({ where: { tenantId, OR: [{ filePath: rel }, { thumbPath: rel }] } });
  if (!owned) return null;
  return readFile(path.join(studioDir(), rel)).catch(() => null);
}
