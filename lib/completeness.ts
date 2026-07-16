/* ---------------------------------------------------------------------------
   Dette de fiche — règles de complétude par stade.
   Un « manque » = un champ vide détecté en live (source de vérité : la fiche).
   FieldSnooze ne stocke que les reports (« plus tard ») et abandons (« n'existe pas »).
--------------------------------------------------------------------------- */
import { prisma } from "@/lib/db";
import type { Contact, Order } from "@prisma/client";

export type MissingField = {
  field: string; // clé stable (aussi utilisée par FieldSnooze et les callbacks)
  label: string; // court, pour les récaps
  ask: string;   // question posée par le bot ({name} remplacé)
};

const RANK: Record<string, number> = { LEAD: 0, DEVIS_ENVOYE: 1, ACOMPTE_RECU: 2, EN_PRODUCTION: 3, LIVRE: 4, ANNULE: -1 };

/** Les manques d'une commande, par ordre d'importance. */
export function missingFor(order: Order & { contact: Contact }): MissingField[] {
  const r = RANK[order.status] ?? 0;
  const out: MissingField[] = [];
  if (r < 0) return out; // annulée : on ne réclame rien

  if (r >= 1) {
    if (!order.eventDate) out.push({ field: "eventDate", label: "date de l'événement", ask: "Quelle est la date de l'événement de {name} ? (ex. 22.08)" });
    if (!order.parts) out.push({ field: "parts", label: "nombre de parts", ask: "Combien de parts pour {name} ? (ex. 26)" });
    if (!order.priceQuoted) out.push({ field: "priceQuoted", label: "prix", ask: "Quel prix as-tu annoncé à {name} ? (en CHF, ex. 185)" });
    if (!order.occasion) out.push({ field: "occasion", label: "occasion", ask: "C'est pour quelle occasion chez {name} ? (anniversaire, mariage, baptême…)" });
  }
  if (r >= 2) {
    if (!order.contact.phone) out.push({ field: "phone", label: "téléphone", ask: "As-tu pu obtenir le n° de mobile de {name} ? (ex. +41 79 …)" });
    if (order.deliveryMode === "livraison" && !order.deliveryAddress)
      out.push({ field: "deliveryAddress", label: "adresse de livraison", ask: "Quelle est l'adresse de livraison pour {name} ?" });
  }
  return out;
}

export type PendingField = { order: Order & { contact: Contact }; miss: MissingField };

/** Les manques « mûrs » d'un tenant : hors snooze actif, hors abandon, fiches actives. */
export async function pendingFields(tenantId: string, limit = 10): Promise<PendingField[]> {
  const orders = await prisma.order.findMany({
    where: { tenantId, status: { in: ["DEVIS_ENVOYE", "ACOMPTE_RECU", "EN_PRODUCTION"] }, cancelledAt: null },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
    take: 60,
  });
  if (!orders.length) return [];
  const snoozes = await prisma.fieldSnooze.findMany({ where: { tenantId, orderId: { in: orders.map((o) => o.id) } } });
  const blocked = new Set(
    snoozes
      .filter((z) => z.dismissed || (z.remindAt && z.remindAt.getTime() > Date.now()))
      .map((z) => `${z.orderId}:${z.field}`)
  );
  const out: PendingField[] = [];
  for (const o of orders) {
    for (const m of missingFor(o)) {
      if (blocked.has(`${o.id}:${m.field}`)) continue;
      out.push({ order: o, miss: m });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Applique une réponse texte d'Annie à un champ manquant. Retour : libellé confirmé ou null si illisible. */
export async function fillField(tenantId: string, orderId: string, field: string, raw: string): Promise<string | null> {
  const text = raw.trim();
  if (!text) return null;
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { contact: true } });
  if (!order) return null;

  if (field === "phone") {
    const digits = text.replace(/[^\d+]/g, "");
    if (digits.replace(/\D/g, "").length < 9) return null;
    const phone = digits.startsWith("00") ? `+${digits.slice(2)}` : digits.startsWith("0") ? `+41${digits.slice(1)}` : digits;
    await prisma.contact.update({ where: { id: order.contactId }, data: { phone } });
    return `téléphone : ${phone}`;
  }
  if (field === "eventDate") {
    const m = text.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (!m) return null;
    const now = new Date();
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear();
    let d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]), 12));
    if (!m[3] && d.getTime() < now.getTime() - 86400000) d = new Date(Date.UTC(year + 1, Number(m[2]) - 1, Number(m[1]), 12));
    if (isNaN(d.getTime())) return null;
    await prisma.order.update({ where: { id: orderId }, data: { eventDate: d } });
    return `date : ${d.toLocaleDateString("fr-CH")}`;
  }
  if (field === "parts" || field === "priceQuoted") {
    const n = parseInt(text.replace(/\D/g, ""), 10);
    if (!n || n < 1 || n > 5000) return null;
    await prisma.order.update({ where: { id: orderId }, data: { [field]: n } });
    return field === "parts" ? `${n} parts` : `prix : CHF ${n}`;
  }
  if (field === "occasion") {
    await prisma.order.update({ where: { id: orderId }, data: { occasion: text.slice(0, 60) } });
    return `occasion : ${text.slice(0, 60)}`;
  }
  if (field === "deliveryAddress") {
    await prisma.order.update({ where: { id: orderId }, data: { deliveryAddress: text.slice(0, 200) } });
    return `adresse : ${text.slice(0, 200)}`;
  }
  return null;
}

export async function snoozeField(tenantId: string, orderId: string, field: string, days: number) {
  await prisma.fieldSnooze.upsert({
    where: { tenantId_orderId_field: { tenantId, orderId, field } },
    create: { tenantId, orderId, field, remindAt: new Date(Date.now() + days * 86400000) },
    update: { remindAt: new Date(Date.now() + days * 86400000), dismissed: false },
  });
}

export async function dismissField(tenantId: string, orderId: string, field: string) {
  await prisma.fieldSnooze.upsert({
    where: { tenantId_orderId_field: { tenantId, orderId, field } },
    create: { tenantId, orderId, field, dismissed: true },
    update: { dismissed: true, remindAt: null },
  });
}
