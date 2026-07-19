/* ---------------------------------------------------------------------------
   Édition d'image via Gemini — Nano Banana Pro (gemini-3-pro-image).
   Même clé que le reste (GEMINI_API_KEY). Réponse directe (image inline).
   Modèle surchargeable via GEMINI_IMAGE_MODEL.
--------------------------------------------------------------------------- */
const GUARD = " Photorealistic result. Keep the cake perfectly identical — same shape, colors, decorations and text. Never add text, logos or elements that are not present on the original cake.";

export function geminiImageEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Édite une image (data URI) → renvoie le résultat en data URI. Direct. */
export async function editImageGemini(sourceDataUri: string, prompt: string): Promise<{ dataUri: string } | { error: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: "GEMINI_API_KEY non configurée." };
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image";
  const m = sourceDataUri.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!m) return { error: "Image source invalide." };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt.slice(0, 1500) + GUARD }, { inline_data: { mime_type: m[1], data: m[2] } }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      }
    );
    if (!res.ok) {
      console.error("gemini image http", res.status, await res.text().catch(() => ""));
      return { error: `L'édition a échoué (${res.status}).` };
    }
    const j = await res.json();
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p: { inline_data?: { data?: string; mime_type?: string }; inlineData?: { data?: string; mimeType?: string } }) => p.inline_data?.data || p.inlineData?.data);
    const data = img?.inline_data?.data ?? img?.inlineData?.data;
    const mime = img?.inline_data?.mime_type ?? img?.inlineData?.mimeType ?? "image/png";
    return data ? { dataUri: `data:${mime};base64,${data}` } : { error: "Aucune image renvoyée." };
  } catch (e) {
    console.error("gemini image", e);
    return { error: "Gemini ne répond pas — réessaie." };
  }
}
