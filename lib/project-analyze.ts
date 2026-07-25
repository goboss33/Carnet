/* ---------------------------------------------------------------------------
   Analyse IA d'un échange client (capture d'e-mail / WhatsApp) → proposition
   de fiche : mode standard (champs gâteau) OU Mode ligne (postes du devis).
   Même plomberie Gemini que l'OCR des tickets ; sortie JSON stricte.
--------------------------------------------------------------------------- */
import { extractJson } from "@/lib/gemini";
import { logAiCall } from "@/lib/ai-log";
import type { OrderItem } from "@/lib/order-items";

export type ProjectAnalysis = {
  mode: "ligne" | "standard";
  occasion?: string;
  themeNote?: string;
  celebrant?: string;
  celebrantAge?: number;
  parts?: number;
  tiers?: number;
  eventDate?: string; // YYYY-MM-DD
  price?: number; // CHF
  items?: OrderItem[];
};

const PROMPT = `Tu analyses la capture d'écran d'un échange client (e-mail, WhatsApp, Instagram) pour une pâtissière artisanale suisse (gâteaux sur mesure).
Objectif : pré-remplir la fiche de commande. Réponds UNIQUEMENT avec un objet JSON :
{
  "mode": "ligne" | "standard",
  "occasion": "texte court ou null",
  "theme": "thème/style souhaité ou null",
  "celebrant": "prénom de la personne fêtée, ou nom de l'entreprise si événement d'entreprise, ou null",
  "celebrant_age": nombre ou null (ex. 6 pour un enfant ; 100 pour un centenaire d'entreprise),
  "parts": nombre de parts ou null,
  "tiers": 1 ou 2 ou null (nombre d'étages, seulement si mentionné),
  "event_date": "YYYY-MM-DD" ou null,
  "price_chf": nombre ou null (prix TOTAL évoqué),
  "items": [ { "label": "désignation courte", "detail": "détail utile ou null", "qty": nombre ou null, "unit_chf": prix unitaire ou null, "amount_chf": montant de la ligne ou null, "optional": true si offert/optionnel } ]
}
Règles pour "mode" :
- "ligne" si l'échange révèle un projet à PLUSIEURS postes distincts (pièce maîtresse + parts de service + livraison/installation…), un client ENTREPRISE, ou un très gros volume (plus de 100 parts).
- "standard" pour un gâteau unique classique (anniversaire, baby shower…), même avec livraison.
Règles pour "items" : seulement si mode = "ligne". Un poste par élément chiffrable ou proposé (y compris dégustation offerte → optional). qty × unit_chf quand l'échange le donne (ex. « 800 parts à 10.– »), sinon amount_chf. N'invente JAMAIS un montant non évoqué : laisse null.
Toutes les valeurs absentes de l'échange → null. Aucun texte hors du JSON.`;

export async function analyzeProjectConversation(image: Buffer, mime: string): Promise<ProjectAnalysis | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image.toString("base64") } }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 4096 },
        }),
      }
    );
    if (!res.ok) {
      console.error("analyse projet http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const text: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const j = extractJson(text);
    logAiCall("projet.analyse", PROMPT, "[capture de l'échange]", text.slice(0, 2000), Boolean(j), Date.now() - t0);
    if (!j) return null;

    const num = (v: unknown, max = 1_000_000) => (typeof v === "number" && isFinite(v) && v > 0 && v <= max ? v : undefined);
    const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const rawItems = Array.isArray(j.items) ? (j.items as Record<string, unknown>[]) : [];
    const items: OrderItem[] = rawItems
      .map((it, i) => {
        const qty = num(it.qty, 100000);
        const unit = num(it.unit_chf, 1_000_000);
        const amount = num(it.amount_chf, 10_000_000);
        const cents = qty && unit ? Math.round(qty * unit * 100) : amount ? Math.round(amount * 100) : 0;
        return {
          id: `ia${Date.now()}${i}`,
          label: str(it.label) ?? "",
          detail: str(it.detail, 300),
          qty: qty ? Math.round(qty) : null,
          unit: unit ? Math.round(unit * 100) : null,
          cents,
          ...(it.optional === true ? { opt: true } : {}),
        };
      })
      .filter((it) => it.label || it.cents > 0)
      .slice(0, 20);

    return {
      mode: j.mode === "ligne" ? "ligne" : "standard",
      occasion: str(j.occasion, 60),
      themeNote: str(j.theme, 120),
      celebrant: str(j.celebrant, 60),
      celebrantAge: num(j.celebrant_age, 150) ? Math.round(num(j.celebrant_age, 150)!) : undefined,
      parts: num(j.parts, 100000) ? Math.round(num(j.parts, 100000)!) : undefined,
      tiers: j.tiers === 1 || j.tiers === 2 ? (j.tiers as number) : undefined,
      eventDate: typeof j.event_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.event_date) ? j.event_date : undefined,
      price: num(j.price_chf, 10_000_000),
      items: items.length ? items : undefined,
    };
  } catch (e) {
    console.error("analyse projet:", e);
    return null;
  }
}
