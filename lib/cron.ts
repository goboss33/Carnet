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
import { pendingFields } from "@/lib/completeness";
import type { Tenant } from "@prisma/client";

const lastRun = new Map<string, string>(); // `${tenantId}:${job}` -> yyyy-mm-dd

export function startCron() {
  console.log("Carnet cron : démarré (horaires par tenant, réglables dans /reglages)");
  normalizeExisting().catch((e) => console.error("normalisation:", e));
  retroTagRevenue().catch((e) => console.error("retro-tag:", e));
  backfillDeliveredAt().catch((e) => console.error("backfill-livre:", e));
  setInterval(() => tick().catch((e) => console.error("cron error:", e)), 60_000);
}

/** Répare les commandes livrées sans date de livraison (ancien setStatus) :
    sinon elles échappent au CA du mois et à la colonne Livré. */
async function backfillDeliveredAt() {
  const orphans = await prisma.order.findMany({
    where: { status: "LIVRE", deliveredAt: null },
    select: { id: true, eventDate: true, updatedAt: true },
  });
  for (const o of orphans) {
    await prisma.order.update({ where: { id: o.id }, data: { deliveredAt: o.eventDate ?? o.updatedAt } });
  }
  if (orphans.length) console.log(`Carnet : ${orphans.length} commande(s) livrée(s) redatée(s).`);
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

/** Rétro-tag : seul le B2B est déduit ; les cupcakes historiques restent du
    sur-mesure (décors personnalisés) — la catégorie Collection commencera
    avec la vraie collection. Répare aussi l'ancien tag trop agressif. */
async function retroTagRevenue() {
  const undo = await prisma.order.updateMany({
    where: { revenueCategory: "COLLECTION", occasion: { contains: "cupcake", mode: "insensitive" } },
    data: { revenueCategory: "SUR_MESURE" },
  });
  const b2b = await prisma.order.updateMany({
    where: { revenueCategory: "SUR_MESURE", occasion: { contains: "entreprise", mode: "insensitive" } },
    data: { revenueCategory: "B2B" },
  });
  if (undo.count || b2b.count) console.log(`Carnet : rétro-tag — ${undo.count} cupcakes re-classés sur-mesure, ${b2b.count} B2B.`);
}

async function tick() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const hour = zurichHour(now); // heure de Zurich, quel que soit le fuseau du conteneur
  const tenants = await prisma.tenant.findMany();
  for (const t of tenants) {
    const s = await getSettings(t.id);
    // 📰 pages du site programmées — à la minute près
    if (s.cronJournal) {
      const { runJournalPublisher } = await import("@/lib/journal");
      await runJournalPublisher(t).catch((e) => console.error("journal:", e));
    }
    if (hour === s.digestHour && lastRun.get(`${t.id}:digest`) !== today) {
      lastRun.set(`${t.id}:digest`, today);
      // agenda : re-sync des commandes actives (recrée les événements supprimés à la main)
      if (s.gcalSync) {
        const { gcalEnabled, syncOrderEvent } = await import("@/lib/gcal");
        if (gcalEnabled()) {
          const actives = await prisma.order.findMany({
            where: { tenantId: t.id, status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] }, eventDate: { gte: new Date(Date.now() - 86400000) } },
            select: { id: true },
            take: 50,
          });
          for (const a of actives) await syncOrderEvent(a.id).catch(() => null);
        }
      }
      let switched: string[] = [];
      if (s.cronProduction) switched = (await autoProduction(t, s).catch((e) => { console.error("production:", e); return []; })) ?? [];
      if (s.cronDigest) await morningDigest(t, false, switched).catch((e) => console.error("digest:", e));
      if (s.cronReviews) await reviewNudges(t, s).catch((e) => console.error("reviews:", e));
      if (s.cronBirthday) await birthdayNudges(t, s).catch((e) => console.error("birthday:", e));
      if (s.cronThemes) await runThemeCheck(t).catch((e) => console.error("themes:", e));
      if (s.cronGsc) { const { runGscReport } = await import("@/lib/gsc"); await runGscReport(t).catch((e) => console.error("gsc:", e)); }
    }
    if (hour === s.nudgeHour && lastRun.get(`${t.id}:nudge`) !== today) {
      lastRun.set(`${t.id}:nudge`, today);
      let sent = 0;
      if (s.cronEveningNudges) sent = (await eveningNudges(t, s).catch((e) => { console.error("evening:", e); return 0; })) ?? 0;
      if (s.cronFieldNudges && sent < s.nudgeMaxPerEvening)
        await fieldNudges(t, s, s.nudgeMaxPerEvening - sent).catch((e) => console.error("fields:", e));
    }
    if (now.getDate() === 1 && hour === s.digestHour + 1 && lastRun.get(`${t.id}:monthly`) !== today) {
      lastRun.set(`${t.id}:monthly`, today);
      if (s.cronMonthly) await monthlyReport(t).catch((e) => console.error("monthly:", e));
    }
  }
}

