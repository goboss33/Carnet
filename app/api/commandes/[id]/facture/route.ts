import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getBrand } from "@/lib/brand";
import { getLexicon } from "@/lib/lexicon";
import { PAYKIND_LABEL } from "@/lib/money";
import { safePdfText as safe } from "@/lib/pdf";

/* ---------------------------------------------------------------------------
   GET /api/commandes/[id]/facture — facture PDF de la commande.
   TVA pilotée par les réglages : assujetti → « TVA x % incluse » (calcul
   inversé, prix TTC inchangés) ; sinon mention « non assujetti » (ne JAMAIS
   afficher une ligne TVA sans être inscrit — art. 27 LTVA, impôt facturé
   = impôt dû). Acomptes/soldes lus dans le journal des encaissements.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const A4 = { w: 595.28, h: 841.89 };
const M = 52;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tenant = await currentTenant();
    const order = await prisma.order.findUnique({
      where: { id },
      include: { contact: true, payments: { orderBy: { paidAt: "asc" } } },
    });
    if (!order || order.tenantId !== tenant.id) return new NextResponse("Introuvable", { status: 404 });
    if (!order.priceQuoted) return new NextResponse("Renseigne d'abord le prix de la commande.", { status: 400 });

    const [brand, s, lex] = await Promise.all([getBrand(), getSettings(tenant.id), getLexicon(tenant.id)]);

    const totalCents = order.priceQuoted * 100;
    const received = order.payments.filter((p) => p.kind !== "POURBOIRE");
    const paidCents = received.reduce((a, p) => a + p.cents, 0);
    const dueCents = Math.max(0, totalCents - paidCents);
    const chf = (c: number) => `CHF ${(c / 100).toFixed(2)}`;
    const dt = (d: Date) => d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const no = order.orderNo ? String(order.orderNo).padStart(4, "0") : order.id.slice(-6).toUpperCase();

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const gray = rgb(0.45, 0.45, 0.48);
    const dark = rgb(0.1, 0.1, 0.12);
    const line = rgb(0.88, 0.88, 0.9);
    const accent = (() => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(brand.color);
      return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : dark;
    })();

    const page = doc.addPage([A4.w, A4.h]);
    let y = A4.h - M;
    const text = (raw: string, x: number, size: number, o?: { bold?: boolean; color?: ReturnType<typeof rgb>; right?: number }) => {
      const t = safe(raw); // point unique : tout ce qui est dessiné passe ici
      const f = o?.bold ? bold : font;
      const xx = o?.right != null ? o.right - f.widthOfTextAtSize(t, size) : x;
      page.drawText(t, { x: xx, y, size, font: f, color: o?.color ?? dark });
    };
    const hr = (yy = 0) => page.drawLine({ start: { x: M, y: y + yy }, end: { x: A4.w - M, y: y + yy }, thickness: 0.7, color: line });
    const wrap = (raw: string, f: PDFFont, size: number, maxW: number): string[] => {
      const words = safe(raw).split(/\s+/).filter(Boolean);
      const out: string[] = [];
      let cur = "";
      for (const w of words) {
        const cand = cur ? `${cur} ${w}` : w;
        if (f.widthOfTextAtSize(cand, size) <= maxW || !cur) cur = cand;
        else { out.push(cur); cur = w; }
      }
      if (cur) out.push(cur);
      return out;
    };

    // ---- En-tête : émetteur à gauche, FACTURE à droite
    text(brand.name, M, 20, { bold: true, color: accent });
    text("FACTURE", 0, 20, { bold: true, right: A4.w - M });
    y -= 16;
    text(`n° ${no}`, 0, 10, { color: gray, right: A4.w - M });
    const seller = [s.accountHolder, ...s.businessAddress.split("\n").map((l) => l.trim()).filter(Boolean)];
    for (const l of seller) { y -= 13; text(l, M, 9, { color: gray }); }
    if (s.vatEnabled && s.vatNumber) { y -= 13; text(`N° TVA ${s.vatNumber}`, M, 9, { color: gray }); }
    y -= 24;
    text(`Date : ${dt(new Date())}`, 0, 9, { color: gray, right: A4.w - M });

    // ---- Cliente
    const c = order.contact;
    text("Facturée à", M, 8, { color: gray });
    y -= 14;
    text(`${c.firstName} ${c.lastName}`.trim(), M, 11, { bold: true });
    if (order.deliveryMode === "livraison" && order.deliveryAddress) {
      for (const l of wrap(order.deliveryAddress, font, 9, 260)) { y -= 12; text(l, M, 9, { color: gray }); }
    }
    for (const l of [c.email, c.phone].filter(Boolean) as string[]) { y -= 12; text(l, M, 9, { color: gray }); }
    y -= 26;

    // ---- Détail
    text("Description", M, 8, { color: gray });
    text("Montant", 0, 8, { color: gray, right: A4.w - M });
    y -= 5; hr(); y -= 14;

    const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);
    const title = [cap(lex.product), "sur mesure", order.occasion ? `— ${order.occasion}` : ""].filter(Boolean).join(" ");
    text(title, M, 10.5, { bold: true });
    text(chf(totalCents), 0, 10.5, { bold: true, right: A4.w - M });
    const details: string[] = [];
    if (order.celebrant) details.push(`Pour ${order.celebrant}${order.celebrantAge ? ` (${order.celebrantAge} ans)` : ""}`);
    if (order.themeNote) details.push(`Thème : ${order.themeNote}`);
    const size = [order.tiers ? `${order.tiers} étage${order.tiers > 1 ? "s" : ""}` : "", order.parts ? `${order.parts} ${order.parts > 1 ? lex.units : lex.unit}` : ""].filter(Boolean).join(" · ");
    if (size) details.push(size);
    const compo = [order.biscuit, ...(order.fourrages ?? [])].filter(Boolean).join(", ");
    if (compo) details.push(`Composition : ${compo}`);
    if (order.sansLactose) details.push("Sans lactose");
    if (order.eventDate) details.push(`${cap(lex.occasion)} du ${dt(order.eventDate)}`);
    details.push(order.deliveryMode === "livraison" ? `Livraison${order.deliveryAddress ? ` — ${order.deliveryAddress}` : ""} (incluse)` : cap(lex.pickupLabel));
    for (const d of details) for (const l of wrap(d, font, 9, A4.w - 2 * M - 110)) { y -= 13; text(l, M + 10, 9, { color: gray }); }

    // ---- Total (+ TVA incluse si assujetti)
    y -= 10; hr(); y -= 16;
    text("Total", A4.w - M - 200, 11, { bold: true });
    text(chf(totalCents), 0, 11, { bold: true, right: A4.w - M });
    if (s.vatEnabled && s.vatRate > 0) {
      const vatCents = Math.round((totalCents * s.vatRate) / (100 + s.vatRate));
      y -= 13;
      text(`Prix TTC — dont TVA ${String(s.vatRate).replace(".", ",")} % : ${chf(vatCents)}`, 0, 8.5, { color: gray, right: A4.w - M });
    }

    // ---- Paiements déjà reçus + solde
    if (received.length) {
      y -= 24;
      text("Paiements reçus", M, 8, { color: gray });
      y -= 5; hr(); y -= 13;
      for (const p of received) {
        text(`${PAYKIND_LABEL[p.kind] ?? p.kind} — ${dt(p.paidAt)}`, M, 9);
        text(`${p.cents < 0 ? "+" : "−"} ${chf(Math.abs(p.cents))}`, 0, 9, { color: gray, right: A4.w - M });
        y -= 13;
      }
      y -= 5;
    } else {
      y -= 18;
    }
    y -= 8;
    if (dueCents > 0) {
      text("Reste à payer", A4.w - M - 200, 12, { bold: true });
      text(chf(dueCents), 0, 12, { bold: true, right: A4.w - M, color: accent });
      // ---- Coordonnées de règlement
      const pay: string[] = [];
      if (s.paymentDefault === "twint" && s.twintNumber) pay.push(`Twint : ${s.twintNumber}`);
      if (s.iban) pay.push(`IBAN : ${s.iban}${s.bankName ? ` (${s.bankName})` : ""}${s.accountHolder ? ` — ${s.accountHolder}` : ""}`);
      if (s.paymentDefault !== "twint" && s.twintNumber) pay.push(`Twint : ${s.twintNumber}`);
      if (pay.length) {
        y -= 22;
        text("Règlement", M, 8, { color: gray });
        for (const l of pay) { y -= 13; text(l, M, 9); }
      }
    } else {
      text("Facture acquittée — merci !", 0, 11, { bold: true, right: A4.w - M, color: rgb(0.05, 0.55, 0.35) });
    }

    // ---- Pied de page
    const footer: string[] = [];
    if (!s.vatEnabled) footer.push("Non assujetti à la TVA (art. 10 LTVA) — TVA non applicable.");
    footer.push(`Document généré par ${brand.name} le ${dt(new Date())}.`);
    let fy = M;
    for (const l of footer.reverse()) {
      page.drawText(safe(l), { x: M, y: fy, size: 7.5, font, color: gray });
      fy += 10;
    }

    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-${no}.pdf"`,
      },
    });
  } catch (e) {
    console.error("facture pdf:", e);
    return new NextResponse("Facture impossible — détail dans les logs du serveur.", { status: 500 });
  }
}
