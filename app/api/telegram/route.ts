/* ---------------------------------------------------------------------------
   Bot Telegram v2 — l'interface d'Annie, sans un seul slash.
   Menu permanent : 📸 Scanner un ticket · ✍️ Nouveau lead · 📅 Cette semaine
   · 💰 Dépenses du mois. Toute photo envoyée = ticket à analyser (Gemini).
--------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma, currentTenant } from "@/lib/db";
import { say, sayInline, editMessage, answerCallback, downloadPhoto, MAIN_KEYBOARD, tg } from "@/lib/telegram";
import { analyzeReceipt } from "@/lib/gemini";
import { chf, CATEGORIES, catLabel } from "@/lib/money";
import type { Source, ExpenseCategory } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RECEIPTS = () => path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

/* ------------------------------------------------------------ lead flow */

type Draft = {
  firstName?: string;
  source?: string;
  occasion?: string;
  eventDate?: string;
  parts?: number;
  phone?: string;
};

const LEAD_STEPS = [
  { key: "firstName", q: "Prénom du client ?", skippable: false },
  { key: "source", q: "Par quel canal ?", skippable: false }, // inline
  { key: "occasion", q: "Occasion ? (ex. anniversaire 6 ans, mariage…)", skippable: true },
  { key: "eventDate", q: "Date de l'événement ? (JJ.MM.AAAA)", skippable: true },
  { key: "parts", q: "Nombre de parts ?", skippable: true },
  { key: "phone", q: "Numéro de mobile ?", skippable: true },
] as const;

const parseDate = (t: string): Date | null => {
  const m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
};

async function askLeadStep(chatId: number, idx: number) {
  const step = LEAD_STEPS[idx];
  if (step.key === "source") {
    await sayInline(chatId, `<b>${idx + 1}/6</b> — ${step.q}`, [
      [
        { text: "WhatsApp", callback_data: "lead:src:WHATSAPP" },
        { text: "Instagram", callback_data: "lead:src:INSTAGRAM" },
      ],
      [
        { text: "Téléphone", callback_data: "lead:src:TELEPHONE" },
        { text: "Autre", callback_data: "lead:src:AUTRE" },
      ],
    ]);
  } else if (step.skippable) {
    await sayInline(chatId, `<b>${idx + 1}/6</b> — ${step.q}`, [
      [{ text: "⏭ Passer", callback_data: `lead:skip:${idx}` }],
    ]);
  } else {
    await say(chatId, `<b>${idx + 1}/6</b> — ${step.q}`);
  }
}

async function advanceLead(chatId: number, tenantId: string, idx: number, draft: Draft) {
  const next = idx + 1;
  if (next < LEAD_STEPS.length) {
    await prisma.botSession.upsert({
      where: { chatId: BigInt(chatId) },
      update: { step: `lead:${next}`, draft },
      create: { chatId: BigInt(chatId), tenantId, step: `lead:${next}`, draft },
    });
    await askLeadStep(chatId, next);
    return;
  }
  // fin → création
  await prisma.botSession.update({ where: { chatId: BigInt(chatId) }, data: { step: "idle", draft: {} } });
  if (!draft.firstName) {
    await say(chatId, "Il me faut au moins un prénom — recommence avec ✍️ Nouveau lead.");
    return;
  }
  const source = (draft.source ?? "AUTRE") as Source;
  let contact = draft.phone
    ? await prisma.contact.findFirst({ where: { tenantId, phone: draft.phone } })
    : null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: { tenantId, firstName: draft.firstName, phone: draft.phone ?? "", source },
    });
  }
  const order = await prisma.order.create({
    data: {
      tenantId,
      contactId: contact.id,
      source,
      occasion: draft.occasion ?? "",
      eventDate: draft.eventDate ? new Date(draft.eventDate) : null,
      parts: draft.parts,
      activities: { create: { type: "SYSTEM", body: "Fiche créée via le bot Telegram." } },
    },
  });
  await say(
    chatId,
    [
      "✅ <b>Fiche créée</b>",
      `${draft.firstName} — ${draft.occasion || "occasion à préciser"}`,
      draft.eventDate ? `📅 ${new Date(draft.eventDate).toLocaleDateString("fr-CH")}` : "",
      `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
    ].filter(Boolean).join("\n")
  );
}

/* ------------------------------------------------------- ticket scan */

async function handlePhoto(chatId: number, tenantId: string, tenantSlug: string, fileId: string) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const raw = await downloadPhoto(fileId);
  if (!raw) {
    await say(chatId, "Je n'ai pas réussi à récupérer la photo — réessaie ?");
    return;
  }
  const img = await sharp(raw).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

  const expense = await prisma.expense.create({ data: { tenantId } });
  const now = new Date();
  const rel = path.join(tenantSlug, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, `${expense.id}.webp`);
  const abs = path.join(RECEIPTS(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, img);

  const ocr = await analyzeReceipt(img);
  const data = {
    receiptPath: rel,
    ...(ocr
      ? {
          merchant: ocr.merchant,
          totalCents: ocr.totalCents,
          category: ocr.category as ExpenseCategory,
          date: ocr.date ? new Date(ocr.date) : now,
          vat: ocr.vat,
          ocrJson: ocr as object,
        }
      : {}),
  };
  await prisma.expense.update({ where: { id: expense.id }, data });

  if (!ocr) {
    await say(
      chatId,
      `📸 Photo enregistrée, mais je n'ai pas pu la lire automatiquement${process.env.GEMINI_API_KEY ? "" : " (clé Gemini non configurée)"}.\nComplète-la ici : ${process.env.APP_URL}/compta`
    );
    return;
  }
  const vatTxt = ocr.vat.length ? `\nTVA : ${ocr.vat.map((v) => `${v.rate}% → ${chf(v.amountCents)}`).join(" · ")}` : "";
  await sayInline(
    chatId,
    `🧾 <b>${ocr.merchant || "Commerçant ?"}</b> — <b>${chf(ocr.totalCents)}</b>\n📅 ${ocr.date ?? "date inconnue"} · ${catLabel(ocr.category)}${vatTxt}\n\nTout est bon ?`,
    [
      [
        { text: "✅ Valider", callback_data: `exp:ok:${expense.id}` },
        { text: "🏷 Catégorie", callback_data: `exp:cat:${expense.id}` },
        { text: "🗑", callback_data: `exp:del:${expense.id}` },
      ],
    ]
  );
}

