import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { fmtCHF, fmtDate, SOURCES } from "@/lib/statuts";
import OrdersTable, { type Row } from "./OrdersTable";
import type { OrderStatus, Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

const STATUT: Record<string, { label: string; cls: string }> = {
  LEAD: { label: "Lead", cls: "bg-sky-100 text-sky-700" },
  DEVIS_ENVOYE: { label: "Devis envoyé", cls: "bg-amber-100 text-amber-700" },
  ACOMPTE_RECU: { label: "Confirmé", cls: "bg-violet-100 text-violet-700" },
  EN_PRODUCTION: { label: "En production", cls: "bg-orange-100 text-orange-700" },
  LIVRE: { label: "Livré", cls: "bg-emerald-100 text-emerald-700" },
  ANNULE: { label: "Annulé", cls: "bg-zinc-200 text-zinc-500" },
};
const STATUT_IDS = Object.keys(STATUT) as OrderStatus[];

const input = "h-9 rounded-lg border border-zinc-300 bg-white px-2.5 text-sm text-zinc-900 outline-none transition-colors focus:border-(--color-brand)";

export default async function Historique({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; annee?: string; occasion?: string }>;
}) {
  const sp = await searchParams;
  const tenant = await currentTenant();
  const now = new Date();
  const q = (sp.q ?? "").trim();
  const occasion = (sp.occasion ?? "").trim();
  const statut = sp.statut && STATUT_IDS.includes(sp.statut as OrderStatus) ? (sp.statut as OrderStatus) : "";
  // Recherche par nom → on élargit à toutes les années par défaut.
  const yearParam = sp.annee ?? (q ? "all" : String(now.getFullYear()));
  const allYears = yearParam === "all";
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getFullYear();

  const where: Prisma.OrderWhereInput = { tenantId: tenant.id };
  if (!allYears) where.eventDate = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
  if (statut) where.status = statut;
  if (occasion) where.occasion = { contains: occasion, mode: "insensitive" };
  if (q) where.contact = { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] };

  const orders = await prisma.order.findMany({
    where,
    include: { contact: true },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const total = orders.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const years: string[] = [];
  for (let yy = now.getFullYear(); yy >= 2023; yy--) years.push(String(yy));

  const rows: Row[] = orders.map((o) => ({
    id: o.id,
    name: `${o.contact.firstName} ${o.contact.lastName}`.trim(),
    occasion: o.occasion || "—",
    date: o.eventDate ? fmtDate(o.eventDate) : "—",
    dateISO: o.eventDate ? o.eventDate.toISOString() : null,
    status: o.status,
    source: SOURCES.find((s) => s.id === o.source)?.label ?? "",
    amount: fmtCHF(o.priceQuoted),
    amountCents: o.priceQuoted ?? 0,
    paidCents: (o.depositCents ?? 0) + (o.balanceCents ?? 0),
  }));

  return (
    <>
      <PageHeader
        title="Historique"
        subtitle={<>{orders.length} commande{orders.length > 1 ? "s" : ""} · {fmtCHF(total)}{orders.length >= 300 ? " · 300 max" : ""}</>}
      />

      {/* Filtres */}
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher un client…" className={`${input} min-w-40 flex-1`} />
        <input name="occasion" defaultValue={occasion} placeholder="Occasion" className={`${input} w-32`} />
        <select name="statut" defaultValue={statut} className={input}>
          <option value="">Tous statuts</option>
          {STATUT_IDS.map((s) => (
            <option key={s} value={s}>{STATUT[s].label}</option>
          ))}
        </select>
        <select name="annee" defaultValue={allYears ? "all" : String(year)} className={input}>
          {years.map((yy) => (
            <option key={yy} value={yy}>{yy}</option>
          ))}
          <option value="all">Toutes années</option>
        </select>
        <button className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700">Filtrer</button>
        {(q || occasion || statut || sp.annee) && (
          <Link href="/commandes" className="text-sm text-zinc-400 transition-colors hover:text-zinc-700">Réinitialiser</Link>
        )}
      </form>

      <p className="mb-2 text-xs text-zinc-400">
        Astuce : appui long sur une ligne pour la sélectionner (puis tape les autres), ou Ctrl/Cmd+clic — pratique pour marquer plusieurs commandes « payées en entier ».
      </p>

      <OrdersTable rows={rows} />
    </>
  );
}
