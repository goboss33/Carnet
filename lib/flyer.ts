/* ---------------------------------------------------------------------------
   Flyer partenaire — compose branding/flyer-base.png + QR + code, à la volée.
   Constantes calées sur la base générée (1240×1748 @300dpi).
--------------------------------------------------------------------------- */

import path from "path";
import { readFile } from "fs/promises";
import sharp from "sharp";
import QRCode from "qrcode";

const QR_X = 96 + 22;
const QR_Y = 1258 + 22;
const QR_SIZE = 296;
const CODE_LINE_Y = 1708;
const W = 1240;

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

  const composites: sharp.OverlayOptions[] = [{ input: qrPng, left: QR_X, top: QR_Y }];

  if (opts.code) {
    const label = `CODE PARTENAIRE :  ${opts.code.toUpperCase()}`;
    const svg = Buffer.from(
      `<svg width="${W}" height="48" xmlns="http://www.w3.org/2000/svg">
        <text x="${W / 2}" y="34" text-anchor="middle" font-family="Quicksand" font-size="27"
          letter-spacing="3" fill="#968A7C">${label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
      </svg>`
    );
    composites.push({ input: svg, left: 0, top: CODE_LINE_Y });
  }

  return sharp(base).composite(composites).png().toBuffer();
}
