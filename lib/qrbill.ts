/* ---------------------------------------------------------------------------
   QR-facture suisse (Swiss QR-bill) — section de paiement normée dessinée en
   bas d'une page A4 pdf-lib : récépissé (62 mm) + section paiement avec
   Swiss QR Code (croix suisse) et montant. Payload SPC v2.2, référence NON
   (IBAN classique, message non structuré) — scannable par toutes les apps
   bancaires suisses. Tailles de police et zones selon les Implementation
   Guidelines SIX (titre 11, en-têtes 6/8, valeurs 8/10, QR 46 mm).
--------------------------------------------------------------------------- */
import QRCode from "qrcode";
import { rgb, type PDFDocument, type PDFPage, type PDFFont } from "pdf-lib";
import { safePdfText as safe } from "@/lib/pdf";

export const QR_ZONE_PT = 105 * 2.834645669; // hauteur réservée en bas de page

const mm = (v: number) => v * 2.834645669;
const BLACK = rgb(0, 0, 0);

export type QrBillData = {
  iban: string; // IBAN CH/LI, avec ou sans espaces
  creditorName: string;
  creditorLine1: string; // rue et n°
  creditorLine2: string; // NPA localité
  amountCents: number;
  debtorName?: string;
  debtorLine1?: string;
  debtorLine2?: string;
  message?: string; // ex. « Facture 0042 »
};

export function qrBillReady(iban: string, addressLines: string[]): boolean {
  return /^(CH|LI)\d{19}$/.test(iban.replace(/\s+/g, "").toUpperCase()) && addressLines.length >= 2;
}

/* « Rue du Four 12, 1261 Le Vaud » → ["Rue du Four 12", "1261 Le Vaud"] */
export function splitAddress(raw: string): [string, string] | null {
  const i = raw.lastIndexOf(",");
  if (i < 1) return null;
  const l1 = raw.slice(0, i).trim();
  const l2 = raw.slice(i + 1).trim();
  return l1 && l2 ? [l1.slice(0, 70), l2.slice(0, 70)] : null;
}

function payload(d: QrBillData): string {
  const iban = d.iban.replace(/\s+/g, "").toUpperCase();
  // Jeu de caractères admis = sous-ensemble Latin-1 → même sanitizer que l'impression.
  const t = (s: string | undefined, max: number) => safe((s ?? "").trim()).slice(0, max);
  const creditor = ["K", t(d.creditorName, 70), t(d.creditorLine1, 70), t(d.creditorLine2, 70), "", "", "CH"];
  const debtor = d.debtorName
    ? ["K", t(d.debtorName, 70), t(d.debtorLine1, 70), t(d.debtorLine2, 70), "", "", "CH"]
    : ["", "", "", "", "", "", ""];
  return [
    "SPC", "0200", "1",
    iban,
    ...creditor,
    "", "", "", "", "", "", "", // ultimate creditor (réservé)
    (d.amountCents / 100).toFixed(2),
    "CHF",
    ...debtor,
    "NON", "",
    t(d.message, 140),
    "EPD",
  ].join("\r\n");
}

