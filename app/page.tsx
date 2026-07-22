import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUTS } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { missingFor } from "@/lib/completeness";
import PipelineBoard, { type CardData, type ColumnData } from "@/app/components/PipelineBoard";
import { Plus, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/* Mini-courbe (sparkline) : mappe une série de 6 valeurs dans un viewBox 110×26. */
function sparkPoints(series: number[]): string {
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  return series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * 110;
      const y = 4 + 18 * (1 - (v - min) / range);
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(" ");
}

export default async function Pipeline() {
  const tenant = await currentTenant();
  const now = new Date();

  // Bornes des 6 derniers mois (glissants) pour le pouls de performance.
  const bounds: Date[] = [];
  for (let i = 5; i >= 0; i--) bounds.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const idxOf = (d: Date | null): number => {
    if (!d) return -1;
    const t = d.getTime();
    if (t < bounds[0].getTime() || t >= end.getTime()) return -1;
    for (let k = 5; k >= 0; k--) if (t >= bounds[k].getTime()) return k;
    return -1;
  };

  const [orders, kpiOrders] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { not: "ANNULE" } },
      include: { contact: true },
      orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.order.findMany({
      where: { tenantId: tenant.id, OR: [{ createdAt: { gte: bounds[0] } }, { depositPaidAt: { gte: bounds[0] } }] },
      select: { createdAt: true, depositPaidAt: true, priceQuoted: true },
      take: 3000,
    }),
  ]);

  // Séries mensuelles : demandes (createdAt), confirmations (depositPaidAt), panier moyen.
  const demandes = [0, 0, 0, 0, 0, 0];
  const confirmed = [0, 0, 0, 0, 0, 0];
  const panierSum = [0, 0, 0, 0, 0, 0];
  const panierCnt = [0, 0, 0, 0, 0, 0];
  for (const o of kpiOrders) {
    const ci = idxOf(o.createdAt);
    if (ci >= 0) demandes[ci]++;
    const pi = idxOf(o.depositPaidAt);
    if (pi >= 0) {
      confirmed[pi]++;
      if (o.priceQuoted) { panierSum[pi] += o.priceQuoted; panierCnt[pi]++; }
    }
  }
  const conversion = demandes.map((d, k) => (d > 0 ? Math.round((confirmed[k] / d) * 100) : 0));
  const panier = panierCnt.map((c, k) => (c > 0 ? Math.round(panierSum[k] / c) : 0));

  const trend = (delta: number): "up" | "down" | "flat" => (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
  const dtxt = (delta: number, suffix = "") => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}${suffix}`;
  const dDem = demandes[5] - demandes[4];
  const dCon = confirmed[5] - confirmed[4];
  const convOk = demandes[5] > 0 && demandes[4] > 0;
  const panOk = panier[5] > 0 && panier[4] > 0;

  const kpis = [
    { label: "Demandes reçues", value: String(demandes[5]), deltaText: dtxt(dDem), dir: trend(dDem), spark: demandes, sub: `vs ${demandes[4]} le mois dernier` },
    { label: "Commandes confirmées", value: String(confirmed[5]), deltaText: dtxt(dCon), dir: trend(dCon), spark: confirmed, sub: `vs ${confirmed[4]} le mois dernier` },
    { label: "Taux de conversion", value: demandes[5] > 0 ? `${conversion[5]}%` : "—", deltaText: convOk ? dtxt(conversion[5] - conversion[4], " pts") : "", dir: convOk ? trend(conversion[5] - conversion[4]) : "flat", spark: conversion, sub: "demandes → confirmées" },
    { label: "Panier moyen", value: panier[5] > 0 ? `CHF ${panier[5]}` : "—", deltaText: panOk ? dtxt(panier[5] - panier[4]) : "", dir: panOk ? trend(panier[5] - panier[4]) : "flat", spark: panier, sub: "par commande confirmée" },
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
        paidCents: pay.paidCents,
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

      {/* Pouls de performance — mois en cours vs mois précédent (6 mois glissants) */}
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{k.label}</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <p className="text-xl font-semibold tracking-tight text-zinc-900">{k.value}</p>
              {k.deltaText && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                    k.dir === "up" ? "bg-emerald-50 text-emerald-700" : k.dir === "down" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-500",
                  )}
                >
                  {k.dir === "up" ? <ArrowUpRight className="size-3" /> : k.dir === "down" ? <ArrowDownRight className="size-3" /> : null}
                  {k.deltaText}
                </span>
              )}
            </div>
            <svg viewBox="0 0 110 26" preserveAspectRatio="none" aria-hidden className="mt-2 block h-6 w-full">
              <polyline
                points={sparkPoints(k.spark)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                className={k.dir === "up" ? "text-emerald-500" : k.dir === "down" ? "text-red-500" : "text-zinc-300"}
              />
            </svg>
            <p className="mt-1.5 text-[11px] text-zinc-400">{k.sub}</p>
          </div>
        ))}
      </div>

      <PipelineBoard columns={columns} cards={cards} />
    </>
  );
}
