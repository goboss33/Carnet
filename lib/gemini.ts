/* Analyse d'un ticket de caisse via Gemini (API REST, clé du projet GCP). */

/* ------------------------- Laboratoire IA : trace de chaque appel ------ */
import { logAiCall as logPrompt } from "@/lib/ai-log";

export type ReceiptData = {
  merchant: string;
  date: string | null; // ISO
  totalCents: number;
  vat: { rate: number; amountCents: number }[];
  category: "MATIERES_PREMIERES" | "EMBALLAGE" | "MATERIEL" | "MARKETING" | "AUTRE";
};

const PROMPT = `Tu analyses un justificatif d'achat suisse (ticket de caisse, facture en ligne, PDF) pour la comptabilité d'une pâtissière artisanale (cake design).
Extrais et réponds UNIQUEMENT avec un objet JSON (aucun autre texte) :
{
  "merchant": "nom du commerce (ex. Migros, Coop, Landi)",
  "date": "date du ticket au format YYYY-MM-DD, ou null si illisible",
  "total_chf": nombre décimal (total payé en CHF),
  "vat": [{ "rate": taux TVA en %, "amount_chf": montant TVA en CHF }],
  "category": "MATIERES_PREMIERES" | "EMBALLAGE" | "MATERIEL" | "MARKETING" | "AUTRE"
}
Catégorie : MATIERES_PREMIERES pour l'alimentaire (farine, beurre, œufs, sucre, décors comestibles…),
EMBALLAGE pour boîtes/cartons/rubans, MATERIEL pour ustensiles/moules/petit équipement,
MARKETING pour impressions/pub. Sinon AUTRE (y compris essence/entretien du véhicule :
ils sont couverts par le forfait kilométrique, pas par les dépenses).`;

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
  const t0 = Date.now();
  const done = (r: ReceiptData | null) => {
    logPrompt("recu.ocr", PROMPT, "[image du justificatif]", r ? JSON.stringify(r) : null, Boolean(r), Date.now() - t0);
    return r;
  };
  const model = process.env.GEMINI_MODEL || FALLBACK_MODEL;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await callGemini(key, model, image, mime);
    if (r === "MODEL_GONE") break;
    if (r) return done(r);
    console.warn(`gemini: tentative ${attempt + 1} sans résultat exploitable${attempt === 0 ? " → retry" : ""}`);
  }
  if ((process.env.GEMINI_MODEL || FALLBACK_MODEL) !== FALLBACK_MODEL) {
    console.warn(`gemini: fallback ${FALLBACK_MODEL}`);
    const r = await callGemini(key, FALLBACK_MODEL, image, mime);
    return done(r === "MODEL_GONE" ? null : r);
  }
  return done(null);
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
    const cats = ["MATIERES_PREMIERES", "EMBALLAGE", "MATERIEL", "MARKETING", "AUTRE"];
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

/* ------------------------------------------------------------------------
   Générateur générique (multimodal, multi-tours) — pour l'assistant de rédaction.
------------------------------------------------------------------------- */

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function geminiGenerate(opts: {
  system?: string;
  contents: { role: "user" | "model"; parts: GeminiPart[] }[];
  temperature?: number;
  maxOutputTokens?: number;
  kind?: string; // étiquette pour le Laboratoire IA (Réglages → Assistant)
  model?: string; // surcharge ponctuelle (ex. GEMINI_STORY_MODEL pour le récit)
}): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = opts.model || process.env.GEMINI_MODEL || FALLBACK_MODEL;
  const t0 = Date.now();
  const userText = opts.contents
    .map((c) => `[${c.role}] ` + c.parts.map((p) => ("text" in p ? p.text : "[image]")).join("\n"))
    .join("\n---\n");
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(40000),
        body: JSON.stringify({
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          contents: opts.contents,
          // Plafond large : les modèles « thinking » consomment des tokens de sortie
          // pour raisonner avant d'écrire → sinon la réponse est tronquée.
          generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.maxOutputTokens ?? 8192 },
        }),
      }
    );
    if (!res.ok) {
      const errTxt = await res.text().catch(() => "");
      console.error("gemini gen http", res.status, errTxt);
      if (opts.kind) logPrompt(opts.kind, opts.system ?? "", userText, `HTTP ${res.status} ${errTxt}`, false, Date.now() - t0);
      return null;
    }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== "STOP") {
      console.warn("gemini gen finishReason:", cand.finishReason); // MAX_TOKENS = réponse coupée
    }
    const text: string = (cand?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim();
    if (opts.kind) logPrompt(opts.kind, opts.system ?? "", userText, text, Boolean(text), Date.now() - t0);
    return text || null;
  } catch (e) {
    console.error("gemini gen error", e);
    if (opts.kind) logPrompt(opts.kind, opts.system ?? "", userText, String(e), false, Date.now() - t0);
    return null;
  }
}

/* ------------------------------------------------------------------------
   Capture de conversation (WhatsApp / Instagram / FB) → demande structurée.
------------------------------------------------------------------------- */

export type ConversationData = {
  isRequest: boolean;
  channel: "whatsapp" | "instagram" | "facebook" | "sms" | "email" | "autre";
  contactName: string | null;
  contactPhone: string | null;
  instagram: string | null;
  celebrant: string | null;
  celebrantAge: number | null;
  occasion: string | null;
  eventDate: string | null; // YYYY-MM-DD
  eventTime: string | null;
  handoverTime: string | null; // HH:MM — heure de retrait/livraison convenue
  eventPlace: string | null;
  parts: number | null;
  flavors: string | null;
  theme: string | null;
  deliveryMode: "retrait" | "livraison" | null;
  deliveryAddress: string | null;
  priceQuoted: number | null; // CHF
  depositMentioned: boolean;
  referredBy: string | null;
  summary: string;
};

