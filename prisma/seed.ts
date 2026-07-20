/**
 * Seed de développement — données de test Maman Gâteau.
 *
 *   npm run db:seed     (remplit / réinitialise le tenant de test)
 *   npm run db:reset    (recrée le schéma à neuf PUIS seed)
 *
 * Idempotent : on efface les données du tenant de test puis on les recrée.
 * N'est JAMAIS lancé en production (l'entrypoint Docker ne fait que db push).
 */
import { PrismaClient, Prisma, OrderStatus, Source, RevenueCategory } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = process.env.TENANT_SLUG ?? "maman-gateau";
const NAME = process.env.TENANT_NAME ?? "Maman Gâteau";

/** Date relative à aujourd'hui (jours), heure optionnelle. */
const day = (offset: number, h = 10, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return d;
};

async function main() {
  // 1. Tenant (auto-créé aussi par l'app, mais on le garantit ici)
  const tenant = await prisma.tenant.upsert({
    where: { slug: SLUG },
    update: { name: NAME },
    create: { slug: SLUG, name: NAME },
  });
  const tenantId = tenant.id;

  // 2. Reset des données du tenant de test (ordre = contraintes de clés)
  await prisma.journalEntry.deleteMany({ where: { tenantId } });
  await prisma.order.deleteMany({ where: { tenantId } }); // cascade Activity/AiMessage
  await prisma.contact.deleteMany({ where: { tenantId } });
  await prisma.studioAsset.deleteMany({ where: { tenantId } });

  // 3. Réglages — Studio activé pour voir les onglets Contenu / Journal
  await prisma.settings.upsert({
    where: { tenantId },
    update: { studioEnabled: true },
    create: {
      tenantId,
      studioEnabled: true,
      brandName: "Maman Gâteau",
      brandColor: "#b5651d",
      depositPct: 30,
      kmRate: 0.7,
      siteUrl: "https://mamangateau.ch",
      sitePathPrefix: "creations",
      reviewUrl: "https://g.page/r/maman-gateau/review",
      twintNumber: "079 000 00 00",
      accountHolder: "Annie — Maman Gâteau",
      goalCaMensuel: 4000,
      goalPanierMoyen: 250,
      goalAvisGoogle: 50,
    },
  });

  // 4. Contacts
  const contactsData = [
    { firstName: "Sophie", lastName: "Meyer", phone: "079 123 45 67", email: "sophie.meyer@example.ch", source: Source.CONFIGURATEUR },
    { firstName: "Julie", lastName: "Rochat", phone: "078 234 56 78", email: "julie.rochat@example.ch", source: Source.INSTAGRAM },
    { firstName: "Vlora", lastName: "Krasniqi", phone: "076 345 67 89", email: "vlora.k@example.ch", source: Source.WHATSAPP },
    { firstName: "Daniela", lastName: "Santos", phone: "079 456 78 90", email: "daniela.santos@example.ch", source: Source.BOUCHE_A_OREILLE },
    { firstName: "Céline", lastName: "Favre", phone: "078 567 89 01", email: "celine.favre@example.ch", source: Source.CONFIGURATEUR },
    { firstName: "Marc", lastName: "Dubois", phone: "076 678 90 12", email: "marc.dubois@example.ch", source: Source.TELEPHONE },
    { firstName: "Léa", lastName: "Bonvin", phone: "079 789 01 23", email: "lea.bonvin@example.ch", source: Source.INSTAGRAM },
    { firstName: "Nadia", lastName: "Cherif", phone: "078 890 12 34", email: "nadia.cherif@example.ch", source: Source.FACEBOOK },
  ];
  const contacts = [];
  for (const c of contactsData) {
    contacts.push(await prisma.contact.create({ data: { tenantId, ...c } }));
  }
  const [sophie, julie, vlora, daniela, celine, marc, lea, nadia] = contacts;

  // 5. Commandes — un exemplaire par statut, dates réalistes
  const mk = (data: Prisma.OrderUncheckedCreateInput) =>
    prisma.order.create({ data });

  // LEAD (2)
  await mk({
    tenantId, contactId: sophie.id, status: OrderStatus.LEAD, source: Source.CONFIGURATEUR,
    occasion: "Anniversaire 6 ans", celebrant: "Emma", celebrantAge: 6, parts: 20,
    themeNote: "Licorne arc-en-ciel, pastel", eventDate: day(21, 15),
    priceQuoted: 240, revenueCategory: RevenueCategory.SUR_MESURE,
    notes: "Demande via configurateur, allergie fruits à coque.",
  });
  await mk({
    tenantId, contactId: nadia.id, status: OrderStatus.LEAD, source: Source.FACEBOOK,
    occasion: "Baby shower", parts: 15, themeNote: "Nuages, doré et blanc",
    eventDate: day(35, 14), priceQuoted: 190, revenueCategory: RevenueCategory.SUR_MESURE,
  });

  // DEVIS_ENVOYE (1)
  await mk({
    tenantId, contactId: julie.id, status: OrderStatus.DEVIS_ENVOYE, source: Source.INSTAGRAM,
    occasion: "Mariage", parts: 80, tiers: 3, themeNote: "Champêtre, fleurs fraîches, blanc cassé",
    eventDate: day(60, 16), priceQuoted: 620, revenueCategory: RevenueCategory.SUR_MESURE,
    deliveryMode: "livraison", deliveryAddress: "Domaine de Rovéréaz, Lausanne", deliveryKm: 8,
    notes: "Devis envoyé, en attente de réponse.",
  });

  // ACOMPTE_RECU (2)
  await mk({
    tenantId, contactId: vlora.id, status: OrderStatus.ACOMPTE_RECU, source: Source.WHATSAPP,
    occasion: "Anniversaire 30 ans", celebrant: "Vlora", parts: 25,
    themeNote: "Number cake, doré et fleurs", eventDate: day(12, 18),
    priceQuoted: 280, depositCents: 8400, depositPaidAt: day(-3),
    revenueCategory: RevenueCategory.SUR_MESURE, handoverAt: day(12, 17),
  });
  await mk({
    tenantId, contactId: celine.id, status: OrderStatus.ACOMPTE_RECU, source: Source.CONFIGURATEUR,
    occasion: "Anniversaire 1 an", celebrant: "Noah", celebrantAge: 1, parts: 18,
    themeNote: "Safari, animaux de la jungle", eventDate: day(18, 15),
    priceQuoted: 210, depositCents: 6300, depositPaidAt: day(-1),
    revenueCategory: RevenueCategory.SUR_MESURE,
  });

  // EN_PRODUCTION (1)
  await mk({
    tenantId, contactId: daniela.id, status: OrderStatus.EN_PRODUCTION, source: Source.BOUCHE_A_OREILLE,
    occasion: "Anniversaire 40 ans", celebrant: "Daniela", parts: 30,
    themeNote: "Élégant noir et or, feuille d'or", eventDate: day(4, 19),
    priceQuoted: 340, depositCents: 10200, depositPaidAt: day(-10),
    revenueCategory: RevenueCategory.SUR_MESURE, handoverAt: day(4, 18),
    biscuit: "Chocolat", fourrages: ["Ganache chocolat", "Praliné"],
  });

  // LIVRE (3) — deliveredAt renseigné pour la CA et la machine à avis
  const livreLicorne = await mk({
    tenantId, contactId: lea.id, status: OrderStatus.LIVRE, source: Source.INSTAGRAM,
    occasion: "Anniversaire 5 ans", celebrant: "Chloé", celebrantAge: 5, parts: 20,
    themeNote: "Licorne pastel et arc-en-ciel", eventDate: day(-8, 15),
    priceQuoted: 250, depositCents: 7500, depositPaidAt: day(-20),
    balanceCents: 17500, balancePaidAt: day(-8), deliveredAt: day(-8, 14),
    revenueCategory: RevenueCategory.SUR_MESURE,
    reviewAskedAt: day(-6), notes: "Livraison parfaite, cliente ravie.",
  });
  await mk({
    tenantId, contactId: marc.id, status: OrderStatus.LIVRE, source: Source.TELEPHONE,
    occasion: "Gâteau d'entreprise", parts: 40, themeNote: "Logo société, bleu corporate",
    eventDate: day(-15, 12), priceQuoted: 480, balancePaidAt: day(-15), deliveredAt: day(-15, 11),
    revenueCategory: RevenueCategory.B2B, deliveryMode: "livraison", deliveryAddress: "Rue de Genève 7, Lausanne",
  });
  await mk({
    tenantId, contactId: daniela.id, status: OrderStatus.LIVRE, source: Source.BOUCHE_A_OREILLE,
    occasion: "Baptême", celebrant: "Lucas", parts: 24, themeNote: "Ciel étoilé, bleu nuit et argent",
    eventDate: day(-25, 16), priceQuoted: 300, balancePaidAt: day(-25), deliveredAt: day(-25, 15),
    revenueCategory: RevenueCategory.SUR_MESURE,
  });

  // ANNULE (1)
  await mk({
    tenantId, contactId: sophie.id, status: OrderStatus.ANNULE, source: Source.CONFIGURATEUR,
    occasion: "Cupcakes", parts: 12, themeNote: "Halloween", eventDate: day(-40, 14),
    priceQuoted: 90, cancelledAt: day(-42), revenueCategory: RevenueCategory.COLLECTION,
    notes: "Annulée par la cliente — report indéterminé.",
  });

  // 6. Journal — 2 entrées (une publiée liée à la licorne livrée, un brouillon guide)
  await prisma.journalEntry.create({
    data: {
      tenantId, type: "CREATION", template: "RECIT", format: "ARTICLE",
      status: "PUBLIEE", category: "ANNIVERSAIRE", orderId: livreLicorne.id,
      slug: "gateau-licorne-anniversaire-pully",
      title: "Un gâteau licorne tout en pastel pour les 5 ans de Chloé",
      metaTitle: "Gâteau licorne anniversaire enfant — Maman Gâteau (Pully)",
      metaDescription: "Retour sur la création d'un gâteau licorne arc-en-ciel pour un anniversaire d'enfant dans la région de Lausanne.",
      keywords: ["gâteau licorne", "gâteau anniversaire enfant", "cake designer Lausanne"],
      story: "## Une commande pleine de couleurs\n\nQuand Léa nous a contactés pour les 5 ans de Chloé, l'envie était claire : une licorne, beaucoup de pastel, et un arc-en-ciel.\n\nLe résultat a fait briller les yeux de toute la table.",
      publishedAt: day(-5),
    },
  });
  await prisma.journalEntry.create({
    data: {
      tenantId, type: "ARTICLE", template: "GUIDE", format: "ARTICLE",
      status: "BROUILLON", category: "CONSEILS",
      slug: "combien-de-parts-gateau-anniversaire",
      title: "Combien de parts prévoir pour un gâteau d'anniversaire ?",
      metaTitle: "Combien de parts pour un gâteau d'anniversaire ? Le guide",
      metaDescription: "Notre méthode simple pour estimer le nombre de parts d'un gâteau selon le nombre d'invités et le moment de la journée.",
      keywords: ["nombre de parts gâteau", "taille gâteau anniversaire", "gâteau combien de personnes"],
      story: "## La règle de base\n\nPour un dessert de fin de repas, comptez une part par personne. Pour un buffet sucré, prévoyez large.",
    },
  });

  const counts = {
    contacts: await prisma.contact.count({ where: { tenantId } }),
    orders: await prisma.order.count({ where: { tenantId } }),
    journal: await prisma.journalEntry.count({ where: { tenantId } }),
  };
  console.log(`✅ Seed terminé pour « ${NAME} » :`, counts);
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
