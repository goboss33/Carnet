"use server";

/* Studio — server actions (module isolé). */

import { revalidatePath } from "next/cache";
import { prisma, currentTenant } from "@/lib/db";
import { deleteAsset, purgeUnused } from "@/lib/studio/storage";
import { renderPostInBackground } from "@/lib/studio/render";
import { generateCaption } from "@/lib/studio/captions";
import type { StudioPostStatus } from "@prisma/client";

export async function createStudioPost(input: { template: string; title: string; assetIds: string[] }): Promise<{ error?: string; id?: string }> {
  const tenant = await currentTenant();
  const assets = await prisma.studioAsset.findMany({ where: { tenantId: tenant.id, id: { in: input.assetIds } } });
  if (!assets.length) return { error: "Sélectionne au moins un média." };
  const ordered = input.assetIds.filter((id) => assets.some((a) => a.id === id));
  // liaison commande auto si tous les médias liés pointent la même commande
  const orderIds = [...new Set(assets.map((a) => a.orderId).filter(Boolean))] as string[];
  const orderId = orderIds.length === 1 ? orderIds[0] : null;

  const post = await prisma.studioPost.create({
    data: {
      tenantId: tenant.id,
      template: input.template === "compilation" ? "compilation" : "transformation",
      title: input.title.slice(0, 80),
      orderId,
      assets: { create: ordered.map((assetId, i) => ({ assetId, position: i })) },
    },
  });
  // légende générée d'office (éditable ensuite) + montage lancé
  const cap = await generateCaption(tenant.id, { orderId, template: post.template, title: post.title }).catch(() => null);
  if (cap) await prisma.studioPost.update({ where: { id: post.id }, data: { caption: cap.caption, hashtags: cap.hashtags } });
  renderPostInBackground(post.id);
  revalidatePath("/studio");
  return { id: post.id };
}

export async function rerenderStudioPost(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const post = await prisma.studioPost.findFirst({ where: { id, tenantId: tenant.id } });
  if (!post) return { error: "Publication introuvable." };
  renderPostInBackground(post.id);
  revalidatePath("/studio");
  return {};
}

export async function saveStudioPost(id: string, formData: FormData): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const post = await prisma.studioPost.findFirst({ where: { id, tenantId: tenant.id } });
  if (!post) return { error: "Publication introuvable." };
  const sched = String(formData.get("scheduledFor") ?? "");
  await prisma.studioPost.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? post.title).slice(0, 80),
      caption: String(formData.get("caption") ?? post.caption).slice(0, 2200),
      hashtags: String(formData.get("hashtags") ?? post.hashtags).slice(0, 500),
      scheduledFor: sched ? new Date(sched) : null,
      ...(sched && post.status === "MONTEE" ? { status: "PROGRAMMEE" as StudioPostStatus } : {}),
    },
  });
  revalidatePath("/studio");
  return {};
}

export async function regenStudioCaption(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const post = await prisma.studioPost.findFirst({ where: { id, tenantId: tenant.id } });
  if (!post) return { error: "Publication introuvable." };
  const cap = await generateCaption(tenant.id, { orderId: post.orderId, template: post.template, title: post.title });
  await prisma.studioPost.update({ where: { id }, data: { caption: cap.caption, hashtags: cap.hashtags } });
  revalidatePath("/studio");
  return {};
}

export async function markStudioPublished(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  await prisma.studioPost.updateMany({ where: { id, tenantId: tenant.id }, data: { status: "PUBLIEE", publishedAt: new Date() } });
  revalidatePath("/studio");
  return {};
}

export async function deleteStudioPost(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const post = await prisma.studioPost.findFirst({ where: { id, tenantId: tenant.id } });
  if (!post) return { error: "Publication introuvable." };
  if (post.outputPath) {
    const path = await import("path");
    const { unlink } = await import("fs/promises");
    const { studioDir } = await import("@/lib/studio/storage");
    await unlink(path.join(studioDir(), post.outputPath)).catch(() => null);
  }
  await prisma.studioPost.delete({ where: { id } });
  revalidatePath("/studio");
  return {};
}

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
