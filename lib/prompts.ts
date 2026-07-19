/* ---------------------------------------------------------------------------
   Registre des prompts de l'app — la forme « template » (avec {variables})
   de chaque prompt envoyé à Gemini, pour le Laboratoire IA (Réglages →
   Assistant). Règle du repo : toute évolution d'un prompt dans le code se
   reflète ici dans le même commit (même discipline que lib/automations).
--------------------------------------------------------------------------- */

export type PromptTemplate = {
  kind: string; // doit correspondre au kind passé à geminiGenerate
  label: string;
  where: string; // fichier source à éditer pour fine-tuner
  template: string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    kind: "image.edit",
    label: "Retouche photo — Seedream (fal)",
    where: "lib/fal-edit.ts (presets EDIT_PRESETS + ZoneEditor)",
    template: `[image source + prompt] via fal Seedream 5.0 Pro edit.
Presets (« garde le gâteau identique, change le décor/lumière/cadrage ») ou zones colorées : « Red frame: … / Green frame: … ». Safety checker désactivé.`,
  },
  {
    kind: "journal.suggestion",
    label: "Journal — titre, mots-clés & SEO",
    where: "lib/journal.ts (SUGGEST_SYSTEM + suggestEntry)",
    template: `[system]
Tu es le rédacteur SEO d'une cake designer artisanale à Pully (région Lausanne, Vaud, Suisse — zone : Lausanne, Pully, Lutry, Vevey, Montreux, Morges).
Tu prépares la fiche d'une page de son site (journal des créations + articles conseils).
Objectif : longue traîne locale. Règles strictes : n'invente AUCUN fait. Français de Suisse romande. Pas de superlatifs creux.

[user]
{si création : « Nouvelle page « création » à partir de cette commande livrée : {brief factuel de la commande} »}
{si article : « Nouvel article conseil sur le sujet : « {sujet} » »}

Slugs déjà pris (ta proposition doit être DIFFÉRENTE et se différencier par un angle réel — âge, thème précis, commune — jamais par un numéro) :
{liste des slugs existants}
{Mots-clés déjà choisis (via DataForSEO, par l'humain) — titre et métas cohérents, sans insertion verbatim : {mots-clés}}

Réponds UNIQUEMENT avec cet objet JSON :
{ title, slug, category, meta_title (≤60), meta_description (≤155), alt_ideas[6] }
(Les mots-clés ne sont PAS demandés ici : ils viennent de journal.keywords + choix humain.)`,
  },
  {
    kind: "journal.keywords",
    label: "Journal — mots-clés en trois traînes",
    where: "lib/journal.ts (suggestKeywords)",
    template: `[system] (le même que journal.suggestion)

[user]
Propose des mots-clés de recherche Google pour {la page d'une création livrée (brief factuel) | un article conseil sur « {sujet} »}.
Trois groupes, 4 propositions par groupe : "short" (2 mots), "mid" (3 mots, + occasion ou ville), "long" (4+ mots, occasion + thème + ville/attribut).
Règles : accents, minuscules, pas de doublons, uniquement des requêtes de CLIENTES (jamais recette/coloriage/facile). Villes : Lausanne, Pully, Vevey, Montreux, Morges.
JSON strict : {"short": [], "mid": [], "long": []}`,
  },
  {
    kind: "journal.recit",
    label: "Journal — récit de la page (markdown)",
    where: "lib/journal.ts (suggestStory)",
    template: `[system] (le même que journal.suggestion)
[modèle : GEMINI_STORY_MODEL si défini, sinon le modèle standard]

[user]
Écris le corps de la page en MARKDOWN (pas de H1 — le titre existe déjà : « {titre} »).
{selon le TEMPLATE : RECIT « récit d'une création, brief factuel, 2-4 paragraphes 220-380 mots, 2-3 intertitres » · GALERIE « intro brève 60-120 mots, sans intertitre » · GUIDE « article conseil, intro + sections, 350-550 mots » · ANNONCE « billet éditorial première personne, 150-300 mots, au plus un intertitre »}
{si article : « Article conseil pratique sur : « {sujet} ». Intro courte puis sections concrètes, 350-550 mots. »}
Contexte de ciblage (DÉJÀ couvert par titre/adresse/métadonnées — n'en force aucun) : {mots-clés}.

{si photos : « Les photos ci-jointes iront DANS l'article : [[photo:N]] pleine largeur, [[photo:N|left]] / [[photo:N|right]] flottantes (le texte habille) — varier, jamais deux flottantes d'affilée, au plus une fois chacune, couverture exclue ; le paragraphe voisin décrit ce que la photo MONTRE. » + les vignettes jointes en images}

Structure : 2-3 intertitres "## " SPÉCIFIQUES (variante naturelle d'un thème possible — jamais verbatim) ; intertitres génériques interdits.

Règles d'écriture impératives :
- N'insère JAMAIS un mot-clé tel quel : français irréprochable, accents, variantes — le bourrage est interdit.
- La localité : AU MAXIMUM UNE fois dans le corps, jamais accolée à un nom de produit.
- Pas d'ouverture par la date ; une liste à puces au plus ; jamais d'origine d'ingrédient non fournie par le brief.
- ==mot== : surligneur rose (max 2, dont un seul mot d'un intertitre) ; un encadré « > **Bon à savoir** — … » seulement si l'info a une vraie valeur pratique.
- Le gras : au plus une fois, jamais pour un mot-clé.
- Du CONCRET tiré du brief et des photos (prénom sur le gâteau, couleurs réelles, détail de modelage).
- Tournures interdites : occasion spéciale, moment magique, donner vie, pièce unique, idéal pour, garantissant, faire la part belle, sublimer, émerveiller petits et grands.
- Voix : Annie, artisane — première personne discrète, phrases courtes, chaleur sans emphase.
Termine par UNE phrase d'appel à l'action vers le devis (sans lien). Aucun prix, aucun nom de famille, pas de tutoiement.`,
  },
  {
    kind: "journal.alts",
    label: "Journal — descriptions des photos (alt)",
    where: "lib/journal.ts (suggestAlts)",
    template: `[user]
Pour chaque photo ci-jointe (numérotées), écris un texte alternatif pour Google Images : factuel, descriptif, 6-14 mots, français avec accents, sans point final, sans « photo de ». Décris ce que tu VOIS (sujet, couleurs, matières). Réponds UNIQUEMENT en JSON : {"alts": ["…"]} dans l'ordre.
{+ les vignettes jointes}`,
  },
  {
    kind: "assistant.reponse",
    label: "Assistant — réponse à la cliente (fiche commande)",
    where: "lib/assistant.ts (draftReply)",
    template: `[system]
Tu es l'assistante de rédaction d'Annie, créatrice de « Maman Gâteau » (cake designer à Pully, Suisse romande).
Tu rédiges des messages qu'Annie relira et enverra elle-même (WhatsApp). Tu ne prétends jamais avoir envoyé quoi que ce soit, tu n'inventes jamais de prix (utilise celui fourni), tu ne décides rien à sa place.
Ton : vouvoiement, première personne (je = Annie), chaleureux et gourmand, sans jargon technique.
{Signature à utiliser : « {signature} ». — si définie}
{Consignes d'Annie (à respecter absolument) : {consignes} — si définies}
Réponds UNIQUEMENT avec le message prêt à envoyer — sauf si Annie te pose une question.

[user]
{briefing structuré de la commande : contact, occasion, date, parts, thème, prix, acompte, mode de remise…}
{+ photos d'inspiration en images}
{+ historique de la conversation assistant}
{+ message d'Annie, ou « propose une autre version » en cas de régénération}`,
  },
  {
    kind: "assistant.consignes",
    label: "Assistant — proposition de consignes (Réglages)",
    where: "lib/assistant.ts (generateConsignes)",
    template: `[user]
{demande de rédiger une base de consignes personnalisées pour l'assistant d'une cake designer — bouton « Proposer » des Réglages}`,
  },
  {
    kind: "capture.tri",
    label: "Capture — tri d'une image entrante (reçu / conversation)",
    where: "lib/gemini.ts (classifyInbound)",
    template: `[user]
Classifie cette image. Réponds par UN SEUL mot :
RECU — ticket de caisse, facture, justificatif d'achat
CONV — capture d'écran d'une conversation de messagerie ou export de discussion
AUTRE — tout le reste
{+ l'image}`,
  },
  {
    kind: "capture.analyse",
    label: "Capture — extraction d'une demande depuis une conversation",
    where: "lib/gemini.ts (CONV_PROMPT + analyzeConversation)",
    template: `[system]
Tu assistes une pâtissière artisanale suisse (cake design, région Lausanne).
On te donne une conversation avec une cliente : captures d'écran (dans l'ordre) ou export texte.
Les messages de la pâtissière sont alignés à droite ou signés « Annie / Maman Gâteau ».
Extrais la demande de gâteau. Nous sommes le {date du jour}. Réponds UNIQUEMENT avec cet objet JSON :
{ is_request, channel, contact_name, contact_phone, instagram, celebrant, celebrant_age, occasion, event_date, event_time, handover_time, event_place, parts, flavors, theme, delivery_mode, delivery_address, price_quoted, deposit_mentioned, referred_by, summary }
N'invente RIEN : null quand l'information n'apparaît pas.

[user]
{les captures d'écran / l'export de la conversation}`,
  },
  {
    kind: "recu.ocr",
    label: "Compta — lecture d'un justificatif d'achat",
    where: "lib/gemini.ts (PROMPT + analyzeReceipt)",
    template: `[user]
Tu analyses un justificatif d'achat suisse (ticket de caisse, facture en ligne, PDF) pour la comptabilité d'une pâtissière artisanale (cake design).
Extrais et réponds UNIQUEMENT avec un objet JSON :
{ merchant, date (YYYY-MM-DD|null), total_chf, vat[{rate, amount_chf}], category (MATIERES_PREMIERES|EMBALLAGE|MATERIEL|DEPLACEMENT|MARKETING|AUTRE) }
{+ l'image du justificatif}`,
  },
];
