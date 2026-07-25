import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getBrand } from "@/lib/brand";
import { getLexicon } from "@/lib/lexicon";
import { parseItems, itemsTotalCents } from "@/lib/order-items";
import { parseExtras, extraLabel } from "@/lib/order-extras";
import { piecesOf, orderTotal, pieceSummary, piecePrice } from "@/lib/order-pieces";
import { discountLabel } from "@/lib/pricing";
import { safePdfText as safe } from "@/lib/pdf";

/* ---------------------------------------------------------------------------
   GET /api/commandes/[id]/devis — devis PDF, jumeau de la facture.
   Lignes de commande (dont options hors total), validité réglable,
   acceptation par e-mail OU acompte (pas de scan nécessaire), zone
   « Bon pour accord » pour les services achats. Régénérable à volonté :
   « annule et remplace tout devis antérieur ».
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const A4 = { w: 595.28, h: 841.89 };
const M = 52;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const tenant = await currentTenant();
    const order = await prisma.order.findUnique({ where: { id }, include: { contact: true } });
    if (!order || order.tenantId !== tenant.id) return new NextResponse("Introuvable", { status: 404 });

    // Lignes actives seulement en Mode ligne (éteint = dormantes, prix simple).
    const items = order.kind === "EXCEPTION" ? (parseItems(order.items) ?? []) : [];
    const counted = items.filter((it) => !it.opt);
    const options = items.filter((it) => it.opt);
    const totalCents = counted.length ? itemsTotalCents(items) : (order.priceQuoted ?? 0) * 100;
    if (!totalCents) return new NextResponse("Renseigne d'abord un prix ou des lignes.", { status: 400 });

    const [brand, s, lex] = await Promise.all([getBrand(), getSettings(tenant.id), getLexicon(tenant.id)]);
    const chf = (c: number) => {
      const [int, dec] = (c / 100).toFixed(2).split(".");
      return `CHF ${int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${dec}`;
    };
    const dt = (d: Date) => d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
    const no = order.orderNo ? `D-${String(order.orderNo).padStart(4, "0")}` : `D-${new Date().getFullYear()}-${order.id.slice(-4).toUpperCase()}`;
    const validUntil = new Date(Date.now() + s.quoteValidityDays * 86400000);

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
      const t = safe(raw);
      const f = o?.bold ? bold : font;
      const xx = o?.right != null ? o.right - f.widthOfTextAtSize(t, size) : x;
      page.drawText(t, { x: xx, y, size, font: f, color: o?.color ?? dark });
    };
    const hr = () => page.drawLine({ start: { x: M, y: y + 3 }, end: { x: A4.w - M, y: y + 3 }, thickness: 0.7, color: line });
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
    const cap = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

    // ---- En-tête
    text(brand.name, M, 20, { bold: true, color: accent });
    text("DEVIS", 0, 20, { bold: true, right: A4.w - M });
    y -= 16;
    text(`n° ${no}`, 0, 10, { color: gray, right: A4.w - M });
    const addrLines = s.businessAddress.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const l of [s.accountHolder, ...addrLines].filter(Boolean)) { y -= 13; text(l, M, 9, { color: gray }); }
    if (s.vatEnabled && s.vatNumber) { y -= 13; text(`N° TVA ${s.vatNumber}`, M, 9, { color: gray }); }
    else if (s.businessUid) { y -= 13; text(`IDE ${s.businessUid}`, M, 9, { color: gray }); }
    y -= 24;
    text(`Date : ${dt(new Date())}`, 0, 9, { color: gray, right: A4.w - M });
    y -= 12;
    text(`Valable jusqu'au ${dt(validUntil)}`, 0, 9, { bold: true, right: A4.w - M });

    // ---- Client·e
    const c = order.contact;
    const person = `${c.firstName} ${c.lastName}`.trim();
    y += 12; // remonte à hauteur du bloc de droite
    text(c.company ? "Devis établi pour" : "Devis établi pour", M, 8, { color: gray });
    y -= 14;
    text(c.company || person, M, 11, { bold: true });
    if (c.company && person) { y -= 12; text(`À l'attention de ${person}`, M, 9, { color: gray }); }
    for (const l of [c.email, c.phone].filter(Boolean) as string[]) { y -= 12; text(l, M, 9, { color: gray }); }
    y -= 26;

    // ---- Lignes
    text("Description", M, 8, { color: gray });
    text("Montant", 0, 8, { color: gray, right: A4.w - M });
    y -= 5; hr(); y -= 14;

    const drawItem = (label: string, detail: string | undefined, cents: number, opts?: { qty?: number | null; unit?: number | null }) => {
      const qtyPrefix = opts?.qty && opts?.unit ? `${opts.qty} × ` : "";
      for (const [i, l] of wrap(qtyPrefix + label, bold, 10.5, A4.w - 2 * M - 90).entries()) {
        text(l, M, 10.5, { bold: true });
        if (i === 0) text(chf(cents), 0, 10.5, { bold: true, right: A4.w - M });
        y -= 14;
      }
      if (opts?.qty && opts?.unit) { text(`${opts.qty} pièces à ${chf(opts.unit)}`, M + 10, 8.5, { color: gray }); y -= 12; }
      if (detail) for (const l of wrap(detail, font, 9, A4.w - 2 * M - 90)) { text(l, M + 10, 9, { color: gray }); y -= 12; }
      y -= 4;
    };

    const orderPieces = piecesOf(order);
    if (counted.length) {
      for (const it of counted) drawItem(it.label || "—", it.detail, it.cents, it);
    } else if (orderPieces.length > 1) {
      // Plusieurs pièces : chacune sa ligne, avec son prix catalogue.
      for (const piece of orderPieces) {
        const [head, ...rest] = pieceSummary(piece, s.pricing).split(" — ");
        drawItem(head, rest.join(" — ") || undefined, piecePrice(s.pricing, piece, order.occasion) * 100);
      }
      if (order.eventDate) { text(`Date de la prestation : ${dt(order.eventDate)}`, M + 10, 9, { color: gray }); y -= 14; }
    } else {
      // Pas de lignes : reconstitue une désignation depuis la fiche (comme la facture).
      const title = [cap(lex.product), "sur mesure", order.occasion ? `— ${order.occasion}` : ""].filter(Boolean).join(" ");
      const ex = parseExtras(order.extras); // prix déjà inclus dans le total → « compris »
      const details = [
        order.themeNote ? `Thème : ${order.themeNote}` : "",
        [order.tiers ? `${order.tiers} étage${order.tiers > 1 ? "s" : ""}` : "", order.parts ? `${order.parts} ${order.parts > 1 ? lex.units : lex.unit}` : ""].filter(Boolean).join(" · "),
        ex.length ? `Compris : ${ex.map(extraLabel).join(", ")}` : "",
        order.eventDate ? `Date de la prestation : ${dt(order.eventDate)}` : "",
      ].filter(Boolean).join(" — ");
      drawItem(title, details || undefined, totalCents);
    }

    // ---- Livraison et remise : le client doit voir ce qu'il gagne
    const detail = !counted.length && orderPieces.length
      ? orderTotal(s.pricing, {
          pieces: orderPieces, occasion: order.occasion, deliveryMode: order.deliveryMode, deliveryKm: order.deliveryKm,
          discount: order.discountKind ? { kind: order.discountKind as "chf" | "pct", value: order.discountValue } : null,
        })
      : null;
    if (detail) {
      y -= 6; hr(); y -= 14;
      text("Sous-total", A4.w - M - 220, 9.5, { color: gray });
      text(chf(detail.pieces * 100), 0, 9.5, { color: gray, right: A4.w - M });
      if (order.deliveryMode === "livraison") {
        y -= 13;
        const km = order.deliveryKm;
        const rule = `livraison offerte jusqu'à ${s.pricing.kmFree} km, puis CHF ${s.pricing.kmRate}/km`;
        text(`Livraison${km ? ` — ${km} km` : ""} (${rule})`, M, 9.5, { color: gray });
        text(detail.delivery > 0 ? chf(detail.delivery * 100) : "offerte", 0, 9.5, { color: gray, right: A4.w - M });
      }
      if (detail.discount > 0) {
        y -= 13;
        text(discountLabel({ kind: order.discountKind as "chf" | "pct", value: order.discountValue }), M, 9.5, { bold: true, color: rgb(0.05, 0.55, 0.35) });
        text(`− ${chf(detail.discount * 100)}`, 0, 9.5, { bold: true, right: A4.w - M, color: rgb(0.05, 0.55, 0.35) });
      }
      y -= 4;
    }

    // ---- Total
    y -= 6; hr(); y -= 16;
    text("Total", A4.w - M - 200, 12, { bold: true });
    text(chf(totalCents), 0, 12, { bold: true, right: A4.w - M, color: accent });
    if (s.vatEnabled && s.vatRate > 0) {
      const vatCents = Math.round((totalCents * s.vatRate) / (100 + s.vatRate));
      y -= 13;
      text(`Prix TTC — dont TVA ${String(s.vatRate).replace(".", ",")} % : ${chf(vatCents)}`, 0, 8.5, { color: gray, right: A4.w - M });
    }

    // ---- Options (hors total)
    if (options.length) {
      y -= 24;
      text("En option (non compris dans le total)", M, 8, { color: gray });
      y -= 5; hr(); y -= 13;
      for (const it of options) {
        text(it.label || "—", M, 9.5);
        text(it.cents ? chf(it.cents) : "offert", 0, 9.5, { color: gray, right: A4.w - M });
        y -= 13;
        if (it.detail) for (const l of wrap(it.detail, font, 8.5, A4.w - 2 * M - 90)) { text(l, M + 10, 8.5, { color: gray }); y -= 11; }
      }
    }

    // ---- Conditions + événement
    y -= 26;
    text("Conditions", M, 8, { color: gray });
    y -= 5; hr(); y -= 13;
    const quotePhotos = order.quotePhotos.filter((p) => order.inspirationPhotos.includes(p)).slice(0, 4);
    const conditions = [
      order.eventDate ? `Prestation prévue le ${dt(order.eventDate)}${order.deliveryMode === "livraison" && order.deliveryAddress ? ` — ${order.deliveryAddress}` : ""}.` : "",
      `Devis valable jusqu'au ${dt(validUntil)} ; il annule et remplace tout devis antérieur pour cette ${lex.order}.`,
      `Il est réputé accepté par confirmation écrite (un e-mail suffit) ou par le versement de l'acompte de ${s.depositPct} %.`,
      "Chaque élément reste modulable jusqu'à la validation finale du design.",
      quotePhotos.length ? "Les visuels présentés en page 2 illustrent l'intention créative ; ils ne constituent pas un rendu contractuel." : "",
    ].filter(Boolean);
    for (const cond of conditions) for (const l of wrap(cond, font, 9, A4.w - 2 * M)) { text(l, M, 9); y -= 12; }

    // ---- Bon pour accord
    y -= 28;
    const half = (A4.w - 2 * M - 24) / 2;
    text("Lieu et date", M, 8, { color: gray });
    text("Bon pour accord — signature", M + half + 24, 8, { color: gray });
    y -= 26;
    page.drawLine({ start: { x: M, y }, end: { x: M + half, y }, thickness: 0.7, color: line });
    page.drawLine({ start: { x: M + half + 24, y }, end: { x: A4.w - M, y }, thickness: 0.7, color: line });

    // ---- Pied de page
    const footer: string[] = [];
    if (!s.vatEnabled) footer.push("Non assujetti à la TVA (art. 10 LTVA) — TVA non applicable.");
    footer.push(`Document généré par ${brand.name} le ${dt(new Date())}.`);
    let fy = M;
    for (const l of footer.reverse()) {
      page.drawText(safe(l), { x: M, y: fy, size: 7.5, font, color: gray });
      fy += 10;
    }

    // ---- Page 2 : Visuels du concept (photos cochées « sur le devis »)
    if (quotePhotos.length) {
      const sharp = (await import("sharp")).default;
      const path = await import("path");
      const { readFile } = await import("fs/promises");
      const dir = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

      const images: { img: Awaited<ReturnType<typeof doc.embedJpg>>; w: number; h: number }[] = [];
      for (const rel of quotePhotos) {
        try {
          // Les photos sont stockées en webp — pdf-lib ne lit que JPG/PNG : conversion à la volée.
          const buf = await readFile(path.join(dir, rel));
          const jpg = await sharp(buf).rotate().resize(1400, 1400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
          const img = await doc.embedJpg(jpg);
          images.push({ img, w: img.width, h: img.height });
        } catch (e) {
          console.error("devis visuel illisible:", rel, e);
        }
      }

      if (images.length) {
        const p2 = doc.addPage([A4.w, A4.h]);
        let y2 = A4.h - M;
        p2.drawText(safe("Visuels du concept"), { x: M, y: y2, size: 15, font: bold, color: accent });
        p2.drawText(safe(`Devis n° ${no}`), { x: A4.w - M - font.widthOfTextAtSize(safe(`Devis n° ${no}`), 9), y: y2 + 3, size: 9, font, color: gray });
        y2 -= 16;
        // La précision qui compte : inspiration, pas rendu exact — chaque pièce est faite main.
        const disclaimer =
          "Ces visuels illustrent l'intention créative et la direction artistique du projet. " +
          "Chaque création étant réalisée entièrement à la main, la pièce livrée pourra s'écarter de ces images " +
          "(proportions, teintes, détails de décor) tout en respectant l'esprit du concept validé ensemble. " +
          "Ils constituent une source d'inspiration, non un engagement sur un rendu à l'identique.";
        for (const l of wrap(disclaimer, font, 9, A4.w - 2 * M)) {
          p2.drawText(safe(l), { x: M, y: y2, size: 9, font, color: gray });
          y2 -= 12;
        }
        y2 -= 10;

        // Grille 2 colonnes — cases égales, image centrée à l'échelle.
        const gap = 14;
        const boxW = (A4.w - 2 * M - gap) / 2;
        const boxH = images.length <= 2 ? 380 : 280;
        images.slice(0, 4).forEach(({ img, w, h }, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const scale = Math.min(boxW / w, boxH / h);
          const dw = w * scale;
          const dh = h * scale;
          const x = M + col * (boxW + gap) + (boxW - dw) / 2;
          const yTop = y2 - row * (boxH + gap);
          p2.drawImage(img, { x, y: yTop - dh - (boxH - dh) / 2, width: dw, height: dh }); // centrée dans sa case
        });

        p2.drawText(safe(`Document généré par ${brand.name} le ${dt(new Date())}.`), { x: M, y: M, size: 7.5, font, color: gray });
      }
    }

    const bytes = await doc.save();
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="devis-${no}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("devis pdf:", e);
    return new NextResponse("Devis impossible — détail dans les logs du serveur.", { status: 500 });
  }
}