/** Première image → RECU (justificatif), CONV (capture de messagerie) ou AUTRE. */
export async function classifyInbound(image: Buffer, mime: string): Promise<"receipt" | "conversation" | "autre"> {
  const out = await geminiGenerate({
    contents: [{
      role: "user",
      parts: [
        { text: "Classifie cette image. Réponds par UN SEUL mot :\nRECU — ticket de caisse, facture, justificatif d'achat (papier ou en ligne)\nCONV — capture d'écran d'une conversation (WhatsApp, Instagram, Messenger, SMS, e-mail / Gmail / Outlook) ou export de discussion\nAUTRE — tout le reste" },
        { inline_data: { mime_type: mime, data: image.toString("base64") } },
      ],
    }],
    temperature: 0,
    maxOutputTokens: 2048,
    kind: "capture.tri",
  });
  const w = (out ?? "").toUpperCase();
  if (w.includes("CONV")) return "conversation";
  if (w.includes("RECU") || w.includes("REÇU")) return "receipt";
  return "autre";
}

const CONV_PROMPT = (today: string) => `Tu assistes une pâtissière artisanale suisse (cake design, région Lausanne).
On te donne une conversation avec une cliente : captures d'écran de messagerie (dans l'ordre) ou export texte.
Les messages de la pâtissière sont ceux alignés à droite (WhatsApp : bulles vertes) ou signés « Annie / Maman Gâteau ».
Extrais la demande de gâteau. Nous sommes le ${today}. Réponds UNIQUEMENT avec cet objet JSON :
{
  "is_request": true si la conversation contient une demande/commande de gâteau ou cupcakes, sinon false,
  "channel": "whatsapp" | "instagram" | "facebook" | "sms" | "email" | "autre" (déduis de l'interface visible ; « email » si c'est une boîte mail / Gmail / Outlook),
  "contact_name": "nom de la cliente (souvent dans l'en-tête ou sa signature)" | null,
  "contact_phone": "numéro au format international visible dans l'en-tête ou le texte" | null,
  "instagram": "pseudo instagram si visible" | null,
  "celebrant": "prénom de la personne fêtée" | null,
  "celebrant_age": âge fêté (nombre) | null,
  "occasion": "Anniversaire d'enfant" | "Anniversaire d'adulte" | "Mariage" | "Baby shower" | "Événement d'entreprise" | "Autre occasion" | null — classe TOUJOURS dans cette liste exacte (jamais de texte libre) ; l'âge va dans celebrant_age, pas ici ; anniversaire : enfant si ≤ 15 ans, adulte sinon ; baptême, communion, etc. → "Autre occasion",
  "event_date": "YYYY-MM-DD (résous les dates relatives par rapport à aujourd'hui ; année suivante si la date est passée)" | null,
  "event_time": "HH:MM ou plage (ex. 15-18h)" | null,
  "handover_time": "HH:MM — heure de RETRAIT ou de LIVRAISON convenue avec la pâtissière (différente de l'heure de la fête)" | null,
  "event_place": "lieu de la fête" | null,
  "parts": nombre de parts/invités | null,
  "flavors": "saveurs/fourrages évoqués, texte court" | null,
  "theme": "thème + couleurs (ex. axolotl, vert canard)" | null,
  "delivery_mode": "retrait" si la cliente vient chercher, "livraison" si livraison demandée, sinon null,
  "delivery_address": "adresse de livraison" | null,
  "price_quoted": prix annoncé par la pâtissière en CHF (nombre) | null,
  "deposit_mentioned": true si un acompte versé/confirmé est mentionné,
  "referred_by": "qui a recommandé (ex. « Daniela »)" | null,
  "summary": "résumé de 1-2 phrases : où en est la discussion, prochaines étapes"
}
N'invente RIEN : null quand l'information n'apparaît pas.`;

export async function analyzeConversation(parts: GeminiPart[]): Promise<ConversationData | null> {
  const today = new Date().toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich", year: "numeric", month: "long", day: "numeric" });
  const out = await geminiGenerate({
    system: CONV_PROMPT(today),
    contents: [{ role: "user", parts }],
    temperature: 0,
    maxOutputTokens: 4096,
    kind: "capture.analyse",
  });
  if (!out) return null;
  const j = extractJson(out);
  if (!j) { console.error("gemini conv bad json:", out.slice(0, 300)); return null; }
  const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? Math.round(v) : null);
  const channels = ["whatsapp", "instagram", "facebook", "sms", "email"];
  return {
    isRequest: j.is_request === true,
    channel: (channels.includes(String(j.channel)) ? String(j.channel) : "autre") as ConversationData["channel"],
    contactName: str(j.contact_name, 80),
    contactPhone: str(j.contact_phone, 30),
    instagram: str(j.instagram, 60),
    celebrant: str(j.celebrant, 60),
    celebrantAge: num(j.celebrant_age),
    occasion: str(j.occasion, 60),
    eventDate: typeof j.event_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.event_date) ? j.event_date : null,
    eventTime: str(j.event_time, 30),
    handoverTime: typeof j.handover_time === "string" && /^\d{1,2}[h:]\d{2}$/.test(j.handover_time.trim()) ? j.handover_time.trim() : null,
    eventPlace: str(j.event_place, 120),
    parts: num(j.parts),
    flavors: str(j.flavors, 160),
    theme: str(j.theme, 160),
    deliveryMode: j.delivery_mode === "retrait" || j.delivery_mode === "livraison" ? j.delivery_mode : null,
    deliveryAddress: str(j.delivery_address, 200),
    priceQuoted: num(j.price_quoted),
    depositMentioned: j.deposit_mentioned === true,
    referredBy: str(j.referred_by, 80),
    summary: str(j.summary, 400) ?? "",
  };
}
