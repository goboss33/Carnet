/* ---------------------------------------------------------------------------
   Édition d'image via fal — Seedream 5.0 Pro Image Editing.
   Met en valeur le gâteau (décor, prise de vue, lumière) SANS le dénaturer.
   Safety checker désactivé (demande utilisateur). Auth : FAL_KEY (env).
   Appel REST synchrone (fal.run) — l'édition prend ~10-30 s.
--------------------------------------------------------------------------- */
import { readAssetFile } from "@/lib/studio/storage";
import { prisma } from "@/lib/db";

export function falEnabled(): boolean {
  return Boolean(process.env.FAL_KEY);
}

/* Presets calibrés : chacun insiste pour garder le gâteau parfaitement
   identique — seuls l'environnement et le cadrage changent. */
export const EDIT_PRESETS: { id: string; label: string; emoji: string; prompt: string }[] = [
  {
    id: "photoshoot", emoji: "📸", label: "Photoshoot présentoir",
    prompt: "Place this exact cake on an elegant white ceramic cake stand for a professional studio photoshoot. Soft neutral beige backdrop, soft diffused window light, high-end pastry photography, shallow depth of field. Keep the cake itself perfectly identical: exact same shape, colors, decorations and text. Do not modify the cake in any way.",
  },
  {
    id: "cleanbg", emoji: "🧹", label: "Nettoyer le fond",
    prompt: "Replace the cluttered background with a clean, soft neutral studio backdrop (warm off-white). Keep the cake and its stand perfectly identical and untouched; only the background changes.",
  },
  {
    id: "studiolight", emoji: "☀️", label: "Lumière studio",
    prompt: "Relight the scene with soft professional studio lighting, balanced exposure, gentle natural shadows, warm inviting tones. Keep the cake, its colors, decorations and text perfectly identical.",
  },
  {
    id: "zoom", emoji: "🔍", label: "Zoom sur un détail",
    prompt: "Create a close-up macro shot focusing on the most detailed decoration of the cake, shallow depth of field, professional food photography. Keep every detail perfectly faithful to the original, do not invent new elements.",
  },
];

const GUARD = " Photorealistic result. Never add text, logos or elements that are not present on the original cake.";
const MODEL = "bytedance/seedream/v5/pro/edit";

/** Soumet une édition à la file fal — renvoie l'id de requête (réponse rapide). */
export async function editSubmit(sourceDataUri: string, prompt: string): Promise<{ requestId: string } | { error: string }> {
  const key = process.env.FAL_KEY;
  if (!key) return { error: "FAL_KEY non configurée." };
  try {
    const res = await fetch(`https://queue.fal.run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        prompt: prompt.slice(0, 1500) + GUARD,
        image_urls: [sourceDataUri],
        image_size: "auto_2K",
        num_images: 1,
        output_format: "jpeg",
        enable_safety_checker: false,
      }),
    });
    if (!res.ok) {
      console.error("fal submit http", res.status, await res.text().catch(() => ""));
      return { error: `L'envoi a échoué (${res.status}).` };
    }
    const j = await res.json();
    return j?.request_id ? { requestId: j.request_id } : { error: "fal n'a pas renvoyé d'identifiant." };
  } catch (e) {
    console.error("fal submit", e);
    return { error: "fal ne répond pas — réessaie dans un instant." };
  }
}

/** Interroge la file fal — { pending } tant que ça travaille, { url } au bout. */
export async function editPoll(requestId: string): Promise<{ pending?: boolean; url?: string; error?: string }> {
  const key = process.env.FAL_KEY;
  if (!key) return { error: "FAL_KEY non configurée." };
  if (!/^[\w-]{6,80}$/.test(requestId)) return { error: "Identifiant invalide." };
  try {
    const st = await fetch(`https://queue.fal.run/${MODEL}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!st.ok) return { error: `Statut indisponible (${st.status}).` };
    const sj = await st.json();
    if (sj?.status !== "COMPLETED") return { pending: true };
    const rj = await fetch(`https://queue.fal.run/${MODEL}/requests/${requestId}`, {
      headers: { Authorization: `Key ${key}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!rj.ok) return { error: `Résultat indisponible (${rj.status}).` };
    const j = await rj.json();
    const url = j?.images?.[0]?.url;
    return url ? { url } : { error: "Aucune image renvoyée." };
  } catch (e) {
    console.error("fal poll", e);
    return { error: "fal ne répond pas — réessaie." };
  }
}

/** Charge un asset Studio en data URI (pour l'envoyer à fal). */
export async function assetDataUri(tenantId: string, assetId: string): Promise<string | null> {
  const a = await prisma.studioAsset.findFirst({ where: { id: assetId, tenantId }, select: { filePath: true } });
  if (!a) return null;
  const buf = await readAssetFile(tenantId, a.filePath);
  if (!buf) return null;
  return `data:image/webp;base64,${buf.toString("base64")}`;
}
