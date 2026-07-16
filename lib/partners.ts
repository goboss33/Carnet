/* Décision sur une candidature partenaire — partagé bot Telegram / web. */
import { prisma } from "@/lib/db";
import type { Partner, PartnerApplication } from "@prisma/client";

const clean = (x: string) => x.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "");

export async function acceptApplication(tenantId: string, appId: string): Promise<{ error?: string; partner?: Partner; app?: PartnerApplication }> {
  const app = await prisma.partnerApplication.findFirst({ where: { id: appId, tenantId } });
  if (!app) return { error: "Candidature introuvable." };
  if (app.status !== "pending") return { error: `Déjà traitée (${app.status === "accepted" ? "acceptée" : "déclinée"}).` };

  const base = `${clean(app.business).slice(0, 4) || "PART"}${app.city ? `-${clean(app.city).slice(0, 3)}` : ""}`;
  let code = base;
  for (let i = 2; await prisma.partner.findUnique({ where: { tenantId_code: { tenantId, code } } }); i++) code = `${base}${i}`;

  const partner = await prisma.partner.create({
    data: {
      tenantId,
      name: app.business,
      type: app.type,
      code,
      ratePct: 10,
      contact: app.contactName,
      phone: app.phone,
      city: app.city,
    },
  });
  const updated = await prisma.partnerApplication.update({ where: { id: app.id }, data: { status: "accepted", handledAt: new Date() } });
  return { partner, app: updated };
}

export async function declineApplication(tenantId: string, appId: string): Promise<{ error?: string; app?: PartnerApplication }> {
  const app = await prisma.partnerApplication.findFirst({ where: { id: appId, tenantId } });
  if (!app) return { error: "Candidature introuvable." };
  if (app.status !== "pending") return { error: "Déjà traitée." };
  const updated = await prisma.partnerApplication.update({ where: { id: app.id }, data: { status: "declined", handledAt: new Date() } });
  return { app: updated };
}
