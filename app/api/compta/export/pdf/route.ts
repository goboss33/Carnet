import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma, currentTenant } from "@/lib/db";
import { catLabel, mileageCents, PAYKIND_LABEL } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { getBrand } from "@/lib/brand";

/* ---------------------------------------------------------------------------
   GET /api/compta/export/pdf?m=YYYY-MM (ou ?y=YYYY) — dossier compta en PDF :
   synthèse (encaissé / dépenses / déplacements / résultat), journal des
   encaissements, dépenses, note fiduciaire. Pagination automatique.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const A4 = { w: 595.28, h: 841.89 };
const M = 44; // marge

export async function GET(req: NextRequest) {
  const m = req.nextUrl.searchParams.get("m") ?? "";
  const yy = req.nextUrl.searchParams.get("y") ?? "";
  let start: Date, end: Date, label: string, file: string;
  if (/^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split("-").map(Number);
    start = new Date(Date.UTC(y, mo - 1, 1));
    end = new Date(Date.UTC(y, mo, 1));
    label = start.toLocaleDateString("fr-CH", { month: "long", year: "numeric", timeZone: "UTC" });
    file = m;
  } else if (/^\d{4}$/.test(yy)) {
    start = new Date(Date.UTC(Number(yy), 0, 1));
    end = new Date(Date.UTC(Number(yy) + 1, 0, 1));
    label = `année ${yy}`;
    file = yy;
  } else {
    return new NextResponse("?m=YYYY-MM ou ?y=YYYY requis", { status: 400 });
  }

  const tenant = await currentTenant();
  const [brand, s, payments, expenses, delivered] = await Promise.all([
    getBrand(),
    getSettings(tenant.id),
    prisma.payment.findMany({
      where: { tenantId: tenant.id, paidAt: { gte: start, lt: end } },
      include: { order: { include: { contact: true } } },
      orderBy: { paidAt: "asc" },
    }),
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, select: { deliveryMode: true, deliveryKm: true } }),
  ]);

  const totalRev = payments.reduce((a, p) => a + p.cents, 0);
  const totalExp = expenses.reduce((a, e) => a + e.totalCents, 0);
  const mileage = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);
  const chf = (c: number) => `${(c / 100).toFixed(2)}`;
  const dt = (d: Date) => d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const gray = rgb(0.45, 0.45, 0.48);
  const dark = rgb(0.1, 0.1, 0.12);
  const line = rgb(0.88, 0.88, 0.9);

  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const ensure = (needed: number) => {
    if (y - needed < M) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - M;
    }
  };
  const text = (t: string, x: number, size: number, opts?: { bold?: boolean; color?: ReturnType<typeof rgb>; right?: number }) => {
    const f = opts?.bold ? bold : font;
    const xx = opts?.right != null ? opts.right - f.widthOfTextAtSize(t, size) : x;
    page.drawText(t, { x: xx, y, size, font: f, color: opts?.color ?? dark });
  };
  const hr = () => {
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: A4.w - M, y: y + 3 }, thickness: 0.7, color: line });
  };

  // ---- En-tête
  text(brand.name, M, 16, { bold: true });
  y -= 18;
  text(`Comptabilité — ${label}`, M, 11, { color: gray });
  text(`généré le ${new Date().toLocaleDateString("fr-CH")}`, 0, 8, { color: gray, right: A4.w - M });
  y -= 22;

  // ---- Synthèse
  const kv = (k: string, v: string, boldV = false) => {
    ensure(16);
    text(k, M, 10, { color: gray });
    text(`${v} CHF`, 0, 10, { bold: boldV, right: A4.w - M });
    y -= 15;
  };
  kv("Encaissé (comptabilité de trésorerie)", chf(totalRev));
  kv("Dépenses", chf(totalExp));
  kv(`Déplacements déductibles (forfait ${s.kmRate} CHF/km, A/R — hors trésorerie)`, chf(mileage));
  kv("Résultat (encaissé − dépenses)", chf(totalRev - totalExp), true);
  y -= 10;

  // ---- Encaissements
  const section = (t: string) => {
    ensure(34);
    text(t, M, 11, { bold: true });
    y -= 16;
  };
  const cols = { date: M, no: M + 58, name: M + 106, type: A4.w - M - 150, amt: A4.w - M };

  section(`Encaissements (${payments.length})`);
  if (payments.length) {
    text("Date", cols.date, 8, { color: gray });
    text("N°", cols.no, 8, { color: gray });
    text("Cliente", cols.name, 8, { color: gray });
    text("Type", cols.type, 8, { color: gray });
    text("CHF", 0, 8, { color: gray, right: cols.amt });
    y -= 5; hr(); y -= 10;
    for (const p of payments) {
      ensure(14);
      const name = `${p.order.contact.firstName} ${p.order.contact.lastName}`.trim().slice(0, 38);
      text(dt(p.paidAt), cols.date, 9);
      text(p.order.orderNo ? `#${String(p.order.orderNo).padStart(4, "0")}` : "—", cols.no, 9, { color: gray });
      text(name, cols.name, 9);
      text(PAYKIND_LABEL[p.kind] ?? p.kind, cols.type, 9, { color: gray });
      text(chf(p.cents), 0, 9, { right: cols.amt, color: p.cents < 0 ? rgb(0.75, 0.15, 0.15) : dark });
      y -= 13;
    }
    y -= 2; hr(); y -= 12;
    text("Total encaissé", cols.name, 9, { bold: true });
    text(chf(totalRev), 0, 9, { bold: true, right: cols.amt });
    y -= 20;
  } else {
    text("Aucun encaissement sur la période.", M, 9, { color: gray });
    y -= 20;
  }

  // ---- Dépenses
  section(`Dépenses (${expenses.length})`);
  if (expenses.length) {
    text("Date", cols.date, 8, { color: gray });
    text("Commerçant", cols.no, 8, { color: gray });
    text("Catégorie", cols.type, 8, { color: gray });
    text("CHF", 0, 8, { color: gray, right: cols.amt });
    y -= 5; hr(); y -= 10;
    for (const e of expenses) {
      ensure(14);
      text(dt(e.date), cols.date, 9);
      text((e.merchant || "—").slice(0, 40), cols.no, 9);
      text(catLabel(e.category), cols.type, 9, { color: gray });
      text(chf(e.totalCents), 0, 9, { right: cols.amt });
      y -= 13;
    }
    y -= 2; hr(); y -= 12;
    text("Total dépenses", cols.name, 9, { bold: true });
    text(chf(totalExp), 0, 9, { bold: true, right: cols.amt });
    y -= 20;
  } else {
    text("Aucune dépense sur la période.", M, 9, { color: gray });
    y -= 20;
  }

  // ---- Note
  ensure(26);
  text("Comptabilité d'encaissement : chaque paiement compte à sa date de réception.", M, 8, { color: gray });
  y -= 11;
  text("Forfait kilométrique et TVA à confirmer avec la fiduciaire.", M, 8, { color: gray });

  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="carnet-compta-${file}.pdf"`,
    },
  });
}
