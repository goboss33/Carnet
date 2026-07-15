"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, currentTenant } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { NEXT_STATUS } from "@/lib/statuts";
import { normPhone, normEmail, contactWhere } from "@/lib/normalize";
import { getSettings } from "@/lib/settings";
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
  deliveryAddress: z.string().default(""),
  notes: z.string().default(""),
});

export async function createLead(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const d = parsed.data;
  d.phone = normPhone(d.phone);
  d.email = normEmail(d.email);
  const tenant = await currentTenant();

  // Réutilise le contact si tél ou e-mail déjà connus (valeurs normalisées)
  const where = contactWhere(tenant.id, d.phone, d.email);
  let contact = where ? await prisma.contact.findFirst({ where }) : null;

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
      deliveryMode: d.deliveryAddress ? "livraison" : "retrait",
      deliveryAddress: d.deliveryAddress,
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
  const s = await getSettings(order.tenantId);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: next,
      ...(next === "ACOMPTE_RECU"
        ? {
            depositPaidAt: new Date(),
            // acompte par défaut (réglage) si aucun montant n'a encore été saisi (cohérent avec le bot)
            ...(order.depositCents || !order.priceQuoted ? {} : { depositCents: Math.round((order.priceQuoted * s.depositPct) / 100) * 100 }),
          }
        : {}),
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
    data: {
      status,
      ...(status === "ANNULE" ? { cancelledAt: new Date() } : {}),
      activities: { create: { type: "STATUS", body: `Statut → ${status}` } },
    },
  });
  revalidatePath("/");
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/compta");
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

/* ------------------------------------------------------------ paiement */

const paymentPatch = z.object({
  depositChf: z.coerce.number().min(0).optional(),
  balanceChf: z.coerce.number().min(0).optional(),
});

/** Enregistre acompte + solde depuis la fiche (montants en CHF ; 0/​vide = efface). */
export async function recordPayment(orderId: string, formData: FormData) {
  const d = paymentPatch.parse(Object.fromEntries(formData));
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const depositCents = Math.round((d.depositChf ?? 0) * 100);
  const balanceCents = Math.round((d.balanceChf ?? 0) * 100);
  await prisma.order.update({
    where: { id: orderId },
    data: {
      depositCents: depositCents || null,
      balanceCents: balanceCents || null,
      depositPaidAt: depositCents ? (order.depositPaidAt ?? new Date()) : null,
      balancePaidAt: balanceCents ? (order.balancePaidAt ?? new Date()) : null,
      activities: { create: { type: "STATUS", body: "Paiement mis à jour depuis la fiche." } },
    },
  });
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/");
}

/** Marque une commande intégralement payée (acompte = total, solde = 0). */
export async function markPaidInFull(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.priceQuoted) return;
  const total = order.priceQuoted * 100;
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: order.status === "LEAD" || order.status === "DEVIS_ENVOYE" ? "ACOMPTE_RECU" : order.status,
      depositCents: total,
      balanceCents: 0,
      depositPaidAt: order.depositPaidAt ?? new Date(),
      balancePaidAt: new Date(),
      activities: { create: { type: "STATUS", body: `Payé en entier (CHF ${order.priceQuoted}) — depuis la fiche.` } },
    },
  });
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/");
}

/** Marque en lot plusieurs commandes comme payées en entier (ex. solder l'historique importé). */
export async function markManyPaidInFull(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) return;
  const tenant = await currentTenant();
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant.id, id: { in: ids }, priceQuoted: { not: null } },
  });
  await Promise.all(
    orders.map((o) =>
      prisma.order.update({
        where: { id: o.id },
        data: {
          depositCents: (o.priceQuoted ?? 0) * 100,
          balanceCents: 0,
          depositPaidAt: o.depositPaidAt ?? new Date(),
          balancePaidAt: o.balancePaidAt ?? new Date(),
        },
      })
    )
  );
  revalidatePath("/commandes");
  revalidatePath("/compta");
  revalidatePath("/");
}