/* ------------------------------------------------ bilan du 1er du mois */
async function monthlyReport(t: Tenant, dryRun = false) {
  const { computeCap } = await import("@/lib/cap");
  const c = await computeCap(t.id);
  const prev = c.caParMois[c.caParMois.length - 2]; // mois qui vient de se terminer
  const prev2 = c.caParMois[c.caParMois.length - 3];
  const delta = prev2 && prev2.ca > 0 ? Math.round(((prev.ca - prev2.ca) / prev2.ca) * 100) : null;
  const phase = c.phases[c.phaseCourante];
  const done = phase.jalons.filter((j) => j.done).length;

  // Les bons points du mois — parce qu'une ascension se célèbre marche par marche
  const wins: string[] = [];
  if (delta != null && delta > 0) wins.push(`🎉 CA en hausse de <b>${delta} %</b> par rapport au mois précédent !`);
  if (prev.ca > 0 && prev.ca >= Math.max(...c.caParMois.slice(0, -1).map((x) => x.ca))) wins.push("🏆 Meilleur mois des 12 derniers — record battu !");
  if (prev.net > 0) wins.push(`💚 Mois dans le vert : CHF ${prev.net} de résultat net.`);
  if (c.weekendsPleins >= 3) wins.push(`🔥 ${c.weekendsPleins} week-ends sur 4 déjà remplis pour la suite.`);
  if (c.retentionPct >= 20) wins.push(`💛 ${c.retentionPct} % de tes clientes sont déjà revenues — elles t'adorent.`);
  const attention: string[] = [];
  if (delta != null && delta < -15) attention.push(`👀 CA en retrait de ${Math.abs(delta)} % — les creux font partie du jeu, regarde les leads en attente.`);

  await notifyAll(
    [
      `📈 <b>Bilan de ${prev.month}</b>${dryRun ? " (🧪 test)" : ""}`,
      `CA livré : <b>CHF ${prev.ca}</b>${delta != null ? ` (${delta >= 0 ? "+" : ""}${delta} %)` : ""} · net : CHF ${prev.net}`,
      `Panier moyen : CHF ${c.panierMoyen} · mariages : ${c.partMariagePct} % · hors sur-mesure : ${c.partDecouplePct} %`,
      `Week-ends à venir remplis : ${c.weekendsPleins}/4 · clientes fidèles : ${c.retentionPct} %`,
      ...wins,
      ...attention,
      `${phase.name} : <b>${done}/${phase.jalons.length}</b> jalons ✓`,
      `${process.env.APP_URL ?? ""}/cap`,
    ].join("\n")
  );
  // saisie éclair des métriques manuelles
  const ids = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (ids.length && !dryRun) {
    await prisma.botSession.upsert({
      where: { chatId: BigInt(ids[0]) },
      update: { step: "metric:instagram_followers" },
      create: { chatId: BigInt(ids[0]), tenantId: t.id, step: "metric:instagram_followers" },
    });
    const { sayInline: si } = await import("@/lib/telegram");
    await si(Number(ids[0]), "📸 Combien d'abonnés Instagram aujourd'hui ? (un nombre)", [
      [{ text: "⏭ Passer", callback_data: "metric:skip" }],
    ]);
  }
}

