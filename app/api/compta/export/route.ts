import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { catLabel, mileageCents } from "@/lib/money";
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
  const [expenses, delivered, cancelledKept] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, include: { contact: true }, orderBy: { deliveredAt: "asc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "ANNULE", cancelledAt: { gte: start, lt: end }, OR: [{ depositCents: { gt: 0 } }, { balanceCents: { gt: 0 } }] }, include: { contact: true }, orderBy: { cancelledAt: "asc" } }),
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
    ...delivered.map((o) =>
      ["recette", o.deliveredAt!.toISOString().slice(0, 10), esc(`Commande ${o.contact.firstName} ${o.contact.lastName} — ${o.occasion}`), "vente", ((o.priceQuoted ?? 0) + (o.tipCents ?? 0) / 100).toFixed(2), "", o.tipCents ? esc(`dont pourboire ${(o.tipCents / 100).toFixed(2)}`) : ""].join(";")
    ),
    ...cancelledKept.map((o) =>
      ["recette", o.cancelledAt!.toISOString().slice(0, 10), esc(`Acompte conservé — annulation ${o.contact.firstName} ${o.contact.lastName}`), "acompte conservé", (((o.depositCents ?? 0) + (o.balanceCents ?? 0)) / 100).toFixed(2), "", ""].join(";")
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
