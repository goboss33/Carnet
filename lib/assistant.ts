/* ---------------------------------------------------------------------------
   Assistant de rédaction (devis & réponses clients) — brique partagée bot ↔ web.
   Gemini multimodal (voit les photos d'inspiration), conversation persistée
   par commande (AiMessage), fallback template si l'IA n'est pas dispo.
   L'assistant ne produit QUE du texte : aucune action, aucun envoi.
--------------------------------------------------------------------------- */

import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getSettings, type EffectiveSettings } from "@/lib/settings";
import { geminiGenerate, type GeminiPart } from "@/lib/gemini";

const RECEIPTS = () => path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

export type PayMethod = "twint" | "virement";

function paymentBlock(s: EffectiveSettings, method: PayMethod): string {
  if (method === "virement") {
    const parts = [s.accountHolder, s.iban, s.bankName].filter(Boolean).join(" · ");
    return parts ? `virement bancaire (${parts})` : "virement bancaire (coordonnées à préciser)";
  }
  return s.twintNumber ? `Twint au ${s.twintNumber}` : "Twint (numéro à préciser)";
}

async function loadPhotos(rels: string[]): Promise<GeminiPart[]> {
  const parts: GeminiPart[] = [];
  for (const rel of rels.slice(0, 3)) {
    try {
      const buf = await readFile(path.join(RECEIPTS(), rel));
      const mime = rel.endsWith(".webp") ? "image/webp" : rel.endsWith(".png") ? "image/png" : "image/jpeg";
      parts.push({ inline_data: { mime_type: mime, data: buf.toString("base64") } });
    } catch {
      /* photo manquante : on l'ignore */
    }
  }
  return parts;
}

