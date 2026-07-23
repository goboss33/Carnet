import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { catLabel, mileageCents, PAYKIND_LABEL } from "@/lib/money";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const yy = req.nextUrl.searchParams.get("y") ?? "";
  let start: Date, end: Date, label: string;
  if (/^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    start = new Date(Date.UTC(y, mo - 1, 1));
    end = new Date(Date.UTC(y, mo, 1));
    label = m;
  } else if (/^\d{4}$/.test(yy)) {
    start = new Date(Date.UTC(Number(yy), 0, 1));
    end = new Date(Date.UTC(Number(yy) + 1, 0, 1));
    label = yy;
  } else {
    return new NextResponse("?m=YYYY-MM ou ?y=YYYY requis", { status: 400 });
  }

  const tenant = await currentTenant();
  const [expenses, payments, delivered] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    // Journal des encaissements — comptabilité de trésorerie : une ligne par
    // paiement reçu (ou remboursé, montant négatif), à sa date.
    prisma.payment.findMany({
      where: { tenantId: tenant.id, paidAt: { gte: start, lt: end } },
      include: { order: { include: { contact: true } } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, select: { deliveryMode: true, deliveryKm: true } }),
  ]);

  const s = await getSettings(tenant.id);
  const mileage = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const vatTxt = (v: unknown) =>
    Array.isArray(v)
      ? (v as { rate: number; amountCents: number }[]).map((x) => `${x.rate}%: ${(x.amountCents / 100).toFixed(2)}`).join(" | ")
      : "";
  const rows = [
    ["type", "date", "libelle", "categorie", "montant_chf", "tva", "note"].join(";"),
    ...payments.map((p) =>
      [
        "recette",
        p.paidAt.toISOString().slice(0, 10),
        esc(`${p.order.contact.firstName} ${p.order.contact.lastName}${p.order.occasion ? ` — ${p.order.occasion}` : ""}${p.order.orderNo ? ` (#${String(p.order.orderNo).padStart(4, "0")})` : ""}`),
        esc(PAYKIND_LABEL[p.kind] ?? p.kind),
        (p.cents / 100).toFixed(2),
        "",
        "",
      ].join(";")
    ),
    ...expenses.map((e) =>
      ["depense", e.date.toISOString().slice(0, 10), esc(e.merchant || "—"), esc(catLabel(e.category)), (e.totalCents / 100).toFixed(2), esc(vatTxt(e.vat)), esc(e.notes)].join(";")
    ),
    ...(mileage > 0
      ? [["deduction", start.toISOString().slice(0, 10), esc(`Frais de déplacement déductibles (forfait ${s.kmRate} CHF/km, aller-retour)`), "deplacement", (mileage / 100).toFixed(2), "", ""].join(";")]
      : []),
  ];
  return new NextResponse("﻿" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carnet-compta-${label}.csv"`,
    },
  });
}
