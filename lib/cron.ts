/* ---------------------------------------------------------------------------
   Tâches planifiées (in-process, single instance) :
   · digest de production le matin · relances du soir · machine à avis J+2
   · relance anniversaire.
   Les horaires et l'activation de chaque cron viennent des réglages par tenant
   (lib/settings) — l'env reste le défaut.
--------------------------------------------------------------------------- */

import { prisma } from "@/lib/db";
import { notifyAll, sayInline } from "@/lib/telegram";
import { waLink } from "@/lib/wa";
import { normPhone, normEmail } from "@/lib/normalize";
import { getSettings } from "@/lib/settings";
import type { Tenant } from "@prisma/client";

const lastRun = new Map<string, string>(); // `${tenantId}:${job}` -> yyyy-mm-dd

export function startCron() {
  console.log("Carnet cron : démarré (horaires par tenant, réglables dans /reglages)");
  normalizeExisting().catch((e) => console.error("normalisation:", e));
  setInterval(() => tick().catch((e) => console.error("cron error:", e)), 60_000);
}

/** Passe idempotente : normalise les téléphones/e-mails hérités (import, anciennes saisies). */
async function normalizeExisting() {
  const contacts = await prisma.contact.findMany({ select: { id: true, phone: true, email: true } });
  let fixed = 0;
  for (const c of contacts) {
    const phone = normPhone(c.phone);
    const email = normEmail(c.email);
    if (phone !== c.phone || email !== c.email) {
      await prisma.contact.update({ where: { id: c.id }, data: { phone, email } });
      fixed++;
    }
  }
  if (fixed) console.log(`Carnet : ${fixed} contact(s) normalisé(s).`);
}

async function tick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
    const s = await getSettings(t.id);
    if (hour === s.digestHour && lastRun.get(`${t.id}:digest`) !== today) {
      lastRun.set(`${t.id}:digest`, today);
      if (s.cronDigest) await morningDigest(t).catch((e) => console.error("digest:", e));
      if (s.cronReviews) await reviewNudges(t, s.reviewUrl).catch((e) => console.error("reviews:", e));
      if (s.cronBirthday) await birthdayNudges(t).catch((e) => console.error("birthday:", e));
    }
    if (hour === s.nudgeHour && lastRun.get(`${t.id}:nudge`) !== today) {
      lastRun.set(`${t.id}:nudge`, today);
      if (s.cronEveningNudges) await eveningNudges(t).catch((e) => console.error("evening:", e));
    }
  }
}

/* ------------------------------------------------ suivi du soir
   Max 3 questions, par urgence : livraison à confirmer > lead sans réponse
   > devis sans nouvelles. Cooldown 2 jours par fiche (lastNudgeAt). */
