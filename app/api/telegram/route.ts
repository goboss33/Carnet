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
import { normPhone } from "@/lib/normalize";
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
  contactId?: string;
  contactName?: string;
  priceQuoted?: number;
};

const RC_STEPS = [
  { key: "occasion", q: "Occasion ? (ex. anniversaire 8 ans)", skippable: false },
  { key: "eventDate", q: "Date de l'événement ? (JJ.MM.AAAA)", skippable: true },
  { key: "parts", q: "Nombre de parts ?", skippable: true },
  { key: "priceQuoted", q: "Prix annoncé (CHF) ?", skippable: true },
] as const;

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

async function askRcStep(chatId: number, idx: number) {
  const step = RC_STEPS[idx];
  if (step.skippable) {
    await sayInline(chatId, `<b>${idx + 1}/4</b> — ${step.q}`, [[{ text: "⏭ Passer", callback_data: `rc:skip:${idx}` }]]);
  } else {
    await say(chatId, `<b>${idx + 1}/4</b> — ${step.q}`);
  }
}

async function advanceRc(chatId: number, tenantId: string, idx: number, draft: Draft) {
  const next = idx + 1;
  if (next < RC_STEPS.length) {
    await prisma.botSession.update({ where: { chatId: BigInt(chatId) }, data: { step: `rc:${next}`, draft } });
    await askRcStep(chatId, next);
    return;
  }
  await prisma.botSession.update({ where: { chatId: BigInt(chatId) }, data: { step: "idle", draft: {} } });
  if (!draft.contactId || !draft.occasion) {
    await say(chatId, "Il manque l'essentiel — recommence avec 🔁 Client existant.");
    return;
  }
  const order = await prisma.order.create({
    data: {
      tenantId,
      contactId: draft.contactId,
      source: "AUTRE",
      occasion: draft.occasion,
      eventDate: draft.eventDate ? new Date(draft.eventDate) : null,
      parts: draft.parts,
      priceQuoted: draft.priceQuoted,
      activities: { create: { type: "SYSTEM", body: "Nouvelle commande (client existant) via le bot." } },
    },
  });
  await say(
    chatId,
    [
      `✅ <b>Commande ajoutée pour ${draft.contactName}</b>`,
      `${draft.occasion}${draft.parts ? ` · ${draft.parts} parts` : ""}${draft.priceQuoted ? ` · CHF ${draft.priceQuoted}` : ""}`,
      draft.eventDate ? `📅 ${new Date(draft.eventDate).toLocaleDateString("fr-CH")}` : "",
      `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
    ].filter(Boolean).join("\n")
  );
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
  const phoneN = draft.phone ? normPhone(draft.phone) : "";
  let contact = phoneN ? await prisma.contact.findFirst({ where: { tenantId, phone: phoneN } }) : null;
  const known = !!contact;
  let knownCount = 0;
  if (contact) knownCount = await prisma.order.count({ where: { contactId: contact.id } });
  if (!contact) {
    contact = await prisma.contact.create({
      data: { tenantId, firstName: draft.firstName, phone: phoneN, source },
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
      known ? `👋 Client déjà connu : rattachée à <b>${contact.firstName} ${contact.lastName}</b> (${knownCount} commande${knownCount > 1 ? "s" : ""} avant celle-ci).` : "",
      `${draft.firstName} — ${draft.occasion || "occasion à préciser"}`,
      draft.eventDate ? `📅 ${new Date(draft.eventDate).toLocaleDateString("fr-CH")}` : "",
      `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
    ].filter(Boolean).join("\n")
  );
}

/* ------------------------------------------------------- ticket scan */

async function handleReceipt(chatId: number, tenantId: string, tenantSlug: string, fileId: string, isPdf: boolean) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const raw = await downloadPhoto(fileId);
  if (!raw) {
    await say(chatId, "Je n'ai pas réussi à récupérer le fichier — réessaie ?");
    return;
  }
  const buf = isPdf
    ? raw
    : await sharp(raw).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

  let expense;
  try {
    expense = await prisma.expense.create({ data: { tenantId } });
    const now = new Date();
    const ext = isPdf ? "pdf" : "webp";
    const rel = path.join(tenantSlug, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, `${expense.id}.${ext}`);
    const abs = path.join(RECEIPTS(), rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, buf);
    await finishReceipt(chatId, tenantId, expense.id, rel, buf, isPdf ? "application/pdf" : "image/webp");
  } catch (e) {
    console.error("handleReceipt error:", e);
    if (expense) await prisma.expense.delete({ where: { id: expense.id } }).catch(() => null);
    await say(chatId, "⚠️ Je n'ai pas pu enregistrer ce justificatif (erreur notée dans les logs). Réessaie dans un instant.");
  }
}

