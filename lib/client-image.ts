/* ---------------------------------------------------------------------------
   Compression d'image côté navigateur, AVANT l'envoi au serveur : canvas →
   JPEG. Une photo de téléphone (5-10 Mo) part en ~300-600 Ko — uploads
   rapides, plus aucune limite de body touchée. Non-images (PDF…), formats
   illisibles (HEIC selon navigateur) ou résultat plus lourd → fichier
   original inchangé, le serveur reste le filet de sécurité.
--------------------------------------------------------------------------- */

export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // pas mieux → on garde l'original
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
