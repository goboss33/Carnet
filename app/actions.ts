"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, currentTenant } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { NEXT_STATUS } from "@/lib/statuts";
import type { OrderStatus, Source } from "@prisma/client";

/* ------------------------------------------------------------ auth */

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return { error: "Mot de passe incorrect." };
  }
  await createSession();
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/* ------------------------------------------------------- commandes */

const leadSchema = z.object({
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  instagram: z.string().default(""),
  source: z.enum(["CONFIGURATEUR", "WHATSAPP", "INSTAGRAM", "TELEPHONE", "AUTRE"]).default("AUTRE"),
  occasion: z.string().default(""),
  eventDate: z.string().default(""),
  parts: z.coerce.number().int().positive().optional(),
  priceQuoted: z.coerce.number().int().positive().optional(),
  notes: z.string().default(""),
});

export async function createLead(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const d = parsed.data;
  const tenant = await currentTenant();

  // Réutilise le contact si tél ou e-mail déjà connus
  let contact =
    (d.phone && (await prisma.contact.findFirst({ where: { tenantId: tenant.id, phone: d.phone } }))) ||
    (d.email && (await prisma.contact.findFirst({ where: { tenantId: tenant.id, email: d.email } }))) ||
    null;

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        email: d.email,
        instagram: d.instagram,
        source: d.source as Source,
      },
    });
  }

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      source: d.source as Source,
      occasion: d.occasion,
      eventDate: d.eventDate ? new Date(d.eventDate) : null,
      parts: d.parts,
      priceQuoted: d.priceQuoted,
      notes: d.notes,
      activities: { create: { type: "SYSTEM", body: "Fiche créée depuis le back-office." } },
    },
  });

  revalidatePath("/");
  redirect(`/commandes/${order.id}`);
}

export async function advanceStatus(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const next = NEXT_STATUS[order.status];
  if (!next) return;
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: next,
      ...(next === "ACOMPTE_RECU" ? { depositPaidAt: new Date() } : {}),
      ...(next === "LIVRE" ? { deliveredAt: new Date() } : {}),
      activities: { create: { type: "STATUS", body: `Statut : ${order.status} → ${next}` } },
    },
  });
  revalidatePath("/");
  revalidatePath(`/commandes/${orderId}`);
}

export async function setStatus(orderId: string, status: OrderStatus) {
  await prisma.order.update({
    where: { id: orderId },
    data: { status, activities: { create: { type: "STATUS", body: `Statut → ${status}` } } },
  });
  revalidatePath("/");
  revalidatePath(`/commandes/${orderId}`);
}

const orderPatch = z.object({
  occasion: z.string().default(""),
  eventDate: z.string().default(""),
  celebrant: z.string().default(""),
  celebrantAge: z.coerce.number().int().optional(),
  parts: z.coerce.number().int().optional(),
  tiers: z.coerce.number().int().optional(),
  biscuit: z.string().default(""),
  style: z.string().default(""),
  themeNote: z.string().default(""),
  deliveryMode: z.string().default("retrait"),
  deliveryAddress: z.string().default(""),
  priceQuoted: z.coerce.number().int().optional(),
  notes: z.string().default(""),
});

export async function updateOrder(orderId: string, formData: FormData) {
  const d = orderPatch.parse(Object.fromEntries(formData));
  await prisma.order.update({
    where: { id: orderId },
    data: {
      occasion: d.occasion,
      eventDate: d.eventDate ? new Date(d.eventDate) : null,
      celebrant: d.celebrant,
      celebrantAge: d.celebrantAge ?? null,
      parts: d.parts ?? null,
      tiers: d.tiers ?? null,
      biscuit: d.biscuit,
      style: d.style,
      themeNote: d.themeNote,
      deliveryMode: d.deliveryMode,
      deliveryAddress: d.deliveryAddress,
      priceQuoted: d.priceQuoted ?? null,
      notes: d.notes,
    },
  });
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/");
}

export async function addNote(orderId: string, formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await prisma.activity.create({ data: { orderId, type: "NOTE", body } });
  revalidatePath(`/commandes/${orderId}`);
}

/* ------------------------------------------------------------- compta */

const expensePatch = z.object({
  date: z.string().default(""),
  merchant: z.string().default(""),
  totalChf: z.coerce.number().min(0).default(0),
  category: z.enum(["MATIERES_PREMIERES", "EMBALLAGE", "MATERIEL", "DEPLACEMENT", "MARKETING", "AUTRE"]).default("AUTRE"),
  notes: z.string().default(""),
});

export async function updateExpense(id: string, formData: FormData) {
  const d = expensePatch.parse(Object.fromEntries(formData));
  await prisma.expense.update({
    where: { id },
    data: {
      date: d.date ? new Date(d.date) : undefined,
      merchant: d.merchant,
      totalCents: Math.round(d.totalChf * 100),
      category: d.category,
      notes: d.notes,
      status: "CONFIRMED",
    },
  });
  revalidatePath("/compta");
}

export async function createExpense(formData: FormData) {
  const d = expensePatch.parse(Object.fromEntries(formData));
  const tenant = await currentTenant();
  await prisma.expense.create({
    data: {
      tenantId: tenant.id,
      status: "CONFIRMED",
      date: d.date ? new Date(d.date) : new Date(),
      merchant: d.merchant,
      totalCents: Math.round(d.totalChf * 100),
      category: d.category,
      notes: d.notes,
    },
  });
  revalidatePath("/compta");
}

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } }).catch(() => null);
  revalidatePath("/compta");
}

