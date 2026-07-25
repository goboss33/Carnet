/* ---------------------------------------------------------------------------
   Flyer partenaire — compose branding/flyer-base.png + QR + code, à la volée.
   Constantes calées sur la base générée (1240×1748 @300dpi).

   Le bas du flyer est RÉÉCRIT par-dessus la base : les lignes de contact
   gagnent les logos Instagram et WhatsApp (l'œil les repère avant de lire) et
   le texte passe du brun clair au chocolat de la marque — le doré et le gris
   d'origine ne tenaient pas le contraste sur le fond beige, surtout imprimés.
   Le fond de cette zone est parfaitement uni (#E1D9D3), d'où des aplats de
   recouvrement invisibles.
--------------------------------------------------------------------------- */

import path from "path";
import { readFile } from "fs/promises";
import sharp, { type OverlayOptions } from "sharp";
import QRCode from "qrcode";

const QR_X = 96 + 22;
const QR_Y = 1258 + 22;
const QR_SIZE = 296;
const CODE_LINE_Y = 1708;
const W = 1240;
const H = 1748;

/* Couleurs (contraste mesuré sur le fond beige #E1D9D3) */
const BG = "#E1D9D3";
const INK = "#4A2C20"; // chocolat de la marque — ~9:1
const SOFT = "#6B5C4F"; // gris chaud — ~4,6:1 (AA)
const GOLD = "#8A6A2E"; // doré assombri — le #C9A34D d'origine tombait à ~2:1

/* Coordonnées relevées sur la base */
const SUB_Y = 1224; // sous-titre « CAKE DESIGN SUR MESURE… »
const IG_Y = 1503;
const WA_Y = 1549;
const TXT_X = 532; // colonne de texte, à droite des icônes
const ICON_X = 487;
const ICON = 30;
const FOOT_Y = 1690;

/* Coordonnées de marque (identiques à celles de la base) */
const SUBTITLE = "CAKE DESIGN SUR MESURE — LAUSANNE · RIVIERA";
const INSTAGRAM = "@maman.gateau.suisse";
const PHONE = "+41 77 440 18 29 · Pully";
const FOOTER = "DEVIS GRATUIT EN 24 H · RÉPONSE PERSONNELLE D’ANNIE";

/* Tracés officiels des marques (Simple Icons, viewBox 24) */
const IG_PATH =
  "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z";
const WA_PATH =
  "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const icon = (d: string, x: number, y: number, size: number, fill: string) =>
  `<g transform="translate(${x},${y}) scale(${size / 24})"><path d="${d}" fill="${fill}"/></g>`;

/** Surcouche du bas de flyer : contraste + logos des réseaux. */
function bottomOverlay(): Buffer {
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="200" y="1198" width="840" height="34" fill="${BG}"/>
      <rect x="470" y="1494" width="770" height="98" fill="${BG}"/>
      <rect x="180" y="1664" width="880" height="40" fill="${BG}"/>

      <text x="${W / 2}" y="${SUB_Y}" text-anchor="middle" font-family="Quicksand" font-size="27"
        font-weight="500" letter-spacing="2.5" fill="${GOLD}">${esc(SUBTITLE)}</text>

      ${icon(IG_PATH, ICON_X, IG_Y, ICON, INK)}
      <text x="${TXT_X}" y="${IG_Y + 27}" font-family="Quicksand" font-size="32" font-weight="500" fill="${INK}">${esc(INSTAGRAM)}</text>

      ${icon(WA_PATH, ICON_X, WA_Y, ICON, INK)}
      <text x="${TXT_X}" y="${WA_Y + 27}" font-family="Quicksand" font-size="32" font-weight="500" fill="${INK}">${esc(PHONE)}</text>

      <text x="${W / 2}" y="${FOOT_Y}" text-anchor="middle" font-family="Quicksand" font-size="24"
        font-weight="500" letter-spacing="1.5" fill="${SOFT}">${esc(FOOTER)}</text>
    </svg>`
  );
}

const SITE = () => process.env.FLYER_SITE_URL ?? "https://mamangateau.ch";

export async function buildFlyer(opts: { code?: string } = {}): Promise<Buffer> {
  const base = await readFile(path.resolve(process.cwd(), "branding/flyer-base.png"));

  const target = opts.code ? `${SITE()}/?ref=${encodeURIComponent(opts.code)}` : `${SITE()}/#configurateur`;
  const qrPng = await QRCode.toBuffer(target, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: QR_SIZE,
    color: { dark: "#4A2C20", light: "#FFFFFF" },
  });

  const composites: OverlayOptions[] = [
    { input: bottomOverlay(), left: 0, top: 0 },
    { input: qrPng, left: QR_X, top: QR_Y },
  ];

  if (opts.code) {
    const label = `CODE PARTENAIRE :  ${opts.code.toUpperCase()}`;
    const svg = Buffer.from(
      `<svg width="${W}" height="48" xmlns="http://www.w3.org/2000/svg">
        <text x="${W / 2}" y="34" text-anchor="middle" font-family="Quicksand" font-size="27"
          letter-spacing="3" fill="${SOFT}">${esc(label)}</text>
      </svg>`
    );
    composites.push({ input: svg, left: 0, top: CODE_LINE_Y });
  }

  return sharp(base).composite(composites).png().toBuffer();
}
