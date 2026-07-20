import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUTS } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { missingFor } from "@/lib/completeness";
import PipelineBoard, { type CardData, type ColumnData } from "@/app/components/PipelineBoard";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function Pipeline() {
  const tenant = await currentTenant();
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [orders, deliveredMonth] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { not: "ANNULE" } },
      include: { contact: true },
      orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: monthStart } } }),
  ]);

  const active = orders.filter((o) => o.status !== "LIVRE");
  const week = active.filter(
    (o) => o.eventDate && o.eventDate.getTime() - Date.now() < 7 * 86400000 && o.eventDate.getTime() > Date.now() - 86400000
  );
  const caMonth = deliveredMonth.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const caPending = active.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const leads = active.filter((o) => o.status === "LEAD").length;

  const stats = [
    { label: "CA livré ce mois", value: `CHF ${caMonth}`, sub: `${deliveredMonth.length} commande${deliveredMonth.length > 1 ? "s" : ""}` },
    { label: "En cours", value: String(active.length), sub: `CHF ${caPending} au total` },
    { label: "Cette semaine", value: String(week.length), sub: "à produire / livrer" },
    { label: "Leads à traiter", value: String(leads), sub: leads ? "devis à envoyer" : "tout est traité" },
  ];

  /* ------------------------------------------------ cartes + colonnes */
  const columns: ColumnData[] = [];
  const cards: CardData[] = [];

  for (const col of STATUTS) {
    const all = orders.filter((o) => o.status === col.id);
    // Livré : les 5 DERNIÈRES livraisons (deliveredAt desc) — pas les premières de l'année.
    const list =
      col.id === "LIVRE"
        ? [...all].sort((a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0)).slice(0, 5)
        : all;
    columns.push({
      id: col.id,
      label: col.label,
      hint: col.hint,
      dot: col.dot,
      count: all.length,
      total: all.reduce((a, o) => a + (o.priceQuoted ?? 0), 0),
      hiddenCount: col.id === "LIVRE" ? Math.max(0, all.length - 5) : 0,
    });
    for (const o of list) {
      const pay = paymentState(o);
      cards.push({
        id: o.id,
        status: o.status,
        name: `${o.contact.firstName} ${o.contact.lastName}`.trim(),
        occasion: o.occasion,
        eventDateISO: o.eventDate ? o.eventDate.toISOString() : null,
        price: o.priceQuoted ?? null,
        sourceLabel: o.source,
        missing: missingFor(o).length,
        dueCents: o.status === "LIVRE" && !pay.isPaid && pay.dueCents > 0 ? pay.dueCents : 0,
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Pipeline"
        actions={
          <Link href="/nouveau" className={cn(buttonVariants({ variant: "brand", size: "sm" }))}>
            <Plus /> Fiche rapide
          </Link>
        }
      />

      {/* Synthèse */}
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{s.label}</p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-900">{s.value}</p>
            <p className="text-xs text-zinc-400">{s.sub}</p>
          </div>
        ))}
      </div>

      <PipelineBoard columns={columns} cards={cards} />
    </>
  );
}