/* -------------------------------------------------------- partenaires */

const partnerSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  type: z.enum(["COMMERCE", "PHOTOGRAPHE", "WEDDING_PLANNER", "SALLE", "AUTRE"]).default("COMMERCE"),
  code: z.string().min(2, "Code requis (ex. BOUL-PULLY)"),
  ratePct: z.coerce.number().int().min(0).max(50).default(10),
  contact: z.string().default(""),
});

export async function createPartner(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = partnerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const d = parsed.data;
  const tenant = await currentTenant();
  const code = d.code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const exists = await prisma.partner.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } });
  if (exists) return { error: `Le code ${code} existe déjà.` };
  await prisma.partner.create({ data: { tenantId: tenant.id, name: d.name, type: d.type, code, ratePct: d.ratePct, contact: d.contact } });
  revalidatePath("/partenaires");
  return {};
}

export async function setOrderPartner(orderId: string, formData: FormData) {
  const partnerId = String(formData.get("partnerId") ?? "");
  await prisma.order.update({
    where: { id: orderId },
    data: {
      partnerId: partnerId || null,
      activities: { create: { type: "SYSTEM", body: partnerId ? "Rattachée à un partenaire." : "Détachée du partenaire." } },
    },
  });
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/partenaires");
}

export async function markCommissionPaid(orderId: string) {
  await prisma.order.update({ where: { id: orderId }, data: { commissionPaidAt: new Date() } });
  revalidatePath("/partenaires");
}

export async function purgeEmptyDrafts() {
  const tenant = await currentTenant();
  await prisma.expense.deleteMany({
    where: { tenantId: tenant.id, status: "DRAFT", receiptPath: "", totalCents: 0 },
  });
  revalidatePath("/compta");
}

/* ------------------------------------------------------------- import */

const STATUTS_IMPORT = ["LEAD", "DEVIS_ENVOYE", "ACOMPTE_RECU", "EN_PRODUCTION", "LIVRE", "ANNULE"] as const;

function parseFrDate(t: string): Date | null {
  const m = t.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
}

export async function importCsv(
  _prev: { report?: string; error?: string } | undefined,
  formData: FormData
): Promise<{ report?: string; error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choisis un fichier CSV." };
  if (file.size > 2_000_000) return { error: "Fichier trop lourd (max 2 Mo)." };

  const text = (await file.text()).replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "Le fichier semble vide (en-tête + au moins une ligne)." };

  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z_]/g, "");
  const header = lines[0].split(sep).map(norm);
  const col = (name: string) => header.indexOf(name);
  const idx = {
    prenom: col("prenom"), nom: col("nom"), telephone: col("telephone"), email: col("email"),
    occasion: col("occasion"), dateEvenement: col("date_evenement"), parts: col("parts"),
    prix: col("prix_chf"), statut: col("statut"), dateLivraison: col("date_livraison"), notes: col("notes"),
  };
  if (idx.prenom < 0) return { error: "Colonne « prenom » introuvable — utilise le modèle fourni." };

  const tenant = await currentTenant();
  let created = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(sep).map((x) => x.replace(/^"|"$/g, "").trim());
    const get = (j: number) => (j >= 0 && j < c.length ? c[j] : "");
    const firstName = get(idx.prenom);
    if (!firstName) { errors.push(`ligne ${i + 1} : prénom manquant`); continue; }

    try {
      const phone = get(idx.telephone);
      const email = get(idx.email);
      let contact =
        (phone && (await prisma.contact.findFirst({ where: { tenantId: tenant.id, phone } }))) ||
        (email && (await prisma.contact.findFirst({ where: { tenantId: tenant.id, email } }))) ||
        null;
      if (!contact) {
        contact = await prisma.contact.create({
          data: { tenantId: tenant.id, firstName, lastName: get(idx.nom), phone, email, source: "AUTRE" },
        });
      }
      const statut = STATUTS_IMPORT.includes(get(idx.statut).toUpperCase() as never)
        ? (get(idx.statut).toUpperCase() as (typeof STATUTS_IMPORT)[number])
        : "LIVRE";
      const deliveredAt = parseFrDate(get(idx.dateLivraison));
      const old = deliveredAt && deliveredAt.getTime() < Date.now() - 7 * 86400000;
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          status: statut,
          source: "AUTRE",
          occasion: get(idx.occasion),
          eventDate: parseFrDate(get(idx.dateEvenement)),
          parts: parseInt(get(idx.parts)) || null,
          priceQuoted: Math.round(parseFloat(get(idx.prix).replace(",", "."))) || null,
          deliveredAt: statut === "LIVRE" ? (deliveredAt ?? parseFrDate(get(idx.dateEvenement))) : null,
          reviewAskedAt: old ? new Date() : null, // pas d'avalanche d'avis rétroactive
          notes: get(idx.notes),
          activities: { create: { type: "SYSTEM", body: "Importée depuis l'historique (CSV)." } },
        },
      });
      created++;
    } catch (e) {
      errors.push(`ligne ${i + 1} : ${e instanceof Error ? e.message.slice(0, 80) : "erreur"}`);
    }
  }
  revalidatePath("/");
  revalidatePath("/contacts");
  return {
    report: `${created} commande${created > 1 ? "s" : ""} importée${created > 1 ? "s" : ""}.${errors.length ? ` ${errors.length} erreur(s) : ${errors.slice(0, 5).join(" · ")}` : ""}`,
  };
}
