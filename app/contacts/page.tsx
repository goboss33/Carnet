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
      orders: { orderBy: { eventDate: "desc" }, take: 1 },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: Row[] = contacts.map((c) => {
    const o = c.orders[0];
    return {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      phone: c.phone,
      email: c.email,
      instagram: c.instagram,
      sourceLabel: SOURCES.find((s) => s.id === c.source)?.label ?? "",
      orderId: o?.id ?? null,
      occasion: o?.occasion ?? "",
      dateLabel: o?.eventDate ? fmtDate(o.eventDate) : "—",
      dateISO: o?.eventDate ? o.eventDate.toISOString() : null,
      price: o?.priceQuoted ?? null,
      ordersCount: c._count.orders,
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