/** Annulation : marque l'acompte comme remboursé (le retire des recettes). */
export async function refundDeposit(orderId: string) {
  await prisma.order.update({
    where: { id: orderId },
    data: {
      depositCents: null,
      balanceCents: null,
      activities: { create: { type: "STATUS", body: "Acompte remboursé (annulation)." } },
    },
  });
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/compta");
  revalidatePath("/");
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

/** Active / désactive un partenaire (garde tout l'historique et les commissions). */
export async function togglePartnerActive(id: string) {
  const p = await prisma.partner.findUnique({ where: { id } });
  if (!p) return;
  await prisma.partner.update({ where: { id }, data: { active: !p.active } });
  revalidatePath("/partenaires");
}

/** Supprime définitivement un partenaire — refusé s'il a des commandes rattachées. */
export async function deletePartner(id: string) {
  const count = await prisma.order.count({ where: { partnerId: id } });
  if (count > 0) return; // sécurité : ne pas casser l'attribution des commandes
  await prisma.partner.delete({ where: { id } }).catch(() => null);
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

/** Parseur CSV complet : guillemets, séparateur et sauts de ligne dans les champs. */
function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** Vide commandes + contacts du tenant (les dépenses et partenaires restent). */
export async function purgeCrm(_prev: { error?: string; report?: string } | undefined, formData: FormData) {
  if (String(formData.get("confirm")).trim().toUpperCase() !== "SUPPRIMER") {
    return { error: "Tape SUPPRIMER dans le champ pour confirmer." };
  }
  const tenant = await currentTenant();
  const orders = await prisma.order.deleteMany({ where: { tenantId: tenant.id } });
  const contacts = await prisma.contact.deleteMany({ where: { tenantId: tenant.id } });
  revalidatePath("/");
  revalidatePath("/contacts");
  return { report: `${orders.count} commandes et ${contacts.count} contacts supprimés. Tu peux réimporter.` };
}

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
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const table = parseCsv(text, sep);
  if (table.length < 2) return { error: "Le fichier semble vide (en-tête + au moins une ligne)." };
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z_]/g, "");
  const header = table[0].map(norm);
  const col = (name: string) => header.indexOf(name);
  const idx = {
    prenom: col("prenom"), nom: col("nom"), telephone: col("telephone"), email: col("email"),
    occasion: col("occasion"), dateEvenement: col("date_evenement"), parts: col("parts"),
    prix: col("prix_chf"), statut: col("statut"), dateLivraison: col("date_livraison"), notes: col("notes"),
    adresse: col("adresse_livraison"), distance: col("distance_km"),
  };
  if (idx.prenom < 0) return { error: "Colonne « prenom » introuvable — utilise le modèle fourni." };

  const tenant = await currentTenant();
  let created = 0;
  const errors: string[] = [];

  for (let i = 1; i < table.length; i++) {
    const c = table[i].map((x) => x.trim());
    if (!c.some(Boolean)) continue;
    const get = (j: number) => (j >= 0 && j < c.length ? c[j] : "");
    const firstName = get(idx.prenom);
    if (!firstName) { errors.push(`ligne ${i + 1} : prénom manquant`); continue; }

    try {
      const phone = normPhone(get(idx.telephone));
      const email = normEmail(get(idx.email));
      const where = contactWhere(tenant.id, phone, email);
      let contact = where ? await prisma.contact.findFirst({ where }) : null;
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
      const price = Math.round(parseFloat(get(idx.prix).replace(",", "."))) || null;
      const deliveredAtVal = statut === "LIVRE" ? (deliveredAt ?? parseFrDate(get(idx.dateEvenement))) : null;
      // Historique livré = considéré réglé (sinon toutes les commandes importées afficheraient « reste à encaisser »).
      const paid =
        statut === "LIVRE" && price
          ? { depositCents: price * 100, balanceCents: 0, depositPaidAt: deliveredAtVal ?? new Date(), balancePaidAt: deliveredAtVal ?? new Date() }
          : {};
      await prisma.order.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          status: statut,
          source: "AUTRE",
          occasion: get(idx.occasion),
          eventDate: parseFrDate(get(idx.dateEvenement)),
          parts: parseInt(get(idx.parts)) || null,
          priceQuoted: price,
          deliveryMode: get(idx.adresse) ? "livraison" : "retrait",
          deliveryAddress: get(idx.adresse),
          deliveryKm: Math.round(parseFloat(get(idx.distance).replace(",", "."))) || null,
          deliveredAt: deliveredAtVal,
          reviewAskedAt: old ? new Date() : null, // pas d'avalanche d'avis rétroactive
          notes: get(idx.notes),
          ...paid,
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

/* ------------------------------------------------------------ contacts */

const contactPatch = z.object({
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  instagram: z.string().default(""),
  source: z.enum(["CONFIGURATEUR", "WHATSAPP", "INSTAGRAM", "TELEPHONE", "AUTRE"]).default("AUTRE"),
  notes: z.string().default(""),
});

export async function updateContact(id: string, _prev: { error?: string; ok?: boolean } | undefined, formData: FormData) {
  const parsed = contactPatch.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const data = { ...parsed.data, phone: normPhone(parsed.data.phone), email: normEmail(parsed.data.email) };
  await prisma.contact.update({ where: { id }, data: { ...data, consentNewsletter: formData.get("consentNewsletter") === "on" } });
  revalidatePath(`/contacts/${id}`);
  revalidatePath("/contacts");
  return { ok: true };
}

export async function deleteContact(id: string) {
  await prisma.order.deleteMany({ where: { contactId: id } }); // activités en cascade
  await prisma.contact.delete({ where: { id } }).catch(() => null);
  revalidatePath("/contacts");
  revalidatePath("/");
  redirect("/contacts");
}

export async function deleteOrder(orderId: string) {
  await prisma.order.delete({ where: { id: orderId } }).catch(() => null);
  revalidatePath("/");
  redirect("/");
}


/* --------------------------------------- commande pour contact existant */

const orderForContact = z.object({
  occasion: z.string().min(1, "Occasion requise"),
  eventDate: z.string().default(""),
  parts: z.coerce.number().int().positive().optional(),
  priceQuoted: z.coerce.number().int().positive().optional(),
  deliveryAddress: z.string().default(""),
  notes: z.string().default(""),
});

export async function createOrderForContact(contactId: string, _prev: { error?: string } | undefined, formData: FormData) {
  const parsed = orderForContact.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  const d = parsed.data;
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return { error: "Contact introuvable." };
  const order = await prisma.order.create({
    data: {
      tenantId: contact.tenantId,
      contactId,
      source: contact.source,
      occasion: d.occasion,
      eventDate: d.eventDate ? new Date(d.eventDate) : null,
      parts: d.parts,
      priceQuoted: d.priceQuoted,
      deliveryMode: d.deliveryAddress ? "livraison" : "retrait",
      deliveryAddress: d.deliveryAddress,
      notes: d.notes,
      activities: { create: { type: "SYSTEM", body: "Nouvelle commande (client existant)." } },
    },
  });
  revalidatePath("/");
  redirect(`/commandes/${order.id}`);
}

/* ------------------------------------------------------------- réglages */

export async function saveSettings(formData: FormData) {
  const tenant = await currentTenant();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const clampInt = (n: number | null, lo: number, hi: number) =>
    n == null || isNaN(n) ? null : Math.min(hi, Math.max(lo, Math.round(n)));
  const kmRate = num("kmRate");
  const data = {
    kmRate: kmRate == null || isNaN(kmRate) ? null : Math.min(10, Math.max(0, kmRate)),
    depositPct: clampInt(num("depositPct"), 0, 100),
    digestHour: clampInt(num("digestHour"), 0, 23),
    nudgeHour: clampInt(num("nudgeHour"), 0, 23),
    reviewUrl: String(formData.get("reviewUrl") ?? "").trim(),
    cronDigest: formData.get("cronDigest") === "on",
    cronEveningNudges: formData.get("cronEveningNudges") === "on",
    cronReviews: formData.get("cronReviews") === "on",
    cronBirthday: formData.get("cronBirthday") === "on",
    cronMonthly: formData.get("cronMonthly") === "on",
    paymentDefault: formData.get("paymentDefault") === "virement" ? "virement" : "twint",
    twintNumber: String(formData.get("twintNumber") ?? "").trim(),
    accountHolder: String(formData.get("accountHolder") ?? "").trim(),
    iban: String(formData.get("iban") ?? "").trim(),
    bankName: String(formData.get("bankName") ?? "").trim(),
    assistantActive: formData.get("assistantActive") === "on",
    assistantSignature: String(formData.get("assistantSignature") ?? "").trim(),
    assistantInstructions: String(formData.get("assistantInstructions") ?? "").trim(),
    goalCaMensuel: clampInt(num("goalCaMensuel"), 0, 100000),
    goalPanierMoyen: clampInt(num("goalPanierMoyen"), 0, 10000),
    goalAvisGoogle: clampInt(num("goalAvisGoogle"), 0, 10000),
    goalPartMariage: clampInt(num("goalPartMariage"), 0, 100),
    goalPartDecouple: clampInt(num("goalPartDecouple"), 0, 100),
    goalInstagram: clampInt(num("goalInstagram"), 0, 10000000),
  };
  await prisma.settings.upsert({
    where: { tenantId: tenant.id },
    update: data,
    create: { tenantId: tenant.id, ...data },
  });
  revalidatePath("/reglages");
}

/** Test manuel : envoie tout de suite un message Telegram et résume l'état des crons. */
export async function testCron(): Promise<{ ok: boolean; message: string }> {
  const tenant = await currentTenant();
  const { cronSelfTest } = await import("@/lib/cron");
  return cronSelfTest(tenant.id);
}

/** Bouton « Proposer des consignes » dans les réglages (pré-remplissage IA, éditable ensuite). */
export async function proposeConsignes(): Promise<string | null> {
  const { generateConsignes } = await import("@/lib/assistant");
  return generateConsignes();
}

/** Assistant (web) : génère un 1er jet (message vide) ou affine avec une consigne. */
export async function assistantSend(orderId: string, formData: FormData) {
  const message = String(formData.get("message") ?? "").trim();
  const { generateDraft } = await import("@/lib/assistant");
  await generateDraft(orderId, { userMessage: message || undefined });
  revalidatePath(`/commandes/${orderId}`);
}

/* ------------------------------------------------------------------ cap */

export async function toggleMilestone(key: string, value: boolean) {
  const tenant = await currentTenant();
  const s = await prisma.settings.findUnique({ where: { tenantId: tenant.id } });
  const milestones = { ...((s?.milestones as Record<string, boolean>) ?? {}), [key]: value };
  await prisma.settings.upsert({
    where: { tenantId: tenant.id },
    update: { milestones },
    create: { tenantId: tenant.id, milestones },
  });
  revalidatePath("/cap");
}

export async function setRevenueCategory(orderId: string, formData: FormData) {
  const v = String(formData.get("revenueCategory") ?? "SUR_MESURE");
  const ok = ["SUR_MESURE", "COLLECTION", "ATELIER", "BON_CADEAU", "DECORS", "B2B"];
  await prisma.order.update({
    where: { id: orderId },
    data: { revenueCategory: (ok.includes(v) ? v : "SUR_MESURE") as never },
  });
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath("/cap");
}

/** Teste un déclencheur du bot (mode 🧪 : messages réels, aucun état modifié). */
export async function testTriggerAction(kind: string): Promise<{ ok: boolean; message: string }> {
  const tenant = await currentTenant();
  const { testTrigger } = await import("@/lib/cron");
  return testTrigger(tenant.id, kind);
}