/* ------------------------------------------------ suivi du soir
   Max 3 questions, par urgence : livraison à confirmer > lead sans réponse
   > devis sans nouvelles. Cooldown 2 jours par fiche (lastNudgeAt). */
async function eveningNudges(t: Tenant, s: Awaited<ReturnType<typeof getSettings>>, dryRun = false) {
  const now = Date.now();
  const cooldown = new Date(now - s.nudgeCooldownDays * 86400000);

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
    take: s.nudgeMaxPerEvening,
  });
  for (const o of delivered) picked.push({ kind: "delivered", o });

  if (picked.length < s.nudgeMaxPerEvening) {
    const leads = await prisma.order.findMany({
      where: {
        tenantId: t.id,
        status: "LEAD",
        createdAt: { lt: new Date(now - s.leadFollowupHours * 3600000) },
        OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cooldown } }],
      },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: s.nudgeMaxPerEvening - picked.length,
    });
    for (const o of leads) picked.push({ kind: "lead", o });
  }

  if (picked.length < s.nudgeMaxPerEvening) {
    const quotes = await prisma.order.findMany({
      where: {
        tenantId: t.id,
        status: "DEVIS_ENVOYE",
        updatedAt: { lt: new Date(now - s.quoteFollowupDays * 86400000) },
        OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cooldown } }],
      },
      include: { contact: true },
      orderBy: { updatedAt: "asc" },
      take: s.nudgeMaxPerEvening - picked.length,
    });
    for (const o of quotes) picked.push({ kind: "quote", o });
  }

  if (!picked.length) {
    if (dryRun) await notifyAll(`🧪 Relances du soir : rien à suivre aujourd'hui.\nRègles : livraison confirmée à date passée · lead sans réponse depuis ${s.leadFollowupHours} h · devis sans nouvelles depuis ${s.quoteFollowupDays} jours — cooldown ${s.nudgeCooldownDays} j par fiche, max ${s.nudgeMaxPerEvening}/soir.`);
    return 0;
  }
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
    const finalButtons = dryRun ? buttons.map((row) => row.map((b) => ({ ...b, callback_data: "noop" }))) : buttons;
    for (const id of ids) await sayInline(Number(id), text, finalButtons);
    await prisma.order.update({ where: { id: order.id }, data: { lastNudgeAt: new Date() } });
  }
  return picked.length;
}

/* 🧩 Données manquantes — fondu dans le créneau du soir, quota partagé. */
export async function fieldNudges(t: Tenant, s: Awaited<ReturnType<typeof getSettings>>, quota: number, dryRun = false) {
  const cooldown = Date.now() - s.nudgeCooldownDays * 86400000;
  const pend = await pendingFields(t.id, 30, s.handoverLeadDays);
  const fresh = pend.filter((p) => !p.order.lastNudgeAt || p.order.lastNudgeAt.getTime() < cooldown);
  // une seule question par fiche et par soir
  const seen = new Set<string>();
  const picked: typeof fresh = [];
  for (const p of fresh) {
    if (seen.has(p.order.id)) continue;
    seen.add(p.order.id);
    picked.push(p);
    if (picked.length >= quota) break;
  }
  if (!picked.length) {
    if (dryRun) await notifyAll(`🧪 Données manquantes : aucun cas éligible.\nRègle : fiche active (devis envoyé ou plus) à laquelle il manque date, parts, prix, occasion — puis téléphone/adresse dès l'acompte. « Plus tard » = rappel après ${s.fieldFollowupDays} j.`);
    return;
  }
  const ids = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const { order, miss } of picked) {
    const name = `${order.contact.firstName} ${order.contact.lastName}`.trim();
    const text = `${dryRun ? "🧪 " : ""}🧩 ${miss.ask.replace("{name}", `<b>${name}</b>`)}\n<i>(${order.occasion || "occasion ?"}${order.eventDate ? ` · ${order.eventDate.toLocaleDateString("fr-CH")}` : ""})</i>`;
    const buttons = [
      [{ text: "✍️ Renseigner", callback_data: `fd:fill:${order.id}:${miss.field}` }],
      [
        { text: "⏰ Plus tard", callback_data: `fd:later:${order.id}:${miss.field}` },
        { text: "❌ N'existe pas", callback_data: `fd:never:${order.id}:${miss.field}` },
      ],
    ];
    const finalButtons = dryRun ? buttons.map((row) => row.map((b) => ({ ...b, callback_data: "noop" }))) : buttons;
    for (const id of ids) await sayInline(Number(id), text, finalButtons);
    if (!dryRun) await prisma.order.update({ where: { id: order.id }, data: { lastNudgeAt: new Date() } });
  }
}

