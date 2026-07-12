/* ---------------------------------------------------------------------------
   Webhook entrant : le configurateur de mamangateau.ch pousse chaque
   demande de devis ici. Auth : header x-carnet-secret (HOOK_SECRET).
--------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, currentTenant } from "@/lib/db";

export const dynamic = "force-dynamic";

const payload = z.object({
  contact: z.object({
    firstName: z.string().min(1),
    lastName: z.string().default(""),
    phone: z.string().default(""),
    email: z.string().default(""),
  }),
  order: z.object({
    occasion: z.string().default(""),
    eventDate: z.string().default(""),
    celebrant: z.string().default(""),
    celebrantAge: z.number().int().nullish(),
    parts: z.number().int().nullish(),
    tiers: z.number().int().nullish(),
    biscuit: z.string().default(""),
    fourrages: z.array(z.string()).default([]),
    style: z.string().default(""),
    themeNote: z.string().default(""),
    deliveryMode: z.string().default("retrait"),
    deliveryAddress: z.string().default(""),
    deliveryKm: z.number().int().nullish(),
    priceQuoted: z.number().int().nullish(),
    extras: z.unknown().nullish(),
    partnerCode: z.string().nullish(),
  }),
});

export async function POST(req: NextRequest) {
  if (req.headers.get("x-carnet-secret") !== process.env.HOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const parsed = payload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "payload" }, { status: 400 });

  const { contact: c, order: o } = parsed.data;
  const tenant = await currentTenant();

  let contact =
    (c.email && (await prisma.contact.findFirst({ where: { tenantId: tenant.id, email: c.email } }))) ||
    (c.phone && (await prisma.contact.findFirst({ where: { tenantId: tenant.id, phone: c.phone } }))) ||
    null;
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        source: "CONFIGURATEUR",
      },
    });
  }

  const partner = o.partnerCode
    ? await prisma.partner.findUnique({
        where: { tenantId_code: { tenantId: tenant.id, code: o.partnerCode.toUpperCase().replace(/[^A-Z0-9-]/g, "") } },
      })
    : null;

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      status: "DEVIS_ENVOYE", // le devis part par e-mail au moment du POST
      source: "CONFIGURATEUR",
      occasion: o.occasion,
      eventDate: o.eventDate ? new Date(o.eventDate) : null,
      celebrant: o.celebrant,
      celebrantAge: o.celebrantAge ?? null,
      parts: o.parts ?? null,
      tiers: o.tiers ?? null,
      biscuit: o.biscuit,
      fourrages: o.fourrages,
      style: o.style,
      themeNote: o.themeNote,
      deliveryMode: o.deliveryMode,
      deliveryAddress: o.deliveryAddress,
      deliveryKm: o.deliveryKm ?? null,
      priceQuoted: o.priceQuoted ?? null,
      extras: o.extras as never,
      partnerId: partner?.id ?? null,
      activities: {
        create: {
          type: "SYSTEM",
          body: partner
            ? `Demande reçue via le configurateur — apportée par ${partner.name} (${partner.code}).`
            : "Demande reçue via le configurateur.",
        },
      },
    },
  });

  return NextResponse.json({ ok: true, orderId: order.id });
}
