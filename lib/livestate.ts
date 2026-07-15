/* ---------------------------------------------------------------------------
   État live des automatismes — ce que la machine « retient » en ce moment.
   Miroir en LECTURE SEULE des critères de lib/cron.ts (tenir les deux en phase).
   Affiché sous chaque automatisme dans Réglages → Automatismes.
--------------------------------------------------------------------------- */
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { pendingFields } from "@/lib/completeness";
import { nextAnniversary } from "@/lib/cron";

const dLeft = (until: number) => Math.max(1, Math.ceil((until - Date.now()) / 86400000));
const names = (list: string[], max = 3) =>
  list.slice(0, max).join(" · ") + (list.length > max ? ` +${list.length - max}` : "");

export async function automationsLive(tenantId: string): Promise<Record<string, string[]>> {
  const s = await getSettings(tenantId);
  const now = Date.now();
  const cooldownMs = s.nudgeCooldownDays * 86400000;
  const cooldownDate = new Date(now - cooldownMs);
  const out: Record<string, string[]> = {};

  /* ---------------------------------------------------------- ☀️ digest */
  const [soon, pendingLeads] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] },
        eventDate: { gte: new Date(now - 86400000), lte: new Date(now + 3 * 86400000) },
      },
      include: { contact: true },
      orderBy: { eventDate: "asc" },
    }),
    prisma.order.count({ where: { tenantId, status: "LEAD" } }),
  ]);
  out.digest = [
    soon.length
      ? `🎂 Sorties d'atelier sous 3 j : ${names(soon.map((o) => o.contact.firstName))}`
      : "Rien à produire sous 3 jours.",
    ...(pendingLeads ? [`📥 ${pendingLeads} lead${pendingLeads > 1 ? "s" : ""} en attente de devis.`] : []),
  ];

  /* ------------------------------------------------------- 🌙 relances */
  const nudgeBase = { OR: [{ lastNudgeAt: null }, { lastNudgeAt: { lt: cooldownDate } }] };
  const [del, leads, quotes, cooling] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] }, eventDate: { lt: new Date(now) }, ...nudgeBase },
      include: { contact: true },
    }),
    prisma.order.findMany({
      where: { tenantId, status: "LEAD", createdAt: { lt: new Date(now - s.leadFollowupHours * 3600000) }, ...nudgeBase },
      include: { contact: true },
    }),
    prisma.order.findMany({
      where: { tenantId, status: "DEVIS_ENVOYE", updatedAt: { lt: new Date(now - s.quoteFollowupDays * 86400000) }, ...nudgeBase },
      include: { contact: true },
    }),
    prisma.order.findMany({
      where: {
        tenantId,
        status: { in: ["LEAD", "DEVIS_ENVOYE", "ACOMPTE_RECU", "EN_PRODUCTION"] },
        lastNudgeAt: { gte: cooldownDate },
      },
      include: { contact: true },
    }),
  ]);
  const ready = [
    ...del.map((o) => `${o.contact.firstName} (livré ?)`),
    ...leads.map((o) => `${o.contact.firstName} (lead)`),
    ...quotes.map((o) => `${o.contact.firstName} (devis)`),
  ];
  out.nudges = [
    ready.length ? `🔜 Ce soir (max ${s.nudgeMaxPerEvening}) : ${names(ready)}` : "Rien à relancer ce soir.",
    ...(cooling.length
      ? [`⏸ En repos : ${names(cooling.map((o) => `${o.contact.firstName} (rev. ${dLeft(o.lastNudgeAt!.getTime() + cooldownMs)} j)`))}`]
      : []),
  ];

  /* ----------------------------------------------------------- 💬 avis */
  const [inWindow, upcoming] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        status: "LIVRE",
        reviewAskedAt: null,
        deliveredAt: { lte: new Date(now - s.reviewDelayDays * 86400000), gte: new Date(now - (s.reviewDelayDays + 12) * 86400000) },
      },
      include: { contact: true },
    }),
    prisma.order.count({
      where: { tenantId, status: "LIVRE", reviewAskedAt: null, deliveredAt: { gt: new Date(now - s.reviewDelayDays * 86400000) } },
    }),
  ]);
  out.reviews = [
    inWindow.length
      ? `🔜 En fenêtre : ${names(inWindow.map((o) => `${o.contact.firstName} (J+${Math.floor((now - o.deliveredAt!.getTime()) / 86400000)})`))}`
      : "Personne en fenêtre de demande d'avis.",
    ...(upcoming ? [`⏳ ${upcoming} livraison${upcoming > 1 ? "s" : ""} récente${upcoming > 1 ? "s" : ""} — demande à J+${s.reviewDelayDays}.`] : []),
  ];

  /* --------------------------------------------------- 🎂 anniversaires */
  const SOON_MIN = Math.max(1, s.birthdayLeadDays - 3);
  const SOON_MAX = s.birthdayLeadDays + 4;
  const candidates = await prisma.order.findMany({
    where: {
      tenantId,
      occasion: { contains: "anniversaire", mode: "insensitive" },
      eventDate: { lt: new Date(now - 60 * 86400000) },
      OR: [{ anniversaryNudgedAt: null }, { anniversaryNudgedAt: { lt: new Date(now - 300 * 86400000) } }],
    },
    include: { contact: true },
  });
  const withDays = candidates
    .filter((o) => o.eventDate)
    .map((o) => ({ o, days: Math.ceil((nextAnniversary(o.eventDate!, new Date()).getTime() - now) / 86400000) }))
    .sort((a, b) => a.days - b.days);
  const nowWin = withDays.filter((x) => x.days >= SOON_MIN && x.days <= SOON_MAX);
  const next3 = withDays.filter((x) => x.days > SOON_MAX).slice(0, 3);
  out.birthday = [
    nowWin.length
      ? `🔜 En fenêtre : ${names(nowWin.map((x) => `${x.o.celebrant || x.o.contact.firstName} (~${x.days} j)`))}`
      : "Personne en fenêtre de relance.",
    ...(next3.length ? [`⏳ Prochaines : ${names(next3.map((x) => `${x.o.celebrant || x.o.contact.firstName} (dans ${x.days} j)`))}`] : []),
  ];

  /* ------------------------------------------------------ 🥣 production */
  const acompte = await prisma.order.findMany({
    where: { tenantId, status: "ACOMPTE_RECU", eventDate: { not: null } },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
    take: 12,
  });
  const dueNow = acompte.filter((o) => o.eventDate!.getTime() <= now + s.productionLeadDays * 86400000);
  const later = acompte.filter((o) => o.eventDate!.getTime() > now + s.productionLeadDays * 86400000).slice(0, 3);
  out.production = [
    dueNow.length
      ? `🔜 Au prochain digest : ${names(dueNow.map((o) => o.contact.firstName))}`
      : "Rien à basculer pour l'instant.",
    ...(later.length
      ? [`⏳ Ensuite : ${names(later.map((o) => `${o.contact.firstName} (dans ${Math.max(1, Math.ceil((o.eventDate!.getTime() - s.productionLeadDays * 86400000 - now) / 86400000))} j)`))}`]
      : []),
  ];

  /* -------------------------------------------------------- 📈 mensuel */
  const zNow = new Date();
  const nextFirst = new Date(zNow.getFullYear(), zNow.getMonth() + 1, 1);
  out.monthly = [
    `⏳ Prochain bilan : ${nextFirst.toLocaleDateString("fr-CH")} à ${s.digestHour + 1} h.`,
  ];

  /* ------------------------------------------------- 🧩 données manquantes */
  const pend = await pendingFields(tenantId, 30);
  const snoozes = await prisma.fieldSnooze.findMany({
    where: { tenantId, dismissed: false, remindAt: { gt: new Date() } },
  });
  const snoozeOrders = snoozes.length
    ? await prisma.order.findMany({ where: { id: { in: snoozes.map((z) => z.orderId) } }, include: { contact: true } })
    : [];
  const byId = new Map(snoozeOrders.map((o) => [o.id, o]));
  const FIELD_LABEL: Record<string, string> = {
    eventDate: "date", parts: "parts", priceQuoted: "prix", occasion: "occasion", phone: "téléphone", deliveryAddress: "adresse",
  };
  out.fields = [
    pend.length
      ? `🔜 À réclamer : ${names(pend.map((p) => `${p.order.contact.firstName} — ${p.miss.label}`))}`
      : "Toutes les fiches actives sont complètes. ✔️",
    ...(snoozes.length
      ? [`⏸ Snoozé : ${names(snoozes.map((z) => `${byId.get(z.orderId)?.contact.firstName ?? "?"} — ${FIELD_LABEL[z.field] ?? z.field} (rev. ${dLeft(z.remindAt!.getTime())} j)`))}`]
      : []),
  ];

  return out;
}
