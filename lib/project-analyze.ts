/* ---------------------------------------------------------------------------
   Analyse IA d'un échange client (texte collé OU captures) → PROPOSITION de
   fiche : mode standard (champs gâteau) ou Mode ligne (postes du devis).
   Règle d'or : cette fonction ne touche JAMAIS la base. Elle rend une
   proposition que l'utilisateur revoit et applique (ou non) champ par champ.

   Garde-fous anti-hallucination :
   - tout montant doit être justifié par une citation textuelle (verbatim) ;
     sans citation, le montant est effacé ;
   - une date d'événement passée ou à plus de 3 ans est rejetée ;
   - le texte collé est toujours préféré à l'image quand les deux existent.
--------------------------------------------------------------------------- */
import { extractJson } from "@/lib/gemini";
import { logAiCall } from "@/lib/ai-log";
import type { OrderItem } from "@/lib/order-items";
import type { OrderPiece, PieceType } from "@/lib/order-pieces";
import { CUPCAKE_STEP, MINI_CUPCAKE_STEP } from "@/lib/pricing";

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
  pieces?: OrderPiece[]; // mode standard : ce qu'il y a à produire (plusieurs gâteaux, cupcakes…)
  client?: { firstName?: string; lastName?: string; phone?: string; email?: string; company?: string };
  channel?: "WHATSAPP" | "INSTAGRAM" | "FACEBOOK" | "EMAIL";
  quoteSent?: boolean;
  warnings: string[]; // ce que l'analyse a écarté (montants sans preuve, date invalide…)
};

const PROMPT = `Tu analyses un échange entre une pâtissière artisanale suisse (gâteaux sur mesure) et un client : soit le TEXTE d'un e-mail/message, soit une ou plusieurs captures d'écran (e-mail, WhatsApp, Instagram).
Objectif : pré-remplir une fiche de commande. Réponds UNIQUEMENT avec un objet JSON :
{
  "mode": "ligne" | "standard",
  "occasion": "texte court ou null",
  "theme": "thème/style souhaité ou null",
  "celebrant": "prénom de la personne fêtée, ou nom de l'entreprise si événement d'entreprise, ou null",
  "celebrant_age": nombre ou null,
  "parts": nombre de parts du gâteau principal ou null,
  "tiers": 1 ou 2 ou null,
  "pieces": [ { "type": "gateau" | "cupcakes" | "mini-cupcakes", "qty": nombre (parts pour un gâteau, pièces pour des cupcakes), "tiers": 1 ou 2 ou null, "biscuit": "vanille|chocolat|citron|… ou null", "fourrage": "goût demandé ou null", "theme": "thème de CETTE pièce ou null" } ],
  "event_date": "YYYY-MM-DD" ou null,
  "price_chf": nombre ou null (prix TOTAL),
  "price_verbatim": "citation EXACTE de l'échange qui donne ce total, ou null",
  "items": [ { "label": "désignation courte", "detail": "détail utile ou null", "qty": nombre ou null, "unit_chf": prix unitaire ou null, "amount_chf": montant ou null, "optional": true si offert/optionnel, "verbatim": "citation EXACTE de l'échange qui justifie ce montant, ou null" } ],
  "client": { "first_name": "prénom ou null", "last_name": "nom ou null", "phone": "n° ou null", "email": "e-mail ou null", "company": "raison sociale si client entreprise, sinon null" },
  "channel": "whatsapp" | "instagram" | "facebook" | "email" | null,
  "quote_sent": true si la pâtissière a DÉJÀ envoyé un devis/estimation chiffrée dans cet échange, sinon false
}

RÈGLES ABSOLUES — le respect de ces règles prime sur la complétude :
1. N'invente RIEN. Si une information n'est pas lisible ou pas présente, mets null. Une fiche vide vaut mieux qu'une fiche fausse.
2. Si l'image est floue, trop petite ou illisible, ne devine pas : mets null partout et "mode": "standard".
3. Tout montant (price_chf, amount_chf, unit_chf) DOIT être accompagné de sa citation exacte dans "verbatim"/"price_verbatim". Pas de citation possible = pas de montant (null).
4. Ne déduis JAMAIS un nom de personne ou une société d'un simple mot visible : recopie ce qui est écrit (adresse e-mail, signature) ou mets null.
5. "mode": "ligne" si le projet a PLUSIEURS postes distincts (pièce maîtresse + parts de service + livraison…), un client ENTREPRISE, ou plus de 100 parts. Sinon "standard".
6. "pieces" : en mode "standard" UNIQUEMENT, liste ce qu'il y a à produire. Un client peut demander DEUX gâteaux différents (ex. « un Mario et un Luigi ») et/ou des cupcakes : une entrée par pièce. Un seul gâteau classique = une seule entrée. Rien de lisible = tableau vide.
Aucun texte hors du JSON.`;

type Input = { text?: string; images?: { buf: Buffer; mime: string }[] };