/* ------------------------------------------------------------- résumés */

async function weekSummary(chatId: number, tenantId: string) {
  const soon = await prisma.order.findMany({
    where: {
      tenantId,
      status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION", "DEVIS_ENVOYE"] },
      eventDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400000) },
    },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
  });
  await say(
    chatId,
    soon.length
      ? "<b>📅 Les 7 prochains jours :</b>\n" +
          soon
            .map(
              (o) =>
                `• ${o.eventDate?.toLocaleDateString("fr-CH")} — ${o.contact.firstName}, ${o.occasion || "?"} (${o.parts ?? "?"} parts)${o.status === "DEVIS_ENVOYE" ? " ⚠️ devis non confirmé" : ""}`
            )
            .join("\n")
      : "Rien de prévu sur les 7 prochains jours. 🌤"
  );
}

async function monthExpenses(chatId: number, tenantId: string) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const list = await prisma.expense.findMany({
    where: { tenantId, status: "CONFIRMED", date: { gte: start } },
    orderBy: { date: "desc" },
  });
  const total = list.reduce((a, e) => a + e.totalCents, 0);
  const byCat = new Map<string, number>();
  for (const e of list) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.totalCents);
  await say(
    chatId,
    [
      `<b>💰 Dépenses de ${start.toLocaleDateString("fr-CH", { month: "long" })} : ${chf(total)}</b>`,
      ...[...byCat.entries()].map(([c, v]) => `• ${catLabel(c)} : ${chf(v)}`),
      "",
      `Détail & export : ${process.env.APP_URL}/compta`,
    ].join("\n")
  );
}

