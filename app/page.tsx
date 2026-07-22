import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUTS } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { missingFor } from "@/lib/completeness";
import PipelineBoard, { type CardData, type ColumnData } from "@/app/components/PipelineBoard";
import { Plus, ArrowUpRight, ArrowDownRight, Percent, ShoppingBasket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
/* Chemin lissé (Catmull-Rom → Bézier) pour des courbes arrondies. */
function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
/* Deux courbes lissées (mois en cours + mois précédent), viewBox 110×26. */
function twoSpark(cur: number[], prev: number[], maxDays: number) {
  const all = [...cur, ...prev, 0];
  const max = Math.max(...all, 1), min = Math.min(...all, 0), range = max - min || 1;
  const X = (i: number) => (maxDays > 1 ? i / (maxDays - 1) : 0) * 110;
  const Y = (v: number) => 4 + 18 * (1 - (v - min) / range);
  const toPts = (line: number[]): [number, number][] => line.map((v, i) => [Math.round(X(i)), Math.round(Y(v))]);
  return { cur: smoothPath(toPts(cur)), prev: smoothPath(toPts(prev)) };
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
  // Couleur de courbe = tendance du mois (colorée dès qu'il y a de l'activité) ;
  // pastille de delta seulement quand le mois précédent offre une vraie comparaison.
  const convDir = demT > 0 ? trend(convT - convP) : "flat";
  const panDir = panT > 0 ? trend(panT - panP) : "flat";
  // Pastilles de statut reprises du pipeline (mêmes couleurs que la liste déroulante).
  const leadDot = STATUTS.find((s) => s.id === "LEAD")?.dot ?? "bg-sky-500";
  const confDot = STATUTS.find((s) => s.id === "ACOMPTE_RECU")?.dot ?? "bg-violet-500";

  const kpis = [
    { label: "Leads", dot: leadDot, Icon: undefined as LucideIcon | undefined, sub: "ce mois vs mois dernier", value: String(demT), deltaText: dtxt(demT - demP), dir: trend(demT - demP), cur: demCur, prev: demPrev },
    { label: "Confirmé", dot: confDot, Icon: undefined as LucideIcon | undefined, sub: "ce mois vs mois dernier", value: String(conT), deltaText: dtxt(conT - conP), dir: trend(conT - conP), cur: conCur, prev: conPrev },
    { label: "Conversion", dot: "", Icon: Percent as LucideIcon, sub: "demandes → confirmées", value: demT > 0 ? `${convT}%` : "—", deltaText: demT > 0 && demP > 0 ? dtxt(convT - convP, " pts") : "", dir: convDir, cur: convCur, prev: convPrev },
    { label: "Panier moyen", dot: "", Icon: ShoppingBasket as LucideIcon, sub: "par commande confirmée", value: panT > 0 ? `CHF ${panT}` : "—", deltaText: panT > 0 && panP > 0 ? dtxt(panT - panP) : "", dir: panDir, cur: panCur, prev: panPrev },
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
          const Icon = k.Icon;
          return (
            <div key={k.label} className="flex h-full flex-col rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-tight tracking-wider text-zinc-400">
                {k.dot && <span className={cn("size-2 shrink-0 rounded-full", k.dot)} />}
                {Icon && <Icon className="size-3.5 shrink-0 text-zinc-400" />}
                {k.label}
              </p>
              <p className="mt-1 text-[11px] leading-tight text-zinc-400">{k.sub}</p>
              <div className="mt-auto flex items-baseline gap-2 pt-4">
                <p className="text-base font-semibold tracking-tight text-zinc-900">{k.value}</p>
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
                <path d={sp.prev} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-zinc-300" />
                <path d={sp.cur} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className={k.dir === "up" ? "text-emerald-500" : k.dir === "down" ? "text-red-500" : "text-zinc-400"} />
              </svg>
            </div>
          );
        })}
      </div>

      <PipelineBoard columns={columns} cards={cards} />
    </>
  );
}