/* 🥣 Bascule automatique acompte reçu → production à J-x (pilotée par la date). */
async function autoProduction(t: Tenant, s: Awaited<ReturnType<typeof getSettings>>, dryRun = false): Promise<string[]> {
  const horizon = new Date(Date.now() + s.productionLeadDays * 86400000);
  const due = await prisma.order.findMany({
    where: { tenantId: t.id, status: "ACOMPTE_RECU", eventDate: { not: null, lte: horizon } },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
  });
  const names = due.map((o) => `${o.contact.firstName}${o.eventDate ? ` (${o.eventDate.toLocaleDateString("fr-CH", { weekday: "long" })})` : ""}`);
  if (dryRun) {
    await notifyAll(
      due.length
        ? `🧪 Passage en production : ${names.join(" · ")} basculerai${due.length > 1 ? "ent" : "t"} en production (événement dans ≤ ${s.productionLeadDays} j). Rien n'a été modifié.`
        : `🧪 Passage en production : aucun cas éligible.\nRègle : commande « acompte reçu » dont l'événement est dans ${s.productionLeadDays} jours ou moins.`
    );
    return [];
  }
  for (const o of due) {
    await prisma.order.update({
      where: { id: o.id },
      data: { status: "EN_PRODUCTION", activities: { create: { type: "SYSTEM", body: `Passée en production automatiquement (événement dans ≤ ${s.productionLeadDays} j).` } } },
    });
  }
  return names;
}

async function morningDigest(t: Tenant, dryRun = false, switched: string[] = []) {
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
  const staleIncomplete = new Set(
    (await pendingFields(t.id, 50)).filter((p) => p.order.createdAt.getTime() < Date.now() - 7 * 86400000).map((p) => p.order.id)
  ).size;
  if (!soon.length && !pendingLeads && !staleIncomplete && !switched.length) {
    if (dryRun) await notifyAll("🧪 Digest : rien à annoncer aujourd'hui — aucune sortie d'atelier sous 3 jours, aucun lead en attente, aucune fiche incomplète ancienne.");
    return;
  }
  const lines = [
    "☀️ <b>Bonjour ! Le programme :</b>",
    ...(switched.length ? [`🥣 Entre en production : ${switched.join(" · ")}`] : []),
    ...soon.map((o) => {
      const days = o.eventDate ? Math.ceil((o.eventDate.getTime() - Date.now()) / 86400000) : 0;
      const when = days <= 0 ? "AUJOURD'HUI" : days === 1 ? "demain" : `J-${days}`;
      return `• <b>${when}</b> — ${o.contact.firstName}, ${o.occasion || "?"} (${o.parts ?? "?"} parts, ${o.deliveryMode})\n  ${process.env.APP_URL}/commandes/${o.id}`;
    }),
    ...(soon.length === 0 ? ["Rien à produire sous 3 jours. 🌤"] : []),
    ...(pendingLeads > 0 ? [`\n📥 ${pendingLeads} lead${pendingLeads > 1 ? "s" : ""} en attente de devis.`] : []),
    ...(staleIncomplete > 0 ? [`🧩 ${staleIncomplete} fiche${staleIncomplete > 1 ? "s" : ""} incomplète${staleIncomplete > 1 ? "s" : ""} depuis 7 j+ — je te demanderai les infos ce soir.`] : []),
  ];
  await notifyAll(lines.join("\n"));
}

