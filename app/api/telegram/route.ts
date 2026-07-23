/* ---------------------------------------------------------------------------
   Bot Telegram v3 — un seul flux « 🎂 Nouvelle demande ».
   Le bot cherche le client par nom : existant → questions commande ;
   nouveau → canal + téléphone (anti-doublon) puis commande.
   Clavier figé à 4 boutons ; tout le reste vit dans ☰ Menu.
   Toute photo/PDF envoyé = justificatif à comptabiliser (Gemini).
--------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, rename, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import AdmZip from "adm-zip";
import { prisma, currentTenant } from "@/lib/db";
import { say, sayInline, editMessage, answerCallback, downloadPhoto, tg } from "@/lib/telegram";
import { analyzeReceipt, classifyInbound, analyzeConversation, type ConversationData, type GeminiPart } from "@/lib/gemini";
import { missingFor, fillField, snoozeField, dismissField } from "@/lib/completeness";
import { acceptApplication, declineApplication } from "@/lib/partners";
import { chf, CATEGORIES, catLabel } from "@/lib/money";
import { paymentState } from "@/lib/payments";
import { waLink } from "@/lib/wa";
import { AUTOMATIONS } from "@/lib/automations";

/* aide générée depuis le registre central — envoyée en plusieurs messages
   (un par famille) pour rester sous la limite Telegram de 4096 caractères. */
async function sendHelp(chatId: number) {
  const fam = (f: "cron" | "reaction" | "command", title: string) =>
    [`<b>${title}</b>`, ...AUTOMATIONS.filter((a) => a.family === f).map((a) => `${a.emoji} <b>${a.name}</b> — ${a.desc} <i>(${a.trigger})</i>`)].join("\n\n");
  await say(chatId, "<b>Carnet — aide</b>\n\n" + fam("command", "🎂 À la demande"));
  await say(chatId, fam("cron", "⏰ Programmés — réglables dans Réglages → Automatismes"));
  await say(chatId, fam("reaction", "⚡ Réactions automatiques") + "\n\nBouton ✖ Annuler (ou /annule) pour abandonner une saisie en cours.");
}

import { getSettings } from "@/lib/settings";
import { normPhone } from "@/lib/normalize";
import { nextOrderNo } from "@/lib/order-number";
import { normalizeOccasion } from "@/lib/order-options";
import type { Source, ExpenseCategory } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RECEIPTS = () => path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");

type TgUpdate = {
  message?: {
    chat?: { id: number };
    photo?: { file_id: string }[];
    media_group_id?: string;
    document?: { file_id: string; mime_type?: string; file_size?: number; file_name?: string };
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
  conv?: ConversationData;
  photos?: string[];
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
        { text: "Facebook", callback_data: "nc:src:FACEBOOK" },
        { text: "Bouche-à-oreille", callback_data: "nc:src:BOUCHE_A_OREILLE" },
      ],
      [
        { text: "Téléphone", callback_data: "nc:src:TELEPHONE" },
        { text: "Autre", callback_data: "nc:src:AUTRE" },
      ],
    ]);
  } else if (spec.skippable) {
    await sayInline(chatId, spec.q, [[
      { text: "⏭ Passer", callback_data: "nc:skip" },
      { text: "✖ Annuler", callback_data: "cancel:x" },
    ]]);
  } else {
    await sayInline(chatId, spec.q, [[{ text: "✖ Annuler", callback_data: "cancel:x" }]]);
  }
}

