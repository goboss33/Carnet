/* ---------------------------------------------------------------------------
   Assistant de rédaction (devis & réponses clients) — brique partagée bot ↔ web.
   Récap des détails déterministe (recopié tel quel) + enrobage IA (Gemini
   multimodal : voit les photos d'inspiration). Conversation persistée par
   commande (AiMessage), fallback template si l'IA n'est pas dispo.
   L'assistant ne produit QUE du texte : aucune action, aucun envoi.
   Paiement : Twint uniquement (le virement reste un cas particulier géré à la main).
--------------------------------------------------------------------------- */

import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { geminiGenerate, type GeminiPart } from "@/lib/gemini";

const RECEIPTS = () => path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

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
  opts: { userMessage?: string; regenerate?: boolean } = {}
): Promise<{ ok: boolean; text: string; usedAI: boolean }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { contact: true, aiMessages: { orderBy: { createdAt: "asc" }, take: 24 } },
  });
  if (!order) return { ok: false, text: "", usedAI: false };
  const s = await getSettings(order.tenantId);
  const deposit = order.priceQuoted ? Math.round((order.priceQuoted * s.depositPct) / 100) : null;
  const twint = s.twintNumber ? `Twint au ${s.twintNumber}` : "Twint";

  if (opts.userMessage?.trim()) {
    await prisma.aiMessage.create({ data: { orderId, role: "user", content: opts.userMessage.trim() } });
  }

  // Récapitulatif déterministe — recopié tel quel dans le message (zéro risque d'erreur).
  const gouts = [order.biscuit, ...(order.fourrages ?? [])].filter(Boolean);
  const recap = [
    `• Occasion : ${order.occasion || "?"}${order.eventDate ? ` — ${order.eventDate.toLocaleDateString("fr-CH")}` : ""}`,
    order.celebrant ? `• Pour : ${order.celebrant}${order.celebrantAge ? ` (${order.celebrantAge} ans)` : ""}` : "",
    `• ${order.parts ?? "?"} parts${order.tiers ? ` · ${order.tiers} étage${order.tiers > 1 ? "s" : ""}` : ""}`,
    gouts.length ? `• ${gouts.join(" · ")}` : "",
    order.style || order.themeNote ? `• ${[order.style, order.themeNote].filter(Boolean).join(" — ")}` : "",
    order.deliveryMode === "livraison"
      ? `• Livraison : ${order.deliveryAddress || "à préciser"}${order.deliveryKm ? ` (${order.deliveryKm} km)` : ""}`
      : "• Retrait à l'atelier (Pully)",
  ]
    .filter(Boolean)
    .join("\n");

  const briefing = [
    "Contexte (pour toi, à ne pas recopier) :",
    `- Cliente : ${order.contact.firstName}`,
    order.inspirationPhotos.length
      ? `- ${order.inspirationPhotos.length} photo(s) d'inspiration jointe(s) : regarde-les pour juger la complexité du décor et justifier le prix si besoin.`
      : "",
    deposit
      ? `- Acompte à demander : CHF ${deposit} (${s.depositPct} %) par ${twint}.`
      : "- Prix pas encore fixé : n'annonce ni prix ni acompte, propose plutôt d'en discuter.",
    "",
    "Rédige le message de confirmation de devis à envoyer à la cliente, prêt à copier-coller, structuré ainsi :",
    "1) une accroche chaleureuse et personnelle ;",
    "2) le récapitulatif ci-dessous RECOPIÉ EXACTEMENT (mêmes lignes, ne reformule pas, ne change aucun détail) :",
    recap,
    deposit
      ? `3) le prix (CHF ${order.priceQuoted}, avec une justification bienveillante si le décor le mérite), puis l'invitation à confirmer par l'acompte via ${twint} ;`
      : "3) une invitation chaleureuse à échanger pour finaliser le devis ;",
    "4) la signature.",
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "Tu es l'assistante de rédaction d'Annie, créatrice de « Maman Gâteau » (cake designer à Pully, Suisse romande).",
    "Tu rédiges des messages qu'Annie relira et enverra elle-même (WhatsApp). Tu ne prétends jamais avoir envoyé quoi que ce soit, tu n'inventes jamais de prix (utilise celui fourni), tu ne décides rien à sa place.",
    "Ton : vouvoiement, première personne (je = Annie), chaleureux et gourmand, sans jargon technique.",
    s.assistantSignature ? `Signature à utiliser : « ${s.assistantSignature} ».` : "",
    s.assistantInstructions ? `Consignes d'Annie (à respecter absolument) :\n${s.assistantInstructions}` : "",
    "Réponds UNIQUEMENT avec le message prêt à envoyer — sauf si Annie te pose une question, alors réponds-lui brièvement puis propose le message.",
  ]
    .filter(Boolean)
    .join("\n");

  const photos = await loadPhotos(order.inspirationPhotos);
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [
    { role: "user", parts: [{ text: briefing }, ...photos] },
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
      "Merci beaucoup pour votre demande ! Voici le récapitulatif :",
      recap,
      order.priceQuoted ? `\nJe vous propose un devis à CHF ${order.priceQuoted}.` : "",
      deposit ? `Pour confirmer et bloquer la date, il suffit d'un acompte de CHF ${deposit} par ${twint}.` : "",
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