async function reviewNudges(t: Tenant, s: Awaited<ReturnType<typeof getSettings>>, dryRun = false) {
  const candidates = await prisma.order.findMany({
    where: {
      tenantId: t.id,
      status: "LIVRE",
      reviewAskedAt: null,
      deliveredAt: { lte: new Date(Date.now() - s.reviewDelayDays * 86400000), gte: new Date(Date.now() - (s.reviewDelayDays + 12) * 86400000) },
    },
    include: { contact: true },
  });
  if (dryRun && !candidates.length) {
    await notifyAll(`🧪 Avis J+${s.reviewDelayDays} : aucun cas éligible aujourd'hui.\nRègle : commande livrée il y a ${s.reviewDelayDays} à ${s.reviewDelayDays + 12} jours, avis pas encore demandé.`);
    return;
  }
  for (const o of candidates) {
    const msgClient = [
      `Bonjour ${o.contact.firstName} ! C'est Annie de Maman Gâteau 🧁`,
      `J'espère que ${o.celebrant ? `la fête de ${o.celebrant}` : "votre fête"} était magique et que le gâteau a régalé tout le monde !`,
      s.reviewUrl
        ? `Si vous avez 30 secondes, votre petit avis m'aiderait énormément : ${s.reviewUrl}`
        : `Si vous avez 30 secondes, un petit avis Google m'aiderait énormément 💛`,
      `Merci du fond du cœur, et à bientôt !`,
    ].join("\n");
    await notifyAll(
      [
        `💬 <b>Demande d'avis — ${o.contact.firstName}</b> (livré il y a ${s.reviewDelayDays} jours ou plus)`,
        o.contact.phone ? `<a href="${waLink(o.contact.phone, msgClient)}">📲 Ouvrir WhatsApp avec le message</a>` : `Transfère-lui ce message :`,
        "",
        `<code>${msgClient}</code>`,
        "",
        `(ou appui long → copier)`,
      ].join("\n")
    );
    if (!dryRun) await prisma.order.update({ where: { id: o.id }, data: { reviewAskedAt: new Date() } });
  }
}

/* ------------------------------------------------ relance anniversaire
   ~3 semaines avant l'anniversaire (1 an, puis chaque année) d'une commande
   d'anniversaire passée : message prêt à envoyer, au plus une fois par an. */
async function birthdayNudges(t: Tenant, s: Awaited<ReturnType<typeof getSettings>>, dryRun = false) {
  let sentBirthday = 0;
  const now = new Date();
  const SOON_MIN = Math.max(1, s.birthdayLeadDays - 3);
  const SOON_MAX = s.birthdayLeadDays + 4;
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
    sentBirthday++;
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
    if (!dryRun) await prisma.order.update({ where: { id: o.id }, data: { anniversaryNudgedAt: new Date() } });
  }
  if (dryRun && !sentBirthday) {
    await notifyAll(`🧪 Relance anniversaire : aucun cas éligible aujourd'hui.\nRègle : commande d'anniversaire dont la date retombe dans ${Math.max(1, s.birthdayLeadDays - 3)} à ${s.birthdayLeadDays + 4} jours, pas déjà relancée cette année.`);
  }
}

