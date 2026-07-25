/* ---------------------------------------------------------------------------
   Préparation d'images côté navigateur AVANT l'envoi.

   compressImage : canvas → JPEG pour alléger les uploads (photos, justificatifs).
   Garde-fou : on ne descend jamais sous MIN_W de large — une capture d'écran
   très haute (un fil d'e-mail entier fait du 1:16) deviendrait illisible pour
   l'OCR si on bornait bêtement la plus grande dimension.

   tileForOcr : découpe une capture très haute en tuiles lisibles (avec
   recouvrement pour ne couper aucune ligne de texte) — chaque tuile garde sa
   largeur d'origine, donc son texte reste net.
--------------------------------------------------------------------------- */

const MIN_W = 1000; // largeur minimale préservée pour rester lisible

async function toBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

function draw(bmp: ImageBitmap, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas;
}

const toFile = (canvas: HTMLCanvasElement, name: string, quality: number): Promise<File | null> =>
  new Promise((res) =>
    canvas.toBlob((b) => res(b ? new File([b], name, { type: "image/jpeg" }) : null), "image/jpeg", quality)
  );

/** Compression générale (photos d'inspiration, justificatifs). */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await toBitmap(file);
  if (!bmp) return file;
  try {
    // On borne la plus grande dimension, SANS jamais réduire la largeur sous MIN_W.
    let scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (bmp.width * scale < MIN_W) scale = Math.min(1, MIN_W / bmp.width);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = draw(bmp, 0, 0, bmp.width, bmp.height, w, h);
    if (!canvas) return file;
    const out = await toFile(canvas, file.name.replace(/\.\w+$/, "") + ".jpg", quality);
    return out && out.size < file.size ? out : file;
  } finally {
    bmp.close?.();
  }
}

/** Prépare une capture pour l'OCR : largeur préservée, découpée en tuiles si très haute. */
export async function tileForOcr(file: File, maxRatio = 2.2, overlap = 0.06): Promise<File[]> {
  if (!file.type.startsWith("image/")) return [file];
  const bmp = await toBitmap(file);
  if (!bmp) return [file];
  try {
    const w = Math.min(bmp.width, 1600);
    const scale = w / bmp.width;
    const h = Math.round(bmp.height * scale);
    const ratio = h / w;
    if (ratio <= maxRatio) {
      const canvas = draw(bmp, 0, 0, bmp.width, bmp.height, w, h);
      const out = canvas ? await toFile(canvas, "capture.jpg", 0.9) : null;
      return out ? [out] : [file];
    }
    // Trop haute : on découpe en n tuiles qui se recouvrent légèrement.
    const n = Math.min(6, Math.ceil(ratio / maxRatio));
    const tileSrcH = bmp.height / n;
    const over = tileSrcH * overlap;
    const files: File[] = [];
    for (let i = 0; i < n; i++) {
      const sy = Math.max(0, i * tileSrcH - over);
      const sh = Math.min(bmp.height - sy, tileSrcH + 2 * over);
      const dh = Math.round(sh * scale);
      const canvas = draw(bmp, 0, sy, bmp.width, sh, w, dh);
      const f = canvas ? await toFile(canvas, `capture-${i + 1}.jpg`, 0.9) : null;
      if (f) files.push(f);
    }
    return files.length ? files : [file];
  } finally {
    bmp.close?.();
  }
}