export async function analyzeConversationInput(input: Input): Promise<ProjectAnalysis | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

  const parts: Record<string, unknown>[] = [{ text: PROMPT }];
  const text = (input.text ?? "").trim();
  if (text) parts.push({ text: `--- ÉCHANGE (texte intégral) ---\n${text.slice(0, 30000)}` });
  for (const im of (input.images ?? []).slice(0, 6)) {
    parts.push({ inline_data: { mime_type: im.mime, data: im.buf.toString("base64") } });
  }
  if (parts.length === 1) return null; // ni texte ni image

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 4096 },
      }),
    });
    if (!res.ok) {
      console.error("analyse échange http", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = await res.json();
    const out: string = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const j = extractJson(out);
    logAiCall(
      "projet.analyse",
      PROMPT,
      text ? `[texte ${text.length} car.]` : `[${(input.images ?? []).length} capture(s)]`,
      out.slice(0, 2000),
      Boolean(j),
      Date.now() - t0
    );
    if (!j) return null;

    const warnings: string[] = [];
    const num = (v: unknown, max = 1_000_000) => (typeof v === "number" && isFinite(v) && v > 0 && v <= max ? v : undefined);
    const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, max) : undefined);
    const cited = (v: unknown) => typeof v === "string" && v.trim().length >= 3; // citation plausible

    // --- Lignes : un montant sans citation est effacé (garde-fou n°3)
    const rawItems = Array.isArray(j.items) ? (j.items as Record<string, unknown>[]) : [];
    let dropped = 0;
    const items: OrderItem[] = rawItems
      .map((it, i) => {
        const ok = cited(it.verbatim);
        const qty = ok ? num(it.qty, 100000) : undefined;
        const unit = ok ? num(it.unit_chf, 1_000_000) : undefined;
        const amount = ok ? num(it.amount_chf, 10_000_000) : undefined;
        if (!ok && (it.amount_chf || it.unit_chf)) dropped++;
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
      .filter((it) => it.label)
      .slice(0, 20);
    if (dropped) warnings.push(`${dropped} montant${dropped > 1 ? "s" : ""} sans citation dans l'échange — laissé${dropped > 1 ? "s" : ""} vide${dropped > 1 ? "s" : ""}`);

    // --- Prix total : même exigence de citation
    let price = num(j.price_chf, 10_000_000);
    if (price && !cited(j.price_verbatim)) { warnings.push("prix total sans citation — écarté"); price = undefined; }

    // --- Date : ni passée, ni à plus de 3 ans (garde-fou n°2)
    let eventDate: string | undefined;
    if (typeof j.event_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.event_date)) {
      const d = new Date(`${j.event_date}T12:00:00Z`).getTime();
      const now = Date.now();
      if (isNaN(d)) eventDate = undefined;
      else if (d < now - 2 * 86400000) warnings.push(`date lue « ${j.event_date} » dans le passé — écartée`);
      else if (d > now + 3 * 365 * 86400000) warnings.push(`date lue « ${j.event_date} » à plus de 3 ans — écartée`);
      else eventDate = j.event_date;
    }

    const client = (() => {
      const c = (j.client ?? {}) as Record<string, unknown>;
      const email = str(c.email, 120);
      const out = {
        firstName: str(c.first_name, 60),
        lastName: str(c.last_name, 60),
        phone: str(c.phone, 30),
        email: email && /.+@.+\..+/.test(email) ? email : undefined,
        company: str(c.company, 80),
      };
      return Object.values(out).some(Boolean) ? out : undefined;
    })();

    /* Pièces (mode standard) : quantités calées sur les pas de vente
       (cupcakes par 6, minis par 12), au moins une boîte. */
    const rawPieces = Array.isArray(j.pieces) ? (j.pieces as Record<string, unknown>[]) : [];
    const pieces: OrderPiece[] = rawPieces
      .map((it, i) => {
        const t = String(it.type ?? "").toLowerCase();
        const type: PieceType = t.includes("mini") ? "MINI_CUPCAKE" : t.includes("cupcake") ? "CUPCAKE" : "CAKE";
        const step = type === "CUPCAKE" ? CUPCAKE_STEP : type === "MINI_CUPCAKE" ? MINI_CUPCAKE_STEP : 1;
        const raw = num(it.qty, 100000) ?? 0;
        const qty = type === "CAKE" ? Math.round(raw) : Math.max(step, Math.round(raw / step) * step);
        const fourrage = str(it.fourrage, 80);
        return {
          id: `ia${Date.now()}${i}`,
          type,
          qty,
          tiers: type === "CAKE" ? (it.tiers === 2 ? 2 : 1) : null,
          biscuit: str(it.biscuit, 60) ?? "",
          fourrages: fourrage ? [fourrage] : [],
          themeNote: str(it.theme, 200),
        } as OrderPiece;
      })
      .filter((p) => p.qty > 0)
      .slice(0, 12);

    return {
      mode: j.mode === "ligne" ? "ligne" : "standard",
      pieces: pieces.length ? pieces : undefined,
      occasion: str(j.occasion, 60),
      themeNote: str(j.theme, 120),
      celebrant: str(j.celebrant, 60),
      celebrantAge: num(j.celebrant_age, 150) ? Math.round(num(j.celebrant_age, 150)!) : undefined,
      parts: num(j.parts, 100000) ? Math.round(num(j.parts, 100000)!) : undefined,
      tiers: j.tiers === 1 || j.tiers === 2 ? (j.tiers as number) : undefined,
      eventDate,
      price,
      items: items.length ? items : undefined,
      client,
      channel: (() => {
        const ch = String(j.channel ?? "").toUpperCase();
        return ch === "WHATSAPP" || ch === "INSTAGRAM" || ch === "FACEBOOK" || ch === "EMAIL" ? (ch as ProjectAnalysis["channel"]) : undefined;
      })(),
      quoteSent: j.quote_sent === true,
      warnings,
    };
  } catch (e) {
    console.error("analyse échange:", e);
    return null;
  }
}
