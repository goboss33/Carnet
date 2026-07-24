import { NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { paymentState } from "@/lib/payments";
import { missingFor } from "@/lib/completeness";

/* ---------------------------------------------------------------------------
   GET /api/notifications — tout ce qui attend la main d'Annie :
   · tickets   : dépenses en brouillon (bot) à compléter → modale dépense
   · debts     : fiches actives avec des infos manquantes (dette de fiche)
   · unpaid    : livrées pas encore soldées (argent à réclamer)
   · noHour    : remises des 7 prochains jours sans heure fixée
   Protégée par le middleware de session (comme le reste de l'app).
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await currentTenant();
  const in7d = new Date(Date.now() + 7 * 86400000);

  const [drafts, active, delivered] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "DRAFT" }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { in: ["LEAD", "DEVIS_ENVOYE", "ACOMPTE_RECU", "EN_PRODUCTION"] } },
      include: { contact: true },
      orderBy: { eventDate: "asc" },
      take: 200,
    }),
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: "LIVRE", priceQuoted: { not: null } },
      include: { contact: true },
      orderBy: { deliveredAt: "desc" },
      take: 100,
    }),
  ]);

  const name = (o: { contact: { firstName: string; lastName: string } }) => `${o.contact.firstName} ${o.contact.lastName}`.trim();
  const fmtD = (d: Date | null) => (d ? d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short" }) : "");

  const tickets = drafts.map((e) => ({
    id: e.id,
    dateISO: e.date.toISOString().slice(0, 10),
    merchant: e.merchant,
    category: e.category,
    totalCents: e.totalCents,
    notes: e.notes,
    receiptPath: e.receiptPath,
  }));

  const debts = active
    // handoverAt exclu : l'heure de remise a sa propre section (sinon doublon).
    .map((o) => ({ o, missing: missingFor(o).filter((m) => m.field !== "handoverAt") }))
    .filter((x) => x.missing.length > 0)
    .slice(0, 10)
    // missingFor renvoie des objets { field, label, ask } — on ne sort que le LIBELLÉ
    // (une valeur non sérialisée en string ferait planter le rendu côté client).
    .map((x) => ({ id: x.o.id, name: name(x.o), count: x.missing.length, first: x.missing[0]?.label ?? "" }));

  const unpaid = delivered
    .map((o) => ({ o, pay: paymentState(o) }))
    .filter((x) => !x.pay.isPaid && x.pay.dueCents > 0)
    .slice(0, 10)
    .map((x) => ({ id: x.o.id, name: name(x.o), dueCents: x.pay.dueCents, date: fmtD(x.o.deliveredAt) }));

  const noHour = active
    .filter((o) => (o.status === "ACOMPTE_RECU" || o.status === "EN_PRODUCTION") && o.eventDate && o.eventDate <= in7d && !o.handoverAt)
    .slice(0, 10)
    .map((o) => ({ id: o.id, name: name(o), date: fmtD(o.eventDate) }));

  return NextResponse.json({
    count: tickets.length + debts.length + unpaid.length + noHour.length,
    tickets,
    debts,
    unpaid,
    noHour,
  });
}
