import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { chf, mileageCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { ChevronLeft, ChevronRight, Download, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

/* Pastille de variation vs année précédente (même langage que la vue mois). */
function Delta({ delta, good }: { delta: number; good: "up" | "down" | null }) {
  if (delta === 0) return null;
  const up = delta > 0;
  const tone = good === null ? "bg-zinc-100 text-zinc-500" : (up ? good === "up" : good === "down") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium", tone)}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "+" : "−"}{chf(Math.abs(delta))}
    </span>
  );
}

export default async function Annee({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const { y } = await searchParams;
  const now = new Date();
  const year = /^\d{4}$/.test(y ?? "") ? Number(y) : now.getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const pStart = new Date(Date.UTC(year - 1, 0, 1));

  const tenant = await currentTenant();
  const [expenses, delivered, cancelledKept, expPrevAgg, delivPrev, keptPrev] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "ANNULE", cancelledAt: { gte: start, lt: end }, OR: [{ depositCents: { gt: 0 } }, { balanceCents: { gt: 0 } }] } }),
    prisma.expense.aggregate({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: pStart, lt: start } }, _sum: { totalCents: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: pStart, lt: start } }, select: { priceQuoted: true, tipCents: true, deliveryMode: true, deliveryKm: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "ANNULE", cancelledAt: { gte: pStart, lt: start }, OR: [{ depositCents: { gt: 0 } }, { balanceCents: { gt: 0 } }] }, select: { depositCents: true, balanceCents: true } }),
  ]);
  const s = await getSettings(tenant.id);

  // Pourboires inclus (cohérent avec la vue mensuelle et l'export).
  const months = Array.from({ length: 12 }, (_, i) => {
    const rev =
      delivered.filter((o) => o.deliveredAt!.getUTCMonth() === i).reduce((a, o) => a + (o.priceQuoted ?? 0) * 100 + (o.tipCents ?? 0), 0) +
      cancelledKept.filter((o) => o.cancelledAt!.getUTCMonth() === i).reduce((a, o) => a + (o.depositCents ?? 0) + (o.balanceCents ?? 0), 0);
    const exp = expenses.filter((e) => e.date.getUTCMonth() === i).reduce((a, e) => a + e.totalCents, 0);
    return { i, rev, exp };
  });
  const totRev = months.reduce((a, m) => a + m.rev, 0);
  const totExp = months.reduce((a, m) => a + m.exp, 0);
  const mileageYear = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);
  const vatYear = expenses.reduce(
    (a, e) => a + (Array.isArray(e.vat) ? (e.vat as { amountCents?: number }[]).reduce((sm, v) => sm + (v.amountCents ?? 0), 0) : 0),
    0
  );

  // Année précédente (deltas)
  const prevExp = expPrevAgg._sum.totalCents ?? 0;
  const prevRev =
    delivPrev.reduce((a, o) => a + (o.priceQuoted ?? 0) * 100 + (o.tipCents ?? 0), 0) +
    keptPrev.reduce((a, o) => a + (o.depositCents ?? 0) + (o.balanceCents ?? 0), 0);
  const prevMileage = delivPrev.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);

  const name = (i: number) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString("fr-CH", { month: "long", timeZone: "UTC" });
  const currentMonth = year === now.getFullYear() ? now.getMonth() : -1;
  const maxRev = Math.max(1, ...months.map((m) => m.rev));

  const kpis = [
    { label: `Recettes ${year}`, value: chf(totRev), tone: "text-emerald-700", sub: `${delivered.length + cancelledKept.length} recettes`, delta: totRev - prevRev, good: "up" as const },
    { label: `Dépenses ${year}`, value: chf(totExp), tone: "text-red-700", sub: vatYear > 0 ? `dont TVA ${chf(vatYear)}` : `${expenses.length} tickets`, delta: totExp - prevExp, good: "down" as const },
    { label: "Frais de déplacement", value: chf(mileageYear), tone: "text-zinc-900", sub: `forfait ${s.kmRate} CHF/km, A/R`, delta: mileageYear - prevMileage, good: null },
    { label: "Résultat imposable estimé", value: chf(totRev - totExp - mileageYear), tone: totRev - totExp - mileageYear >= 0 ? "text-zinc-900" : "text-red-700", sub: "recettes − dépenses − déplacements", delta: totRev - totExp - mileageYear - (prevRev - prevExp - prevMileage), good: "up" as const },
  ];

  return (
    <>
      <PageHeader
        title="Compta — année"
        subtitle="Le dossier annuel, mois par mois — prêt pour la fiduciaire."
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-lg border border-zinc-300 bg-white p-0.5">
              <Link href={`/compta/annee?y=${year - 1}`} aria-label="Année précédente" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"><ChevronLeft className="size-4" /></Link>
              <span className="min-w-14 text-center text-[13px] font-semibold text-zinc-800">{year}</span>
              <Link href={`/compta/annee?y=${year + 1}`} aria-label="Année suivante" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"><ChevronRight className="size-4" /></Link>
            </div>
            <Link href="/compta" className="inline-flex h-8 items-center rounded-lg border border-zinc-300 px-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900">
              Mois
            </Link>
            <a href={`/api/compta/export?y=${year}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 [&_svg]:size-4">
              <Download /> CSV
            </a>
          </>
        }
      />

      {/* Synthèse annuelle — deltas vs année précédente */}
      <div className="mb-7 grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex h-full flex-col rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-zinc-400">{k.label}</p>
            <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-2">
              <p className={cn("text-base font-semibold tracking-tight", k.tone)}>{k.value}</p>
              <Delta delta={k.delta} good={k.good} />
            </div>
            <p className="mt-1 text-[11px] leading-tight text-zinc-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Mois par mois — ligne cliquable, barre de recettes proportionnelle */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">Mois</th>
              <th className="px-4 py-3 text-right">Recettes</th>
              <th className="px-4 py-3 text-right">Dépenses</th>
              <th className="px-4 py-3 text-right">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.i} className={cn("border-b border-zinc-100 last:border-0 even:bg-zinc-50/50 hover:bg-zinc-50", m.i === currentMonth && "bg-(--color-brand-soft) even:bg-(--color-brand-soft)")}>
                <td className="px-4 py-2.5 font-medium capitalize">
                  <Link href={`/compta?m=${year}-${String(m.i + 1).padStart(2, "0")}`} className="flex items-center gap-2 hover:underline">
                    {name(m.i)}
                    {m.i === currentMonth && <span className="rounded-full bg-(--color-brand) px-1.5 py-0.5 text-[10px] font-semibold text-white">en cours</span>}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="tabular-nums text-emerald-700">{m.rev ? chf(m.rev) : "—"}</span>
                  <span className="ml-auto mt-1 block h-1 w-full max-w-24 justify-self-end overflow-hidden rounded-full bg-zinc-100">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((m.rev / maxRev) * 100)}%` }} />
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{m.exp ? chf(m.exp) : "—"}</td>
                <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", m.rev - m.exp < 0 ? "text-red-700" : "text-zinc-900")}>{m.rev || m.exp ? chf(m.rev - m.exp) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-300 bg-zinc-50 font-bold">
            <tr>
              <td className="px-4 py-3">Total {year}</td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{chf(totRev)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-red-700">{chf(totExp)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{chf(totRev - totExp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Le forfait kilométrique et l'assujettissement TVA sont à confirmer avec ta fiduciaire. Export CSV complet en haut de page.
      </p>
    </>
  );
}
