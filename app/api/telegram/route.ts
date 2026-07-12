/* ---------------------------------------------------------------------------
   Bot Telegram — l'interface de saisie d'Annie.
   /lead : création d'une fiche en questions-réponses (état en BDD).
   Sécurité : secret webhook + liste blanche de chat ids.
--------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { prisma, currentTenant } from "@/lib/db";
import type { Source } from "@prisma/client";

export const dynamic = "force-dynamic";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = `https://api.telegram.org/bot${TOKEN}`;

async function say(chatId: number | bigint, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: Number(chatId), text, parse_mode: "HTML" }),
  });
}

type Draft = {
  firstName?: string;
  source?: string;
  occasion?: string;
  eventDate?: string;
  parts?: number;
  phone?: string;
};

const STEPS = [
  { key: "firstName", q: "Prénom du client ?" },
  { key: "source", q: "Canal ? (whatsapp / instagram / téléphone / autre)" },
  { key: "occasion", q: "Occasion ? (ex. anniversaire 6 ans, mariage…)" },
  { key: "eventDate", q: "Date de l'événement ? (JJ.MM.AAAA — ou « passe »)" },
  { key: "parts", q: "Nombre de parts ? (ou « passe »)" },
  { key: "phone", q: "Mobile ? (ou « passe »)" },
] as const;

const parseSource = (t: string): Source => {
  const s = t.toLowerCase();
  if (s.includes("whats")) return "WHATSAPP";
  if (s.includes("insta")) return "INSTAGRAM";
  if (s.includes("tel") || s.includes("tél") || s.includes("phone")) return "TELEPHONE";
  if (s.includes("config") || s.includes("site")) return "CONFIGURATEUR";
  return "AUTRE";
};

const parseDate = (t: string): Date | null => {
  const m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
};

export async function POST(req: NextRequest) {
  // 1. Authentifier Telegram
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.chat?.id || typeof msg.text !== "string") return NextResponse.json({ ok: true });

  const chatId: number = msg.chat.id;
  const text: string = msg.text.trim();

  // 2. Liste blanche
  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed.length === 0) {
    await say(chatId, `Bienvenue sur <b>Carnet</b> 👋\nTon chat id : <code>${chatId}</code>\nAjoute-le à TELEGRAM_ALLOWED_CHAT_IDS pour activer le bot.`);
    return NextResponse.json({ ok: true });
  }
  if (!allowed.includes(String(chatId))) {
    await say(
      chatId,
      `Ce bot est privé 🧁\nTon identifiant : <code>${chatId}</code> — transmets-le à l'administrateur pour être ajouté.`
    );
    return NextResponse.json({ ok: true });
  }

  const tenant = await currentTenant();
  const session = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });
  const setStep = (step: string, draft: Draft) =>
    prisma.botSession.upsert({
      where: { chatId: BigInt(chatId) },
      update: { step, draft },
      create: { chatId: BigInt(chatId), tenantId: tenant.id, step, draft },
    });

  // 3. Commandes
  if (text === "/start" || text === "/aide") {
    await say(chatId, [
      "<b>Carnet</b> — saisie rapide 🧁",
      "/lead — nouvelle fiche client (6 questions, « passe » pour sauter)",
      "/annule — abandonner la saisie en cours",
      "/jour — les commandes des 7 prochains jours",
    ].join("\n"));
    return NextResponse.json({ ok: true });
  }

  if (text === "/annule") {
    await setStep("idle", {});
    await say(chatId, "Saisie annulée. /lead pour recommencer.");
    return NextResponse.json({ ok: true });
  }

  if (text === "/jour") {
    const soon = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] },
        eventDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) },
      },
      include: { contact: true },
      orderBy: { eventDate: "asc" },
    });
    await say(
      chatId,
      soon.length
        ? "<b>7 prochains jours :</b>\n" +
            soon
              .map((o) => `• ${o.eventDate?.toLocaleDateString("fr-CH")} — ${o.contact.firstName}, ${o.occasion || "?"} (${o.parts ?? "?"} parts)`)
              .join("\n")
        : "Rien de confirmé sur les 7 prochains jours."
    );
    return NextResponse.json({ ok: true });
  }

  if (text === "/lead") {
    await setStep("0", {});
    await say(chatId, `Nouvelle fiche ✍️\n${STEPS[0].q}`);
    return NextResponse.json({ ok: true });
  }

  // 4. Machine à étapes
  const stepIdx = session && session.step !== "idle" ? parseInt(session.step) : NaN;
  if (!isNaN(stepIdx) && stepIdx >= 0 && stepIdx < STEPS.length) {
    const draft: Draft = (session?.draft as Draft) ?? {};
    const skip = /^pass/i.test(text);
    const step = STEPS[stepIdx];

    if (!skip) {
      if (step.key === "parts") {
        const n = parseInt(text.replace(/\D/g, ""));
        if (!isNaN(n)) draft.parts = n;
      } else if (step.key === "eventDate") {
        const d = parseDate(text);
        if (d) draft.eventDate = d.toISOString();
        else if (!skip) {
          await say(chatId, "Date non comprise — format JJ.MM.AAAA, ou « passe ».");
          return NextResponse.json({ ok: true });
        }
      } else {
        (draft as Record<string, unknown>)[step.key] = text;
      }
    }

    const nextIdx = stepIdx + 1;
    if (nextIdx < STEPS.length) {
      await setStep(String(nextIdx), draft);
      await say(chatId, STEPS[nextIdx].q);
      return NextResponse.json({ ok: true });
    }

    // Fin : créer contact + commande
    if (!draft.firstName) {
      await setStep("idle", {});
      await say(chatId, "Il me faut au moins un prénom — /lead pour recommencer.");
      return NextResponse.json({ ok: true });
    }
    const source = parseSource(draft.source ?? "");
    let contact = draft.phone
      ? await prisma.contact.findFirst({ where: { tenantId: tenant.id, phone: draft.phone } })
      : null;
    if (!contact) {
      contact = await prisma.contact.create({
        data: { tenantId: tenant.id, firstName: draft.firstName, phone: draft.phone ?? "", source },
      });
    }
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        source,
        occasion: draft.occasion ?? "",
        eventDate: draft.eventDate ? new Date(draft.eventDate) : null,
        parts: draft.parts,
        activities: { create: { type: "SYSTEM", body: "Fiche créée via le bot Telegram." } },
      },
    });
    await setStep("idle", {});
    await say(
      chatId,
      [
        "✅ <b>Fiche créée</b>",
        `${draft.firstName} — ${draft.occasion || "occasion à préciser"}`,
        draft.eventDate ? `📅 ${new Date(draft.eventDate).toLocaleDateString("fr-CH")}` : "",
        `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
      ].filter(Boolean).join("\n")
    );
    return NextResponse.json({ ok: true });
  }

  await say(chatId, "Je n'ai pas compris — /aide pour les commandes.");
  return NextResponse.json({ ok: true });
}
