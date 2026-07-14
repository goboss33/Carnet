/* ---------------------------------------------------------------------------
   Webhook entrant : le configurateur de mamangateau.ch pousse chaque
   demande de devis ici. Auth : header x-carnet-secret (HOOK_SECRET).
--------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { prisma, currentTenant } from "@/lib/db";
import { notifyAll, sendPhotosAll } from "@/lib/telegram";
import { normPhone, normEmail, contactWhere } from "@/lib/normalize";

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
  photos: z.array(z.object({ name: z.string().default("photo.jpg"), data: z.string() })).max(3).optional(),
});

export async function POST(req: NextRequest) {
  if (req.headers.get("x-carnet-secret") !== process.env.HOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const parsed = payload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "payload" }, { status: 400 });

  const { contact: c, order: o } = parsed.data;
  c.phone = normPhone(c.phone);
  c.email = normEmail(c.email);
  const tenant = await currentTenant();

  const where = contactWhere(tenant.id, c.phone, c.email);
  let contact = where ? await prisma.contact.findFirst({ where }) : null;
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
      status: "LEAD", // à traiter tant qu'Annie n'a pas répondu (l'e-mail auto n'est qu'une estimation)
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

  /* Photos d'inspiration : stockées sous RECEIPTS_DIR/inspirations et envoyées à Annie. */
  const photoBuffers: Buffer[] = [];
  if (parsed.data.photos?.length) {
    const rels: string[] = [];
    const dir = path.resolve(process.env.RECEIPTS_DIR ?? "./data/receipts");
    for (let i = 0; i < parsed.data.photos.length; i++) {
      try {
        const buf = Buffer.from(parsed.data.photos[i].data, "base64");
        if (!buf.length || buf.length > 5_000_000) continue;
        const abs = path.join(dir, "inspirations", tenant.slug, order.id, `${i + 1}.jpg`);
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(abs, buf);
        rels.push(`inspirations/${tenant.slug}/${order.id}/${i + 1}.jpg`);
        photoBuffers.push(buf);
      } catch (e) {
        console.error("inspiration photo error", e);
      }
    }
    if (rels.length) await prisma.order.update({ where: { id: order.id }, data: { inspirationPhotos: rels } });
  }

  notifyAll(
    [
      "🎂 <b>Nouvelle demande de devis !</b>",
      `${c.firstName} ${c.lastName} — ${o.occasion || "occasion ?"}`,
      o.eventDate ? `📅 ${new Date(o.eventDate).toLocaleDateString("fr-CH")}` : "",
      `${o.parts ?? "?"} parts · ${o.deliveryMode}${o.priceQuoted ? ` · dès CHF ${o.priceQuoted}` : ""}`,
      partner ? `🤝 Apportée par ${partner.name}` : "",
      photoBuffers.length ? `🖼 ${photoBuffers.length} photo(s) d'inspiration` : "",
      `${process.env.APP_URL ?? ""}/commandes/${order.id}`,
    ].filter(Boolean).join("\n")
  ).catch((e) => console.error("notify error", e));

  if (photoBuffers.length) {
    sendPhotosAll(photoBuffers, `🖼 Inspiration — ${c.firstName} ${c.lastName}`).catch((e) => console.error("send photos", e));
  }

  return NextResponse.json({ ok: true, orderId: order.id });
}
