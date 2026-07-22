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

/* Cumuls journaliers (index 1..jour) : comptage, moyenne, taux. */
function cumCount(inc: number[], lastDay: number): number[] {
  const out: number[] = []; let s = 0;
  for (let d = 1; d <= lastDay; d++) { s += inc[d] || 0; out.push(s); }
  return out;
}
function cumAvg(sum: number[], n: number[], lastDay: number): number[] {
  const out: number[] = []; let ss = 0, nn = 0;
  for (let d = 1; d <= lastDay; d++) { ss += sum[d] || 0; nn += n[d] || 0; out.push(nn > 0 ? Math.round(ss / nn) : 0); }
  return out;
}
function cumConv(dem: number[], con: number[], lastDay: number): number[] {
  const out: number[] = []; let dd = 0, cc = 0;
  for (let d = 1; d <= lastDay; d++) { dd += dem[d] || 0; cc += con[d] || 0; out.push(dd > 0 ? Math.round((cc / dd) * 100) : 0); }
  return out;
}
/* Deux courbes (mois en cours + mois précédent) sur le même axe de jours, viewBox 110×26. */
function twoSpark(cur: number[], prev: number[], maxDays: number) {
  const all = [...cur, ...prev, 0];
  const max = Math.max(...all, 1), min = Math.min(...all, 0), range = max - min || 1;
  const X = (i: number) => (maxDays > 1 ? i / (maxDays - 1) : 0) * 110;
  const Y = (v: number) => 4 + 18 * (1 - (v - min) / range);
  const pts = (line: number[]) => line.map((v, i) => `${Math.round(X(i))},${Math.round(Y(v))}`).join(" ");
  return { cur: pts(cur), prev: pts(prev) };
}

export default async function Pipeline() {
  const tenant = await currentTenant();
  const now = new Date();

  // Bornes des 6 derniers mois (glissants) pour le pouls de performance.
  const bounds: Date[] = [];
  for (let i = 5; i >= 0; i--) bounds.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

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

  // Cumuls journaliers — mois en cours (jusqu'à aujourd'hui) vs mois précédent (complet).
  const daysPrev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const todayDay = now.getDate();
  const maxDays = Math.max(daysPrev, todayDay);
  const inCur = (d: Date) => d >= bounds[5] && d < end;
  const inPrev = (d: Date) => d >= bounds[4] && d < bounds[5];
  const mk = () => ({ dem: Array(32).fill(0), con: Array(32).fill(0), pSum: Array(32).fill(0), pN: Array(32).fill(0) });
  const cur = mk(), prev = mk();
  for (const o of kpiOrders) {
    const c = o.createdAt;
    if (inCur(c)) cur.dem[c.getDate()]++; else if (inPrev(c)) prev.dem[c.getDate()]++;
    const p = o.depositPaidAt;
    if (p) {
      const b = inCur(p) ? cur : inPrev(p) ? prev : null;
      if (b) { b.con[p.getDate()]++; if (o.priceQuoted) { b.pSum[p.getDate()] += o.priceQuoted; b.pN[p.getDate()]++; } }
    }
  }
  const demCur = cumCount(cur.dem, todayDay), demPrev = cumCount(prev.dem, daysPrev);
  const conCur = cumCount(cur.con, todayDay), conPrev = cumCount(prev.con, daysPrev);
  const convCur = cumConv(cur.dem, cur.con, todayDay), convPrev = cumConv(prev.dem, prev.con, daysPrev);
  const panCur = cumAvg(cur.pSum, cur.pN, todayDay), panPrev = cumAvg(prev.pSum, prev.pN, daysPrev);
  const last = (a: number[]) => (a.length ? a[a.length - 1] : 0);
  const demT = last(demCur), demP = last(demPrev);
  const conT = last(conCur), conP = last(conPrev);
  const convT = last(convCur), convP = last(convPrev);
  const panT = last(panCur), panP = last(panPrev);

  const trend = (delta: number): "up" | "down" | "flat" => (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
  const dtxt = (delta: number, suffix = "") => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}${suffix}`;
  const convOk = demT > 0 && demP > 0;
  const panOk = panT > 0 && panP > 0;

  const kpis = [
    { label: "Demandes reçues", value: String(demT), deltaText: dtxt(demT - demP), dir: trend(demT - demP), cur: demCur, prev: demPrev, sub: "ce mois vs mois dernier" },
    { label: "Commandes confirmées", value: String(conT), deltaText: dtxt(conT - conP), dir: trend(conT - conP), cur: conCur, prev: conPrev, sub: "ce mois vs mois dernier" },
    { label: "Taux de conversion", value: demT > 0 ? `${convT}%` : "—", deltaText: convOk ? dtxt(convT - convP, " pts") : "", dir: convOk ? trend(convT - convP) : "flat", cur: convCur, prev: convPrev, sub: "demandes → confirmées" },
    { label: "Panier moyen", value: panT > 0 ? `CHF ${panT}` : "—", deltaText: panOk ? dtxt(panT - panP) : "", dir: panOk ? trend(panT - panP) : "flat", cur: panCur, prev: panPrev, sub: "par commande confirmée" },
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

      {/* Pouls de performance — mois en cours (plein) vs mois précédent (pointillé) */}
      <div className="mb-7 grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        {kpis.map((k) => {
          const sp = twoSpark(k.cur, k.prev, maxDays);
          return (
            <div key={k.label} className="flex h-full flex-col rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
              <p className="min-h-[2.6em] text-[11px] font-semibold uppercase leading-tight tracking-wider text-zinc-400">{k.label}</p>
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
              <div className="mt-auto pt-3">
                <svg viewBox="0 0 110 26" preserveAspectRatio="none" aria-hidden className="block h-6 w-full">
                  <polyline points={sp.prev} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-zinc-300" />
                  <polyline points={sp.cur} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className={k.dir === "up" ? "text-emerald-500" : k.dir === "down" ? "text-red-500" : "text-zinc-400"} />
                </svg>
                <p className="mt-1.5 text-[11px] text-zinc-400">{k.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      <PipelineBoard columns={columns} cards={cards} />
    </>
  );
}
