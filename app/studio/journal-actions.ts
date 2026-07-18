"use server";

/* Journal — server actions du parcours « Pages du site ». */

import { revalidatePath } from "next/cache";
import { prisma, currentTenant } from "@/lib/db";
import {
  slugify, slugFree, suggestEntry, suggestStory, publishEntry, revalidateSite, publicUrl,
  type JournalImage,
} from "@/lib/journal";
import type { JournalCategory, JournalFormat, JournalType } from "@prisma/client";

export async function suggestEntryAction(input: { type: JournalType; orderId?: string | null; subject?: string; keywords?: string[] }) {
  const tenant = await currentTenant();
  return suggestEntry(tenant.id, input);
}

export async function findKeywordsAction(input: { type: JournalType; orderId?: string | null; subject?: string }) {
  const tenant = await currentTenant();
  const { dfsEnabled, keywordIdeas } = await import("@/lib/dataforseo");
  if (!dfsEnabled()) return { error: "DataForSEO n'est pas configuré (DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD dans Portainer)." };
  const { seedKeywords } = await import("@/lib/journal");
  const seeds = await seedKeywords(tenant.id, input);
  if (!seeds.length) return { error: input.type === "CREATION" ? "Choisis d'abord la commande source." : "Écris d'abord le sujet de l'article." };
  const ideas = await keywordIdeas(seeds);
  if (!ideas) return { error: "DataForSEO ne répond pas — réessaie dans un instant." };
  return { ideas };
}

export async function suggestStoryAction(input: { type: JournalType; format?: JournalFormat; orderId?: string | null; subject?: string; title: string; keywords: string[]; coverAlt?: string; photos?: { assetId: string; alt: string }[] }) {
  const tenant = await currentTenant();
  return suggestStory(tenant.id, input);
}

export async function suggestAltsAction(assetIds: string[]) {
  const tenant = await currentTenant();
  const { suggestAlts } = await import("@/lib/journal");
  return suggestAlts(tenant.id, assetIds);
}

export async function checkSlugAction(slug: string, excludeId?: string): Promise<{ slug: string; free: boolean }> {
  const tenant = await currentTenant();
  const clean = slugify(slug);
  return { slug: clean, free: await slugFree(tenant.id, clean, excludeId) };
}

export type JournalPayload = {
  id?: string;
  type: JournalType;
  format: JournalFormat;
  videoAssetId: string;
  youtubeUrl: string;
  orderId?: string | null;
  title: string;
  slug: string;
  category: JournalCategory;
  keywords: string[];
  story: string;
  coverAssetId: string;
  images: JournalImage[];
  metaTitle: string;
  metaDescription: string;
  publishMode: "draft" | "now" | "schedule";
  scheduledFor?: string | null; // ISO local
};

export async function saveJournalEntry(p: JournalPayload): Promise<{ error?: string; id?: string; url?: string | null }> {
  const tenant = await currentTenant();
  const existing = p.id ? await prisma.journalEntry.findFirst({ where: { id: p.id, tenantId: tenant.id } }) : null;
  if (p.id && !existing) return { error: "Page introuvable." };

  const title = p.title.trim().slice(0, 90);
  if (!title) return { error: "Le titre est requis." };
  const images = (p.images ?? []).filter((i) => i?.assetId).map((i) => ({ assetId: i.assetId, alt: (i.alt ?? "").trim().slice(0, 140) })).slice(0, 12);
  const coverAssetId = p.coverAssetId && images.some((i) => i.assetId === p.coverAssetId) ? p.coverAssetId : (images[0]?.assetId ?? "");

  // slug : figé une fois publiée (une adresse indexée ne bouge plus)
  let slug = existing?.status === "PUBLIEE" ? existing.slug : slugify(p.slug || title);
  if (!slug) return { error: "L'adresse (slug) est requise." };
  if (existing?.status !== "PUBLIEE" && !(await slugFree(tenant.id, slug, existing?.id))) {
    return { error: `L'adresse « ${slug} » est déjà prise — différencie-la par un angle réel (âge, thème, commune), jamais par un numéro.` };
  }

  const base = {
    type: p.type,
    format: p.format,
    videoAssetId: p.format === "VIDEO" ? p.videoAssetId : "",
    youtubeUrl: p.format === "VIDEO" ? p.youtubeUrl.trim().slice(0, 200) : "",
    orderId: p.type === "CREATION" ? (p.orderId || null) : null,
    title,
    slug,
    category: p.category,
    keywords: (p.keywords ?? []).map((k) => k.trim()).filter(Boolean).slice(0, 6),
    story: p.story ?? "",
    coverAssetId,
    images,
    metaTitle: p.metaTitle.trim().slice(0, 70),
    metaDescription: p.metaDescription.trim().slice(0, 170),
  };

  let id = existing?.id;
  if (existing) {
    await prisma.journalEntry.update({ where: { id: existing.id }, data: base });
  } else {
    const created = await prisma.journalEntry.create({ data: { ...base, tenantId: tenant.id } });
    id = created.id;
  }

  let url: string | null = null;
  if (existing?.status === "PUBLIEE") {
    // page en ligne modifiée → le site se met à jour
    await revalidateSite(tenant.id, [slug]);
    url = await publicUrl(tenant.id, slug);
  } else if (p.publishMode === "now") {
    const r = await publishEntry(tenant.id, id!);
    if (r.error) return { error: r.error, id };
    url = r.url ?? null;
  } else if (p.publishMode === "schedule") {
    const when = p.scheduledFor ? new Date(p.scheduledFor) : null;
    if (!when || isNaN(when.getTime())) return { error: "Choisis la date et l'heure de publication.", id };
    if (when.getTime() < Date.now() - 60000) return { error: "La date de publication est déjà passée.", id };
    await prisma.journalEntry.update({ where: { id: id! }, data: { status: "PROGRAMMEE", scheduledFor: when } });
  } else {
    await prisma.journalEntry.update({ where: { id: id! }, data: { status: "BROUILLON", scheduledFor: null } });
  }

  revalidatePath("/studio");
  return { id, url };
}

export async function unpublishJournalEntry(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const e = await prisma.journalEntry.findFirst({ where: { id, tenantId: tenant.id } });
  if (!e) return { error: "Page introuvable." };
  await prisma.journalEntry.update({ where: { id }, data: { status: "BROUILLON", scheduledFor: null } });
  if (e.status === "PUBLIEE") await revalidateSite(tenant.id, [e.slug]);
  revalidatePath("/studio");
  return {};
}

export async function deleteJournalEntry(id: string): Promise<{ error?: string }> {
  const tenant = await currentTenant();
  const e = await prisma.journalEntry.findFirst({ where: { id, tenantId: tenant.id } });
  if (!e) return { error: "Page introuvable." };
  await prisma.journalEntry.delete({ where: { id } });
  if (e.status === "PUBLIEE") await revalidateSite(tenant.id, [e.slug]);
  revalidatePath("/studio");
  return {};
}