const fmtIban = (iban: string) => iban.replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
const fmtAmount = (c: number) => (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/* Dessine la section de paiement (0 → 105 mm) sur la page fournie. */
export async function drawQrBill(
  doc: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  d: QrBillData
): Promise<void> {
  const png = await QRCode.toBuffer(payload(d), {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 640,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qr = await doc.embedPng(png);

  const W = page.getWidth();
  const t = (raw: string, x: number, y: number, size: number, b = false) =>
    page.drawText(safe(raw), { x, y, size, font: b ? bold : font, color: BLACK });

  // Traits de séparation (pointillés) + consigne
  const dash = { thickness: 0.6, color: BLACK, dashArray: [3, 3] as number[] };
  page.drawLine({ start: { x: 0, y: mm(105) }, end: { x: W, y: mm(105) }, ...dash });
  page.drawLine({ start: { x: mm(62), y: 0 }, end: { x: mm(62), y: mm(105) }, ...dash });
  const note = "À détacher avant le versement";
  page.drawText(safe(note), {
    x: (W - font.widthOfTextAtSize(safe(note), 7)) / 2, y: mm(106.5), size: 7, font, color: BLACK,
  });

  const creditor = [d.creditorName, d.creditorLine1, d.creditorLine2];
  const debtor = d.debtorName ? [d.debtorName, d.debtorLine1 ?? "", d.debtorLine2 ?? ""].filter(Boolean) : null;

  // ---------------- Récépissé (gauche, marges 5 mm)
  {
    const x = mm(5);
    t("Récépissé", x, mm(93), 11, true);
    let y = mm(88);
    t("Compte / Payable à", x, y, 6, true); y -= mm(3.4);
    t(fmtIban(d.iban), x, y, 8); y -= mm(3.4);
    for (const l of creditor) { t(l, x, y, 8); y -= mm(3.4); }
    y -= mm(3);
    t("Payable par" + (debtor ? "" : " (nom/adresse)"), x, y, 6, true); y -= mm(3.4);
    if (debtor) for (const l of debtor) { t(l, x, y, 8); y -= mm(3.4); }
    else y -= mm(12); // espace à remplir à la main
    t("Monnaie", x, mm(18), 6, true);
    t("Montant", x + mm(13), mm(18), 6, true);
    t("CHF", x, mm(14.5), 8);
    t(fmtAmount(d.amountCents), x + mm(13), mm(14.5), 8);
    const pd = "Point de dépôt";
    page.drawText(safe(pd), { x: mm(57) - bold.widthOfTextAtSize(safe(pd), 6), y: mm(8), size: 6, font: bold, color: BLACK });
  }

  // ---------------- Section paiement (droite)
  {
    const x = mm(67);
    t("Section paiement", x, mm(93), 11, true);

    // Swiss QR Code — 46 mm, croix suisse 7 mm au centre
    const qy = mm(42);
    page.drawImage(qr, { x, y: qy, width: mm(46), height: mm(46) });
    const cx = x + mm(23), cy = qy + mm(23);
    page.drawRectangle({ x: cx - mm(4), y: cy - mm(4), width: mm(8), height: mm(8), color: rgb(1, 1, 1) });
    page.drawRectangle({ x: cx - mm(3.3), y: cy - mm(3.3), width: mm(6.6), height: mm(6.6), color: BLACK });
    page.drawRectangle({ x: cx - mm(0.6), y: cy - mm(2.1), width: mm(1.2), height: mm(4.2), color: rgb(1, 1, 1) });
    page.drawRectangle({ x: cx - mm(2.1), y: cy - mm(0.6), width: mm(4.2), height: mm(1.2), color: rgb(1, 1, 1) });

    // Monnaie / Montant sous le QR
    t("Monnaie", x, mm(37), 8, true);
    t("Montant", x + mm(16), mm(37), 8, true);
    t("CHF", x, mm(32.8), 10);
    t(fmtAmount(d.amountCents), x + mm(16), mm(32.8), 10);

    // Colonne d'informations à droite du QR
    const ix = mm(118);
    let y = mm(90);
    t("Compte / Payable à", ix, y, 8, true); y -= mm(4);
    t(fmtIban(d.iban), ix, y, 10); y -= mm(4);
    for (const l of creditor) { t(l, ix, y, 10); y -= mm(4); }
    if (d.message) {
      y -= mm(2);
      t("Informations supplémentaires", ix, y, 8, true); y -= mm(4);
      t(d.message.slice(0, 46), ix, y, 10); y -= mm(4);
    }
    y -= mm(2);
    t("Payable par" + (debtor ? "" : " (nom/adresse)"), ix, y, 8, true); y -= mm(4);
    if (debtor) for (const l of debtor) { t(l, ix, y, 10); y -= mm(4); }
  }
}
