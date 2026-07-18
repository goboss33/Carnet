/* ---------------------------------------------------------------------------
   Journal — pages SEO du site vitrine, pilotées depuis Carnet.
   Principe : suggéré partout (Gemini), validé toujours (Annie).
   Publication : directe ou programmée (cron) → webhook de revalidation
   vers le site (ISR), signé avec HOOK_SECRET (déjà partagé).
--------------------------------------------------------------------------- */

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { geminiGenerate } from "@/lib/gemini";
import type { JournalCategory, JournalType, Tenant } from "@prisma/client";

export type JournalImage = { assetId: string; alt: string };

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
  keywords: string[];
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
    o.style ? `Style : ${o.style}` : null,
    o.themeNote ? `Thème : ${o.themeNote}` : null,
    o.deliveryMode === "livraison" && city ? `Commune de livraison : ${city}` : null,
    o.eventDate ? `Mois : ${o.eventDate.toLocaleDateString("fr-CH", { month: "long", year: "numeric" })}` : null,
  ].filter(Boolean).join("\n");
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

export async function suggestEntry(
  tenantId: string,
  input: { type: JournalType; orderId?: string | null; subject?: string }
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

Réponds UNIQUEMENT avec cet objet JSON :
{
  "title": "titre H1 naturel et précis (max 70 caractères)",
  "slug": "slug-court-mots-cles (minuscules, tirets, inclut la localité si pertinente)",
  "category": "${cats}",
  "keywords": ["3 à 5 requêtes longue traîne visées"],
  "meta_title": "balise title (max 60 caractères, mot-clé principal au début)",
  "meta_description": "meta description engageante (max 155 caractères, avec un appel à l'action)",
  "alt_ideas": ["6 textes alternatifs d'images, descriptifs et factuels, basés sur le brief"]
}`,
      }],
    }],
    temperature: 0.4,
    maxOutputTokens: 4096,
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
    keywords: arr(j.keywords, 5, 80),
    metaTitle: String(j.meta_title ?? "").trim().slice(0, 70),
    metaDescription: String(j.meta_description ?? "").trim().slice(0, 170),
    altIdeas: arr(j.alt_ideas, 8, 120),
  };
}

export async function suggestStory(
  tenantId: string,
  input: { type: JournalType; orderId?: string | null; subject?: string; title: string; keywords: string[] }
): Promise<string | { error: string }> {
  const brief = input.orderId ? await orderBrief(tenantId, input.orderId) : null;
  const out = await geminiGenerate({
    system: SUGGEST_SYSTEM,
    contents: [{
      role: "user",
      parts: [{
        text: `Écris le corps de la page en MARKDOWN (pas de H1 — le titre existe déjà : « ${input.title} »).
${input.type === "CREATION"
  ? `C'est le récit d'une création réalisée. Brief factuel :\n${brief ?? "(aucun)"}\n\nStructure : 2-3 courts paragraphes de récit (la demande, les choix de design, les saveurs), un sous-titre "## " si utile. 250-400 mots.`
  : `C'est un article conseil pratique sur : « ${input.subject ?? input.title} ». Structure : intro courte, 2-4 sections "## " concrètes, 350-550 mots. Donne de vrais repères chiffrés uniquement s'ils sont universellement vrais (ex. nombre de parts par taille standard).`}
Mots-clés à placer NATURELLEMENT (jamais en liste) : ${input.keywords.join(", ") || "(libres)"}
Termine par UNE phrase d'appel à l'action vers le devis en ligne (sans lien — il sera ajouté par le site).
Rappel : aucun fait inventé, aucun prix, aucun nom de famille. Tutoiement interdit — la page s'adresse aux visiteurs.`,
      }],
    }],
    temperature: 0.6,
    maxOutputTokens: 8192,
  });
  return out?.trim() || { error: "Gemini indisponible — réessaie dans un instant." };
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
    select: { coverAssetId: true, images: true },
  });
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.coverAssetId) ids.add(e.coverAssetId);
    for (const im of (e.images as JournalImage[] | null) ?? []) if (im?.assetId) ids.add(im.assetId);
  }
  return ids;
}

/** IDs d'assets utilisés par n'importe quelle page (même brouillon) — protège purge et suppression. */
export async function journalAssetIds(tenantId: string): Promise<Set<string>> {
  const entries = await prisma.journalEntry.findMany({
    where: { tenantId },
    select: { coverAssetId: true, images: true },
  });
  const ids = new Set<string>();
  for (const e of entries) {
    if (e.coverAssetId) ids.add(e.coverAssetId);
    for (const im of (e.images as JournalImage[] | null) ?? []) if (im?.assetId) ids.add(im.assetId);
  }
  return ids;
}
