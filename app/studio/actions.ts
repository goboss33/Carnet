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
