import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getBrand } from "@/lib/brand";
import { getLexicon } from "@/lib/lexicon";
import { PAYKIND_LABEL } from "@/lib/money";
import { safePdfText as safe } from "@/lib/pdf";
import { parseItems, itemsTotalCents } from "@/lib/order-items";
import { parseExtras, extraLabel } from "@/lib/order-extras";
import { piecesOf, orderTotal, pieceSummary, piecePrice } from "@/lib/order-pieces";
import { discountLabel } from "@/lib/pricing";
import { drawQrBill, qrBillReady, splitAddress, toAddressLines, QR_ZONE_PT } from "@/lib/qrbill";

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
    // Lignes actives seulement en Mode ligne — éteint, elles sont dormantes et le prix simple fait foi.
    const activeItems = order.kind === "EXCEPTION" ? (parseItems(order.items) ?? []) : [];
    if (!order.priceQuoted && !activeItems.length)
      return new NextResponse("Renseigne d'abord le prix de la commande.", { status: 400 });

    const [brand, s, lex] = await Promise.all([getBrand(), getSettings(tenant.id), getLexicon(tenant.id)]);

    // Lignes de commande : quand elles sont actives, la facture les détaille
    // (mêmes lignes que le devis — continuité devis → facture).
    const lineItems = activeItems.filter((it) => !it.opt);
    const totalCents = lineItems.length ? itemsTotalCents(lineItems) : (order.priceQuoted ?? 0) * 100;
    const received = order.payments.filter((p) => p.kind !== "POURBOIRE");
    const paidCents = received.reduce((a, p) => a + p.cents, 0);
    const dueCents = Math.max(0, totalCents - paidCents);
    const chf = (c: number) => {
      const [int, dec] = (c / 100).toFixed(2).split(".");
      return `CHF ${int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dec}`;
    };
    const dt = (d: Date) => d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const no = order.orderNo ? String(order.orderNo).padStart(4, "0") : `${new Date().getFullYear()}-${order.id.slice(-4).toUpperCase()}`;
    const addrLines = toAddressLines(s.businessAddress);
    // QR-facture : seulement s'il reste à payer et que l'émetteur est complet (IBAN CH/LI + adresse).
    const canQr = dueCents > 0 && !!s.accountHolder && qrBillReady(s.iban, addrLines);

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
    const seller = [s.accountHolder, ...addrLines];
    for (const l of seller) { y -= 13; text(l, M, 9, { color: gray }); }
    if (s.vatEnabled && s.vatNumber) { y -= 13; text(`N° TVA ${s.vatNumber}`, M, 9, { color: gray }); }
    else if (s.businessUid) { y -= 13; text(`IDE ${s.businessUid}`, M, 9, { color: gray }); }
    y -= 24;
    text(`Date : ${dt(new Date())}`, 0, 9, { color: gray, right: A4.w - M });

    // ---- Client·e (entreprise en premier si renseignée — factures B2B)
    const c = order.contact;
    const person = `${c.firstName} ${c.lastName}`.trim();
    text(c.company ? "Facturé à" : "Facturée à", M, 8, { color: gray });
    y -= 14;
    text(c.company || person, M, 11, { bold: true });
    if (c.company && person) { y -= 12; text(`À l'attention de ${person}`, M, 9, { color: gray }); }
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
    if (lineItems.length) {
      // Facture détaillée — mêmes lignes que le devis.
      for (const it of lineItems) {
        const qtyPrefix = it.qty && it.unit ? `${it.qty} × ` : "";
        text(qtyPrefix + (it.label || "—"), M, 10.5, { bold: true });
        text(chf(it.cents), 0, 10.5, { bold: true, right: A4.w - M });
        if (it.qty && it.unit) { y -= 12; text(`${it.qty} pièces à ${chf(it.unit)}`, M + 10, 8.5, { color: gray }); }
        if (it.detail) for (const l of wrap(it.detail, font, 9, A4.w - 2 * M - 90)) { y -= 12; text(l, M + 10, 9, { color: gray }); }
        if (order.eventDate && it === lineItems[lineItems.length - 1]) { y -= 12; text(`Date de la prestation : ${dt(order.eventDate)}`, M + 10, 9, { color: gray }); }
        y -= 17;
      }
      y += 13; // compense le dernier pas de boucle (le trait du total suit)
    } else if (piecesOf(order).length > 1) {
      // Plusieurs pièces : chacune sa ligne (même présentation que le devis).
      for (const piece of piecesOf(order)) {
        const [head, ...rest] = pieceSummary(piece, s.pricing).split(" — ");
        text(head, M, 10.5, { bold: true });
        text(chf(piecePrice(s.pricing, piece, order.occasion) * 100), 0, 10.5, { bold: true, right: A4.w - M });
        if (rest.length) for (const l of wrap(rest.join(" — "), font, 9, A4.w - 2 * M - 90)) { y -= 12; text(l, M + 10, 9, { color: gray }); }
        y -= 17;
      }
      if (order.eventDate) { text(`Date de la prestation : ${dt(order.eventDate)}`, M + 10, 9, { color: gray }); y -= 4; }
      else y += 13;
    } else {
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
      // Compléments du configurateur : leur prix est déjà dans le total → « compris ».
      const ex = parseExtras(order.extras);
      if (ex.length) details.push(`Compris : ${ex.map(extraLabel).join(", ")}`);
      if (order.eventDate) details.push(`Date de la prestation : ${dt(order.eventDate)}`);
      details.push(order.deliveryMode === "livraison" ? `Livraison${order.deliveryAddress ? ` — ${order.deliveryAddress}` : ""} (incluse)` : cap(lex.pickupLabel));
      for (const d of details) for (const l of wrap(d, font, 9, A4.w - 2 * M - 110)) { y -= 13; text(l, M + 10, 9, { color: gray }); }
    }

    // ---- Livraison et remise (mêmes explications que le devis)
    const fPieces = piecesOf(order);
    if (!lineItems.length && fPieces.length) {
      const t = orderTotal(s.pricing, {
        pieces: fPieces, occasion: order.occasion, deliveryMode: order.deliveryMode, deliveryKm: order.deliveryKm,
        discount: order.discountKind ? { kind: order.discountKind as "chf" | "pct", value: order.discountValue } : null,
      });
      if (order.deliveryMode === "livraison" || t.discount > 0) {
        y -= 10; hr(); y -= 14;
        text("Sous-total", A4.w - M - 220, 9.5, { color: gray });
        text(chf(t.pieces * 100), 0, 9.5, { color: gray, right: A4.w - M });
        if (order.deliveryMode === "livraison") {
          y -= 13;
          text(`Livraison${order.deliveryKm ? ` — ${order.deliveryKm} km` : ""} (offerte jusqu'à ${s.pricing.kmFree} km, puis CHF ${s.pricing.kmRate}/km)`, M, 9.5, { color: gray });
          text(t.delivery > 0 ? chf(t.delivery * 100) : "offerte", 0, 9.5, { color: gray, right: A4.w - M });
        }
        if (t.discount > 0) {
          y -= 13;
          text(discountLabel({ kind: order.discountKind as "chf" | "pct", value: order.discountValue }), M, 9.5, { bold: true, color: rgb(0.05, 0.55, 0.35) });
          text(`− ${chf(t.discount * 100)}`, 0, 9.5, { bold: true, right: A4.w - M, color: rgb(0.05, 0.55, 0.35) });
        }
      }
    }

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
        text(`${cap(PAYKIND_LABEL[p.kind] ?? p.kind)} — ${dt(p.paidAt)}`, M, 9);
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
      if (s.paymentTermsDays > 0) {
        const due = new Date(Date.now() + s.paymentTermsDays * 86400000);
        y -= 13;
        text(`Payable à ${s.paymentTermsDays} jours — échéance : ${dt(due)}`, 0, 8.5, { color: gray, right: A4.w - M });
      }
      // ---- Coordonnées de règlement (la QR-facture prend le relais quand elle est possible)
      y -= 22;
      text("Règlement", M, 8, { color: gray });
      if (canQr) {
        y -= 13;
        text(`Par QR-facture ci-dessous${s.twintNumber ? ` ou Twint : ${s.twintNumber}` : ""}`, M, 9);
      } else {
        const pay: string[] = [];
        if (s.paymentDefault === "twint" && s.twintNumber) pay.push(`Twint : ${s.twintNumber}`);
        if (s.iban) pay.push(`IBAN : ${s.iban}${s.bankName ? ` (${s.bankName})` : ""}${s.accountHolder ? ` — ${s.accountHolder}` : ""}`);
        if (s.paymentDefault !== "twint" && s.twintNumber) pay.push(`Twint : ${s.twintNumber}`);
        for (const l of pay) { y -= 13; text(l, M, 9); }
      }
    } else {
      text("Facture acquittée — merci !", 0, 11, { bold: true, right: A4.w - M, color: rgb(0.05, 0.55, 0.35) });
    }

    // ---- QR-facture (section de paiement normée, bas de page)
    if (canQr) {
      const da = order.deliveryMode === "livraison" && order.deliveryAddress ? splitAddress(order.deliveryAddress) : null;
      await drawQrBill(doc, page, font, bold, {
        iban: s.iban,
        creditorName: s.accountHolder,
        creditorLine1: addrLines[0],
        creditorLine2: addrLines[addrLines.length - 1],
        amountCents: dueCents,
        ...(da ? { debtorName: c.company || person, debtorLine1: da[0], debtorLine2: da[1] } : {}),
        message: `Facture ${no}`,
      });
    }

    // ---- Pied de page (au-dessus de la section de paiement quand elle existe)
    const footer: string[] = [];
    if (!s.vatEnabled) footer.push("Non assujetti à la TVA (art. 10 LTVA) — TVA non applicable.");
    footer.push(`Document généré par ${brand.name} le ${dt(new Date())}.`);
    let fy = canQr ? QR_ZONE_PT + 26 : M;
    for (const l of footer.reverse()) {
      page.drawText(safe(l), { x: M, y: fy, size: 7.5, font, color: gray });
      fy += 10;
    }

    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-${no}.pdf"`,
        "Cache-Control": "no-store", // le PDF reflète l'état live (paiements, réglages)
      },
    });
  } catch (e) {
    console.error("facture pdf:", e);
    return new NextResponse("Facture impossible — détail dans les logs du serveur.", { status: 500 });
  }
}
