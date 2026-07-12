import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import { catLabel } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m") ?? "";
  if (!/^\d{4}-\d{2}$/.test(m)) return new NextResponse("?m=YYYY-MM requis", { status: 400 });
  const [y, mo] = m.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 1));

  const tenant = await currentTenant();
  const [expenses, delivered] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, include: { contact: true }, orderBy: { deliveredAt: "asc" } }),
  ]);

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [
    ["type", "date", "libelle", "categorie", "montant_chf", "note"].join(";"),
    ...delivered.map((o) =>
      ["recette", o.deliveredAt!.toISOString().slice(0, 10), esc(`Commande ${o.contact.firstName} ${o.contact.lastName} — ${o.occasion}`), "vente", ((o.priceQuoted ?? 0)).toFixed(2), ""].join(";")
    ),
    ...expenses.map((e) =>
      ["depense", e.date.toISOString().slice(0, 10), esc(e.merchant || "—"), esc(catLabel(e.category)), (e.totalCents / 100).toFixed(2), esc(e.notes)].join(";")
    ),
  ];
  return new NextResponse("﻿" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="carnet-compta-${m}.csv"`,
    },
  });
}