/* --------------------------------------------------------------- POST */

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await req.json().catch(() => null);
  const ok = () => NextResponse.json({ ok: true });

  const msg = update?.message;
  const cb = update?.callback_query;
  const chatId: number | undefined = msg?.chat?.id ?? cb?.message?.chat?.id;
  if (!chatId) return ok();

  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(String(chatId))) {
    await say(chatId, `Ce bot est privé 🧁\nTon identifiant : <code>${chatId}</code> — transmets-le à l'administrateur pour être ajouté.`);
    return ok();
  }

  const tenant = await currentTenant();

  /* ---------- boutons inline (callback_query) ---------- */
  if (cb) {
    const [ns, action, ...rest] = String(cb.data ?? "").split(":");
    const mid: number = cb.message.message_id;

    if (ns === "lead") {
      const session = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });
      const idx = session?.step?.startsWith("lead:") ? parseInt(session.step.slice(5)) : -1;
      const draft: Draft = (session?.draft as Draft) ?? {};
      if (idx < 0) {
        await answerCallback(cb.id, "Saisie expirée — relance ✍️ Nouveau lead");
        return ok();
      }
      if (action === "src") {
        draft.source = rest[0];
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `Canal : <b>${rest[0].toLowerCase()}</b> ✓`);
        await advanceLead(chatId, tenant.id, idx, draft);
      } else if (action === "skip") {
        await answerCallback(cb.id);
        await editMessage(chatId, mid, "⏭ Passé");
        await advanceLead(chatId, tenant.id, idx, draft);
      }
      return ok();
    }

    if (ns === "exp") {
      const id = rest[0] ?? action; // exp:<action>:<id>[:<cat>]
      if (action === "ok") {
        const e = await prisma.expense.update({ where: { id: rest[0] }, data: { status: "CONFIRMED" } });
        await answerCallback(cb.id, "Enregistré ✓");
        await editMessage(chatId, mid, `✅ <b>${e.merchant || "Dépense"}</b> — ${chf(e.totalCents)} · ${catLabel(e.category)}\nComptabilisé.`);
      } else if (action === "del") {
        await prisma.expense.delete({ where: { id: rest[0] } }).catch(() => null);
        await answerCallback(cb.id, "Annulé");
        await editMessage(chatId, mid, "🗑 Ticket annulé.");
      } else if (action === "cat") {
        await answerCallback(cb.id);
        const rows = [];
        for (let i = 0; i < CATEGORIES.length; i += 2) {
          rows.push(
            CATEGORIES.slice(i, i + 2).map((c) => ({
              text: `${c.emoji} ${c.label}`,
              callback_data: `exp:setcat:${rest[0]}:${c.id}`,
            }))
          );
        }
        await editMessage(chatId, mid, "🏷 Quelle catégorie ?", rows);
      } else if (action === "setcat") {
        const e = await prisma.expense.update({
          where: { id: rest[0] },
          data: { category: rest[1] as ExpenseCategory },
        });
        await answerCallback(cb.id, catLabel(rest[1]));
        await sayInlineConfirm(chatId, mid, e.id, e.merchant, e.totalCents, e.category);
      }
      void id;
      return ok();
    }
    await answerCallback(cb.id);
    return ok();
  }

  /* ---------- messages ---------- */
  if (!msg) return ok();

  // Photo = ticket, toujours.
  if (Array.isArray(msg.photo) && msg.photo.length) {
    const best = msg.photo[msg.photo.length - 1];
    await handlePhoto(chatId, tenant.id, tenant.slug, best.file_id);
    return ok();
  }

  const text: string = typeof msg.text === "string" ? msg.text.trim() : "";
  if (!text) return ok();

  // Menu
  if (text === "/start" || text === "/aide") {
    await say(chatId, "Bienvenue sur <b>Carnet</b> 🧁\nUtilise les boutons ci-dessous — ou envoie directement la photo d'un ticket de caisse.");
    return ok();
  }
  if (text.startsWith("📸")) {
    await say(chatId, "Envoie-moi la photo du ticket 📷 (ou n'importe quand, sans passer par ce bouton).");
    return ok();
  }
  if (text.startsWith("✍️") || text === "/lead") {
    await prisma.botSession.upsert({
      where: { chatId: BigInt(chatId) },
      update: { step: "lead:0", draft: {} },
      create: { chatId: BigInt(chatId), tenantId: tenant.id, step: "lead:0", draft: {} },
    });
    await askLeadStep(chatId, 0);
    return ok();
  }
  if (text.startsWith("📅") || text === "/jour") {
    await weekSummary(chatId, tenant.id);
    return ok();
  }
  if (text.startsWith("💰")) {
    await monthExpenses(chatId, tenant.id);
    return ok();
  }
  if (text === "/annule") {
    await prisma.botSession.updateMany({ where: { chatId: BigInt(chatId) }, data: { step: "idle", draft: {} } });
    await say(chatId, "Saisie annulée.");
    return ok();
  }

  // Étape lead en cours ?
  const session = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });
  if (session?.step?.startsWith("lead:")) {
    const idx = parseInt(session.step.slice(5));
    const draft: Draft = (session.draft as Draft) ?? {};
    const step = LEAD_STEPS[idx];
    if (step.key === "source") {
      await say(chatId, "Choisis le canal avec les boutons ci-dessus 👆");
      return ok();
    }
    if (step.key === "parts") {
      const n = parseInt(text.replace(/\D/g, ""));
      if (isNaN(n)) {
        await say(chatId, "Un nombre, ou ⏭ Passer.");
        return ok();
      }
      draft.parts = n;
    } else if (step.key === "eventDate") {
      const d = parseDate(text);
      if (!d) {
        await say(chatId, "Format JJ.MM.AAAA, ou ⏭ Passer.");
        return ok();
      }
      draft.eventDate = d.toISOString();
    } else {
      (draft as Record<string, unknown>)[step.key] = text;
    }
    await advanceLead(chatId, tenant.id, idx, draft);
    return ok();
  }

  await say(chatId, "Utilise les boutons du menu 👇 — ou envoie la photo d'un ticket.");
  return ok();
}

async function sayInlineConfirm(chatId: number, mid: number, id: string, merchant: string, totalCents: number, category: string) {
  await editMessage(chatId, mid, `🧾 <b>${merchant || "Commerçant ?"}</b> — <b>${chf(totalCents)}</b> · ${catLabel(category)}\n\nTout est bon ?`, [
    [
      { text: "✅ Valider", callback_data: `exp:ok:${id}` },
      { text: "🏷 Catégorie", callback_data: `exp:cat:${id}` },
      { text: "🗑", callback_data: `exp:del:${id}` },
    ],
  ]);
}
