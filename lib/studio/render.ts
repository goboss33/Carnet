/* ---------------------------------------------------------------------------
   Studio — moteur de montage ffmpeg. Sortie : 1080×1920, 30 fps, MUETTE
   (musique et texte s'ajoutent nativement à la publication — meilleur reach).
   Templates : transformation (hook 1 s → process ×2 → reveal → photo finale)
   et compilation (diaporama animé zoom lent).
--------------------------------------------------------------------------- */
import path from "path";
import { mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { studioDir } from "./storage";

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const W = 1080, H = 1920;

const norm = (extra = "") =>
  `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p${extra}`;

/** Lance le montage en arrière-plan (le statut du post suit : MONTAGE → MONTEE/ERREUR). */
export function renderPostInBackground(postId: string) {
  setTimeout(() => {
    renderPost(postId).catch(async (e) => {
      console.error("studio render:", e);
      await prisma.studioPost.update({ where: { id: postId }, data: { status: "ERREUR", renderError: String(e).slice(0, 300) } }).catch(() => null);
    });
  }, 10);
}

export async function renderPost(postId: string): Promise<void> {
  const post = await prisma.studioPost.findUnique({
    where: { id: postId },
    include: { assets: { include: { asset: true }, orderBy: { position: "asc" } }, },
  });
  if (!post) throw new Error("post introuvable");
  const items = post.assets.map((pa) => pa.asset);
  if (!items.length) throw new Error("aucun média sélectionné");

  await prisma.studioPost.update({ where: { id: postId }, data: { status: "MONTAGE", renderError: "" } });

  const dir = studioDir();
  const outRel = path.join("studio", "renders", `${post.id}.mp4`);
  const outAbs = path.join(dir, outRel);
  await mkdir(path.dirname(outAbs), { recursive: true });

  const inputs: string[] = [];
  const filters: string[] = [];
  const concat: string[] = [];
  let idx = 0;
  const add = (abs: string) => { inputs.push("-i", abs); return idx++; };

  if (post.template === "compilation") {
    // photos (et clips courts) → 2.2 s par élément, zoom lent sur les photos
    for (const a of items.slice(0, 10)) {
      const i = add(path.join(dir, a.filePath));
      if (a.kind === "PHOTO") {
        filters.push(`[${i}:v]${norm()},zoompan=z='min(zoom+0.0012,1.12)':d=66:s=${W}x${H}:fps=30[v${i}]`);
      } else {
        filters.push(`[${i}:v]trim=duration=2.2,${norm()}[v${i}]`);
      }
      concat.push(`[v${i}]`);
    }
  } else {
    // transformation : reveal = dernier VIDEO de la liste (ou dernier média)
    const videos = items.filter((a) => a.kind === "VIDEO");
    const reveal = videos.length ? videos[videos.length - 1] : items[items.length - 1];
    const process = items.filter((a) => a !== reveal && a.kind === "VIDEO");
    const photos = items.filter((a) => a !== reveal && a.kind === "PHOTO");

    // hook : 1 s du reveal
    const hi = add(path.join(dir, reveal.filePath));
    if (reveal.kind === "VIDEO") filters.push(`[${hi}:v]trim=duration=1,${norm()}[vh]`);
    else filters.push(`[${hi}:v]${norm()},zoompan=z='min(zoom+0.003,1.1)':d=30:s=${W}x${H}:fps=30[vh]`);
    concat.push("[vh]");

    // process ×2 (max 3 clips, ~6 s chacun après accélération)
    for (const a of process.slice(0, 3)) {
      const i = add(path.join(dir, a.filePath));
      filters.push(`[${i}:v]setpts=0.5*PTS,trim=duration=6,${norm()}[v${i}]`);
      concat.push(`[v${i}]`);
    }
    // reveal vitesse réelle (max 8 s)
    const ri = add(path.join(dir, reveal.filePath));
    if (reveal.kind === "VIDEO") filters.push(`[${ri}:v]trim=duration=8,${norm()}[vr]`);
    else filters.push(`[${ri}:v]${norm()},zoompan=z='min(zoom+0.0012,1.1)':d=180:s=${W}x${H}:fps=30[vr]`);
    concat.push("[vr]");

    // photo finale 2 s si dispo
    const fin = photos[photos.length - 1];
    if (fin) {
      const i = add(path.join(dir, fin.filePath));
      filters.push(`[${i}:v]${norm()},zoompan=z='min(zoom+0.002,1.08)':d=60:s=${W}x${H}:fps=30[vf]`);
      concat.push("[vf]");
    }
  }

  const filterGraph = `${filters.join(";")};${concat.join("")}concat=n=${concat.length}:v=1:a=0[out]`;
  await exec(FFMPEG, ["-y", ...inputs, "-filter_complex", filterGraph, "-map", "[out]", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-movflags", "+faststart", "-an", outAbs], { timeout: 600_000 });

  await prisma.studioPost.update({ where: { id: postId }, data: { status: "MONTEE", outputPath: outRel } });
}