async function eveningNudges(t: Tenant) {
  const now = Date.now();
  const cooldown = new Date(now - 2 * 86400000);

  const picked: { kind: "delivered" | "lead" | "quote"; o: Awaited<ReturnType<typeof prisma.order.findFirst>> & object }[] = [];

  const delivered = await prisma.order.findMany({
    where: {
      tenantId: t.id,
      status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] },
      eventDate: { lt: new Date(now) },
      OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cooldown } }],
    },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
    take: 3,
  });
  for (const o of delivered) picked.push({ kind: "delivered", o });

  if (picked.length < 3) {
    const leads = await prisma.order.findMany({
      where: {
        tenantId: t.id,
        status: "LEAD",
        createdAt: { lt: new Date(now - 24 * 3600000) },
        OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cooldown } }],
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: 3 - picked.length,
    });
    for (const o of leads) picked.push({ kind: "lead", o });
  }

  if (picked.length < 3) {
    const quotes = await prisma.order.findMany({
      where: {
        tenantId: t.id,
        status: "DEVIS_ENVOYE",
        updatedAt: { lt: new Date(now - 4 * 86400000) },
        OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cooldown } }],
      },
      include: { contact: true },
      orderBy: { updatedAt: "asc" },
      take: 3 - picked.length,
    });
    for (const o of quotes) picked.push({ kind: "quote", o });
  }

  if (!picked.length) return;
  const ids = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  for (const { kind, o } of picked) {
    const order = o as typeof o & { contact: { firstName: string; lastName: string; phone: string } };
    const name = `${order.contact.firstName} ${order.contact.lastName}`.trim();
    const when = order.eventDate ? order.eventDate.toLocaleDateString("fr-CH") : "date ?";
    let text = "";
    let buttons: { text: string; callback_data: string }[][] = [];

    if (kind === "delivered") {
      text = `📦 Le gâteau de <b>${name}</b> (${order.occasion || "?"}, ${when}) a bien été livré ?`;
      buttons = [
        [
          { text: "✅ Livré", callback_data: `nu:delivered:${order.id}` },
          { text: "❌ Annulé", callback_data: `nu:drop:${order.id}` },
        ],
        [{ text: "⏰ Plus tard", callback_data: `nu:later:${order.id}` }],
      ];
    } else if (kind === "lead") {
      text = `📝 As-tu répondu à la demande de <b>${name}</b> (${order.occasion || "?"}${order.eventDate ? `, ${when}` : ""}) ?`;
      buttons = [
        [{ text: "✅ Devis envoyé", callback_data: `nu:sent:${order.id}` }],
        [
          { text: "⏰ Plus tard", callback_data: `nu:later:${order.id}` },
          { text: "🗄 Sans suite", callback_data: `nu:drop:${order.id}` },
        ],
      ];
    } else {
      text = `💬 Des nouvelles de <b>${name}</b> ? Devis envoyé${order.priceQuoted ? ` (CHF ${order.priceQuoted})` : ""}, sans réponse depuis quelques jours.`;
      buttons = [
        [{ text: "💰 Acompte reçu", callback_data: `nu:dep:${order.id}` }],
        [{ text: "✍️ Préparer une relance", callback_data: `nu:relance:${order.id}` }],
        [
          { text: "⏰ Plus tard", callback_data: `nu:later:${order.id}` },
          { text: "🗄 Sans suite", callback_data: `nu:drop:${order.id}` },
        ],
      ];
    }
    for (const id of ids) await sayInline(Number(id), text, buttons);
    await prisma.order.update({ where: { id: order.id }, data: { lastNudgeAt: new Date() } });
  }
}

async function morningDigest(t: Tenant) {
  const soon = await prisma.order.findMany({
    where: {
      tenantId: t.id,
      status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] },
      eventDate: { gte: new Date(Date.now() - 86400000), lte: new Date(Date.now() + 3 * 86400000) },
    },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
  });
  const pendingLeads = await prisma.order.count({ where: { tenantId: t.id, status: "LEAD" } });
  if (!soon.length && !pendingLeads) return;
  const lines = [
    "☀️ <b>Bonjour ! Le programme :</b>",
    ...soon.map((o) => {
      const days = o.eventDate ? Math.ceil((o.eventDate.getTime() - Date.now()) / 86400000) : 0;
      const when = days <= 0 ? "AUJOURD'HUI" : days === 1 ? "demain" : `J-${days}`;
      return `• <b>${when}</b> — ${o.contact.firstName}, ${o.occasion || "?"} (${o.parts ?? "?"} parts, ${o.deliveryMode})\n  ${process.env.APP_URL}/commandes/${o.id}`;
    }),
    ...(soon.length === 0 ? ["Rien à produire sous 3 jours. 🌤"] : []),
    ...(pendingLeads > 0 ? [`\n📥 ${pendingLeads} lead${pendingLeads > 1 ? "s" : ""} en attente de devis.`] : []),
  ];
  await notifyAll(lines.join("\n"));
}

