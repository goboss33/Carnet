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

/* -------------------------------------------------------------------------
   Brouillon de réponse au client (devis) rédigé au ton de Maman Gâteau.
   Renvoie un texte prêt à relire/envoyer, ou null si l'IA n'est pas dispo.
------------------------------------------------------------------------- */

export type DraftInput = {
  firstName: string;
  occasion: string;
  eventDate: Date | null;
  celebrant: string;
  celebrantAge: number | null;
  parts: number | null;
  tiers: number | null;
  biscuit: string;
  fourrages: string[];
  style: string;
  themeNote: string;
  priceQuoted: number | null;
  deliveryMode: string;
  deliveryAddress: string;
};

export async function draftQuoteReply(o: DraftInput): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || FALLBACK_MODEL;

  const details = [
    `- Cliente : ${o.firstName}`,
    `- Occasion : ${o.occasion || "?"}`,
    o.eventDate ? `- Date : ${o.eventDate.toLocaleDateString("fr-CH")}` : "",
    o.celebrant ? `- Pour : ${o.celebrant}${o.celebrantAge ? ` (${o.celebrantAge} ans)` : ""}` : "",
    o.parts ? `- Format : ${o.parts} parts${o.tiers ? `, ${o.tiers} étage(s)` : ""}` : "",
    o.biscuit ? `- Biscuit : ${o.biscuit}` : "",
    o.fourrages?.length ? `- Fourrage : ${o.fourrages.join(" + ")}` : "",
    o.style ? `- Style : ${o.style}${o.themeNote ? ` (thème : ${o.themeNote})` : ""}` : "",
    o.deliveryMode === "livraison" ? `- Livraison : ${o.deliveryAddress || "à préciser"}` : "- Retrait à l'atelier (Pully)",
    o.priceQuoted ? `- Prix envisagé : CHF ${o.priceQuoted}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `Tu es Annie, créatrice de « Maman Gâteau », cake designer à Pully (Suisse romande).
Rédige un message WhatsApp chaleureux, soigné et personnel en réponse à une demande de devis, prêt à envoyer tel quel.
Ton : vouvoiement, à la première personne (je), chaleureux et gourmand, sans jargon technique. Un ou deux emojis au maximum.
Contenu : remercie ${o.firstName} pour sa demande, montre que tu as bien noté ce qu'elle souhaite (sans tout réciter mécaniquement), ${o.priceQuoted ? `propose le devis à CHF ${o.priceQuoted}` : "propose d'affiner le devis ensemble"}, invite à valider ou ajuster, et rappelle en douceur qu'un petit acompte permet de bloquer la date (les week-ends partent vite). 5 à 7 phrases, pas plus.
Termine par « À très vite, Annie — Maman Gâteau ». N'ajoute rien d'autre (pas d'objet, pas de balises, pas de guillemets autour du message).
Détails de la commande :
${details}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
        }),
      }
    );
    if (!res.ok) {
      console.error("gemini draft http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.error("gemini draft error", e);
    return null;
  }
}