async function finishReceipt(chatId: number, tenantId: string, expenseId: string, rel: string, img: Buffer, mime: string) {

  const ocr = await analyzeReceipt(img, mime);
  const data = {
    receiptPath: rel,
    ...(ocr
      ? {
          merchant: ocr.merchant,
          totalCents: ocr.totalCents,
          category: ocr.category as ExpenseCategory,
          date: ocr.date ? new Date(ocr.date) : new Date(),
          vat: ocr.vat,
          ocrJson: ocr as object,
        }
      : {}),
  };
  await prisma.expense.update({ where: { id: expenseId }, data });

  if (!ocr) {
    await say(
      chatId,
      `📸 Photo enregistrée, mais je n'ai pas pu la lire automatiquement${process.env.GEMINI_API_KEY ? "" : " (clé Gemini non configurée)"}.\nComplète-la ici : ${process.env.APP_URL}/compta`
    );
    return;
  }
  void 0;
  const dup = await prisma.expense.findFirst({
    where: {
      tenantId,
      id: { not: expenseId },
      totalCents: ocr.totalCents,
      date: ocr.date ? new Date(ocr.date) : undefined,
    },
  });
  const vatTxt = ocr.vat.length ? `\nTVA : ${ocr.vat.map((v) => `${v.rate}% → ${chf(v.amountCents)}`).join(" · ")}` : "";
  const dupTxt = dup ? "\n\n⚠️ <b>Possible doublon</b> : un justificatif au même montant et à la même date existe déjà." : "";
  await sayInline(
    chatId,
    `🧾 <b>${ocr.merchant || "Commerçant ?"}</b> — <b>${chf(ocr.totalCents)}</b>\n📅 ${ocr.date ?? "date inconnue"} · ${catLabel(ocr.category)}${vatTxt}${dupTxt}\n\nTout est bon ?`,
    [
      [
        { text: "✅ Valider", callback_data: `exp:ok:${expenseId}` },
        { text: "✏️ Corriger", callback_data: `exp:fix:${expenseId}` },
      ],
      [
        { text: "🏷 Catégorie", callback_data: `exp:cat:${expenseId}` },
        { text: "🗑 Annuler", callback_data: `exp:del:${expenseId}` },
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

  try {
    return await handleUpdate(update, ok);
  } catch (e) {
    console.error("telegram webhook error:", e);
    const cid = update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id;
    if (cid) await say(cid, "⚠️ Oups, une erreur interne — réessaie dans un instant.").catch(() => null);
    return ok(); // toujours 200 : pas de retry-storm Telegram
  }
}

type TgUpdate = {
  message?: {
    chat?: { id: number };
    photo?: { file_id: string }[];
    document?: { file_id: string; mime_type?: string; file_size?: number };
    text?: string;
  };
  callback_query?: { id: string; data?: string; message: { chat: { id: number }; message_id: number } };
} | null;

async function handleUpdate(update: TgUpdate, ok: () => NextResponse) {
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

    if (ns === "rc") {
      if (action === "pick") {
        const contact = await prisma.contact.findUnique({
          where: { id: rest[0] },
          include: { _count: { select: { orders: true } } },
        });
        if (!contact) {
          await answerCallback(cb.id, "Introuvable");
          return ok();
        }
        const draft = { contactId: contact.id, contactName: `${contact.firstName} ${contact.lastName}`.trim() };
        await prisma.botSession.upsert({
          where: { chatId: BigInt(chatId) },
          update: { step: "rc:0", draft },
          create: { chatId: BigInt(chatId), tenantId: tenant.id, step: "rc:0", draft },
        });
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `🔁 <b>${contact.firstName} ${contact.lastName}</b> — ${contact._count.orders} commande${contact._count.orders > 1 ? "s" : ""} au compteur.`);
        await askRcStep(chatId, 0);
      } else if (action === "skip") {
        const rcSession = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });
        const idx = rcSession?.step?.startsWith("rc:") ? parseInt(rcSession.step.slice(3)) : -1;
        if (idx < 0) {
          await answerCallback(cb.id, "Saisie expirée");
          return ok();
        }
        await answerCallback(cb.id);
        await editMessage(chatId, mid, "⏭ Passé");
        await advanceRc(chatId, tenant.id, idx, (rcSession?.draft as Draft) ?? {});
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
      } else if (action === "fix") {
        await answerCallback(cb.id);
        await prisma.botSession.upsert({
          where: { chatId: BigInt(chatId) },
          update: { step: `fix:${rest[0]}` },
          create: { chatId: BigInt(chatId), tenantId: tenant.id, step: `fix:${rest[0]}` },
        });
        await say(chatId, "✏️ Envoie la correction : un <b>montant</b> (34.50), un <b>commerçant</b> (Coop), une <b>date</b> (12.01.2026) — ou les trois d'un coup.");
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
    await handleReceipt(chatId, tenant.id, tenant.slug, best.file_id, false);
    return ok();
  }
  // Document : image « en fichier » ou facture PDF.
  if (msg.document?.file_id) {
    const mime = msg.document.mime_type ?? "";
    if ((msg.document.file_size ?? 0) > 15_000_000) {
      await say(chatId, "Fichier trop lourd (max ~15 Mo).");
      return ok();
    }
    if (mime === "application/pdf" || mime.startsWith("image/")) {
      await handleReceipt(chatId, tenant.id, tenant.slug, msg.document.file_id, mime === "application/pdf");
    } else {
      await say(chatId, "Je ne lis que les images et les PDF pour l'instant.");
    }
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
  if (text.startsWith("🔁")) {
    await prisma.botSession.upsert({
      where: { chatId: BigInt(chatId) },
      update: { step: "rcsearch", draft: {} },
      create: { chatId: BigInt(chatId), tenantId: tenant.id, step: "rcsearch", draft: {} },
    });
    await say(chatId, "🔁 Nom ou prénom du client ?");
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

  const session = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });

  // Recherche client existant ?
  if (session?.step === "rcsearch") {
    const found = await prisma.contact.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { firstName: { contains: text, mode: "insensitive" } },
          { lastName: { contains: text, mode: "insensitive" } },
        ],
      },
      include: { _count: { select: { orders: true } } },
      take: 6,
      orderBy: { updatedAt: "desc" },
    });
    if (!found.length) {
      await say(chatId, `Aucun client trouvé pour « ${text} ». Réessaie, ou ✍️ Nouveau lead si c'est quelqu'un de nouveau.`);
      return ok();
    }
    await sayInline(
      chatId,
      `${found.length} résultat${found.length > 1 ? "s" : ""} — c'est qui ?`,
      found.map((c) => [{
        text: `${c.firstName} ${c.lastName}`.trim() + ` (${c._count.orders})${c.phone ? " · …" + c.phone.slice(-4) : ""}`,
        callback_data: `rc:pick:${c.id}`,
      }])
    );
    return ok();
  }

  // Étapes commande client existant ?
  if (session?.step?.startsWith("rc:")) {
    const idx = parseInt(session.step.slice(3));
    const draft: Draft = (session.draft as Draft) ?? {};
    const step = RC_STEPS[idx];
    if (step.key === "parts" || step.key === "priceQuoted") {
      const n = parseInt(text.replace(/\D/g, ""));
      if (isNaN(n)) {
        await say(chatId, "Un nombre, ou ⏭ Passer.");
        return ok();
      }
      draft[step.key] = n;
    } else if (step.key === "eventDate") {
      const d = parseDate(text);
      if (!d) {
        await say(chatId, "Format JJ.MM.AAAA, ou ⏭ Passer.");
        return ok();
      }
      draft.eventDate = d.toISOString();
    } else {
      draft.occasion = text;
    }
    await advanceRc(chatId, tenant.id, idx, draft);
    return ok();
  }

  // Correction d'un justificatif en cours ?
  if (session?.step?.startsWith("fix:")) {
    const expId = session.step.slice(4);
    const exp = await prisma.expense.findUnique({ where: { id: expId } });
    if (!exp) {
      await prisma.botSession.update({ where: { chatId: BigInt(chatId) }, data: { step: "idle" } });
      await say(chatId, "Ce justificatif n'existe plus.");
      return ok();
    }
    const data: { totalCents?: number; merchant?: string; date?: Date } = {};
    let rest = text;
    const dm = rest.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (dm) {
      const d = parseDate(dm[0]);
      if (d) data.date = d;
      rest = rest.replace(dm[0], " ");
    }
    const am = rest.match(/(\d+(?:[.,]\d{1,2})?)/);
    if (am) {
      data.totalCents = Math.round(parseFloat(am[1].replace(",", ".")) * 100);
      rest = rest.replace(am[1], " ");
    }
    const merchant = rest.replace(/\s+/g, " ").trim();
    if (merchant) data.merchant = merchant;
    if (!Object.keys(data).length) {
      await say(chatId, "Je n'ai rien reconnu — montant (34.50), commerçant, ou date (12.01.2026).");
      return ok();
    }
    const upd = await prisma.expense.update({ where: { id: expId }, data });
    await prisma.botSession.update({ where: { chatId: BigInt(chatId) }, data: { step: "idle" } });
    await sayInline(
      chatId,
      `🧾 <b>${upd.merchant || "Commerçant ?"}</b> — <b>${chf(upd.totalCents)}</b>\n📅 ${upd.date.toLocaleDateString("fr-CH")} · ${catLabel(upd.category)}\n\nTout est bon ?`,
      [
        [
          { text: "✅ Valider", callback_data: `exp:ok:${upd.id}` },
          { text: "✏️ Corriger", callback_data: `exp:fix:${upd.id}` },
        ],
        [
          { text: "🏷 Catégorie", callback_data: `exp:cat:${upd.id}` },
          { text: "🗑 Annuler", callback_data: `exp:del:${upd.id}` },
        ],
      ]
    );
    return ok();
  }

  // Étape lead en cours ?
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