async function reviewNudges(t: Tenant, reviewUrl: string) {
  const candidates = await prisma.order.findMany({
    where: {
      tenantId: t.id,
      status: "LIVRE",
      reviewAskedAt: null,
      deliveredAt: { lte: new Date(Date.now() - 2 * 86400000), gte: new Date(Date.now() - 14 * 86400000) },
    },
    include: { contact: true },
  });
  for (const o of candidates) {
    const msgClient = [
      `Bonjour ${o.contact.firstName} ! C'est Annie de Maman Gâteau 🧁`,
      `J'espère que ${o.celebrant ? `la fête de ${o.celebrant}` : "votre fête"} était magique et que le gâteau a régalé tout le monde !`,
      reviewUrl
        ? `Si vous avez 30 secondes, votre petit avis m'aiderait énormément : ${reviewUrl}`
        : `Si vous avez 30 secondes, un petit avis Google m'aiderait énormément 💛`,
      `Merci du fond du cœur, et à bientôt !`,
    ].join("\n");
    await notifyAll(
      [
        `💬 <b>Demande d'avis — ${o.contact.firstName}</b> (livré il y a 2 jours)`,
        o.contact.phone ? `<a href="${waLink(o.contact.phone, msgClient)}">📲 Ouvrir WhatsApp avec le message</a>` : `Transfère-lui ce message :`,
        "",
        `<code>${msgClient}</code>`,
        "",
        `(ou appui long → copier)`,
      ].join("\n")
    );
    await prisma.order.update({ where: { id: o.id }, data: { reviewAskedAt: new Date() } });
  }
}

/* ------------------------------------------------ relance anniversaire
   ~3 semaines avant l'anniversaire (1 an, puis chaque année) d'une commande
   d'anniversaire passée : message prêt à envoyer, au plus une fois par an. */
async function birthdayNudges(t: Tenant) {
  const now = new Date();
  const SOON_MIN = 18;
  const SOON_MAX = 25; // fenêtre ~3 semaines avant
  const candidates = await prisma.order.findMany({
    where: {
      tenantId: t.id,
      occasion: { contains: "anniversaire", mode: "insensitive" },
      eventDate: { lt: new Date(now.getTime() - 60 * 86400000) }, // au moins 2 mois passés
      OR: [{ anniversaryNudgedAt: null }, { anniversaryNudgedAt: { lt: new Date(now.getTime() - 300 * 86400000) } }],
    },
    include: { contact: true },
  });
  for (const o of candidates) {
    if (!o.eventDate) continue;
    const next = nextAnniversary(o.eventDate, now);
    const days = Math.ceil((next.getTime() - now.getTime()) / 86400000);
    if (days < SOON_MIN || days > SOON_MAX) continue;
    const yearsSince = next.getUTCFullYear() - o.eventDate.getUTCFullYear();
    const nextAge = o.celebrantAge ? o.celebrantAge + yearsSince : null;
    const who = o.celebrant || o.contact.firstName;
    const msgClient = [
      `Bonjour ${o.contact.firstName} ! C'est Annie de Maman Gâteau 🧁`,
      `Je pensais à ${o.celebrant ? o.celebrant : "vous"} — l'anniversaire approche${nextAge ? ` (déjà ${nextAge} ans !)` : ""}. Ce serait une joie de vous refaire un beau gâteau cette année.`,
      `Vous avez une idée en tête, ou envie qu'on en imagine un ensemble ? Écrivez-moi quand vous voulez.`,
      `Belle journée !`,
    ].join("\n");
    await notifyAll(
      [
        `🎂 <b>Anniversaire à venir — ${who}</b> (dans ~${days} jours)`,
        `L'an dernier : ${o.occasion || "anniversaire"}${o.eventDate ? ` le ${o.eventDate.toLocaleDateString("fr-CH")}` : ""}. Envie de reprendre contact avec ${o.contact.firstName} ?`,
        o.contact.phone ? `<a href="${waLink(o.contact.phone, msgClient)}">📲 Ouvrir WhatsApp</a>` : "",
        "",
        `<code>${msgClient}</code>`,
      ].filter(Boolean).join("\n")
    );
    await prisma.order.update({ where: { id: o.id }, data: { anniversaryNudgedAt: new Date() } });
  }
}

/** Prochain anniversaire (même jour/mois) à venir à partir de `now`. */
function nextAnniversary(eventDate: Date, now: Date): Date {
  const m = eventDate.getUTCMonth();
  const d = eventDate.getUTCDate();
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), m, d));
  if (candidate.getTime() < now.getTime()) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, m, d));
  return candidate;
}
