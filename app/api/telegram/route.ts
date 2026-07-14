/* ---------------------------------------------------------------------------
   Bot Telegram v3 — un seul flux « 🎂 Nouvelle commande ».
   Le bot cherche le client par nom : existant → questions commande ;
   nouveau → canal + téléphone (anti-doublon) puis commande.
   Clavier figé à 4 boutons ; tout le reste vit dans ☰ Menu.
   Toute photo/PDF envoyé = justificatif à comptabiliser (Gemini).
--------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma, currentTenant } from "@/lib/db";
import { say, sayInline, editMessage, answerCallback, downloadPhoto, tg } from "@/lib/telegram";
import { analyzeReceipt } from "@/lib/gemini";
import { chf, CATEGORIES, catLabel } from "@/lib/money";
import { paymentState } from "@/lib/payments";
import { waLink } from "@/lib/wa";
import { getSettings } from "@/lib/settings";
import { normPhone } from "@/lib/normalize";
import type { Source, ExpenseCategory } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RECEIPTS = () => path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

type TgUpdate = {
  message?: {
    chat?: { id: number };
    photo?: { file_id: string }[];
    document?: { file_id: string; mime_type?: string; file_size?: number };
    text?: string;
  };
  callback_query?: { id: string; data?: string; message: { chat: { id: number }; message_id: number } };
} | null;

/* ------------------------------------------- flux unique « commande » */

type Draft = {
  contactId?: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  phone?: string;
  occasion?: string;
  eventDate?: string;
  parts?: number;
  priceQuoted?: number;
};

const QUESTIONS: Record<string, { q: string; skippable: boolean }> = {
  who: { q: "C'est pour qui ? (prénom ou nom du client)", skippable: false },
  src: { q: "Par quel canal est-elle arrivée ?", skippable: false },
  phone: { q: "Son numéro de mobile ?", skippable: true },
  occasion: { q: "Occasion ? (ex. anniversaire 8 ans, mariage…)", skippable: false },
  date: { q: "Date de l'événement ? (JJ.MM.AAAA)", skippable: true },
  parts: { q: "Nombre de parts ?", skippable: true },
  price: { q: "Prix annoncé (CHF) ?", skippable: true },
};

const seqFor = (draft: Draft) =>
  draft.contactId ? ["occasion", "date", "parts", "price"] : ["src", "phone", "occasion", "date", "parts", "price"];

const parseDate = (t: string): Date | null => {
  const m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
};

async function setStep(chatId: number, tenantId: string, step: string, draft: Draft) {
  await prisma.botSession.upsert({
    where: { chatId: BigInt(chatId) },
    update: { step, draft },
    create: { chatId: BigInt(chatId), tenantId, step, draft },
  });
}

async function askNc(chatId: number, key: string) {
  const spec = QUESTIONS[key];
  if (key === "src") {
    await sayInline(chatId, spec.q, [
      [
        { text: "WhatsApp", callback_data: "nc:src:WHATSAPP" },
        { text: "Instagram", callback_data: "nc:src:INSTAGRAM" },
      ],
      [
        { text: "Téléphone", callback_data: "nc:src:TELEPHONE" },
        { text: "Autre", callback_data: "nc:src:AUTRE" },
      ],
    ]);
  } else if (spec.skippable) {
    await sayInline(chatId, spec.q, [[{ text: "⏭ Passer", callback_data: "nc:skip" }]]);
  } else {
    await say(chatId, spec.q);
  }
}

async function startNc(chatId: number, tenantId: string) {
  await setStep(chatId, tenantId, "nc:who", {});
  await say(chatId, "🎂 <b>Nouvelle commande</b>\n" + QUESTIONS.who.q);
}

async function advanceNc(chatId: number, tenantId: string, currentKey: string, draft: Draft) {
  const seq = seqFor(draft);
  const idx = seq.indexOf(currentKey);
  const next = idx >= 0 && idx + 1 < seq.length ? seq[idx + 1] : null;
  if (next) {
    await setStep(chatId, tenantId, `nc:${next}`, draft);
    await askNc(chatId, next);
    return;
  }
  await finishNc(chatId, tenantId, draft);
}