async function startNc(chatId: number, tenantId: string) {
  await setStep(chatId, tenantId, "nc:who", {});
  await sayInline(chatId, "🎂 <b>Nouvelle demande</b>\n" + QUESTIONS.who.q, [[{ text: "✖ Annuler", callback_data: "cancel:x" }]]);
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
      await say(chatId, "Il me faut au moins un prénom — relance 🎂 Nouvelle demande.");
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

  // Occasion rabattue sur la liste standard ; le texte tapé part en note s'il précisait plus.
  const rawOcc = (draft.occasion ?? "").trim();
  const occ = normalizeOccasion(rawOcc);
  const order = await prisma.order.create({
    data: {
      tenantId,
      orderNo: await nextOrderNo(tenantId),
      contactId,
      source: (draft.source ?? "AUTRE") as Source,
      occasion: occ,
      eventDate: draft.eventDate ? new Date(draft.eventDate) : null,
      parts: draft.parts,
      priceQuoted: draft.priceQuoted,
      notes: rawOcc && occ.toLowerCase() !== rawOcc.toLowerCase() ? `Occasion indiquée : ${rawOcc}` : "",
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
  await sayInline(chatId, "📄 As-tu déjà envoyé le devis à cette cliente ?", [[
    { text: "✅ Oui, devis envoyé", callback_data: `nu:sent:${order.id}` },
    { text: "Pas encore", callback_data: `nu:leadok:${order.id}` },
  ]]);
}


/* ----------------------------------------------- capture de conversation */

/** Photos d'un album Telegram : bufferisées ~2,5 s puis traitées ensemble. */
const albumBuf = new Map<string, { chatId: number; tenantId: string; tenantSlug: string; files: { fileId: string; isPdf: boolean }[]; timer: ReturnType<typeof setTimeout> }>();

function queueAlbum(groupId: string, chatId: number, tenantId: string, tenantSlug: string, file: { fileId: string; isPdf: boolean }) {
  const key = `${chatId}:${groupId}`;
  const cur = albumBuf.get(key);
  if (cur) {
    clearTimeout(cur.timer);
    cur.files.push(file);
    cur.timer = setTimeout(() => flushAlbum(key), 2500);
  } else {
    albumBuf.set(key, { chatId, tenantId, tenantSlug, files: [file], timer: setTimeout(() => flushAlbum(key), 2500) });
  }
}

async function flushAlbum(key: string) {
  const b = albumBuf.get(key);
  albumBuf.delete(key);
  if (!b) return;
  try {
    await handleInboundMedia(b.chatId, b.tenantId, b.tenantSlug, b.files);
  } catch (e) {
    console.error("flushAlbum:", e);
    await say(b.chatId, "⚠️ Je n'ai pas réussi à traiter cet envoi — réessaie ?").catch(() => null);
  }
}

/** Point d'entrée images/PDF : classifie (ticket vs conversation) puis route. */
async function handleInboundMedia(chatId: number, tenantId: string, tenantSlug: string, files: { fileId: string; isPdf: boolean }[]) {
  if (!files.length) return;
  const sess = await prisma.botSession.findUnique({ where: { chatId: BigInt(chatId) } });
  if (sess?.step?.startsWith("att:")) {
    await attachInspirations(chatId, tenantId, tenantSlug, sess.step.slice(4), files);
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    for (const f of files) await handleReceipt(chatId, tenantId, tenantSlug, f.fileId, f.isPdf);
    return;
  }
  const first = await downloadPhoto(files[0].fileId);
  if (!first) {
    await say(chatId, "Je n'ai pas réussi à récupérer le fichier — réessaie ?");
    return;
  }
  const firstBuf = files[0].isPdf
    ? first
    : await sharp(first).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  const kind = await classifyInbound(firstBuf, files[0].isPdf ? "application/pdf" : "image/webp");

  if (kind !== "conversation") {
    // justificatif (ou illisible) : flux compta habituel, fichier par fichier
    for (const f of files) await handleReceipt(chatId, tenantId, tenantSlug, f.fileId, f.isPdf);
    return;
  }

  await say(chatId, `📥 Capture${files.length > 1 ? "s" : ""} de conversation détectée${files.length > 1 ? "s" : ""} — je lis…`);
  const parts: GeminiPart[] = [{ inline_data: { mime_type: files[0].isPdf ? "application/pdf" : "image/webp", data: firstBuf.toString("base64") } }];
  for (const f of files.slice(1)) {
    const raw = await downloadPhoto(f.fileId);
    if (!raw) continue;
    const buf = f.isPdf ? raw : await sharp(raw).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    parts.push({ inline_data: { mime_type: f.isPdf ? "application/pdf" : "image/webp", data: buf.toString("base64") } });
  }
  await presentConversation(chatId, tenantId, parts);
}

/** Export .txt de discussion (WhatsApp : ⋮ → Plus → Exporter). */
async function handleChatExport(chatId: number, tenantId: string, fileId: string) {
  const raw = await downloadPhoto(fileId);
  if (!raw) {
    await say(chatId, "Je n'ai pas réussi à récupérer le fichier — réessaie ?");
    return;
  }
  const text = raw.toString("utf8").slice(0, 120_000);
  await say(chatId, "📥 Export de discussion reçu — je lis…");
  await presentConversation(chatId, tenantId, [{ text: `Export de la discussion :\n${text}` }]);
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Export .zip WhatsApp (discussion + médias) : txt → analyse, images de la CLIENTE → inspirations. */
async function handleChatZip(chatId: number, tenantId: string, tenantSlug: string, fileId: string) {
  const raw = await downloadPhoto(fileId);
  if (!raw) {
    await say(chatId, "Je n'ai pas réussi à récupérer le fichier — réessaie ? (si l'export est lourd, refais-le « sans médias »)");
    return;
  }
  let zip: AdmZip;
  try {
    zip = new AdmZip(raw);
  } catch {
    await say(chatId, "⚠️ Ce zip est illisible — réessaie l'export depuis WhatsApp.");
    return;
  }
  const entries = zip.getEntries().filter((e) => !e.isDirectory && !e.entryName.includes(".."));
  const txtEntry =
    entries.find((e) => /chat|discussion/i.test(e.entryName) && e.entryName.toLowerCase().endsWith(".txt")) ??
    entries.find((e) => e.entryName.toLowerCase().endsWith(".txt"));
  if (!txtEntry) {
    await say(chatId, "⚠️ Pas de fichier de discussion (.txt) dans ce zip.");
    return;
  }
  const text = txtEntry.getData().toString("utf8").slice(0, 120_000);
  const imgEntries = entries.filter((e) => /\.(jpe?g|png|webp)$/i.test(e.entryName)).slice(0, 40);
  await say(chatId, `📥 Export reçu (discussion${imgEntries.length ? ` + ${imgEntries.length} image${imgEntries.length > 1 ? "s" : ""}` : ""}) — je lis…`);

  const conv = await analyzeConversation([{ text: `Export de la discussion :\n${text}` }]);
  if (!conv || !conv.isRequest) {
    await say(chatId, conv ? "🤷 Je n'ai pas reconnu de demande de gâteau dans cette discussion." : "⚠️ Je n'ai pas réussi à analyser cette discussion — réessaie ?");
    return;
  }

  // qui a envoyé quoi ? (ligne du txt qui référence le fichier)
  const clientKeyName = (conv.contactName ?? "").toLowerCase();
  const clientKeyPhone = (conv.contactPhone ?? "").replace(/\D/g, "").slice(-9);
  const photos: string[] = [];
  const dir = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");
  let idx = 0;
  for (const e of imgEntries) {
    const base = e.entryName.split("/").pop() ?? e.entryName;
    const m = text.match(new RegExp(`(?:-\\s|\\]\\s?)([^:\\n]{1,60}?)\\s?:[^\\n]*${esc(base)}`));
    const sender = (m?.[1] ?? "").trim().toLowerCase();
    const senderDigits = sender.replace(/\D/g, "").slice(-9);
    const isClient =
      sender &&
      ((clientKeyName && (sender.includes(clientKeyName) || clientKeyName.includes(sender))) ||
        (clientKeyPhone && senderDigits && senderDigits === clientKeyPhone));
    if (!isClient) continue;
    try {
      const buf = e.getData();
      if (!buf.length || buf.length > 6_000_000) continue;
      const webp = await sharp(buf).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      idx++;
      const rel = path.join("inspirations", tenantSlug, `tmp-cv-${chatId}`, `${idx}.webp`);
      const abs = path.join(dir, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, webp);
      photos.push(rel);
    } catch (err) {
      console.error("zip image:", err);
    }
  }
  await presentConversation(chatId, tenantId, [], { conv, photos });
}

/** Analyse + récap + demande de validation (rien n'est créé sans ✅). */
async function presentConversation(chatId: number, tenantId: string, parts: GeminiPart[], pre?: { conv: ConversationData; photos: string[] }) {
  const conv = pre?.conv ?? (await analyzeConversation(parts));
  if (!conv) {
    await say(chatId, "⚠️ Je n'ai pas réussi à analyser cette conversation. Réessaie, ou crée la fiche via 🎂 Nouvelle demande.");
    return;
  }
  if (!conv.isRequest) {
    await say(chatId, "🤷 Je n'ai pas reconnu de demande de gâteau dans cette conversation. Si je me trompe, crée la fiche via 🎂 Nouvelle demande.");
    return;
  }
  const photos = pre?.photos ?? [];
  await setStep(chatId, tenantId, "cv:confirm", { conv, photos });
  await sayInline(chatId, convRecap(conv) + (photos.length ? `\n📎 ${photos.length} photo${photos.length > 1 ? "s" : ""} d'inspiration de la cliente — jointe${photos.length > 1 ? "s" : ""} à la fiche au moment du ✅.` : ""), [
    [{ text: "✅ Créer la fiche", callback_data: "cv:ok" }],
    [
      { text: "✏️ Corriger", callback_data: "cv:fix" },
      { text: "❌ Ignorer", callback_data: "cv:cancel" },
    ],
  ]);
}

function convStatus(conv: ConversationData): "LEAD" | "DEVIS_ENVOYE" | "ACOMPTE_RECU" {
  if (conv.depositMentioned) return "ACOMPTE_RECU";
  if (conv.priceQuoted) return "DEVIS_ENVOYE";
  return "LEAD";
}

const STATUS_LABEL: Record<string, string> = { LEAD: "Lead", DEVIS_ENVOYE: "Devis envoyé", ACOMPTE_RECU: "Confirmé" };
const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", sms: "SMS", email: "E-mail", autre: "autre canal" };

/** Manques bloquants au stade proposé — calculés avant création. */
function convMissing(conv: ConversationData): string[] {
  const st = convStatus(conv);
  const out: string[] = [];
  if (!conv.contactName) out.push("nom");
  if (st !== "LEAD") {
    if (!conv.eventDate) out.push("date de l'événement");
    if (!conv.parts) out.push("nombre de parts");
    if (!conv.priceQuoted) out.push("prix");
    if (!conv.occasion) out.push("occasion");
  }
  if (st === "ACOMPTE_RECU") {
    if (!conv.contactPhone) out.push("téléphone");
    if (conv.deliveryMode === "livraison" && !conv.deliveryAddress) out.push("adresse de livraison");
  }
  return out;
}

function convRecap(conv: ConversationData): string {
  const miss = convMissing(conv);
  const l: string[] = [
    `📥 <b>Demande détectée — ${conv.contactName ?? "nom inconnu"}</b> (${CHANNEL_LABEL[conv.channel]})`,
    [
      conv.occasion ?? null,
      conv.celebrant ? `${conv.celebrant}${conv.celebrantAge ? ` ${conv.celebrantAge} ans` : ""}` : null,
      conv.eventDate ? new Date(conv.eventDate + "T12:00:00").toLocaleDateString("fr-CH") : null,
      conv.eventTime,
      conv.parts ? `${conv.parts} parts` : null,
      conv.priceQuoted ? `CHF ${conv.priceQuoted}` : null,
    ].filter(Boolean).join(" · "),
    conv.theme ? `🎨 ${conv.theme}` : "",
    conv.flavors ? `🍰 ${conv.flavors}` : "",
    conv.eventPlace ? `📍 ${conv.eventPlace}` : "",
    conv.deliveryMode ? `🚗 ${conv.deliveryMode === "retrait" ? "Retrait atelier" : `Livraison${conv.deliveryAddress ? ` — ${conv.deliveryAddress}` : ""}`}` : "",
    conv.contactPhone ? `📱 ${conv.contactPhone}` : "",
    conv.referredBy ? `👋 Recommandée par ${conv.referredBy}` : "",
    conv.summary ? `\n<i>${conv.summary}</i>` : "",
    `\nStatut proposé : <b>${STATUS_LABEL[convStatus(conv)]}</b>`,
    miss.length ? `⚠️ Manque : ${miss.join(", ")} — je te les demanderai le soir venu.` : "✔️ Fiche complète pour ce stade.",
  ];
  return l.filter(Boolean).join("\n");
}

async function createFromConversation(chatId: number, tenantId: string, conv: ConversationData, tmpPhotos: string[] = []) {
  const phoneN = conv.contactPhone ? normPhone(conv.contactPhone) : "";
  let contact = phoneN
    ? await prisma.contact.findFirst({ where: { tenantId, phone: phoneN }, include: { _count: { select: { orders: true } } } })
    : null;
  let knownNote = "";
  const source = (conv.referredBy ? "BOUCHE_A_OREILLE" : conv.channel === "whatsapp" ? "WHATSAPP" : conv.channel === "instagram" ? "INSTAGRAM" : conv.channel === "facebook" ? "FACEBOOK" : conv.channel === "email" ? "EMAIL" : conv.channel === "sms" ? "SMS" : "AUTRE") as Source;

  if (contact) {
    knownNote = `👋 Ce numéro existait déjà : rattachée à <b>${contact.firstName} ${contact.lastName}</b>`.trim() + ` (${contact._count.orders} commande${contact._count.orders > 1 ? "s" : ""}).`;
    if (!contact.instagram && conv.instagram) await prisma.contact.update({ where: { id: contact.id }, data: { instagram: conv.instagram } });
  } else {
    const words = (conv.contactName ?? "Inconnue").split(/\s+/);
    contact = Object.assign(
      await prisma.contact.create({
        data: {
          tenantId,
          firstName: words[0],
          lastName: words.slice(1).join(" "),
          phone: phoneN,
          instagram: conv.instagram ?? "",
          source,
        },
      }),
      { _count: { orders: 0 } }
    );
  }

  // Occasion rabattue sur la liste standard ; la formulation d'origine part en note.
  const rawConvOcc = (conv.occasion ?? "").trim();
  const convOcc = normalizeOccasion(rawConvOcc, conv.celebrantAge);
  const notes = [
    conv.summary,
    rawConvOcc && convOcc.toLowerCase() !== rawConvOcc.toLowerCase() ? `Occasion indiquée : ${rawConvOcc}` : "",
    conv.eventPlace ? `Fête : ${conv.eventPlace}${conv.eventTime ? ` (${conv.eventTime})` : ""}` : conv.eventTime ? `Heure : ${conv.eventTime}` : "",
    conv.flavors ? `Saveurs évoquées : ${conv.flavors}` : "",
  ].filter(Boolean).join("\n");

  const order = await prisma.order.create({
    data: {
      tenantId,
      orderNo: await nextOrderNo(tenantId),
      contactId: contact.id,
      status: convStatus(conv),
      source,
      sourceDetail: conv.referredBy ? `recommandée par ${conv.referredBy}` : "",
      occasion: convOcc,
      eventDate: conv.eventDate ? new Date(conv.eventDate + "T12:00:00Z") : null,
      handoverAt: (() => {
        if (!conv.eventDate || !conv.handoverTime) return null;
        const m = conv.handoverTime.match(/^(\d{1,2})[h:](\d{2})$/);
        if (!m) return null;
        const dt = new Date(`${conv.eventDate}T${String(Number(m[1])).padStart(2, "0")}:${m[2]}:00`);
        return isNaN(dt.getTime()) ? null : dt;
      })(),
      celebrant: conv.celebrant ?? "",
      celebrantAge: conv.celebrantAge,
      parts: conv.parts,
      themeNote: conv.theme ?? "",
      deliveryMode: conv.deliveryMode ?? "retrait",
      deliveryAddress: conv.deliveryAddress ?? "",
      priceQuoted: conv.priceQuoted,
      ...(conv.depositMentioned ? { depositPaidAt: new Date() } : {}),
      notes,
      activities: { create: { type: "SYSTEM", body: `Fiche créée depuis une conversation ${CHANNEL_LABEL[conv.channel]} (capture).` } },
    },
    include: { contact: true },
  });

  // photos d'inspiration extraites du zip : déplacées du dossier temporaire vers la fiche
  if (tmpPhotos.length) {
    const dir = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");
    const rels: string[] = [];
    for (let i = 0; i < tmpPhotos.length; i++) {
      try {
        const rel = path.join("inspirations", (await prisma.tenant.findUnique({ where: { id: tenantId } }))?.slug ?? "mg", order.id, `insp-${i + 1}.webp`);
        await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await rename(path.join(dir, tmpPhotos[i]), path.join(dir, rel));
        rels.push(rel);
      } catch (e) {
        console.error("move inspiration:", e);
      }
    }
    if (rels.length) await prisma.order.update({ where: { id: order.id }, data: { inspirationPhotos: rels } });
  }

  const { syncOrderEvent } = await import("@/lib/gcal");
  void syncOrderEvent(order.id).catch(() => null);

  const miss = missingFor(order);
  const lines = [
    `✅ <b>Fiche créée — ${contact.firstName} ${contact.lastName}</b>`.trim() + ` · ${STATUS_LABEL[order.status] ?? order.status}`,
    knownNote,
    `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
  ].filter(Boolean);

  if (tmpPhotos.length) lines.push(`📎 ${tmpPhotos.length} photo${tmpPhotos.length > 1 ? "s" : ""} d'inspiration jointe${tmpPhotos.length > 1 ? "s" : ""}.`);

  if (miss.length) {
    const first = miss[0];
    await sayInline(
      chatId,
      [...lines, `\n⚠️ Manque encore : ${miss.map((m) => m.label).join(", ")}.`, `On règle le premier ? ${first.ask.replace("{name}", `<b>${contact.firstName}</b>`)}`].join("\n"),
      [
        [{ text: "✍️ Renseigner", callback_data: `fd:fill:${order.id}:${first.field}` }],
        [
          { text: "⏰ Plus tard", callback_data: `fd:later:${order.id}:${first.field}` },
          { text: "❌ N'existe pas", callback_data: `fd:never:${order.id}:${first.field}` },
        ],
        [{ text: "📎 Ajouter des inspirations", callback_data: `att:start:${order.id}` }],
      ]
    );
  } else {
    await sayInline(chatId, [...lines, "✔️ Fiche complète pour ce stade."].join("\n"), [
      [{ text: "📎 Ajouter des inspirations", callback_data: `att:start:${order.id}` }],
    ]);
  }
}

/** Mode 📎 : les photos envoyées s'attachent à la fiche jusqu'à « Terminé ». */
async function attachInspirations(chatId: number, tenantId: string, tenantSlug: string, orderId: string, files: { fileId: string; isPdf: boolean }[]) {
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { contact: true } });
  if (!order) {
    await say(chatId, "Fiche introuvable — mode 📎 annulé.");
    return;
  }
  const dir = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");
  const rels: string[] = [];
  for (const f of files.filter((x) => !x.isPdf)) {
    try {
      const raw = await downloadPhoto(f.fileId);
      if (!raw) continue;
      const webp = await sharp(raw).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const rel = path.join("inspirations", tenantSlug, order.id, `att-${Date.now()}-${rels.length + 1}.webp`);
      await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await writeFile(path.join(dir, rel), webp);
      rels.push(rel);
    } catch (e) {
      console.error("attach inspiration:", e);
    }
  }
  if (rels.length) await prisma.order.update({ where: { id: orderId }, data: { inspirationPhotos: { push: rels } } });
  const total = order.inspirationPhotos.length + rels.length;
  await sayInline(chatId, `📎 +${rels.length} — ${total} photo${total > 1 ? "s" : ""} sur la fiche de <b>${order.contact.firstName}</b>. Envoie la suite, ou :`, [
    [{ text: "✅ Terminé", callback_data: `att:done:${orderId}` }],
  ]);
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

/** Liste les commandes actives en boutons cliquables (choix d'une commande). */
async function pickOrder(chatId: number, tenantId: string, statuses: string[], cbPrefix: string, title: string, empty: string) {
  const orders = await prisma.order.findMany({
    where: { tenantId, status: { in: statuses as never } },
    include: { contact: true },
    orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
    take: 12,
  });
  if (!orders.length) {
    await say(chatId, empty);
    return;
  }
  const rows = orders.map((o) => {
    const n = `${o.contact.firstName} ${o.contact.lastName}`.trim();
    const when = o.eventDate ? ` · ${o.eventDate.toLocaleDateString("fr-CH")}` : "";
    return [{ text: `${n} — ${o.occasion || "?"}${when}`, callback_data: `${cbPrefix}:${o.id}` }];
  });
  await sayInline(chatId, title, [...rows, [{ text: "✖ Fermer", callback_data: "cancel:x" }]]);
}

async function showMenu(chatId: number, tenantId?: string) {
  let fillLabel = "🧩 Compléter les fiches";
  if (tenantId) {
    const { pendingFields } = await import("@/lib/completeness");
    const n = (await pendingFields(tenantId, 15).catch(() => [])).length;
    if (n > 0) fillLabel += ` (${n})`;
  }
  await sayInline(chatId, "☰ <b>Menu</b>", [
    [{ text: fillLabel, callback_data: "menu:fill" }],
    [
      { text: "💰 Enregistrer un acompte", callback_data: "menu:deposit" },
      { text: "❌ Annuler une commande", callback_data: "menu:cancelorder" },
    ],
    [
      { text: "📅 Cette semaine", callback_data: "menu:week" },
      { text: "💰 Dépenses du mois", callback_data: "menu:expenses" },
    ],
    [{ text: "📈 Mon cap", callback_data: "menu:cap" }],
    [{ text: "📸 Scanner un ticket / une facture", callback_data: "menu:scan" }],
    [{ text: "🔗 Ouvrir Carnet", url: `${process.env.APP_URL ?? "https://carnet.mamangateau.ch"}` } as never],
    [{ text: "❓ Aide", callback_data: "menu:aide" }],
  ]);
}

/* ------------------------------------------------ assistant de rédaction */

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Génère un brouillon et l'envoie avec les actions (Utiliser / Affiner / Régénérer / paiement). */
async function aiGenerate(
  chatId: number,
  orderId: string,
  opts: { userMessage?: string; regenerate?: boolean } = {}
) {
  await tg("sendChatAction", { chat_id: chatId, action: "typing" });
  const { generateDraft } = await import("@/lib/assistant");
  const r = await generateDraft(orderId, opts);
  if (!r.ok) {
    await say(chatId, "Commande introuvable.");
    return;
  }
  await sayInline(
    chatId,
    `✍️ <b>Proposition</b>${r.usedAI ? "" : " (IA indispo — message de base)"} :\n\n${escHtml(r.text)}`,
    [
      [{ text: "✅ Utiliser → WhatsApp", callback_data: `ai:use:${orderId}` }],
      [{ text: "💬 Affiner", callback_data: `ai:refine:${orderId}` }],
    ]
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

      if (action === "askdep") {
        const dep = order.priceQuoted ? Math.round((order.priceQuoted * settings.depositPct) / 100) : null;
        await answerCallback(cb.id);
        await sayInline(
          chatId,
          `💰 Acompte de <b>${name}</b>${dep ? ` (attendu : <b>CHF ${dep}</b>, ${settings.depositPct} %)` : ""} — reçu ?`,
          [
            [
              { text: "✅ Reçu", callback_data: `nu:dep:${orderId}` },
              { text: "✏️ Autre montant", callback_data: `nu:depother:${orderId}` },
            ],
            [{ text: "💯 Payé en entier", callback_data: `nu:paidfull:${orderId}` }],
          ]
        );
        return ok();
      }
      if (action === "leadok") {
        await answerCallback(cb.id, "Noté");
        await editMessage(chatId, mid, `📝 Demande de <b>${name}</b> enregistrée — je te rappellerai de faire le devis.`);
        return ok();
      }
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
            [
              [
                { text: "✅ Gardé", callback_data: `nu:cxkeep:${orderId}` },
                { text: "↩️ Remboursé", callback_data: `nu:cxrefund:${orderId}` },
              ],
              [{ text: "◐ Partiellement", callback_data: `nu:cxpartial:${orderId}` }],
            ]
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
      } else if (action === "cxpartial") {
        await answerCallback(cb.id);
        await setStep(chatId, tenant.id, `cxref:${orderId}`, {});
        await say(chatId, `◐ Quel <b>montant</b> as-tu remboursé à <b>${name}</b> ? (en CHF)`);
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

    if (ns === "cv") {
      const draft = (session?.draft ?? {}) as Draft;
      const conv = draft.conv;
      await answerCallback(cb.id);
      if (!conv) {
        await say(chatId, "Session expirée — renvoie les captures.");
        return ok();
      }
      if (action === "ok") {
        await setStep(chatId, tenant.id, "idle", {});
        await editMessage(chatId, mid, "📥 Demande validée — je crée la fiche…");
        await createFromConversation(chatId, tenant.id, conv, draft.photos ?? []);
      } else if (action === "fix") {
        await setStep(chatId, tenant.id, "cv:fix", { conv, photos: draft.photos });
        await sayInline(chatId, "✏️ Envoie la correction en texte libre — ex. « le prix c'est 195 », « tél +41 79 123 45 67 », « c'est un baptême », « 30 parts ». Plusieurs corrections d'un coup, ça marche aussi.", [[{ text: "✖ Annuler", callback_data: "cancel:x" }]]);
      } else {
        await setStep(chatId, tenant.id, "idle", {});
        if (draft.photos?.length) {
          const dir = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");
          for (const rel of draft.photos) await unlink(path.join(dir, rel)).catch(() => null);
        }
        await editMessage(chatId, mid, "🗑 Demande ignorée — rien n'a été créé.");
      }
      return ok();
    }

    if (ns === "pa") {
      const app = await prisma.partnerApplication.findFirst({ where: { id: rest[0], tenantId: tenant.id } });
      if (!app) {
        await answerCallback(cb.id, "Candidature introuvable");
        return ok();
      }
      if (app.status !== "pending") {
        await answerCallback(cb.id, `Déjà traitée (${app.status === "accepted" ? "acceptée" : "déclinée"})`);
        return ok();
      }
      if (action === "ok") {
        const r = await acceptApplication(tenant.id, app.id);
        if (r.error || !r.partner) {
          await answerCallback(cb.id, r.error ?? "Erreur");
          return ok();
        }
        await answerCallback(cb.id, "Partenaire créé ✓");
        await editMessage(
          chatId,
          mid,
          [
            `✅ <b>Partenaire créé — ${app.business}</b>`,
            `Code : <b>${r.partner.code}</b> · commission par défaut 10 % (modifiable)`,
            `🖨 Flyer personnalisé : ${process.env.APP_URL ?? ""}/api/partenaires/${r.partner.id}/flyer`,
            `Fiche : ${process.env.APP_URL ?? ""}/partenaires`,
          ].join("\n")
        );
      } else if (action === "no") {
        const r = await declineApplication(tenant.id, app.id);
        await answerCallback(cb.id, r.error ?? "Déclinée");
        if (!r.error) await editMessage(chatId, mid, `🗄 Candidature de <b>${app.business}</b> déclinée — rien n'a été créé.`);
      }
      return ok();
    }

    if (ns === "att") {
      const orderId = rest[0];
      if (action === "start") {
        await answerCallback(cb.id);
        await setStep(chatId, tenant.id, `att:${orderId}`, {});
        await sayInline(chatId, "📎 Transfère-moi les photos d'inspiration (une ou plusieurs, depuis WhatsApp/Insta ça marche aussi).", [
          [{ text: "✅ Terminé", callback_data: `att:done:${orderId}` }],
        ]);
      } else if (action === "done") {
        await setStep(chatId, tenant.id, "idle", {});
        const o = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, include: { contact: true } });
        await answerCallback(cb.id, "Mode 📎 terminé");
        await editMessage(chatId, mid, o ? `📎 ${o.inspirationPhotos.length} photo${o.inspirationPhotos.length > 1 ? "s" : ""} d'inspiration sur la fiche de ${o.contact.firstName}.\n${process.env.APP_URL ?? ""}/commandes/${o.id}` : "📎 Terminé.");
      }
      return ok();
    }

    if (ns === "fd") {
      const [orderId, field] = rest;
      const order = orderId ? await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, include: { contact: true } }) : null;
      if (!order) {
        await answerCallback(cb.id, "Fiche introuvable");
        return ok();
      }
      const name = order.contact.firstName;
      if (action === "fill") {
        await answerCallback(cb.id);
        const miss = missingFor(order).find((m) => m.field === field);
        await setStep(chatId, tenant.id, `fill:${orderId}:${field}`, {});
        await sayInline(chatId, `✍️ ${(miss?.ask ?? `Nouvelle valeur pour ${field} de {name} ?`).replace("{name}", `<b>${name}</b>`)}`, [[{ text: "✖ Annuler", callback_data: "cancel:x" }]]);
      } else if (action === "later") {
        const st = await getSettings(tenant.id);
        await snoozeField(tenant.id, orderId, field, st.fieldFollowupDays);
        await answerCallback(cb.id, `OK — je redemande dans ${st.fieldFollowupDays} j`);
        await editMessage(chatId, mid, `⏰ Noté — je te redemande ça dans ${st.fieldFollowupDays} jour${st.fieldFollowupDays > 1 ? "s" : ""} (${name}).`);
      } else if (action === "never") {
        await dismissField(tenant.id, orderId, field);
        await answerCallback(cb.id, "Je ne redemanderai plus");
        await editMessage(chatId, mid, `❌ Compris — je ne redemanderai plus cette info pour ${name}.`);
      }
      return ok();
    }

    if (ns === "cancel") {
      await setStep(chatId, tenant.id, "idle", {});
      await answerCallback(cb.id, "Annulé");
      await editMessage(chatId, mid, "✖ Saisie annulée — le clavier reste à ta disposition.");
      return ok();
    }

    if (ns === "noop") {
      await answerCallback(cb.id, "🧪 Bouton de test — aucun effet");
      return ok();
    }

    if (ns === "metric") {
      await answerCallback(cb.id);
      const step = session?.step ?? "";
      if (step === "metric:instagram_followers") {
        await setStep(chatId, tenant.id, "metric:google_reviews", {});
        await editMessage(chatId, mid, "⏭ Passé");
        await sayInline(chatId, "⭐ Et combien d'avis Google au compteur ?", [[{ text: "⏭ Passer", callback_data: "metric:skip" }]]);
      } else {
        await setStep(chatId, tenant.id, "idle", {});
        await editMessage(chatId, mid, "✅ Bilan bouclé — bon mois ! 🧁");
      }
      return ok();
    }

    if (ns === "menu") {
      await answerCallback(cb.id);
      if (action === "cap") {
        const { computeCap } = await import("@/lib/cap");
        const c = await computeCap(tenant.id);
        const phase = c.phases[c.phaseCourante];
        const done = phase.jalons.filter((j) => j.done).length;
        await say(chatId, [
          `📈 <b>Le cap — ${new Date().toLocaleDateString("fr-CH", { month: "long" })}</b>`,
          `CA du mois : <b>CHF ${c.caMois}</b> / ${c.s.goalCaMensuel} · net CHF ${c.netMois}`,
          `Panier moyen : CHF ${c.panierMoyen} · week-ends remplis : ${c.weekendsPleins}/4`,
          `Mariages : ${c.partMariagePct} % · hors sur-mesure : ${c.partDecouplePct} %`,
          `${phase.name} : <b>${done}/${phase.jalons.length}</b> jalons ✓`,
          `${process.env.APP_URL ?? ""}/cap`,
        ].join("\n"));
        return ok();
      }
      if (action === "fill") {
        await answerCallback(cb.id);
        const { fieldNudges } = await import("@/lib/cron");
        const s2 = await getSettings(tenant.id);
        const { pendingFields } = await import("@/lib/completeness");
        const n = (await pendingFields(tenant.id, 15, s2.handoverLeadDays)).length;
        if (!n) {
          await say(chatId, "🧩 Toutes les fiches actives sont complètes. ✔️");
        } else {
          await say(chatId, `🧩 C'est parti — ${n} info${n > 1 ? "s" : ""} à compléter, je te pose les questions :`);
          await fieldNudges(tenant, s2, Math.min(n, 8));
        }
        return ok();
      }
      if (action === "week") {
        await answerCallback(cb.id);
        await weekSummary(chatId, tenant.id);
        return ok();
      }
      if (action === "expenses") {
        await answerCallback(cb.id);
        await monthExpenses(chatId, tenant.id);
        return ok();
      }
      if (action === "deposit") {
        await pickOrder(chatId, tenant.id, ["LEAD", "DEVIS_ENVOYE"], "nu:askdep", "💰 <b>Enregistrer un acompte</b>\nPour quelle commande ?", "Aucune commande en attente d'acompte. 👍");
        return ok();
      }
      if (action === "cancelorder") {
        await pickOrder(chatId, tenant.id, ["LEAD", "DEVIS_ENVOYE", "ACOMPTE_RECU", "EN_PRODUCTION"], "nu:drop", "❌ <b>Annuler une commande</b>\nLaquelle classer sans suite ?", "Aucune commande à annuler (les livrées ne sont pas concernées). 👍");
        return ok();
      }
      if (action === "scan") {
        await say(chatId, "📸 Envoie-moi simplement la <b>photo d'un ticket</b> ou un <b>PDF de facture</b> — n'importe quand, sans bouton. Je lis le montant, la date et la TVA, tu valides d'un tap.");
      } else if (action === "aide") {
        await sendHelp(chatId);
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
        await sayInline(chatId, "✏️ Envoie la correction : un <b>montant</b> (34.50), un <b>commerçant</b> (Coop), une <b>date</b> (12.01.2026) — ou les trois d'un coup.", [[{ text: "✖ Annuler", callback_data: "cancel:x" }]]);
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

    if (ns === "ai") {
      const orderId = rest[0];
      const order = await prisma.order.findUnique({ where: { id: orderId }, include: { contact: true } });
      if (!order) {
        await answerCallback(cb.id, "Commande introuvable");
        return ok();
      }
      const oname = `${order.contact.firstName} ${order.contact.lastName}`.trim();

      if (action === "start") {
        await answerCallback(cb.id);
        if (order.priceQuoted) {
          await editMessage(chatId, mid, `✍️ <b>Réponse à ${oname}</b>`);
          await sayInline(chatId, `Prix final ? (estimation configurateur : <b>CHF ${order.priceQuoted}</b>)`, [
            [{ text: `✅ Garder CHF ${order.priceQuoted}`, callback_data: `ai:keepprice:${orderId}` }],
            [{ text: "✏️ Autre montant", callback_data: `ai:editprice:${orderId}` }],
          ]);
        } else {
          await setStep(chatId, tenant.id, `ai:setprice:${orderId}`, {});
          await say(chatId, `✍️ <b>Réponse à ${oname}</b>\nQuel est le prix final ? (en CHF)`);
        }
      } else if (action === "keepprice") {
        await answerCallback(cb.id);
        await editMessage(chatId, mid, `Prix : <b>CHF ${order.priceQuoted}</b> ✓`);
        await aiGenerate(chatId, orderId);
      } else if (action === "editprice") {
        await answerCallback(cb.id);
        await setStep(chatId, tenant.id, `ai:setprice:${orderId}`, {});
        await say(chatId, "Quel est le prix final ? (en CHF)");
      } else if (action === "refine") {
        await answerCallback(cb.id);
        await setStep(chatId, tenant.id, `ai:chat:${orderId}`, {});
        await sayInline(chatId, "💬 Dis-moi ce qu'il faut changer, ou pose ta question.", [[{ text: "✖ Annuler", callback_data: "cancel:x" }]]);
      } else if (action === "use") {
        await answerCallback(cb.id);
        const last = await prisma.aiMessage.findFirst({ where: { orderId, role: "assistant" }, orderBy: { createdAt: "desc" } });
        if (!last) {
          await say(chatId, "Aucun message à utiliser — régénère d'abord.");
          return ok();
        }
        const link = order.contact.phone ? waLink(order.contact.phone, last.content) : null;
        await sayInline(
          chatId,
          link
            ? `✅ <a href="${link}">📲 Ouvrir WhatsApp avec le message</a>\n\n(ou appui long sur la proposition ci-dessus → copier)`
            : "✅ Appui long sur la proposition ci-dessus → copier (pas de numéro pour un lien WhatsApp).",
          [[{ text: "✅ Marquer devis envoyé", callback_data: `nu:sent:${orderId}` }]]
        );
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
    const file = { fileId: best.file_id as string, isPdf: false };
    if (typeof msg.media_group_id === "string" && msg.media_group_id) {
      queueAlbum(msg.media_group_id, chatId, tenant.id, tenant.slug, file);
    } else {
      await handleInboundMedia(chatId, tenant.id, tenant.slug, [file]);
    }
    return ok();
  }
  if (msg.document?.file_id) {
    const mime = msg.document.mime_type ?? "";
    const fname = String(msg.document.file_name ?? "").toLowerCase();
    if ((msg.document.file_size ?? 0) > 15_000_000) {
      await say(chatId, "Fichier trop lourd (max ~15 Mo).");
      return ok();
    }
    if (mime === "application/zip" || mime === "application/x-zip-compressed" || fname.endsWith(".zip")) {
      await handleChatZip(chatId, tenant.id, tenant.slug, msg.document.file_id);
    } else if (mime === "text/plain" || fname.endsWith(".txt")) {
      await handleChatExport(chatId, tenant.id, msg.document.file_id);
    } else if (mime === "application/pdf" || mime.startsWith("image/")) {
      const file = { fileId: msg.document.file_id as string, isPdf: mime === "application/pdf" };
      if (typeof msg.media_group_id === "string" && msg.media_group_id) {
        queueAlbum(msg.media_group_id, chatId, tenant.id, tenant.slug, file);
      } else {
        await handleInboundMedia(chatId, tenant.id, tenant.slug, [file]);
      }
    } else {
      await say(chatId, "Je lis les images, les PDF et les exports de discussion (.txt ou .zip WhatsApp).");
    }
    return ok();
  }

  const text: string = typeof msg.text === "string" ? msg.text.trim() : "";
  if (!text) return ok();

  if (text === "/start") {
    await say(chatId, "Bienvenue sur <b>Carnet</b> 🧁\n🎂 pour une nouvelle commande, ou envoie directement la photo d'un ticket.\n/aide pour tout ce que je sais faire.");
    return ok();
  }
  if (text === "/aide") {
    await sendHelp(chatId);
    return ok();
  }
  // nouvelle commande — et compatibilité avec les anciens boutons
  if (text.startsWith("🎂") || text.startsWith("✍️") || text.startsWith("🔁") || text === "/lead") {
    await startNc(chatId, tenant.id);
    return ok();
  }
  if (text.startsWith("☰") || text.toLowerCase() === "menu") {
    await showMenu(chatId, tenant.id);
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

  /* ---- métriques mensuelles (followers, avis) ---- */
  if (session?.step?.startsWith("metric:")) {
    const key = session.step.slice(7);
    const n = parseInt(text.replace(/[^0-9]/g, ""));
    if (isNaN(n)) {
      await say(chatId, "Un nombre, ou ⏭ Passer.");
      return ok();
    }
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    await prisma.metricSnapshot.upsert({
      where: { tenantId_key_month: { tenantId: tenant.id, key, month } },
      update: { value: n },
      create: { tenantId: tenant.id, key, month, value: n },
    });
    if (key === "instagram_followers") {
      await setStep(chatId, tenant.id, "metric:google_reviews", {});
      await sayInline(chatId, `📸 ${n} abonnés, noté ! ⭐ Et combien d'avis Google ?`, [[{ text: "⏭ Passer", callback_data: "metric:skip" }]]);
    } else {
      await setStep(chatId, tenant.id, "idle", {});
      await say(chatId, `⭐ ${n} avis, noté. ✅ Bilan bouclé — bon mois ! 🧁\n${process.env.APP_URL ?? ""}/cap`);
    }
    return ok();
  }

  /* ---- remboursement partiel (annulation) ---- */
  if (session?.step?.startsWith("cxref:")) {
    const orderId = session.step.slice(6);
    const n = parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(n) || n <= 0) {
      await say(chatId, "Un montant en CHF (ex. 30), s'il te plaît.");
      return ok();
    }
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { contact: true } });
    await setStep(chatId, tenant.id, "idle", {});
    if (!order) { await say(chatId, "Fiche introuvable."); return ok(); }
    const paid = (order.depositCents ?? 0) + (order.balanceCents ?? 0);
    const kept = Math.max(0, paid - Math.round(n * 100));
    // recette annulée : on ne garde en encaissé que la part conservée
    await prisma.order.update({
      where: { id: orderId },
      data: {
        depositCents: kept || null,
        balanceCents: null,
        activities: { create: { type: "STATUS", body: `Annulation : CHF ${n} remboursés, ${chf(kept)} conservés — via le bot.` } },
      },
    });
    await say(chatId, `◐ Remboursement de CHF ${n} noté pour <b>${order.contact.firstName}</b> — ${chf(kept)} restent comptés en recette.`);
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

  /* ---- assistant : saisie du prix final ---- */
  if (session?.step?.startsWith("ai:setprice:")) {
    const orderId = session.step.slice("ai:setprice:".length);
    const n = parseFloat(text.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (isNaN(n) || n <= 0) {
      await say(chatId, "Un prix en CHF (ex. 180), s'il te plaît.");
      return ok();
    }
    await prisma.order.update({ where: { id: orderId }, data: { priceQuoted: Math.round(n) } }).catch(() => null);
    await setStep(chatId, tenant.id, "idle", {});
    await aiGenerate(chatId, orderId);
    return ok();
  }

  /* ---- assistant : mode chat (affiner / question) ---- */
  if (session?.step?.startsWith("ai:chat:")) {
    const orderId = session.step.slice("ai:chat:".length);
    await aiGenerate(chatId, orderId, { userMessage: text });
    return ok(); // reste en mode chat jusqu'à /annule
  }

  /* ---- correction d'un justificatif ---- */
  if (session?.step === "cv:fix") {
    const draft = (session.draft ?? {}) as Draft;
    if (!draft.conv) {
      await setStep(chatId, tenant.id, "idle", {});
      await say(chatId, "Session expirée — renvoie les captures.");
      return ok();
    }
    await say(chatId, "✏️ Je corrige…");
    const fixed = await analyzeConversation([
      { text: `Demande déjà extraite (JSON) : ${JSON.stringify(draft.conv)}\nCorrection de la pâtissière : « ${text} »\nApplique la correction et renvoie le JSON complet mis à jour.` },
    ]);
    if (!fixed) {
      await say(chatId, "⚠️ Je n'ai pas réussi à appliquer la correction — reformule ?");
      return ok();
    }
    fixed.isRequest = true;
    await setStep(chatId, tenant.id, "cv:confirm", { conv: fixed, photos: draft.photos });
    await sayInline(chatId, convRecap(fixed), [
      [{ text: "✅ Créer la fiche", callback_data: "cv:ok" }],
      [
        { text: "✏️ Corriger", callback_data: "cv:fix" },
        { text: "❌ Ignorer", callback_data: "cv:cancel" },
      ],
    ]);
    return ok();
  }

  if (session?.step?.startsWith("fill:")) {
    const [, orderId, field] = session.step.split(":");
    const confirmed = await fillField(tenant.id, orderId, field, text);
    if (!confirmed) {
      await say(chatId, "🤔 Je n'ai pas compris — réessaie (ex. « +41 79 123 45 67 », « 22.08 », « 26 », « anniversaire ») ou /annule.");
      return ok();
    }
    await prisma.fieldSnooze.deleteMany({ where: { tenantId: tenant.id, orderId, field } });
    await setStep(chatId, tenant.id, "idle", {});
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, include: { contact: true } });
    const remaining = order ? missingFor(order) : [];
    if (order && remaining.length) {
      const nxt = remaining[0];
      await sayInline(
        chatId,
        `✓ Fiche à jour — ${confirmed}.\nIl manque encore : ${remaining.map((m) => m.label).join(", ")}.\n${nxt.ask.replace("{name}", `<b>${order.contact.firstName}</b>`)}`,
        [
          [{ text: "✍️ Renseigner", callback_data: `fd:fill:${orderId}:${nxt.field}` }],
          [
            { text: "⏰ Plus tard", callback_data: `fd:later:${orderId}:${nxt.field}` },
            { text: "❌ N'existe pas", callback_data: `fd:never:${orderId}:${nxt.field}` },
          ],
        ]
      );
    } else {
      await say(chatId, `✓ Fiche à jour — ${confirmed}. ✔️ Plus rien ne manque pour ce stade.`);
    }
    return ok();
  }

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