/** Génère (ou affine) le brouillon. Persiste l'instruction d'Annie et la réponse. */
export async function generateDraft(
  orderId: string,
  opts: { userMessage?: string; method?: PayMethod; regenerate?: boolean } = {}
): Promise<{ ok: boolean; text: string; usedAI: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { contact: true, aiMessages: { orderBy: { createdAt: "asc" }, take: 24 } },
  });
  if (!order) return { ok: false, text: "", usedAI: false };
  const s = await getSettings(order.tenantId);
  const method: PayMethod = opts.method ?? s.paymentDefault;
  const deposit = order.priceQuoted ? Math.round((order.priceQuoted * s.depositPct) / 100) : null;

  if (opts.userMessage?.trim()) {
    await prisma.aiMessage.create({ data: { orderId, role: "user", content: opts.userMessage.trim() } });
  }

  const context = [
    "Détails de la demande de devis (à confirmer à la cliente) :",
    `- Cliente : ${`${order.contact.firstName} ${order.contact.lastName}`.trim()}`,
    `- Occasion : ${order.occasion || "?"}`,
    order.eventDate ? `- Date : ${order.eventDate.toLocaleDateString("fr-CH")}` : "",
    order.celebrant ? `- Pour : ${order.celebrant}${order.celebrantAge ? ` (${order.celebrantAge} ans)` : ""}` : "",
    order.parts ? `- Format : ${order.parts} parts${order.tiers ? `, ${order.tiers} étage(s)` : ""}` : "",
    order.biscuit ? `- Biscuit : ${order.biscuit}` : "",
    order.fourrages?.length ? `- Fourrage : ${order.fourrages.join(" + ")}` : "",
    order.style ? `- Style : ${order.style}${order.themeNote ? ` (thème : ${order.themeNote})` : ""}` : "",
    order.deliveryMode === "livraison" ? `- Livraison : ${order.deliveryAddress || "à préciser"}` : "- Retrait à l'atelier (Pully)",
    order.priceQuoted ? `- Prix : CHF ${order.priceQuoted}` : "- Prix : à préciser",
    deposit ? `- Acompte à demander : CHF ${deposit} (${s.depositPct} %) par ${paymentBlock(s, method)}` : "",
    order.inspirationPhotos.length
      ? `- ${order.inspirationPhotos.length} photo(s) d'inspiration jointe(s) : analyse-les pour juger la complexité du décor.`
      : "",
    "",
    `Rédige le message de confirmation de devis à envoyer à ${order.contact.firstName}, prêt à copier-coller.`,
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Tu es l'assistante de rédaction d'Annie, créatrice de « Maman Gâteau » (cake designer à Pully, Suisse romande).",
    "Tu rédiges des messages qu'Annie relira et enverra elle-même (WhatsApp). Tu ne prétends jamais avoir envoyé quoi que ce soit, tu n'inventes jamais de prix (utilise celui fourni), tu ne décides rien à sa place.",
    "Ton : vouvoiement, première personne (je = Annie), chaleureux et gourmand, sans jargon technique.",
    "Un devis contient : salutation, récap de ce qui est demandé, le prix (avec une justification bienveillante si Annie l'indique), puis l'invitation à confirmer par un acompte via le moyen de paiement fourni.",
    s.assistantSignature ? `Termine par la signature : « ${s.assistantSignature} ».` : "",
    s.assistantInstructions ? `Consignes d'Annie (à respecter absolument) :\n${s.assistantInstructions}` : "",
    "Réponds UNIQUEMENT avec le message prêt à envoyer — sauf si Annie te pose une question, alors réponds-lui brièvement puis propose le message.",
  ]
    .filter(Boolean)
    .join("\n");

  const photos = await loadPhotos(order.inspirationPhotos);
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [
    { role: "user", parts: [{ text: context }, ...photos] },
  ];
  for (const m of order.aiMessages) {
    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] });
  }
  if (opts.userMessage?.trim()) {
    contents.push({ role: "user", parts: [{ text: opts.userMessage.trim() }] });
  } else if (opts.regenerate) {
    contents.push({ role: "user", parts: [{ text: "Propose une autre version du message, différente de la précédente." }] });
  }

  let usedAI = true;
  let text = s.assistantActive ? await geminiGenerate({ system, contents, temperature: opts.regenerate ? 0.9 : 0.7 }) : null;
  if (!text) {
    usedAI = false;
    text = [
      `Bonjour ${order.contact.firstName},`,
      "",
      `Merci beaucoup pour votre demande ! J'ai bien noté votre projet${order.occasion ? ` pour ${order.occasion.toLowerCase()}` : ""}${order.eventDate ? ` du ${order.eventDate.toLocaleDateString("fr-CH")}` : ""}.`,
      order.priceQuoted ? `Je vous propose un devis à CHF ${order.priceQuoted}.` : "",
      deposit ? `Pour confirmer et bloquer la date, il suffit d'un acompte de CHF ${deposit} par ${paymentBlock(s, method)}.` : "",
      "",
      s.assistantSignature || "À très vite,\nAnnie — Maman Gâteau",
    ]
      .filter(Boolean)
      .join("\n");
  }

  await prisma.aiMessage.create({ data: { orderId, role: "assistant", content: text } });
  return { ok: true, text, usedAI };
}

/** Propose une base de « consignes pour l'assistant » (bouton dans les réglages). */
export async function generateConsignes(): Promise<string | null> {
  return geminiGenerate({
    temperature: 0.6,
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Rédige les « consignes pour l'assistant de rédaction » d'une cake designer artisanale suisse (Maman Gâteau, Pully). " +
              "Ce sont des instructions que l'IA suivra pour écrire les messages aux clientes. Format : puces courtes, en français. " +
              "Inclus : le ton (vouvoiement, chaleureux, gourmand, sans jargon) ; 2-3 règles utiles (ex. proposer les cupcakes en plus ; " +
              "ne jamais confirmer une date sans préciser « sous réserve de disponibilité ») ; et quelques faits pratiques " +
              "(livraison offerte jusqu'à 10 km puis 1.-/km ; réponse sous 24 h ; pas de vegan ; sans-gluten possible sur demande). " +
              "Réponds uniquement avec les consignes.",
          },
        ],
      },
    ],
  });
}
