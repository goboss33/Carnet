/* ---------------------------------------------------------------------------
   Cap — le GPS du business : métriques calculées + roadmap en 3 phases.
   Tout est dérivé des données existantes (commandes, dépenses, snapshots).
--------------------------------------------------------------------------- */

import { prisma } from "@/lib/db";
import { getSettings, type EffectiveSettings } from "@/lib/settings";

export type Jalon = {
  key: string;
  label: string;
  done: boolean;
  auto: boolean;
  detail?: string;
};

export type CapData = {
  s: EffectiveSettings;
  caMois: number;            // CA livré du mois courant (CHF)
  netMois: number;           // CA - dépenses du mois (CHF)
  caParMois: { month: string; ca: number; net: number }[]; // 12 derniers
  panierMoyen: number;       // 3 derniers mois
  chfPart: number;           // CHF / part moyen 3 mois
  partMariagePct: number;    // % CA 3 mois
  partDecouplePct: number;   // % CA 3 mois hors SUR_MESURE
  weekendsPleins: number;    // sur les 4 à venir
  remplissage3mPct: number;  // % week-ends remplis, 12 dernières semaines
  retentionPct: number;      // % clients avec >= 2 commandes
  followers: { month: string; value: number }[];
  avisGoogle: number | null; // dernier snapshot
  phases: { name: string; jalons: Jalon[] }[];
  phaseCourante: number;     // index 0-2
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function computeCap(tenantId: string): Promise<CapData> {
  const s = await getSettings(tenantId);
  const now = new Date();
  const start12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const start3 = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const startM = new Date(now.getFullYear(), now.getMonth(), 1);

  const [livrees12, depenses12, contactsAgg, confirmees, snapshots, totalOrders] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, status: "LIVRE", deliveredAt: { gte: start12 } },
      select: { deliveredAt: true, priceQuoted: true, parts: true, occasion: true, revenueCategory: true },
    }),
    prisma.expense.findMany({
      where: { tenantId, status: "CONFIRMED", date: { gte: start12 } },
      select: { date: true, totalCents: true },
    }),
    prisma.contact.findMany({
      where: { tenantId },
      select: { _count: { select: { orders: true } } },
    }),
    prisma.order.findMany({
      where: { tenantId, status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION"] }, eventDate: { gte: now } },
      select: { eventDate: true },
    }),
    prisma.metricSnapshot.findMany({ where: { tenantId }, orderBy: { month: "asc" } }),
    prisma.order.count({ where: { tenantId } }),
  ]);

  // CA / net par mois
  const months: { month: string; ca: number; net: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ month: monthKey(d), ca: 0, net: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const o of livrees12) {
    const m = byMonth.get(monthKey(o.deliveredAt!));
    if (m) m.ca += o.priceQuoted ?? 0;
  }
  for (const e of depenses12) {
    const m = byMonth.get(monthKey(e.date));
    if (m) m.net -= e.totalCents / 100;
  }
  for (const m of months) m.net = Math.round(m.net + m.ca);

  const cur = byMonth.get(monthKey(startM))!;

  // 3 derniers mois
  const l3 = livrees12.filter((o) => o.deliveredAt! >= start3);
  const ca3 = l3.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const panierMoyen = l3.length ? Math.round(ca3 / l3.length) : 0;
  const avecParts = l3.filter((o) => o.parts && o.priceQuoted);
  const chfPart = avecParts.length
    ? Math.round((avecParts.reduce((a, o) => a + o.priceQuoted! / o.parts!, 0) / avecParts.length) * 10) / 10
    : 0;
  const caMariage = l3.filter((o) => /mariage|wedding/i.test(o.occasion)).reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const caDecouple = l3.filter((o) => o.revenueCategory !== "SUR_MESURE").reduce((a, o) => a + (o.priceQuoted ?? 0), 0);

  // remplissage : 4 prochains week-ends (sam/dim)
  const weekends: [Date, Date][] = [];
  const d0 = new Date(now);
  d0.setHours(0, 0, 0, 0);
  while (weekends.length < 4) {
    if (d0.getDay() === 6) {
      const sat = new Date(d0);
      const sun = new Date(d0);
      sun.setDate(sun.getDate() + 1);
      sun.setHours(23, 59, 59);
      weekends.push([sat, sun]);
    }
    d0.setDate(d0.getDate() + 1);
  }
  const weekendsPleins = weekends.filter(([a, b]) =>
    confirmees.some((o) => o.eventDate! >= a && o.eventDate! <= b)
  ).length;

  // constance : % de week-ends remplis sur les 12 dernières semaines
  const pastOrders = livrees12.filter((o) => o.deliveredAt! >= new Date(now.getTime() - 12 * 7 * 86400000));
  const pastWeekends: [Date, Date][] = [];
  const pd = new Date(now);
  pd.setDate(pd.getDate() - 12 * 7);
  pd.setHours(0, 0, 0, 0);
  const cursor = new Date(pd);
  while (cursor < now) {
    if (cursor.getDay() === 6) {
      const sat = new Date(cursor);
      const sun = new Date(cursor);
      sun.setDate(sun.getDate() + 1);
      sun.setHours(23, 59, 59);
      if (sun < now) pastWeekends.push([sat, sun]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const pastFilled = pastWeekends.filter(([a, b]) => pastOrders.some((o) => o.deliveredAt! >= a && o.deliveredAt! <= b)).length;
  const remplissage3mPct = pastWeekends.length ? Math.round((pastFilled / pastWeekends.length) * 100) : 0;

  const withOrder = contactsAgg.filter((c) => c._count.orders >= 1).length;
  const repeat = contactsAgg.filter((c) => c._count.orders >= 2).length;
  const retentionPct = withOrder ? Math.round((repeat / withOrder) * 100) : 0;

  const followers = snapshots.filter((x) => x.key === "instagram_followers").map((x) => ({ month: x.month, value: x.value }));
  const avisSnaps = snapshots.filter((x) => x.key === "google_reviews");
  const avisGoogle = avisSnaps.length ? avisSnaps[avisSnaps.length - 1].value : null;

  const partMariagePct = ca3 ? Math.round((caMariage / ca3) * 100) : 0;
  const partDecouplePct = ca3 ? Math.round((caDecouple / ca3) * 100) : 0;
  const mariagesLivres = livrees12.filter((o) => /mariage|wedding/i.test(o.occasion)).length;
  const mariageLivre = mariagesLivres > 0;
  const m = s.milestones;

  const phases = [
    {
      name: "Phase 1 — Fondations",
      jalons: [
        { key: "site", label: "Site + configurateur en ligne", done: true, auto: true },
        { key: "pipeline", label: "20 commandes suivies dans Carnet", done: totalOrders >= 20, auto: true, detail: `${totalOrders}/20` },
        { key: "avis10", label: "5 premiers avis Google", done: (avisGoogle ?? 0) >= 5, auto: true, detail: avisGoogle != null ? `${avisGoogle}/5` : "à saisir" },
        { key: "flyers", label: "Flyers chez 2 partenaires", done: !!m.flyers, auto: false },
        { key: "insta300", label: "300 abonnés Instagram", done: (followers.at(-1)?.value ?? 0) >= 300, auto: true, detail: followers.at(-1) ? `${followers.at(-1)!.value}/300` : "à saisir" },
      ],
    },
    {
      name: "Phase 2 — L'élan",
      jalons: [
        { key: "cmd60", label: "60 commandes au compteur", done: totalOrders >= 60, auto: true, detail: `${totalOrders}/60` },
        { key: "caPalier", label: `CA mensuel ≥ ${Math.round(s.goalCaMensuel * 0.6)} CHF`, done: cur.ca >= s.goalCaMensuel * 0.6, auto: true, detail: `${cur.ca}/${Math.round(s.goalCaMensuel * 0.6)}` },
        { key: "mariage1", label: "Premier mariage livré", done: mariageLivre, auto: true },
        { key: "avisPalier", label: `${Math.round(s.goalAvisGoogle * 0.6)} avis Google`, done: (avisGoogle ?? 0) >= s.goalAvisGoogle * 0.6, auto: true, detail: avisGoogle != null ? `${avisGoogle}/${Math.round(s.goalAvisGoogle * 0.6)}` : "à saisir" },
        { key: "instaPalier", label: `${Math.round(s.goalInstagram * 0.5)} abonnés Instagram`, done: (followers.at(-1)?.value ?? 0) >= s.goalInstagram * 0.5, auto: true, detail: followers.at(-1) ? `${followers.at(-1)!.value}/${Math.round(s.goalInstagram * 0.5)}` : "à saisir" },
        { key: "wk2", label: "1 week-end sur 2 rempli (3 mois)", done: remplissage3mPct >= 50, auto: true, detail: `${remplissage3mPct}%` },
      ],
    },
    {
      name: "Phase 3 — Un vrai salaire",
      jalons: [
        { key: "ca", label: `CA mensuel ≥ ${s.goalCaMensuel} CHF`, done: cur.ca >= s.goalCaMensuel, auto: true, detail: `${cur.ca}/${s.goalCaMensuel}` },
        { key: "net", label: "Résultat net positif 3 mois de suite", done: months.slice(-3).every((x) => x.net > 0), auto: true },
        { key: "panier", label: `Panier moyen ≥ ${s.goalPanierMoyen} CHF`, done: panierMoyen >= s.goalPanierMoyen, auto: true, detail: `${panierMoyen}/${s.goalPanierMoyen}` },
        { key: "remplissage", label: "3 week-ends sur 4 remplis (3 mois d'affilée)", done: remplissage3mPct >= 75, auto: true, detail: `${remplissage3mPct}%` },
        { key: "mariagePct", label: `Mariages ≥ ${s.goalPartMariage} % du CA`, done: partMariagePct >= s.goalPartMariage, auto: true, detail: `${partMariagePct}%` },
        { key: "avisGoal", label: `${s.goalAvisGoogle} avis Google`, done: (avisGoogle ?? 0) >= s.goalAvisGoogle, auto: true, detail: avisGoogle != null ? `${avisGoogle}/${s.goalAvisGoogle}` : "à saisir" },
      ],
    },
    {
      name: "Phase 4 — Découplage du temps",
      jalons: [
        { key: "collection", label: "Collection signature en ligne", done: !!m.collection, auto: false },
        { key: "atelier", label: "Premier atelier donné", done: !!m.atelier, auto: false },
        { key: "bons", label: "Bons cadeaux en vente", done: !!m.bons, auto: false },
        { key: "eshop", label: "Boutique toppers en ligne", done: !!m.eshop, auto: false },
        { key: "decouple", label: `≥ ${s.goalPartDecouple} % du CA hors sur-mesure`, done: partDecouplePct >= s.goalPartDecouple, auto: true, detail: `${partDecouplePct}%` },
        { key: "insta", label: `${s.goalInstagram} abonnés Instagram`, done: (followers.at(-1)?.value ?? 0) >= s.goalInstagram, auto: true, detail: followers.at(-1) ? `${followers.at(-1)!.value}/${s.goalInstagram}` : "à saisir" },
      ],
    },
  ];

  const phaseCourante = phases.findIndex((p) => p.jalons.some((j) => !j.done));

  return {
    s,
    caMois: cur.ca,
    netMois: cur.net,
    caParMois: months,
    panierMoyen,
    chfPart,
    partMariagePct,
    partDecouplePct,
    weekendsPleins,
    remplissage3mPct,
    retentionPct,
    followers,
    avisGoogle,
    phases,
    phaseCourante: phaseCourante === -1 ? 2 : phaseCourante,
  };
}
