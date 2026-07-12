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

export async function analyzeReceipt(image: Buffer, mime = "image/webp"): Promise<ReceiptData | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || FALLBACK_MODEL;
  const first = await callGemini(key, model, image, mime);
  if (first !== "MODEL_GONE") return first;
  console.warn(`gemini: modèle « ${model} » indisponible → fallback ${FALLBACK_MODEL}`);
  const second = await callGemini(key, FALLBACK_MODEL, image, mime);
  return second === "MODEL_GONE" ? null : second;
}

async function callGemini(key: string, model: string, image: Buffer, mime: string): Promise<ReceiptData | null | "MODEL_GONE"> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime, data: image.toString("base64") } },
              ],
            },
          ],
          generationConfig: { response_mime_type: "application/json", temperature: 0 },
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
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const j = JSON.parse(text);
    const cats = ["MATIERES_PREMIERES", "EMBALLAGE", "MATERIEL", "DEPLACEMENT", "MARKETING", "AUTRE"];
    return {
      merchant: String(j.merchant ?? "").slice(0, 80),
      date: j.date && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null,
      totalCents: Math.round(Number(j.total_chf ?? 0) * 100) || 0,
      vat: Array.isArray(j.vat)
        ? j.vat
            .filter((v: Record<string, unknown>) => v && !isNaN(Number(v.rate)))
            .map((v: Record<string, unknown>) => ({
              rate: Number(v.rate),
              amountCents: Math.round(Number(v.amount_chf ?? 0) * 100) || 0,
            }))
        : [],
      category: (cats.includes(j.category) ? j.category : "AUTRE") as ReceiptData["category"],
    };
  } catch (e) {
    console.error("gemini error", e);
    return null;
  }
}
