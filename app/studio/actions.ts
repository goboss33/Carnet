"use server";

/* Studio — server actions (module isolé) : bibliothèque de médias. */

import { revalidatePath } from "next/cache";
import { prisma, currentTenant } from "@/lib/db";
import { deleteAsset, purgeUnused } from "@/lib/studio/storage";

export async function deleteStudioAsset(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const r = await deleteAsset(tenant.id, id);
  revalidatePath("/studio");
  return r;
}

export async function linkStudioAsset(id: string, orderId: string | null): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  if (orderId) {
    const o = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id } });
    if (!o) return { error: "Commande introuvable." };
  }
  await prisma.studioAsset.updateMany({ where: { id, tenantId: tenant.id }, data: { orderId } });
  revalidatePath("/studio");
  return {};
}

export async function purgeStudioAssets(): Promise<{ error?: string; purged?: number }> {
  const tenant = await currentTenant();
  const n = await purgeUnused(tenant.id, 6);
  revalidatePath("/studio");
  return { purged: n };
}

/* ---------------------------------------------------- édition IA (fal) */

export async function aiEditSubmit(assetId: string, opts: { model?: "gemini" | "seedream"; presetId?: string; prompt?: string; imageDataUri?: string }): Promise<{ error?: string; requestId?: string; url?: string }> {
  const tenant = await currentTenant();
  const { EDIT_PRESETS, assetDataUri } = await import("@/lib/fal-edit");
  const { logAiCall } = await import("@/lib/ai-log");
  const prompt = opts.presetId ? (EDIT_PRESETS.find((p) => p.id === opts.presetId)?.prompt ?? "") : (opts.prompt ?? "");
  if (prompt.trim().length < 4) return { error: "Décris ce que tu veux modifier." };
  let dataUri = opts.imageDataUri;
  if (dataUri) {
    if (!dataUri.startsWith("data:image/") || dataUri.length > 12_000_000) return { error: "Image annotée invalide." };
  } else {
    dataUri = (await assetDataUri(tenant.id, assetId)) ?? undefined;
  }
  if (!dataUri) return { error: "Photo introuvable." };
  const zones = opts.imageDataUri ? "[image annotée par zones] " : "";
  const t0 = Date.now();

  if (opts.model === "seedream") {
    const { falEnabled, editSubmit } = await import("@/lib/fal-edit");
    if (!falEnabled()) return { error: "Seedream non configuré (FAL_KEY à ajouter dans Portainer)." };
    const r = await editSubmit(dataUri, prompt);
    logAiCall("image.edit", "Seedream 5.0 Pro — édition d'image (fal)", `${zones}${prompt}`,
      "error" in r ? r.error : `Envoyée à la file fal (req ${r.requestId}).`, !("error" in r), Date.now() - t0);
    return "error" in r ? { error: r.error } : { requestId: r.requestId };
  }

  // défaut : Nano Banana Pro (Gemini), réponse directe
  const { geminiImageEnabled, editImageGemini } = await import("@/lib/gemini-image");
  if (!geminiImageEnabled()) return { error: "Nano Banana non configuré (GEMINI_API_KEY manquante)." };
  const r = await editImageGemini(dataUri, prompt);
  logAiCall("image.gemini", "Nano Banana Pro — édition d'image (Gemini)", `${zones}${prompt}`,
    "error" in r ? r.error : "Image générée.", !("error" in r), Date.now() - t0);
  return "error" in r ? { error: r.error } : { url: r.dataUri };
}

export async function aiEditPoll(requestId: string): Promise<{ error?: string; pending?: boolean; url?: string }> {
  await currentTenant();
  const { editPoll } = await import("@/lib/fal-edit");
  return editPoll(requestId);
}

export async function aiEditKeep(sourceAssetId: string, url: string, note: string): Promise<{ error?: string; id?: string }> {
  const tenant = await currentTenant();
  const isFal = /^https:\/\/[\w.-]*fal\.(media|run|ai)\//.test(url);
  const isData = url.startsWith("data:image/");
  if (!isFal && !isData) return { error: "Source invalide." };
  const src = await prisma.studioAsset.findFirst({ where: { id: sourceAssetId, tenantId: tenant.id }, select: { orderId: true } });
  try {
    let buf: Buffer;
    if (isData) {
      const m = url.match(/^data:image\/[\w+.-]+;base64,(.+)$/);
      if (!m) return { error: "Résultat invalide." };
      buf = Buffer.from(m[1], "base64");
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return { error: "Téléchargement du résultat impossible." };
      buf = Buffer.from(await res.arrayBuffer());
    }
    const { ingestAsset } = await import("@/lib/studio/storage");
    const r = await ingestAsset({
      tenantId: tenant.id, tenantSlug: tenant.slug, buf,
      filename: `edit-${Date.now()}.jpg`, orderId: src?.orderId ?? null,
      source: "ai-edit", note: note.slice(0, 80),
    });
    if ("error" in r) return { error: r.error };
    revalidatePath("/studio");
    return { id: r.id };
  } catch (e) {
    console.error("aiEditKeep", e);
    return { error: "Enregistrement impossible." };
  }
}
