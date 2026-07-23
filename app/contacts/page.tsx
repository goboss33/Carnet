import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { fmtDate, SOURCES } from "@/lib/statuts";
import ContactsTable, { type Row } from "./ContactsTable";
import { Upload, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const tenant = await currentTenant();
  const contacts = await prisma.contact.findMany({
    where: { tenantId: tenant.id },
    include: {
      // Toutes les commandes : la 1re (événement le plus récent) pour l'affichage,
      // l'ensemble pour l'index de recherche (occasions, thèmes, fêté·e·s, notes).
      orders: {
        orderBy: { eventDate: "desc" },
        select: { id: true, occasion: true, eventDate: true, priceQuoted: true, themeNote: true, celebrant: true, notes: true },
      },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: Row[] = contacts.map((c) => {
    const o = c.orders[0];
    const name = `${c.firstName} ${c.lastName}`.trim();
    const search = [
      name,
      c.phone, c.email, c.instagram, c.facebook, c.notes,
      SOURCES.find((s) => s.id === c.source)?.label ?? "",
      ...c.orders.flatMap((x) => [
        x.occasion, x.themeNote, x.celebrant, x.notes,
        x.priceQuoted, x.eventDate ? fmtDate(x.eventDate) : "", x.eventDate ? x.eventDate.getUTCFullYear() : "",
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return {
      id: c.id,
      name,
      phone: c.phone,
      email: c.email,
      instagram: c.instagram,
      sourceId: c.source,
      orderId: o?.id ?? null,
      occasion: o?.occasion ?? "",
      dateLabel: o?.eventDate ? fmtDate(o.eventDate) : "—",
      dateISO: o?.eventDate ? o.eventDate.toISOString() : null,
      price: o?.priceQuoted ?? null,
      ordersCount: c._count.orders,
      search,
    };
  });

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={<>{contacts.length} fiche{contacts.length > 1 ? "s" : ""}</>}
        actions={
          <>
            <Link href="/import" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Upload /> Importer
            </Link>
            <Link href="/nouveau" className={cn(buttonVariants({ variant: "brand", size: "sm" }))}>
              <Plus /> Nouvelle fiche
            </Link>
          </>
        }
      />
      <ContactsTable rows={rows} />
    </>
  );
}