/** Prochain anniversaire (même jour/mois) à venir à partir de `now`. */
export function nextAnniversary(eventDate: Date, now: Date): Date {
  const m = eventDate.getUTCMonth();
  const d = eventDate.getUTCDate();
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), m, d));
  if (candidate.getTime() < now.getTime()) candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, m, d));
  return candidate;
}

/** Heure locale (Europe/Zurich) quel que soit le fuseau du serveur/conteneur. */
function zurichHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false }).format(d)) % 24;
}

/* ------------------------------------------------ test manuel du cron
   Envoie un message Telegram tout de suite et résume ce que voient les crons.
   Aucune écriture en base (pas de cooldown consommé). */

/* ------------------------------------------------ 🎨 vigie des thèmes */
/* Compare les thèmes saisis (themeNote) à la base de suggestions du site
   (GET siteUrl/api/themes — source de vérité unique). Rapport Telegram,
   jamais de modification automatique : l'ajout à la base reste un geste. */
const normTheme = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export async function runThemeCheck(t: Tenant, dryRun = false): Promise<void> {
  const s = await getSettings(t.id);
  const raw = await prisma.settings.findUnique({ where: { tenantId: t.id } });
  const say = async (msg: string) => notifyAll(`${dryRun ? "🧪 " : ""}${msg}`);

  if (!s.siteUrl) {
    if (dryRun) await say("🎨 Vigie des thèmes : renseigne d'abord l'URL du site (Réglages → Personnalisation).");
    return;
  }
  const windowMs = s.themeCheckDays * 86400000;
  if (!dryRun) {
    const last = raw?.lastThemeCheckAt?.getTime() ?? 0;
    if (Date.now() - last < windowMs) return; // pas encore l'heure
  }

  let base: string[] = [];
  try {
    const res = await fetch(`${s.siteUrl}/api/themes`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    base = ((await res.json())?.themes ?? []).map(String);
  } catch (e) {
    if (dryRun) await say(`🎨 Vigie des thèmes : le site ne répond pas (${e instanceof Error ? e.message : "?"}) — vérifie l'URL du site et le déploiement de /api/themes.`);
    else console.error("vigie themes:", e);
    return;
  }
  const known = base.map(normTheme).filter(Boolean);

  const since = new Date(Date.now() - windowMs);
  const orders = await prisma.order.findMany({
    where: { tenantId: t.id, createdAt: { gte: since }, themeNote: { not: "" } },
    select: { themeNote: true },
  });

  const missing = new Map<string, number>();
  for (const o of orders) {
    const n = normTheme(o.themeNote);
    if (n.length < 3) continue;
    // couvert si une suggestion connue est contenue dans la saisie (ou l'inverse)
    const covered = known.some((k) => n.includes(k) || k.includes(n));
    if (!covered) missing.set(n, (missing.get(n) ?? 0) + 1);
  }

  if (!dryRun) await prisma.settings.update({ where: { tenantId: t.id }, data: { lastThemeCheckAt: new Date() } }).catch(() => null);

  if (missing.size === 0) {
    if (dryRun) await say(`🎨 Vigie des thèmes : les ${orders.length} saisie(s) des ${s.themeCheckDays} derniers jours sont toutes couvertes par la base (${base.length} suggestions). Rien à ajouter.`);
    return; // cron silencieux quand tout va bien
  }
  const top = [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  await say(
    [
      `🎨 <b>Vigie des thèmes</b> — ${missing.size} saisie(s) absente(s) des suggestions du configurateur :`,
      ...top.map(([k, n]) => `• « ${k} »${n > 1 ? ` (${n}×)` : ""}`),
      `\nSi pertinent, fais-les ajouter à la base du site (lib/data.ts) — demande à Claude, c'est deux minutes.`,
    ].join("\n")
  );
}

export async function cronSelfTest(tenantId: string): Promise<{ ok: boolean; message: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ids = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!token) return { ok: false, message: "⚠️ TELEGRAM_BOT_TOKEN manquant — le bot ne peut rien envoyer." };
  if (!ids.length) return { ok: false, message: "⚠️ Aucun destinataire : la variable TELEGRAM_ALLOWED_CHAT_IDS est vide." };

  const now = Date.now();
  const s = await getSettings(tenantId);
  const [production, leads, quotes, reviews, birthdays] = await Promise.all([
    prisma.order.count({ where: { tenantId, status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] }, eventDate: { gte: new Date(now - 86400000), lte: new Date(now + 3 * 86400000) } } }),
    prisma.order.count({ where: { tenantId, status: "LEAD" } }),
    prisma.order.count({ where: { tenantId, status: "DEVIS_ENVOYE" } }),
    prisma.order.count({ where: { tenantId, status: "LIVRE", reviewAskedAt: null, deliveredAt: { lte: new Date(now - 2 * 86400000), gte: new Date(now - 14 * 86400000) } } }),
    prisma.order.count({ where: { tenantId, occasion: { contains: "anniversaire", mode: "insensitive" }, eventDate: { lt: new Date(now - 60 * 86400000) } } }),
  ]);
  const serverHour = new Date().getHours();
  const zh = zurichHour(new Date());
  await notifyAll(
    [
      "🔔 <b>Test des relances — Carnet</b>",
      "Si tu lis ce message, le bot t'atteint bien. 👍",
      "",
      `☀️ Digest ${s.digestHour} h${s.cronDigest ? "" : " (désactivé)"} : ${production} à produire sous 3 j · ${leads} lead(s).`,
      `🌙 Relances ${s.nudgeHour} h${s.cronEveningNudges ? "" : " (désactivé)"} : ${production} livraison(s) · ${leads} lead(s) · ${quotes} devis.`,
      `💬 Avis${s.cronReviews ? "" : " (désactivé)"} : ${reviews} · 🎂 Anniversaire${s.cronBirthday ? "" : " (désactivé)"} : ${birthdays}.`,
    ].join("\n")
  );
  return {
    ok: true,
    message: `Test envoyé à ${ids.length} destinataire(s) — regarde Telegram. Le bot voit : ${production} à produire, ${leads} lead(s), ${quotes} devis, ${reviews} avis, ${birthdays} anniversaire(s). Heure serveur ${serverHour} h / heure de Zurich ${zh} h.`,
  };
}


