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

export async function aiEditPreview(assetId: string, opts: { presetId?: string; prompt?: string; imageDataUri?: string }): Promise<{ error?: string; url?: string }> {
  const tenant = await currentTenant();
  const { falEnabled, editImageUrl, assetDataUri, EDIT_PRESETS } = await import("@/lib/fal-edit");
  if (!falEnabled()) return { error: "Édition IA non configurée (FAL_KEY à ajouter dans Portainer)." };
  const prompt = opts.presetId ? (EDIT_PRESETS.find((p) => p.id === opts.presetId)?.prompt ?? "") : (opts.prompt ?? "");
  if (prompt.trim().length < 4) return { error: "Décris ce que tu veux modifier." };
  // mode zones : le client fournit l'image annotée (rectangles colorés) ; sinon on charge l'asset
  let dataUri = opts.imageDataUri;
  if (dataUri) {
    if (!dataUri.startsWith("data:image/") || dataUri.length > 12_000_000) return { error: "Image annotée invalide." };
  } else {
    dataUri = (await assetDataUri(tenant.id, assetId)) ?? undefined;
  }
  if (!dataUri) return { error: "Photo introuvable." };
  const r = await editImageUrl(dataUri, prompt);
  return "error" in r ? { error: r.error } : { url: r.url };
}

export async function aiEditKeep(sourceAssetId: string, url: string, note: string): Promise<{ error?: string; id?: string }> {
  const tenant = await currentTenant();
  if (!/^https:\/\/[\w.-]*fal\.(media|run|ai)\//.test(url)) return { error: "Source invalide." };
  const src = await prisma.studioAsset.findFirst({ where: { id: sourceAssetId, tenantId: tenant.id }, select: { orderId: true } });
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { error: "Téléchargement du résultat impossible." };
    const buf = Buffer.from(await res.arrayBuffer());
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
