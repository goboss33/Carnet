/* Analyse d'un ticket de caisse via Gemini (API REST, clé du projet GCP). */

export type ReceiptData = {
  merchant: string;
  date: string | null; // ISO
  totalCents: number;
  vat: { rate: number; amountCents: number }[];
  category: "MATIERES_PREMIERES" | "EMBALLAGE" | "MATERIEL" | "DEPLACEMENT" | "MARKETING" | "AUTRE";
};

const PROMPT = `Tu analyses un justificatif d'achat suisse (ticket de caisse, facture en ligne, PDF) pour la comptabilité d'une pâtissière artisanale (cake design).
Extrais et réponds UNIQUEMENT avec un objet JSON (aucun autre texte) :
{
  "merchant": "nom du commerce (ex. Migros, Coop, Landi)",
  "date": "date du ticket au format YYYY-MM-DD, ou null si illisible",
  "total_chf": nombre décimal (total payé en CHF),
  "vat": [{ "rate": taux TVA en %, "amount_chf": montant TVA en CHF }],
  "category": "MATIERES_PREMIERES" | "EMBALLAGE" | "MATERIEL" | "DEPLACEMENT" | "MARKETING" | "AUTRE"
}
Catégorie : MATIERES_PREMIERES pour l'alimentaire (farine, beurre, œufs, sucre, décors comestibles…),
EMBALLAGE pour boîtes/cartons/rubans, MATERIEL pour ustensiles/moules/petit équipement,
DEPLACEMENT pour essence/parking/transports, MARKETING pour impressions/pub. Sinon AUTRE.`;

const FALLBACK_MODEL = "gemini-flash-latest";

/** Extrait le premier objet JSON balancé d'un texte (fences et bavardage tolérés). */
function extractJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    else if (!inStr) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

export async function analyzeReceipt(image: Buffer, mime = "image/webp"): Promise<ReceiptData | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || FALLBACK_MODEL;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callGemini(key, model, image, mime);
    if (r === "MODEL_GONE") break;
    if (r) return r;
    console.warn(`gemini: tentative ${attempt + 1} sans résultat exploitable${attempt === 0 ? " → retry" : ""}`);
  }
  if ((process.env.GEMINI_MODEL || FALLBACK_MODEL) !== FALLBACK_MODEL) {
    console.warn(`gemini: fallback ${FALLBACK_MODEL}`);
    const r = await callGemini(key, FALLBACK_MODEL, image, mime);
    return r === "MODEL_GONE" ? null : r;
  }
  return null;
}

async function callGemini(key: string, model: string, image: Buffer, mime: string): Promise<ReceiptData | null | "MODEL_GONE"> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime, data: image.toString("base64") } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 4096 },
        }),
      }
    );
    if (res.status === 404) {
      await res.text().catch(() => "");
      return "MODEL_GONE";
    }
    if (!res.ok) {
      console.error("gemini http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== "STOP") {
      console.warn("gemini finishReason:", cand.finishReason);
    }
    const text: string = (cand?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    if (!text.trim()) return null;
    const j = extractJson(text);
    if (!j) {
      console.error("gemini bad json:", text.slice(0, 300));
      return null;
    }
    const cats = ["MATIERES_PREMIERES", "EMBALLAGE", "MATERIEL", "DEPLACEMENT", "MARKETING", "AUTRE"];
    return {
      merchant: String(j.merchant ?? "").slice(0, 80),
      date: typeof j.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null,
      totalCents: Math.round(Number(j.total_chf ?? 0) * 100) || 0,
      vat: Array.isArray(j.vat)
        ? j.vat
            .filter((v: Record<string, unknown>) => v && !isNaN(Number(v.rate)))
            .map((v: Record<string, unknown>) => ({
              rate: Number(v.rate),
              amountCents: Math.round(Number(v.amount_chf ?? 0) * 100) || 0,
            }))
        : [],
      category: (typeof j.category === "string" && cats.includes(j.category) ? j.category : "AUTRE") as ReceiptData["category"],
    };
  } catch (e) {
    console.error("gemini error", e);
    return null;
  }
}