/* ------------------------------------------------ test d'un déclencheur
   Exécute la vraie fonction en mode 🧪 (aucune écriture d'état) pour vérifier
   le format des messages sans polluer les cooldowns. */
export async function testTrigger(tenantId: string, kind: string): Promise<{ ok: boolean; message: string }> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!t) return { ok: false, message: "Tenant introuvable" };
  const s = await getSettings(tenantId);
  try {
    await notifyAll(`🧪 <b>Test « ${kind} »</b> — les messages qui suivent sont un aperçu, rien n'est marqué comme traité.`);
    switch (kind) {
      case "digest": await morningDigest(t, true); break;
      case "nudges": await eveningNudges(t, s, true); break;
      case "reviews": await reviewNudges(t, s, true); break;
      case "birthday": await birthdayNudges(t, s, true); break;
      case "fields": await fieldNudges(t, s, 99, true); break;
      case "production": await autoProduction(t, s, true); break;
      case "monthly": await monthlyReport(t, true); break;
      case "journal": { const { runJournalPublisher } = await import("@/lib/journal"); await runJournalPublisher(t, true); break; }
      case "themes": await runThemeCheck(t, true); break;
      case "gsc": { const { runGscReport } = await import("@/lib/gsc"); await runGscReport(t, true); break; }
      default: return { ok: false, message: `Déclencheur inconnu : ${kind}` };
    }
    return { ok: true, message: "Envoyé sur Telegram — regarde ton téléphone 📱" };
  } catch (e) {
    return { ok: false, message: `Erreur : ${e instanceof Error ? e.message : "inconnue"}` };
  }
}