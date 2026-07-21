import { prisma, currentTenant } from "@/lib/db";
import { fmtDate, SOURCES } from "@/lib/statuts";
import OrdersTable, { type Row } from "./OrdersTable";
import type { OrderStatus, Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  LEAD: "Lead",
  DEVIS_ENVOYE: "Devis envoyé",
  ACOMPTE_RECU: "Confirmé",
  EN_PRODUCTION: "En production",
  LIVRE: "Livré",
  ANNULE: "Annulé",
};
const STATUS_IDS = Object.keys(STATUS_LABEL) as OrderStatus[];

export default async function Historique({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; annee?: string }>;
}) {
  const sp = await searchParams;
  const tenant = await currentTenant();
  const now = new Date();
  const statut = sp.statut && STATUS_IDS.includes(sp.statut as OrderStatus) ? (sp.statut as OrderStatus) : "";
  const yearParam = sp.annee ?? String(now.getFullYear());
  const allYears = yearParam === "all";
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getFullYear();

  const where: Prisma.OrderWhereInput = { tenantId: tenant.id };
  if (!allYears) {
    const startY = new Date(Date.UTC(year, 0, 1));
    const nextY = new Date(Date.UTC(year + 1, 0, 1));
    // Par année d'événement ; les fiches SANS date d'événement sont rangées par leur année de création.
    where.OR = [
      { eventDate: { gte: startY, lt: nextY } },
      { eventDate: null, createdAt: { gte: startY, lt: nextY } },
    ];
  }
  if (statut) where.status = statut;

  const orders = await prisma.order.findMany({
    where,
    include: { contact: true },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: 300,
  });

  // Notes des médias liés (≈ alt-text) — enrichit l'index de recherche.
  const notesByOrder: Record<string, string[]> = {};
  if (orders.length) {
    const assets = await prisma.studioAsset.findMany({
      where: { tenantId: tenant.id, orderId: { in: orders.map((o) => o.id) }, note: { not: "" } },
      select: { orderId: true, note: true },
    });
    for (const a of assets) if (a.orderId) (notesByOrder[a.orderId] ??= []).push(a.note);
  }

  const years: string[] = [];
  for (let yy = now.getFullYear(); yy >= 2023; yy--) years.push(String(yy));

  const rows: Row[] = orders.map((o) => {
    const name = `${o.contact.firstName} ${o.contact.lastName}`.trim();
    const dateStr = o.eventDate ? fmtDate(o.eventDate) : "—";
    const search = [
      name,
      o.contact.phone, o.contact.email, o.contact.instagram,
      o.occasion, o.celebrant, o.celebrantAge, o.biscuit, o.fourrages.join(" "),
      o.themeNote, o.notes, o.sourceDetail, o.deliveryAddress,
      SOURCES.find((s) => s.id === o.source)?.label ?? "", STATUS_LABEL[o.status] ?? "",
      o.priceQuoted, dateStr, o.eventDate ? o.eventDate.getUTCFullYear() : "",
      notesByOrder[o.id]?.join(" ") ?? "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return {
      id: o.id,
      name,
      occasion: o.occasion || "—",
      date: dateStr,
      dateISO: o.eventDate ? o.eventDate.toISOString() : null,
      status: o.status,
      sourceId: o.source,
      amountCents: o.priceQuoted ?? 0,
      paidCents: (o.depositCents ?? 0) + (o.balanceCents ?? 0),
      search,
    };
  });

  return (
    <>
      <PageHeader title="Historique" />
      <OrdersTable rows={rows} statut={statut} annee={yearParam} years={years} />
    </>
  );
}
