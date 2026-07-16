/* ---------------------------------------------------------------------------
   Registre central des automatismes — LA source unique.
   Alimente : la section Réglages, l'aide du bot, les boutons de test.
   Ajouter un automatisme ici = il apparaît partout.
--------------------------------------------------------------------------- */

export type Automation = {
  id: string;
  family: "cron" | "reaction" | "command";
  emoji: string; // Telegram (le bot garde ses emojis)
  icon: string; // nom d'icône Lucide (web)
  name: string;
  desc: string;
  trigger: string; // quand ça se déclenche, en français
  example?: string; // aperçu du message produit
  setting?: string; // nom du toggle Settings (désactivable)
  testKind?: string; // testable via testTrigger
  delays?: { name: string; label: string; unit: string; min: number; max: number; def: number }[];
  textFields?: { name: string; label: string; placeholder?: string; hint?: string }[];
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
    icon: "Sun",
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
    icon: "Moon",
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
    icon: "MessageSquareHeart",
    family: "cron",
    emoji: "💬",
    name: "Machine à avis",
    desc: "Après chaque livraison, le message de demande d'avis Google prêt à transférer à la cliente (lien WhatsApp direct).",
    trigger: "J+x après la livraison, avec le digest du matin",
    example: "💬 Demande d'avis — Sonia (livré il y a 2 jours)\n📲 Ouvrir WhatsApp avec le message…",
    setting: "cronReviews",
    testKind: "reviews",
    delays: [{ name: "reviewDelayDays", label: "Demander l'avis après la livraison", unit: "j", min: 1, max: 14, def: 2 }],
    textFields: [{ name: "reviewUrl", label: "Lien d'avis Google", placeholder: "https://g.page/r/…", hint: "Inséré dans les messages de demande d'avis envoyés aux clientes." }],
    stage: 5,
  },
  {
    id: "birthday",
    icon: "Cake",
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
    icon: "ChefHat",
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
    icon: "TrendingUp",
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
    icon: "Puzzle",
    family: "cron",
    emoji: "🧩",
    name: "Données manquantes",
    desc: "Quand une fiche est incomplète pour son stade (date, parts, prix, occasion — puis téléphone et adresse dès l'acompte), le bot demande l'info manquante : tu réponds directement, la fiche se met à jour.",
    trigger: "Avec les relances du soir · rappel réglable après « plus tard »",
    example: "🧩 As-tu pu obtenir le n° de mobile de Tamara ?\n[✍️ Renseigner] [⏰ Plus tard] [❌ Elle n'en aura pas]",
    setting: "cronFieldNudges",
    testKind: "fields",
    delays: [
      { name: "fieldFollowupDays", label: "Rappel après « plus tard »", unit: "j", min: 1, max: 14, def: 2 },
      { name: "handoverLeadDays", label: "Réclamer l'heure de remise avant l'événement", unit: "j", min: 1, max: 14, def: 2 },
    ],
    stage: 2,
  },
  /* ------------------------------------------------------ ⚡ réactions */
  {
    id: "gcal",
    family: "reaction",
    emoji: "📆",
    icon: "CalendarCheck",
    name: "Agenda Google synchronisé",
    desc: "Dès l'acompte reçu, la remise apparaît dans ton agenda Google (journée entière tant que l'heure n'est pas fixée, puis créneau précis dès qu'elle l'est). Modifiée ou annulée dans Carnet = mise à jour dans l'agenda.",
    trigger: "À l'acompte, puis à chaque changement de date/heure",
    setting: "gcalSync",
    stage: 2,
  },
  {
    id: "capture",
    icon: "Inbox",
    family: "reaction",
    emoji: "📥",
    name: "Capture de conversation",
    desc: "Partage au bot des captures d'écran d'une conversation, son export .txt, ou le .zip WhatsApp complet (discussion + médias) : il reconnaît la demande, extrait tout (contact, date, parts, prix, thème, source), joint les photos d'inspiration envoyées par la cliente, et te propose la fiche — rien n'est créé sans ton ✅. Ensuite, 📎 permet d'ajouter d'autres inspirations par simple transfert. Astuce zip : WhatsApp → Exporter → l'envoyer sur tes Messages enregistrés Telegram, puis le transférer au bot.",
    trigger: "Envoyer captures, export .txt ou .zip au bot",
    example: "📥 Demande détectée — Tamara Sullig (WhatsApp)\nAnniversaire Zelda 8 ans · 22.08 · 26 parts · CHF 185\n⚠️ Manque : occasion confirmée\n[✅ Créer la fiche] [✏️ Corriger] [❌ Ignorer]",
    stage: 0,
  },
  {
    id: "partner-apply",
    icon: "Handshake",
    family: "reaction",
    emoji: "🤝",
    name: "Candidature partenaire",
    desc: "Quand un commerce postule via la page Partenaires du site, la candidature arrive sur Telegram : réponds sur WhatsApp d'un tap, accepte (fiche partenaire + code créés automatiquement) ou décline.",
    trigger: "Dès qu'un pro envoie le formulaire /partenaires",
    example: "🤝 Candidature partenaire — Fleur & Chocolat (fleuriste, Lutry)\nMarie · +41 79 …\n[📲 WhatsApp] [✅ Créer le partenaire] [🗄 Décliner]",
    stage: 0,
  },
  {
    id: "notif-devis",
    icon: "BellRing",
    family: "reaction",
    emoji: "🔔",
    name: "Notification de demande",
    desc: "Chaque demande de devis du site arrive instantanément sur Telegram : récap complet, photos d'inspiration en album, lien fiche.",
    trigger: "Dès qu'une cliente envoie le configurateur",
    stage: 0,
  },
  {
    id: "acompte-chain",
    icon: "Coins",
    family: "reaction",
    emoji: "💰",
    name: "Suivi d'acompte",
    desc: "Quand tu réponds « ✅ Devis envoyé », le bot enchaîne : acompte reçu ? (montant calculé selon ton % — modifiable, ou « pas encore »).",
    trigger: "Après un « Devis envoyé » dans une relance",
    stage: 2,
  },
  {
    id: "known-client",
    icon: "UserCheck",
    family: "reaction",
    emoji: "👋",
    name: "Détection cliente connue",
    desc: "Si le téléphone saisi correspond à une fiche existante, la commande est rattachée à son historique et le bot te le dit (anti-doublon).",
    trigger: "À la création d'une commande via le bot",
    stage: 0,
  },
  {
    id: "assistant",
    icon: "Sparkles",
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
    icon: "CirclePlus",
    family: "command",
    emoji: "🎂",
    name: "Nouvelle demande",
    desc: "« C'est pour qui ? » — cliente existante proposée en boutons ou création, puis 4 à 6 questions. Bouton ✖ Annuler à chaque étape.",
    trigger: "Bouton 🎂 du clavier",
  },
  {
    id: "scan",
    icon: "ScanLine",
    family: "command",
    emoji: "📸",
    name: "Scan de justificatif",
    desc: "Toute photo ou PDF envoyé = ticket lu par l'IA (montant, date, TVA, catégorie) à valider d'un tap. Alerte doublon.",
    trigger: "Envoyer une photo ou un PDF, à tout moment",
  },
  {
    id: "week",
    icon: "CalendarDays",
    family: "command",
    emoji: "📅",
    name: "Cette semaine",
    desc: "Les sorties d'atelier des 7 prochains jours.",
    trigger: "Bouton 📅 du clavier",
  },
  {
    id: "expenses",
    icon: "Wallet",
    family: "command",
    emoji: "💰",
    name: "Dépenses du mois",
    desc: "Total et détail par catégorie, lien vers la compta.",
    trigger: "Bouton 💰 du clavier",
  },
  {
    id: "menu",
    icon: "LayoutGrid",
    family: "command",
    emoji: "☰",
    name: "Menu",
    desc: "Compléter les fiches en attente (🧩, à la demande), la semaine, les dépenses, Mon cap, l'aide, le lien Carnet.",
    trigger: "Bouton ☰ du clavier",
  },
];
