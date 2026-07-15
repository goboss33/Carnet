/* ---------------------------------------------------------------------------
   Registre central des automatismes — LA source unique.
   Alimente : la section Réglages, l'aide du bot, les boutons de test.
   Ajouter un automatisme ici = il apparaît partout.
--------------------------------------------------------------------------- */

export type Automation = {
  id: string;
  family: "cron" | "reaction" | "command";
  emoji: string;
  name: string;
  desc: string;
  trigger: string; // quand ça se déclenche, en français
  example?: string; // aperçu du message produit
  setting?: string; // nom du toggle Settings (désactivable)
  testKind?: string; // testable via testTrigger
  delays?: { name: string; label: string; unit: string; min: number; max: number; def: number }[];
  stage?: number; // index d'étape du cycle de vie (frise)
};

export const LIFECYCLE = [
  "Lead",
  "Devis envoyé",
  "Acompte reçu",
  "Production",
  "Livré",
  "Avis",
  "Anniversaire",
] as const;

export const AUTOMATIONS: Automation[] = [
  /* ------------------------------------------------------ ⏰ programmés */
  {
    id: "digest",
    family: "cron",
    emoji: "☀️",
    name: "Digest du matin",
    desc: "Le programme de production (sorties d'atelier sous 3 jours) et le compteur de leads en attente.",
    trigger: "Chaque jour à l'heure du digest",
    example: "☀️ Bonjour ! Le programme :\n• DEMAIN — Sonia, anniversaire 8 ans (20 parts, livraison)\n📥 2 leads en attente de devis.",
    setting: "cronDigest",
    testKind: "digest",
    stage: 3,
  },
  {
    id: "nudges",
    family: "cron",
    emoji: "🌙",
    name: "Relances du soir",
    desc: "Au plus N questions, par urgence : le gâteau a-t-il été livré ? · as-tu répondu au lead ? · des nouvelles du devis (acompte, relance WhatsApp, sans suite) ?",
    trigger: "Chaque soir à l'heure des relances · cooldown par fiche",
    delays: [
      { name: "leadFollowupHours", label: "Relancer un lead sans réponse après", unit: "h", min: 1, max: 168, def: 24 },
      { name: "quoteFollowupDays", label: "Relancer un devis sans nouvelles après", unit: "j", min: 1, max: 30, def: 4 },
      { name: "nudgeCooldownDays", label: "Repos entre deux questions sur une même fiche", unit: "j", min: 1, max: 14, def: 2 },
      { name: "nudgeMaxPerEvening", label: "Questions max par soir", unit: "", min: 1, max: 10, def: 3 },
    ],
    example: "📝 As-tu répondu à la demande de Marie (anniversaire 6 ans) ?\n[✅ Devis envoyé] [⏰ Plus tard] [🗄 Sans suite]",
    setting: "cronEveningNudges",
    testKind: "nudges",
    stage: 0,
  },
  {
    id: "reviews",
    family: "cron",
    emoji: "💬",
    name: "Machine à avis",
    desc: "Après chaque livraison, le message de demande d'avis Google prêt à transférer à la cliente (lien WhatsApp direct).",
    trigger: "J+x après la livraison, avec le digest du matin",
    example: "💬 Demande d'avis — Sonia (livré il y a 2 jours)\n📲 Ouvrir WhatsApp avec le message…",
    setting: "cronReviews",
    testKind: "reviews",
    delays: [{ name: "reviewDelayDays", label: "Demander l'avis après la livraison", unit: "j", min: 1, max: 14, def: 2 }],
    stage: 5,
  },
  {
    id: "birthday",
    family: "cron",
    emoji: "🎂",
    name: "Relance anniversaire",
    desc: "Un an après chaque commande d'anniversaire : suggestion de recontacter la cliente avant la date (message prêt, âge mis à jour). Une fois par an maximum.",
    trigger: "~x jours avant la date anniversaire, avec le digest",
    example: "🎂 Anniversaire à venir — Helena (dans ~21 jours)\nL'an dernier : château de princesse…",
    setting: "cronBirthday",
    testKind: "birthday",
    delays: [{ name: "birthdayLeadDays", label: "Prévenir avant la date anniversaire", unit: "j", min: 7, max: 60, def: 21 }],
    stage: 6,
  },
  {
    id: "production",
    family: "cron",
    emoji: "🥣",
    name: "Passage en production",
    desc: "Dès que l'événement approche, la commande « acompte reçu » bascule toute seule en production — le pipeline reflète ton plan de travail sans que tu touches à rien.",
    trigger: "Chaque matin avec le digest, à J-x de l'événement",
    example: "☀️ Le programme :\n🥣 Entre en production : Zelda (samedi)",
    setting: "cronProduction",
    testKind: "production",
    delays: [{ name: "productionLeadDays", label: "Basculer avant l'événement", unit: "j", min: 1, max: 14, def: 3 }],
    stage: 3,
  },
  {
    id: "monthly",
    family: "cron",
    emoji: "📈",
    name: "Bilan mensuel (Cap)",
    desc: "CA, net, bons points du mois, jalons de la phase — puis saisie éclair des followers Instagram et du compteur d'avis.",
    trigger: "Le 1ᵉʳ du mois, une heure après le digest",
    example: "📈 Bilan de 2026-07\nCA livré : CHF 1840 (+22 %) · net : CHF 1210\n🎉 CA en hausse de 22 % !…",
    setting: "cronMonthly",
    testKind: "monthly",
  },
  {
    id: "fields",
    family: "cron",
    emoji: "🧩",
    name: "Données manquantes",
    desc: "Quand une fiche est incomplète pour son stade (date, parts, prix, occasion — puis téléphone et adresse dès l'acompte), le bot demande l'info manquante : tu réponds directement, la fiche se met à jour.",
    trigger: "Avec les relances du soir · rappel réglable après « plus tard »",
    example: "🧩 As-tu pu obtenir le n° de mobile de Tamara ?\n[✍️ Renseigner] [⏰ Plus tard] [❌ Elle n'en aura pas]",
    setting: "cronFieldNudges",
    testKind: "fields",
    delays: [{ name: "fieldFollowupDays", label: "Rappel après « plus tard »", unit: "j", min: 1, max: 14, def: 2 }],
    stage: 2,
  },
  /* ------------------------------------------------------ ⚡ réactions */
  {
    id: "capture",
    family: "reaction",
    emoji: "📥",
    name: "Capture de conversation",
    desc: "Partage les captures d'écran d'une conversation (WhatsApp, Instagram, FB) ou son export .txt au bot : il reconnaît la demande, extrait tout (contact, date, parts, prix, thème, source) et te propose la fiche — rien n'est créé sans ton ✅.",
    trigger: "Envoyer des captures ou un export de discussion au bot",
    example: "📥 Demande détectée — Tamara Sullig (WhatsApp)\nAnniversaire Zelda 8 ans · 22.08 · 26 parts · CHF 185\n⚠️ Manque : occasion confirmée\n[✅ Créer la fiche] [✏️ Corriger] [❌ Ignorer]",
    stage: 0,
  },
  {
    id: "notif-devis",
    family: "reaction",
    emoji: "🔔",
    name: "Notification de demande",
    desc: "Chaque demande de devis du site arrive instantanément sur Telegram : récap complet, photos d'inspiration en album, lien fiche.",
    trigger: "Dès qu'une cliente envoie le configurateur",
    stage: 0,
  },
  {
    id: "acompte-chain",
    family: "reaction",
    emoji: "💰",
    name: "Suivi d'acompte",
    desc: "Quand tu réponds « ✅ Devis envoyé », le bot enchaîne : acompte reçu ? (montant calculé selon ton % — modifiable, ou « pas encore »).",
    trigger: "Après un « Devis envoyé » dans une relance",
    stage: 2,
  },
  {
    id: "known-client",
    family: "reaction",
    emoji: "👋",
    name: "Détection cliente connue",
    desc: "Si le téléphone saisi correspond à une fiche existante, la commande est rattachée à son historique et le bot te le dit (anti-doublon).",
    trigger: "À la création d'une commande via le bot",
    stage: 0,
  },
  {
    id: "assistant",
    family: "reaction",
    emoji: "🤖",
    name: "Assistant IA — réponse au devis",
    desc: "« Rédiger la réponse » compose le message pour la cliente (récap exact, Twint) — affinable en conversation, depuis le bot ou la fiche.",
    trigger: "Sur demande, depuis une fiche ou une notification",
    stage: 1,
  },
  /* --------------------------------------------------- 🎂 à la demande */
  {
    id: "new-order",
    family: "command",
    emoji: "🎂",
    name: "Nouvelle commande",
    desc: "« C'est pour qui ? » — cliente existante proposée en boutons ou création, puis 4 à 6 questions.",
    trigger: "Bouton 🎂 du clavier",
  },
  {
    id: "scan",
    family: "command",
    emoji: "📸",
    name: "Scan de justificatif",
    desc: "Toute photo ou PDF envoyé = ticket lu par l'IA (montant, date, TVA, catégorie) à valider d'un tap. Alerte doublon.",
    trigger: "Envoyer une photo ou un PDF, à tout moment",
  },
  {
    id: "week",
    family: "command",
    emoji: "📅",
    name: "Cette semaine",
    desc: "Les sorties d'atelier des 7 prochains jours.",
    trigger: "Bouton 📅 du clavier",
  },
  {
    id: "expenses",
    family: "command",
    emoji: "💰",
    name: "Dépenses du mois",
    desc: "Total et détail par catégorie, lien vers la compta.",
    trigger: "Bouton 💰 du clavier",
  },
  {
    id: "menu",
    family: "command",
    emoji: "☰",
    name: "Menu",
    desc: "Mon cap (résumé de progression), rappel scan, aide complète, lien Carnet.",
    trigger: "Bouton ☰ du clavier",
  },
];
