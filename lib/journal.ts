/* ---------------------------------------------------------------------------
   Journal — pages SEO du site vitrine, pilotées depuis Carnet.
   Principe : suggéré partout (Gemini), validé toujours (Annie).
   Publication : directe ou programmée (cron) → webhook de revalidation
   vers le site (ISR), signé avec HOOK_SECRET (déjà partagé).
--------------------------------------------------------------------------- */

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { geminiGenerate, type GeminiPart } from "@/lib/gemini";
import type { JournalCategory, JournalType, Tenant } from "@prisma/client";
import { TEMPLATE_META, type TemplateKey } from "@/lib/journal-templates";

export type JournalImage = { assetId: string; alt: string };

export { TEMPLATE_META, inferTemplate } from "@/lib/journal-templates";

export const JOURNAL_CATEGORIES: { id: JournalCategory; label: string }[] = [
  { id: "ANNIVERSAIRE", label: "Anniversaire" },
  { id: "MARIAGE", label: "Mariage" },
  { id: "CUPCAKES", label: "Cupcakes" },
  { id: "CONSEILS", label: "Conseils" },
  { id: "ATELIER", label: "Atelier" },
];

/* ------------------------------------------------------------- slugs */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/** Slug libre ? (unicité par tenant, hors entrée en cours d'édition) */
export async function slugFree(tenantId: string, slug: string, excludeId?: string): Promise<boolean> {
  if (!slug) return false;
  const hit = await prisma.journalEntry.findFirst({
    where: { tenantId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return !hit;
}

export async function publicUrl(tenantId: string, slug: string): Promise<string | null> {
  const s = await getSettings(tenantId);
  return s.siteUrl ? `${s.siteUrl}/${s.sitePathPrefix}/${slug}` : null;
}

/* ------------------------------------------------- suggestions Gemini */

type EntrySuggestion = {
  title: string;
  slug: string;
  category: JournalCategory;
  metaTitle: string;
  metaDescription: string;
  altIdeas: string[];
};

/** Brief compact d'une commande — uniquement des faits non sensibles (jamais de nom de famille, téléphone, adresse exacte). */
async function orderBrief(tenantId: string, orderId: string): Promise<string | null> {
  const o = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { contact: true } });
  if (!o) return null;
  const city = o.deliveryAddress.match(/\b(1[0-9]{3})\s+([A-Za-zÀ-ÿ' -]+)/)?.[2]?.trim();
  return [
    `Occasion : ${o.occasion || "?"}`,
    o.celebrantAge ? `Âge fêté : ${o.celebrantAge} ans` : null,
    o.parts ? `Parts : ${o.parts}` : null,
    o.tiers ? `Étages : ${o.tiers}` : null,
    o.biscuit ? `Biscuit : ${o.biscuit}` : null,
    o.fourrages.length ? `Fourrages : ${o.fourrages.join(", ")}` : null,
    o.themeNote ? `Thème : ${o.themeNote}` : null,
    o.deliveryMode === "livraison" && city ? `Commune de livraison : ${city}` : null,
    o.eventDate ? `Mois : ${o.eventDate.toLocaleDateString("fr-CH", { month: "long", year: "numeric" })}` : null,
  ].filter(Boolean).join("\n");
}

/** Graine principale (phrase complète) depuis les champs structurés — jamais d'IA ici. */
export async function seedPhrase(
  tenantId: string,
  input: { type: JournalType; orderId?: string | null; subject?: string }
): Promise<{ main: string; theme: string; occasion: string } | null> {
  const sing = (w: string) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w);
  if (input.type === "ARTICLE") {
    const s = (input.subject ?? "").trim().toLowerCase();
    if (!s) return null;
    return { main: /gateau|gâteau|cake/.test(s) ? s : `gâteau ${s}`, theme: "", occasion: "anniversaire" };
  }
  const o = input.orderId ? await prisma.order.findFirst({ where: { id: input.orderId, tenantId } }) : null;
  if (!o) return null;
  const occasion = (o.occasion || "").toLowerCase().includes("mariage") ? "mariage" : "anniversaire";
  const theme = sing(
    o.themeNote.split(/[,·+/]| et /)[0]?.trim().toLowerCase().split(" ").map(sing).join(" ") ?? ""
  );
  return { main: theme ? `gâteau ${occasion} ${theme}` : `gâteau ${occasion}`, theme, occasion };
}

const SUGGEST_SYSTEM = `Tu es le rédacteur SEO d'une cake designer artisanale à Pully (région Lausanne, Vaud, Suisse — zone : Lausanne, Pully, Lutry, Vevey, Montreux, Morges).
Tu prépares la fiche d'une page de son site (journal des créations + articles conseils).
Objectif : longue traîne locale (ex. « gâteau anniversaire licorne Lausanne », « combien de parts gâteau 25 invités »).
Règles strictes : n'invente AUCUN fait (ni prix, ni prénom, ni détail absent du brief). Français de Suisse romande. Pas de superlatifs creux.`;

function extractJsonLoose(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

type KeywordGroups = { short: string[]; mid: string[]; long: string[] };

/** Mots-clés en trois traînes (Gemini, depuis le brief) — l'humain choisit. */
export async function suggestKeywords(
  tenantId: string,
  input: { type: JournalType; orderId?: string | null; subject?: string }
): Promise<KeywordGroups | { error: string }> {
  const brief = input.orderId ? await orderBrief(tenantId, input.orderId) : null;
  if (input.type === "CREATION" && !brief) return { error: "Commande introuvable." };
  const out = await geminiGenerate({
    system: SUGGEST_SYSTEM,
    contents: [{
      role: "user",
      parts: [{
        text: `${input.type === "CREATION" ? `Propose des mots-clés de recherche Google pour la page d'une création livrée. Brief factuel :\n${brief}` : `Propose des mots-clés de recherche Google pour un article conseil sur : « ${input.subject ?? "" } »`}

Trois groupes, 4 propositions PAR groupe (12 en tout), du plus court au plus précis :
- "short" (courte traîne, 2 mots) : le produit + un attribut fort — ex. « gâteau licorne », « gâteau 4 ans »
- "mid" (moyenne traîne, 3 mots) : + l'occasion OU une ville — ex. « gâteau anniversaire licorne », « gâteau anniversaire montreux »
- "long" (longue traîne, 4 mots et plus) : occasion + thème + ville ou attribut — ex. « gâteau anniversaire licorne lausanne »

Règles : français irréprochable AVEC accents, minuscules, aucun doublon entre groupes, uniquement des requêtes qu'une vraie cliente taperait (jamais « recette », « coloriage », « facile » — elles cherchent à COMMANDER). Villes de la zone : Lausanne, Pully, Vevey, Montreux, Morges.
Réponds UNIQUEMENT avec ce JSON : {"short": ["…"], "mid": ["…"], "long": ["…"]}`,
      }],
    }],
    temperature: 0.4,
    maxOutputTokens: 2048,
    kind: "journal.keywords",
  });
  if (!out) return { error: "Gemini indisponible — réessaie dans un instant." };
  const j = extractJsonLoose(out);
  if (!j) return { error: "Réponse IA illisible — réessaie." };
  const grp = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().toLowerCase().slice(0, 60)).slice(0, 4) : [];
  return { short: grp(j.short), mid: grp(j.mid), long: grp(j.long) };
}

export async function suggestEntry(
  tenantId: string,
  input: { type: JournalType; orderId?: string | null; subject?: string; keywords?: string[] }
): Promise<EntrySuggestion | { error: string }> {
  const brief = input.orderId ? await orderBrief(tenantId, input.orderId) : null;
  if (input.type === "CREATION" && !brief) return { error: "Commande introuvable." };
  const existing = await prisma.journalEntry.findMany({ where: { tenantId }, select: { slug: true }, take: 300 });
  const cats = JOURNAL_CATEGORIES.map((c) => c.id).join(" | ");

  const out = await geminiGenerate({
    system: SUGGEST_SYSTEM,
    contents: [{
      role: "user",
      parts: [{
        text: `${input.type === "CREATION" ? `Nouvelle page « création » à partir de cette commande livrée :\n${brief}` : `Nouvel article conseil sur le sujet : « ${input.subject ?? "" } »`}

Slugs déjà pris (ta proposition doit être DIFFÉRENTE et se différencier par un angle réel — âge, thème précis, commune — jamais par un numéro) :
${existing.map((e) => e.slug).join(", ") || "(aucun)"}
${input.keywords?.length ? `\nMots-clés déjà choisis pour cette page (le titre et les métas doivent leur être cohérents, sans les insérer tels quels) : ${input.keywords.join(", ")}` : ""}

Réponds UNIQUEMENT avec cet objet JSON :
{
  "title": "titre H1 naturel et précis (max 70 caractères)",
  "slug": "slug-court-mots-cles (minuscules, tirets, inclut la localité si pertinente)",
  "category": "${cats}",
  "meta_title": "balise title (max 60 caractères, mot-clé principal au début)",
  "meta_description": "meta description engageante (max 155 caractères, avec un appel à l'action)",
  "alt_ideas": ["6 textes alternatifs d'images, descriptifs et factuels, basés sur le brief"]
}`,
      }],
    }],
    temperature: 0.4,
    maxOutputTokens: 4096,
    kind: "journal.suggestion",
  });
  if (!out) return { error: "Gemini indisponible — réessaie dans un instant." };
  const j = extractJsonLoose(out);
  if (!j) return { error: "Réponse IA illisible — réessaie." };
  const catIds = JOURNAL_CATEGORIES.map((c) => c.id) as string[];
  const arr = (v: unknown, max: number, len: number) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().slice(0, len)).slice(0, max) : [];
  let slug = slugify(String(j.slug ?? j.title ?? ""));
  // collision malgré la consigne → on ne suffixe JAMAIS un numéro : on laisse vide, le parcours demandera un angle.
  if (!(await slugFree(tenantId, slug))) slug = "";
  return {
    title: String(j.title ?? "").trim().slice(0, 90),
    slug,
    category: (catIds.includes(String(j.category)) ? String(j.category) : input.type === "ARTICLE" ? "CONSEILS" : "ANNIVERSAIRE") as JournalCategory,
    metaTitle: String(j.meta_title ?? "").trim().slice(0, 70),
    metaDescription: String(j.meta_description ?? "").trim().slice(0, 170),
    altIdeas: arr(j.alt_ideas, 8, 120),
  };
}

export async function suggestStory(
  tenantId: string,
  input: {
    template: TemplateKey;
    orderId?: string | null;
    subject?: string;
    title: string;
    keywords: string[];
    coverAlt?: string;
    /** photos du corps de l'article (hors couverture), dans l'ordre choisi */
    photos?: { assetId: string; alt: string }[];
  }
): Promise<string | { error: string }> {
  const brief = input.orderId ? await orderBrief(tenantId, input.orderId) : null;
  // marqueurs de photos DANS le texte : seulement les formats « article illustré »
  const withMarkers = input.template === "RECIT" || input.template === "GUIDE";
  const bodyPhotos = withMarkers ? (input.photos ?? []) : [];

  // Gemini VOIT les photos (vignettes) : placement [[photo:N]] + descriptions réelles
  const parts: GeminiPart[] = [];
  const photosBlock = bodyPhotos.length
    ? `

Les photos ci-jointes iront DANS l'article. Insère chacune à l'endroit du récit qui s'y rapporte, sur une ligne seule :
- [[photo:N]] pleine largeur (vue d'ensemble, format paysage) · [[photo:N|left]] ou [[photo:N|right]] flottante, le texte l'habille (portrait, gros plan) — varie les dispositions, jamais deux flottantes d'affilée ;
- le marqueur est SEUL sur sa ligne, avec une ligne vide avant et après (jamais collé à un paragraphe) ;
- chaque photo au plus une fois, n'invente aucun numéro ;
- la photo de couverture est déjà en tête de page — ne l'insère pas${input.coverAlt ? ` (elle montre : « ${input.coverAlt} »)` : ""} ;
- le paragraphe voisin d'une photo doit parler de ce qu'elle montre : décris ce que tu VOIS (couleurs, matières, détails de modelage réels).`
    : "";

  const brief0 = brief ?? "(aucun)";
  const consigne =
    input.template === "RECIT" ? `Récit d'une création réalisée. Brief factuel :\n${brief0}\n\n2-4 paragraphes, 220-380 mots, 2-3 intertitres "## " spécifiques.`
    : input.template === "GALERIE" ? `La page présente une GALERIE de photos d'une création. Brief factuel :\n${brief0}\n\nIntroduction brève : 60-120 mots, 1 paragraphe, aucun intertitre.`
    : input.template === "GUIDE" ? `Article conseil pratique sur : « ${input.subject ?? input.title} ». Intro courte puis sections concrètes, 350-550 mots, 2-3 intertitres "## ". Repères chiffrés uniquement s'ils sont universellement vrais.`
    : /* ANNONCE */ `Billet / annonce sur : « ${input.subject ?? input.title} ». Ton éditorial et personnel — Annie s'exprime à la première personne (annonce d'un nouveau gâteau signature, prise de parole, réflexion sur son métier). 150-300 mots, 1-3 paragraphes, au plus UN intertitre "## ". Chaleureux, sincère, sans jargon.`;
  parts.push({
    text: `Écris le corps de la page en MARKDOWN (pas de H1 — le titre existe déjà : « ${input.title} »).
${consigne}
Contexte de ciblage — DÉJÀ couvert par le titre, l'adresse et les métadonnées de la page, n'en force AUCUN dans le texte : ${input.keywords.join(", ") || "(libre)"}.${photosBlock}

Intertitres génériques interdits (« Des saveurs artisanales », « Un moment magique », « Une création unique »).

Règles d'écriture impératives :
- N'insère JAMAIS un mot-clé ou une requête telle quelle : français irréprochable, accents, formulations variées. Google comprend les variantes — le bourrage de mots-clés est interdit et contre-productif.
- La localité (Pully, Lausanne, Vaud…) apparaît AU MAXIMUM UNE fois dans tout le corps, jamais accolée à un nom de produit (« gâteau licorne à Pully » en milieu de phrase : interdit). Si elle ne s'insère pas naturellement, ne l'insère pas.
- N'ouvre pas par la date (« En ce mois de février… ») — mentionne l'époque seulement si elle apporte quelque chose au récit.
- Ne précise JAMAIS l'origine ou l'appellation d'un ingrédient (« de Madagascar », une marque…) si le brief ne la donne pas.
- Une liste à puces est autorisée quand elle sert vraiment le propos (saveurs, étapes) — au plus une.
- ==mot== surligne un mot au marqueur rose : au plus 2 fois dans l'article, dont éventuellement UN seul mot d'un intertitre.
- Si (et seulement si) une info pratique a une vraie valeur (conservation, délai, astuce), UN encadré : une ligne « > **Bon à savoir** — … » (ou « > **Le savais-tu ?** — … »), 1-2 phrases.
- Le gras (**) : au plus une fois, pour un vrai moment du récit — jamais pour un mot-clé.
- Raconte du CONCRET tiré du brief et des photos : le prénom écrit sur le gâteau s'il y figure, les couleurs réelles, un détail de modelage ou de matière. Rien d'invérifiable.
- Tournures interdites : « occasion spéciale », « moment magique », « donner vie », « pièce unique », « idéal pour », « garantissant », « faire la part belle », « sublimer », « émerveiller petits et grands », « respecte l'imaginaire ».
- Voix : Annie, artisane — première personne discrète (« j'ai modelé… »), phrases courtes, chaleur sans emphase ni jargon marketing.
Termine par UNE phrase d'appel à l'action vers le devis en ligne (sans lien — il sera ajouté par le site).
Aucun prix, aucun nom de famille, pas de tutoiement.`,
  });

  if (bodyPhotos.length) {
    const assets = await prisma.studioAsset.findMany({
      where: { tenantId, id: { in: bodyPhotos.map((p) => p.assetId) } },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    const { readAssetFile } = await import("@/lib/studio/storage");
    for (const [i, p] of bodyPhotos.entries()) {
      const a = byId.get(p.assetId);
      if (!a) continue;
      const buf = await readAssetFile(tenantId, a.thumbPath || a.filePath);
      if (buf) {
        parts.push(
          { text: `Photo ${i + 1} — « ${p.alt || "sans description"} » :` },
          { inline_data: { mime_type: "image/webp", data: buf.toString("base64") } }
        );
      }
    }
  }

  const out = await geminiGenerate({
    system: SUGGEST_SYSTEM,
    // GEMINI_STORY_MODEL (optionnel) : un modèle supérieur pour la seule plume du récit
    model: process.env.GEMINI_STORY_MODEL || undefined,
    contents: [{ role: "user", parts }],
    temperature: 0.6,
    maxOutputTokens: 8192,
    kind: "journal.recit",
  });
  return out?.trim() || { error: "Gemini indisponible — réessaie dans un instant." };
}

/** Descriptions (alt) des photos sélectionnées — Gemini regarde les vignettes. */
export async function suggestAlts(
  tenantId: string,
  assetIds: string[]
): Promise<Record<string, string> | { error: string }> {
  if (!assetIds.length) return {};
  const assets = await prisma.studioAsset.findMany({ where: { tenantId, id: { in: assetIds } } });
  const byId = new Map(assets.map((a) => [a.id, a]));
  const { readAssetFile } = await import("@/lib/studio/storage");
  const parts: GeminiPart[] = [{
    text: `Pour chaque photo ci-jointe (numérotées), écris un texte alternatif pour Google Images : factuel, descriptif, 6-14 mots, français avec accents, sans point final, sans « photo de ». Décris ce que tu VOIS (sujet, couleurs, matières). Réponds UNIQUEMENT en JSON : {"alts": ["…", "…"]} dans l'ordre des photos.`,
  }];
  const ordered: string[] = [];
  for (const id of assetIds) {
    const a = byId.get(id);
    if (!a) continue;
    const buf = await readAssetFile(tenantId, a.thumbPath || a.filePath);
    if (!buf) continue;
    ordered.push(id);
    parts.push({ text: `Photo ${ordered.length} :` }, { inline_data: { mime_type: "image/webp", data: buf.toString("base64") } });
  }
  if (!ordered.length) return { error: "Photos illisibles." };
  const out = await geminiGenerate({
    contents: [{ role: "user", parts }],
    temperature: 0.3,
    maxOutputTokens: 4096,
    kind: "journal.alts",
  });
  if (!out) return { error: "Gemini indisponible — réessaie dans un instant." };
  const j = extractJsonLoose(out);
  const arr = Array.isArray(j?.alts) ? (j!.alts as unknown[]).map((x) => String(x).trim().slice(0, 140)) : [];
  if (!arr.length) return { error: "Réponse IA illisible — réessaie." };
  const res: Record<string, string> = {};
  ordered.forEach((id, i) => { if (arr[i]) res[id] = arr[i]; });
  return res;
}

/* ------------------------------------------------- publication + site */

/** Prévient le site (ISR) — best effort, signé avec le HOOK_SECRET partagé. */
export async function revalidateSite(tenantId: string, slugs: string[]): Promise<boolean> {
  const s = await getSettings(tenantId);
  const secret = process.env.HOOK_SECRET;
  if (!s.siteUrl || !secret) return false;
  try {
    const res = await fetch(`${s.siteUrl}/api/revalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hook-secret": secret },
      body: JSON.stringify({ slugs }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch (e) {
    console.error("journal revalidate:", e);
    return false;
  }
}

export async function publishEntry(tenantId: string, id: string): Promise<{ error?: string; url?: string | null }> {
  const e = await prisma.journalEntry.findFirst({ where: { id, tenantId } });
  if (!e) return { error: "Page introuvable." };
  if (!e.title || !e.slug || !e.story) return { error: "Titre, adresse et récit sont requis avant publication." };
  if (e.format === "VIDEO" && !e.videoAssetId) return { error: "Choisis le clip principal avant de publier une page vidéo." };
  await prisma.journalEntry.update({
    where: { id },
    data: { status: "PUBLIEE", publishedAt: e.publishedAt ?? new Date(), scheduledFor: null },
  });
  await revalidateSite(tenantId, [e.slug]);
  return { url: await publicUrl(tenantId, e.slug) };
}

/** Cron : publie les pages programmées échues. Notifie Telegram. */
export async function runJournalPublisher(t: Tenant, dryRun = false): Promise<number> {
  const due = await prisma.journalEntry.findMany({
    where: { tenantId: t.id, status: "PROGRAMMEE", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: 10,
  });
  if (dryRun) {
    const { notifyAll } = await import("@/lib/telegram");
    const next = await prisma.journalEntry.findFirst({
      where: { tenantId: t.id, status: "PROGRAMMEE" },
      orderBy: { scheduledFor: "asc" },
    });
    await notifyAll(
      due.length
        ? `🧪 📰 ${due.length} page(s) seraient publiées maintenant : ${due.map((d) => d.title || d.slug).join(" · ")}`
        : next?.scheduledFor
          ? `🧪 📰 Rien d'échu. Prochaine page programmée : « ${next.title || next.slug} » le ${next.scheduledFor.toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" })}.`
          : "🧪 📰 Aucune page programmée pour l'instant."
    );
    return due.length;
  }
  for (const e of due) {
    const r = await publishEntry(t.id, e.id);
    const { notifyAll } = await import("@/lib/telegram");
    if (r.error) {
      // incomplète (ex. récit vidé après programmation) → on repasse en brouillon plutôt que de boucler
      await prisma.journalEntry.update({ where: { id: e.id }, data: { status: "BROUILLON", scheduledFor: null } });
      await notifyAll(`📰 ⚠️ « ${e.title || e.slug} » n'a pas pu être publiée (${r.error}) — repassée en brouillon.`);
    } else {
      await notifyAll(`📰 Page publiée : <b>${e.title || e.slug}</b>${r.url ? `\n${r.url}` : ""}`);
    }
  }
  return due.length;
}

/* ------------------------------------------------- lecture publique */

/** IDs d'assets utilisés par des pages publiées (protection purge + service média public). */
export async function publishedAssetIds(tenantId: string): Promise<Set<string>> {
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId, status: "PUBLIEE" },
    select: { coverAssetId: true, videoAssetId: true, images: true },
  });
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.coverAssetId) ids.add(e.coverAssetId);
    if (e.videoAssetId) ids.add(e.videoAssetId);
    for (const im of (e.images as JournalImage[] | null) ?? []) if (im?.assetId) ids.add(im.assetId);
  }
  return ids;
}

/** IDs d'assets utilisés par n'importe quelle page (même brouillon) — protège purge et suppression. */
export async function journalAssetIds(tenantId: string): Promise<Set<string>> {
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId },
    select: { coverAssetId: true, videoAssetId: true, images: true },
  });
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.coverAssetId) ids.add(e.coverAssetId);
    if (e.videoAssetId) ids.add(e.videoAssetId);
    for (const im of (e.images as JournalImage[] | null) ?? []) if (im?.assetId) ids.add(im.assetId);
  }
  return ids;
}
