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