async function finishNc(chatId: number, tenantId: string, draft: Draft) {
  await setStep(chatId, tenantId, "idle", {});
  let contactId = draft.contactId ?? null;
  let contactName = draft.contactName ?? "";
  let knownNote = "";

  if (!contactId) {
    if (!draft.firstName) {
      await say(chatId, "Il me faut au moins un prénom — relance 🎂 Nouvelle commande.");
      return;
    }
    const phoneN = draft.phone ? normPhone(draft.phone) : "";
    const existing = phoneN
      ? await prisma.contact.findFirst({ where: { tenantId, phone: phoneN }, include: { _count: { select: { orders: true } } } })
      : null;
    if (existing) {
      contactId = existing.id;
      contactName = `${existing.firstName} ${existing.lastName}`.trim();
      knownNote = `👋 Ce numéro existait déjà : rattachée à <b>${contactName}</b> (${existing._count.orders} commande${existing._count.orders > 1 ? "s" : ""}).`;
    } else {
      const c = await prisma.contact.create({
        data: {
          tenantId,
          firstName: draft.firstName,
          lastName: draft.lastName ?? "",
          phone: phoneN,
          source: (draft.source ?? "AUTRE") as Source,
        },
      });
      contactId = c.id;
      contactName = `${c.firstName} ${c.lastName}`.trim();
    }
  }

  const order = await prisma.order.create({
    data: {
      tenantId,
      contactId,
      source: (draft.source ?? "AUTRE") as Source,
      occasion: draft.occasion ?? "",
      eventDate: draft.eventDate ? new Date(draft.eventDate) : null,
      parts: draft.parts,
      priceQuoted: draft.priceQuoted,
      activities: { create: { type: "SYSTEM", body: "Commande créée via le bot Telegram." } },
    },
  });

  await say(
    chatId,
    [
      `✅ <b>Commande créée pour ${contactName}</b>`,
      knownNote,
      `${draft.occasion || "occasion à préciser"}${draft.parts ? ` · ${draft.parts} parts` : ""}${draft.priceQuoted ? ` · CHF ${draft.priceQuoted}` : ""}`,
      draft.eventDate ? `📅 ${new Date(draft.eventDate).toLocaleDateString("fr-CH")}` : "",
      `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
    ].filter(Boolean).join("\n")
  );
}

/* ------------------------------------------------------- justificatifs */

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

async function showMenu(chatId: number) {
  await sayInline(chatId, "☰ <b>Menu</b>", [
    [{ text: "📸 Scanner un ticket / une facture", callback_data: "menu:scan" }],
    [{ text: "🔗 Ouvrir Carnet", url: `${process.env.APP_URL ?? "https://carnet.mamangateau.ch"}` } as never],
    [{ text: "❓ Aide", callback_data: "menu:aide" }],
  ]);
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
  const settings = await getSettings(tenant.id);

  /* ---------- boutons inline ---------- */
  if (cb) {
    const [ns, action, ...rest] = String(cb.data ?? "").split(":");
    const mid: number = cb.message.message_id;
    const session = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });
    const draft: Draft = (session?.draft as Draft) ?? {};

    if (ns === "nc") {
      if (action === "pick") {
        const contact = await prisma.contact.findUnique({
          where: { id: rest[0] },
          include: { _count: { select: { orders: true } } },
        });
        if (!contact) {
          await answerCallback(cb.id, "Introuvable");
          return ok();
        }
        const d: Draft = { contactId: contact.id, contactName: `${contact.firstName} ${contact.lastName}`.trim() };
        await setStep(chatId, tenant.id, "nc:occasion", d);
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `🎂 Pour <b>${d.contactName}</b> (${contact._count.orders} commande${contact._count.orders > 1 ? "s" : ""} au compteur).`);
        await askNc(chatId, "occasion");
      } else if (action === "new") {
        const d: Draft = { firstName: draft.firstName, lastName: draft.lastName };
        await setStep(chatId, tenant.id, "nc:src", d);
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `🎂 Nouvelle cliente : <b>${[d.firstName, d.lastName].filter(Boolean).join(" ")}</b>`);
        await askNc(chatId, "src");
      } else if (action === "src") {
        draft.source = rest[0];
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `Canal : <b>${rest[0].toLowerCase()}</b> ✓`);
        await advanceNc(chatId, tenant.id, "src", draft);
      } else if (action === "skip") {
        const key = session?.step?.startsWith("nc:") ? session.step.slice(3) : "";
        if (!key || !QUESTIONS[key]) {
          await answerCallback(cb.id, "Saisie expirée — relance 🎂");
          return ok();
        }
        await answerCallback(cb.id);
        await editMessage(chatId, mid, "⏭ Passé");
        await advanceNc(chatId, tenant.id, key, draft);
      }
      return ok();
    }

    if (ns === "nu") {
      const orderId = rest[0];
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { contact: true } });
      if (!order) {
        await answerCallback(cb.id, "Fiche introuvable");
        return ok();
      }
      const name = `${order.contact.firstName} ${order.contact.lastName}`.trim();

      if (action === "sent") {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "DEVIS_ENVOYE", activities: { create: { type: "STATUS", body: "Devis envoyé (confirmé via le bot)." } } },
        });
        await answerCallback(cb.id, "Devis envoyé ✓");
        const dep = order.priceQuoted ? Math.round((order.priceQuoted * settings.depositPct) / 100) : null;
        await editMessage(chatId, mid, `✅ Devis envoyé à <b>${name}</b>.`);
        await sayInline(
          chatId,
          `💰 Et l'acompte${dep ? ` (attendu : <b>CHF ${dep}</b>, ${settings.depositPct} %)` : ""} — déjà reçu ?`,
          [
            [
              { text: "✅ Reçu", callback_data: `nu:dep:${orderId}` },
              { text: "✏️ Autre montant", callback_data: `nu:depother:${orderId}` },
            ],
            [{ text: "💯 Payé en entier", callback_data: `nu:paidfull:${orderId}` }],
            [{ text: "⏳ Pas encore", callback_data: `nu:depnot:${orderId}` }],
          ]
        );
      } else if (action === "dep") {
        const cents = order.priceQuoted ? Math.round((order.priceQuoted * settings.depositPct) / 100) * 100 : null;
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: "ACOMPTE_RECU",
            depositPaidAt: new Date(),
            depositCents: cents,
            activities: { create: { type: "STATUS", body: `Acompte reçu${cents ? ` (CHF ${cents / 100})` : ""} — via le bot.` } },
          },
        });
        await answerCallback(cb.id, "Acompte ✓");
        await editMessage(chatId, mid, `💰 Acompte de <b>${name}</b> enregistré${cents ? ` (CHF ${cents / 100})` : ""} — date bloquée ✓`);
      } else if (action === "depother") {
        await answerCallback(cb.id);
        await setStep(chatId, tenant.id, `dep:${orderId}`, {});
        await say(chatId, `✏️ Quel montant a versé <b>${name}</b> ? (en CHF)`);
      } else if (action === "depnot") {
        await prisma.order.update({ where: { id: orderId }, data: { lastNudgeAt: new Date() } });
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `⏳ Pas d'acompte encore pour <b>${name}</b> — je re-demanderai.`);
      } else if (action === "paidfull") {
        if (order.priceQuoted) {
          const total = order.priceQuoted * 100;
          await prisma.order.update({
            where: { id: orderId },
            data: {
              status: "ACOMPTE_RECU",
              depositPaidAt: new Date(),
              balancePaidAt: new Date(),
              depositCents: total,
              balanceCents: 0,
              activities: { create: { type: "STATUS", body: `Payé en entier (CHF ${order.priceQuoted}) — via le bot.` } },
            },
          });
          await answerCallback(cb.id, "Payé ✓");
          await editMessage(chatId, mid, `💯 <b>${name}</b> a tout réglé (CHF ${order.priceQuoted}) — plus rien à encaisser, date bloquée ✓`);
        } else {
          await answerCallback(cb.id);
          await setStep(chatId, tenant.id, `full:${orderId}`, {});
          await say(chatId, `💯 Quel <b>montant total</b> a réglé <b>${name}</b> ? (en CHF)`);
        }
      } else if (action === "delivered") {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: "LIVRE",
            deliveredAt: order.eventDate ?? new Date(),
            activities: { create: { type: "STATUS", body: "Marquée livrée via le bot." } },
          },
        });
        await answerCallback(cb.id, "Livré ✓");
        await editMessage(chatId, mid, `✅ Gâteau de <b>${name}</b> livré — la demande d'avis partira automatiquement à J+2. 🧁`);
        const pay = paymentState(order);
        if (pay.dueCents > 0) {
          await sayInline(
            chatId,
            `💰 Le solde de <b>${name}</b> (reste <b>${chf(pay.dueCents)}</b>) est-il encaissé ?`,
            [
              [
                { text: "✅ Oui, soldé", callback_data: `nu:bal:${orderId}` },
                { text: "✏️ Autre montant", callback_data: `nu:balother:${orderId}` },
              ],
              [{ text: "⏳ Pas encore", callback_data: `nu:balnot:${orderId}` }],
            ]
          );
        }
      } else if (action === "bal") {
        const pay = paymentState(order);
        await prisma.order.update({
          where: { id: orderId },
          data: {
            balancePaidAt: new Date(),
            balanceCents: (order.balanceCents ?? 0) + pay.dueCents,
            activities: { create: { type: "STATUS", body: `Solde encaissé${pay.dueCents ? ` (${chf(pay.dueCents)})` : ""} — via le bot.` } },
          },
        });
        await answerCallback(cb.id, "Soldé ✓");
        await editMessage(chatId, mid, `✅ Solde de <b>${name}</b> encaissé — tout est réglé. 💛`);
      } else if (action === "balother") {
        await answerCallback(cb.id);
        await setStep(chatId, tenant.id, `bal:${orderId}`, {});
        await say(chatId, `✏️ Quel montant de solde a versé <b>${name}</b> ? (en CHF)`);
      } else if (action === "balnot") {
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `⏳ Solde de <b>${name}</b> pas encore encaissé — c'est noté.`);
      } else if (action === "drop") {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: "ANNULE", cancelledAt: new Date(), activities: { create: { type: "STATUS", body: "Classée sans suite via le bot." } } },
        });
        await answerCallback(cb.id, "Classée");
        await editMessage(chatId, mid, `🗄 Fiche de <b>${name}</b> classée sans suite.`);
        const pay = paymentState(order);
        if (pay.paidCents > 0) {
          await sayInline(
            chatId,
            `💰 Un acompte de <b>${chf(pay.paidCents)}</b> avait été versé — tu le gardes (compté en recette) ou tu l'as remboursé ?`,
            [[
              { text: "✅ Gardé", callback_data: `nu:cxkeep:${orderId}` },
              { text: "↩️ Remboursé", callback_data: `nu:cxrefund:${orderId}` },
            ]]
          );
        }
      } else if (action === "cxkeep") {
        await prisma.order.update({
          where: { id: orderId },
          data: { activities: { create: { type: "STATUS", body: "Acompte conservé (annulation) — compté en recette." } } },
        });
        await answerCallback(cb.id, "Gardé ✓");
        await editMessage(chatId, mid, `✅ Acompte de <b>${name}</b> conservé — il apparaît dans les recettes du mois.`);
      } else if (action === "cxrefund") {
        await prisma.order.update({
          where: { id: orderId },
          data: { depositCents: null, balanceCents: null, activities: { create: { type: "STATUS", body: "Acompte remboursé (annulation)." } } },
        });
        await answerCallback(cb.id, "Remboursé ✓");
        await editMessage(chatId, mid, `↩️ Acompte de <b>${name}</b> marqué remboursé — retiré des recettes.`);
      } else if (action === "later") {
        await prisma.order.update({ where: { id: orderId }, data: { lastNudgeAt: new Date() } });
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `⏰ OK — je te reparlerai de <b>${name}</b> dans deux jours.`);
      } else if (action === "relance") {
        await answerCallback(cb.id);
        const msgClient = [
          `Bonjour ${order.contact.firstName} ! C'est Annie de Maman Gâteau 🧁`,
          `Je voulais juste m'assurer que vous aviez bien reçu mon devis pour ${order.occasion || "votre gâteau"}${order.eventDate ? ` (le ${order.eventDate.toLocaleDateString("fr-CH")})` : ""}.`,
          `S'il vous reste des questions ou une envie à ajuster, je suis là ! Et si vous souhaitez bloquer la date, un petit acompte suffit — les week-ends partent vite.`,
          `Belle journée !`,
        ].join("\n");
        await say(
          chatId,
          [
            `✍️ <b>Relance prête pour ${name}</b> :`,
            order.contact.phone ? `<a href="${waLink(order.contact.phone, msgClient)}">📲 Ouvrir WhatsApp avec ce message</a>` : "",
            "",
            `<code>${msgClient}</code>`,
            "",
            "(ou appui long → copier)",
          ].filter(Boolean).join("\n")
        );
        await prisma.order.update({ where: { id: orderId }, data: { lastNudgeAt: new Date() } });
      }
      return ok();
    }

    if (ns === "menu") {
      await answerCallback(cb.id);
      if (action === "scan") {
        await say(chatId, "📸 Envoie-moi simplement la <b>photo d'un ticket</b> ou un <b>PDF de facture</b> — n'importe quand, sans bouton. Je lis le montant, la date et la TVA, tu valides d'un tap.");
      } else if (action === "aide") {
        await say(chatId, [
          "<b>Carnet — aide</b>",
          "🎂 <b>Nouvelle commande</b> : je cherche le client par son nom (existant ou nouveau), puis 4 questions max.",
          "📸 Photo/PDF envoyé = dépense comptabilisée après ta validation.",
          "📅 <b>Cette semaine</b> : ce qui sort de l'atelier.",
          "💰 <b>Dépenses du mois</b> : total et détail par catégorie.",
          "Chaque matin à 7 h : le programme du jour + demandes d'avis à J+2.",
          "/annule pour abandonner une saisie en cours.",
        ].join("\n"));
      }
      return ok();
    }

    if (ns === "exp") {
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
        await setStep(chatId, tenant.id, `fix:${rest[0]}`, {});
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
        await editMessage(chatId, mid, `🧾 <b>${e.merchant || "Commerçant ?"}</b> — <b>${chf(e.totalCents)}</b> · ${catLabel(e.category)}\n\nTout est bon ?`, [
          [
            { text: "✅ Valider", callback_data: `exp:ok:${e.id}` },
            { text: "✏️ Corriger", callback_data: `exp:fix:${e.id}` },
          ],
          [
            { text: "🏷 Catégorie", callback_data: `exp:cat:${e.id}` },
            { text: "🗑 Annuler", callback_data: `exp:del:${e.id}` },
          ],
        ]);
      }
      return ok();
    }

    // callbacks d'anciennes versions (lead:/rc:) : session périmée
    await answerCallback(cb.id, "Session expirée — relance depuis le menu 👇");
    return ok();
  }

  /* ---------- messages ---------- */
  if (!msg) return ok();

  if (Array.isArray(msg.photo) && msg.photo.length) {
    const best = msg.photo[msg.photo.length - 1];
    await handleReceipt(chatId, tenant.id, tenant.slug, best.file_id, false);
    return ok();
  }
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

  if (text === "/start" || text === "/aide") {
    await say(chatId, "Bienvenue sur <b>Carnet</b> 🧁\n🎂 pour une nouvelle commande, ou envoie directement la photo d'un ticket.");
    return ok();
  }
  // nouvelle commande — et compatibilité avec les anciens boutons
  if (text.startsWith("🎂") || text.startsWith("✍️") || text.startsWith("🔁") || text === "/lead") {
    await startNc(chatId, tenant.id);
    return ok();
  }
  if (text.startsWith("☰") || text.toLowerCase() === "menu") {
    await showMenu(chatId);
    return ok();
  }
  if (text.startsWith("📸")) {
    await say(chatId, "Envoie-moi la photo du ticket ou le PDF 📷 — sans bouton, ça marche aussi.");
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

  /* ---- flux nouvelle commande ---- */
  if (session?.step === "nc:who") {
    const found = await prisma.contact.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { firstName: { contains: text, mode: "insensitive" } },
          { lastName: { contains: text, mode: "insensitive" } },
        ],
      },
      include: { _count: { select: { orders: true } } },
      take: 5,
      orderBy: { updatedAt: "desc" },
    });
    const tokens = text.split(/\s+/);
    const draft: Draft = { firstName: tokens[0], lastName: tokens.slice(1).join(" ") };
    if (!found.length) {
      await setStep(chatId, tenant.id, "nc:src", draft);
      await say(chatId, `Nouvelle cliente : <b>${text}</b> ✓`);
      await askNc(chatId, "src");
      return ok();
    }
    await setStep(chatId, tenant.id, "nc:who", draft);
    await sayInline(
      chatId,
      "Je connais peut-être déjà — c'est qui ?",
      [
        ...found.map((c) => [{
          text: `${c.firstName} ${c.lastName}`.trim() + ` (${c._count.orders})${c.phone ? " · …" + c.phone.slice(-4) : ""}`,
          callback_data: `nc:pick:${c.id}`,
        }]),
        [{ text: `➕ Nouvelle cliente « ${text.slice(0, 24)} »`, callback_data: "nc:new" }],
      ]
    );
    return ok();
  }

  if (session?.step?.startsWith("nc:")) {
    const key = session.step.slice(3);
    const draft: Draft = (session.draft as Draft) ?? {};
    if (key === "parts" || key === "price") {
      const n = parseInt(text.replace(/\D/g, ""));
      if (isNaN(n)) {
        await say(chatId, "Un nombre, ou ⏭ Passer.");
        return ok();
      }
      if (key === "parts") draft.parts = n;
      else draft.priceQuoted = n;
    } else if (key === "date") {
      const d = parseDate(text);
      if (!d) {
        await say(chatId, "Format JJ.MM.AAAA, ou ⏭ Passer.");
        return ok();
      }
      draft.eventDate = d.toISOString();
    } else if (key === "phone") {
      draft.phone = text;
    } else if (key === "occasion") {
      draft.occasion = text;
    } else if (key === "src") {
      await say(chatId, "Choisis le canal avec les boutons ci-dessus 👆");
      return ok();
    }
    await advanceNc(chatId, tenant.id, key, draft);
    return ok();
  }

  /* ---- montant d'acompte personnalisé ---- */
  if (session?.step?.startsWith("dep:")) {
    const orderId = session.step.slice(4);
    const n = parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(n) || n <= 0) {
      await say(chatId, "Un montant en CHF (ex. 54), s'il te plaît.");
      return ok();
    }
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "ACOMPTE_RECU",
        depositPaidAt: new Date(),
        depositCents: Math.round(n * 100),
        activities: { create: { type: "STATUS", body: `Acompte reçu (CHF ${n}) — via le bot.` } },
      },
      include: { contact: true },
    }).catch(() => null);
    await setStep(chatId, tenant.id, "idle", {});
    if (!order) {
      await say(chatId, "Fiche introuvable.");
      return ok();
    }
    await say(chatId, `💰 Acompte de CHF ${n} enregistré pour <b>${order.contact.firstName}</b> — date bloquée ✓`);
    return ok();
  }

  /* ---- paiement total réglé d'avance (prix inconnu) ---- */
  if (session?.step?.startsWith("full:")) {
    const orderId = session.step.slice(5);
    const n = parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(n) || n <= 0) {
      await say(chatId, "Un montant en CHF (ex. 180), s'il te plaît.");
      return ok();
    }
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "ACOMPTE_RECU",
        priceQuoted: Math.round(n),
        depositPaidAt: new Date(),
        balancePaidAt: new Date(),
        depositCents: Math.round(n * 100),
        balanceCents: 0,
        activities: { create: { type: "STATUS", body: `Payé en entier (CHF ${n}) — via le bot.` } },
      },
      include: { contact: true },
    }).catch(() => null);
    await setStep(chatId, tenant.id, "idle", {});
    if (!order) {
      await say(chatId, "Fiche introuvable.");
      return ok();
    }
    await say(chatId, `💯 CHF ${n} encaissés pour <b>${order.contact.firstName}</b> — tout est réglé, date bloquée ✓`);
    return ok();
  }

  /* ---- solde encaissé personnalisé ---- */
  if (session?.step?.startsWith("bal:")) {
    const orderId = session.step.slice(4);
    const n = parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(n) || n <= 0) {
      await say(chatId, "Un montant en CHF (ex. 120), s'il te plaît.");
      return ok();
    }
    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        balancePaidAt: new Date(),
        balanceCents: (existing?.balanceCents ?? 0) + Math.round(n * 100),
        activities: { create: { type: "STATUS", body: `Solde encaissé (CHF ${n}) — via le bot.` } },
      },
      include: { contact: true },
    }).catch(() => null);
    await setStep(chatId, tenant.id, "idle", {});
    if (!order) {
      await say(chatId, "Fiche introuvable.");
      return ok();
    }
    await say(chatId, `💰 Solde de CHF ${n} enregistré pour <b>${order.contact.firstName}</b>.`);
    return ok();
  }

  /* ---- correction d'un justificatif ---- */
  if (session?.step?.startsWith("fix:")) {
    const expId = session.step.slice(4);
    const exp = await prisma.expense.findUnique({ where: { id: expId } });
    if (!exp) {
      await setStep(chatId, tenant.id, "idle", {});
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
    await setStep(chatId, tenant.id, "idle", {});
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

  await say(chatId, "Utilise les boutons 👇 — ou envoie la photo d'un ticket.");
  return ok();
}
