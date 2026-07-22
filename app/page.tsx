import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUTS } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { missingFor } from "@/lib/completeness";
import PipelineBoard, { type CardData, type ColumnData } from "@/app/components/PipelineBoard";
import KpiPulse, { type KpiPeriod } from "@/app/components/KpiPulse";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

const SAMPLES = 40; // points d'échantillonnage des mini-courbes

export default async function Pipeline() {
  const tenant = await currentTenant();
  const now = new Date();
  const nowT = now.getTime();
  const firstOfMonth = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1);

  // Fenêtre de données : 24 mois (couvre la période 12 mois + les 12 mois précédents).
  const fetchStart = firstOfMonth(-23);

  const [orders, kpiOrders] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { not: "ANNULE" } },
      include: { contact: true },
      orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.order.findMany({
      where: { tenantId: tenant.id, OR: [{ createdAt: { gte: fetchStart } }, { depositPaidAt: { gte: fetchStart } }] },
      select: { createdAt: true, depositPaidAt: true, priceQuoted: true },
      take: 5000,
    }),
  ]);

  const trend = (delta: number): "up" | "down" | "flat" => (delta > 0 ? "up" : delta < 0 ? "down" : "flat");
  const dtxt = (delta: number, suffix = "") => `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}${suffix}`;

  /* Construit les 4 KPI d'une période de M mois : fenêtre courante (M mois, mois
     en cours partiel jusqu'à aujourd'hui) vs fenêtre précédente (M mois complets).
     Cumuls échantillonnés sur SAMPLES points pour les mini-courbes. */
  const buildPeriod = (M: number, label: string, comparison: string): KpiPeriod => {
    const curStart = firstOfMonth(-(M - 1)).getTime();
    const curEnd = firstOfMonth(1).getTime();
    const prevStart = firstOfMonth(-(2 * M - 1)).getTime();
    const prevEnd = curStart;
    const curSpan = curEnd - curStart || 1;
    const prevSpan = prevEnd - prevStart || 1;
    const curLast = Math.min(SAMPLES, Math.floor(((nowT - curStart) / curSpan) * SAMPLES));

    const z = () => new Array(SAMPLES + 1).fill(0) as number[];
    const cDem = z(), cCon = z(), cSum = z(), cCnt = z();
    const pDem = z(), pCon = z(), pSum = z(), pCnt = z();

    for (const o of kpiOrders) {
      const c = o.createdAt.getTime();
      if (c >= curStart && c < curEnd && c <= nowT) cDem[Math.min(SAMPLES, Math.floor(((c - curStart) / curSpan) * SAMPLES))]++;
      else if (c >= prevStart && c < prevEnd) pDem[Math.min(SAMPLES, Math.floor(((c - prevStart) / prevSpan) * SAMPLES))]++;
      const p = o.depositPaidAt?.getTime();
      if (p != null) {
        if (p >= curStart && p < curEnd && p <= nowT) {
          const i = Math.min(SAMPLES, Math.floor(((p - curStart) / curSpan) * SAMPLES));
          cCon[i]++;
          if (o.priceQuoted) { cSum[i] += o.priceQuoted; cCnt[i]++; }
        } else if (p >= prevStart && p < prevEnd) {
          const i = Math.min(SAMPLES, Math.floor(((p - prevStart) / prevSpan) * SAMPLES));
          pCon[i]++;
          if (o.priceQuoted) { pSum[i] += o.priceQuoted; pCnt[i]++; }
        }
      }
    }

    const cumC = (inc: number[], lastIdx: number) => { const out: number[] = []; let s = 0; for (let i = 0; i <= lastIdx; i++) { s += inc[i]; out.push(s); } return out; };
    const cumV = (dem: number[], con: number[], lastIdx: number) => { const out: number[] = []; let dd = 0, cc = 0; for (let i = 0; i <= lastIdx; i++) { dd += dem[i]; cc += con[i]; out.push(dd > 0 ? Math.round((cc / dd) * 100) : 0); } return out; };
    const cumA = (sum: number[], cnt: number[], lastIdx: number) => { const out: number[] = []; let ss = 0, nn = 0; for (let i = 0; i <= lastIdx; i++) { ss += sum[i]; nn += cnt[i]; out.push(nn > 0 ? Math.round(ss / nn) : 0); } return out; };

    const demCur = cumC(cDem, curLast), demPrev = cumC(pDem, SAMPLES);
    const conCur = cumC(cCon, curLast), conPrev = cumC(pCon, SAMPLES);
    const convCur = cumV(cDem, cCon, curLast), convPrev = cumV(pDem, pCon, SAMPLES);
    const panCur = cumA(cSum, cCnt, curLast), panPrev = cumA(pSum, pCnt, SAMPLES);
    const last = (a: number[]) => (a.length ? a[a.length - 1] : 0);
    const demT = last(demCur), demP = last(demPrev), conT = last(conCur), conP = last(conPrev);
    const convT = last(convCur), convP = last(convPrev), panT = last(panCur), panP = last(panPrev);

    return {
      key: String(M),
      label,
      comparison,
      metrics: [
        { value: String(demT), deltaText: dtxt(demT - demP), dir: trend(demT - demP), cur: demCur, prev: demPrev },
        { value: String(conT), deltaText: dtxt(conT - conP), dir: trend(conT - conP), cur: conCur, prev: conPrev },
        { value: demT > 0 ? `${convT}%` : "—", deltaText: demT > 0 && demP > 0 ? dtxt(convT - convP, " pts") : "", dir: demT > 0 ? trend(convT - convP) : "flat", cur: convCur, prev: convPrev },
        { value: panT > 0 ? `CHF ${panT}` : "—", deltaText: panT > 0 && panP > 0 ? dtxt(panT - panP) : "", dir: panT > 0 ? trend(panT - panP) : "flat", cur: panCur, prev: panPrev },
      ],
    };
  };

  const periods: KpiPeriod[] = [
    buildPeriod(1, "1 mois", "vs mois précédent"),
    buildPeriod(3, "3 mois", "vs 3 mois précédents"),
    buildPeriod(12, "12 mois", "vs 12 mois précédents"),
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

      <KpiPulse periods={periods} />

      <PipelineBoard columns={columns} cards={cards} />
    </>
  );
}
