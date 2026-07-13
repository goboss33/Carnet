/* ---------------------------------------------------------------------------
   Tâches planifiées (in-process, single instance) :
   · digest de production chaque matin (DIGEST_HOUR, défaut 7 h locale)
   · machine à avis : J+2 après livraison, message prêt à transférer
--------------------------------------------------------------------------- */

import { prisma } from "@/lib/db";
import { notifyAll } from "@/lib/telegram";
import { normPhone, normEmail } from "@/lib/normalize";

let lastDigestDay = "";

export function startCron() {
  console.log("Carnet cron : démarré (digest à", process.env.DIGEST_HOUR ?? "7", "h)");
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
  const hour = Number(process.env.DIGEST_HOUR ?? 7);
  const today = now.toISOString().slice(0, 10);
  if (now.getHours() === hour && lastDigestDay !== today) {
    lastDigestDay = today;
    await morningDigest();
    await reviewNudges();
  }
}

async function morningDigest() {
  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
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
    if (!soon.length && !pendingLeads) continue;
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
}

async function reviewNudges() {
  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
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
      const review = process.env.GOOGLE_REVIEW_URL ?? "";
      const msgClient = [
        `Bonjour ${o.contact.firstName} ! C'est Annie de Maman Gâteau 🧁`,
        `J'espère que ${o.celebrant ? `la fête de ${o.celebrant}` : "votre fête"} était magique et que le gâteau a régalé tout le monde !`,
        review
          ? `Si vous avez 30 secondes, votre petit avis m'aiderait énormément : ${review}`
          : `Si vous avez 30 secondes, un petit avis Google m'aiderait énormément 💛`,
        `Merci du fond du cœur, et à bientôt !`,
      ].join("\n");
      await notifyAll(
        [
          `💬 <b>Demande d'avis — ${o.contact.firstName}</b> (livré il y a 2 jours)`,
          `Transfère-lui ce message sur WhatsApp${o.contact.phone ? ` (${o.contact.phone})` : ""} :`,
          "",
          `<code>${msgClient}</code>`,
          "",
          `(appui long sur le message → copier)`,
        ].join("\n")
      );
      await prisma.order.update({ where: { id: o.id }, data: { reviewAskedAt: new Date() } });
    }
  }
}
