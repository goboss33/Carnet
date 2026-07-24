import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { chf, mileageCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import ViewToggle from "@/app/compta/ViewToggle";
import ExportMenu from "@/app/compta/ExportMenu";
import YearNav from "./YearNav";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

/* Pastille de variation vs année précédente (même langage que la vue mois). */
function Delta({ delta, good, force }: { delta: number; good: "up" | "down" | null; force?: "good" | "bad" | "neutral" }) {
  if (delta === 0) return null;
  const up = delta > 0;
  const tone = force
    ? force === "good" ? "bg-emerald-50 text-emerald-700" : force === "bad" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-500"
    : good === null ? "bg-zinc-100 text-zinc-500" : (up ? good === "up" : good === "down") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
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
  const [expenses, payments, payPrevAgg, expPrevAgg, delivered, delivPrev] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } } }),
    // Journal des encaissements — LA source des recettes (trésorerie).
    prisma.payment.findMany({ where: { tenantId: tenant.id, paidAt: { gte: start, lt: end } }, select: { cents: true, paidAt: true } }),
    prisma.payment.aggregate({ where: { tenantId: tenant.id, paidAt: { gte: pStart, lt: start } }, _sum: { cents: true } }),
    prisma.expense.aggregate({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: pStart, lt: start } }, _sum: { totalCents: true } }),
    // Livraisons : uniquement pour les km déductibles.
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, select: { deliveryMode: true, deliveryKm: true, deliveredAt: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: pStart, lt: start } }, select: { deliveryMode: true, deliveryKm: true } }),
  ]);
  const s = await getSettings(tenant.id);

  const months = Array.from({ length: 12 }, (_, i) => {
    const rev = payments.filter((p) => p.paidAt.getUTCMonth() === i).reduce((a, p) => a + p.cents, 0);
    const exp = expenses.filter((e) => e.date.getUTCMonth() === i).reduce((a, e) => a + e.totalCents, 0);
    const km = delivered
      .filter((o) => o.deliveredAt!.getUTCMonth() === i)
      .reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);
    return { i, rev, exp, km };
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
  const prevRev = payPrevAgg._sum.cents ?? 0;
  const prevMileage = delivPrev.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);

  const name = (i: number) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString("fr-CH", { month: "long", timeZone: "UTC" });
  const currentMonth = year === now.getFullYear() ? now.getMonth() : -1;
  const maxRev = Math.max(1, ...months.map((m) => m.rev));

  // Mêmes 4 KPI que la vue mensuelle ; dépenses jugées au TAUX (÷ encaissé).
  const ratio = totRev > 0 ? totExp / totRev : null;
  const prevRatio = prevRev > 0 ? prevExp / prevRev : null;
  const depForce: "good" | "bad" | "neutral" = ratio !== null && prevRatio !== null ? (ratio <= prevRatio ? "good" : "bad") : "neutral";
  const kmYear = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" && o.deliveryKm ? o.deliveryKm * 2 : 0), 0);

  const kpis: { label: string; value: string; tone: string; sub: string; subTitle?: string; delta: number; good: "up" | "down" | null; force?: "good" | "bad" | "neutral" }[] = [
    { label: "Encaissé", value: chf(totRev), tone: "text-emerald-700", sub: `${payments.length} encaissement${payments.length > 1 ? "s" : ""}`, delta: totRev - prevRev, good: "up" },
    { label: "Dépenses", value: chf(totExp), tone: "text-red-700", sub: `${expenses.length} ticket${expenses.length > 1 ? "s" : ""}${ratio !== null ? ` · ${Math.round(ratio * 100)} %` : ""}`, subTitle: ratio !== null ? `${Math.round(ratio * 100)} % de l'encaissé (marge)` : undefined, delta: totExp - prevExp, good: null, force: depForce },
    { label: "Résultat", value: chf(totRev - totExp), tone: totRev - totExp >= 0 ? "text-zinc-900" : "text-red-700", sub: "encaissé − dépenses", delta: totRev - totExp - (prevRev - prevExp), good: "up" },
    { label: "Déplacements", value: chf(mileageYear), tone: "text-zinc-900", sub: `${kmYear} km A/R`, subTitle: `forfait ${s.kmRate} CHF/km, aller-retour, déductible`, delta: mileageYear - prevMileage, good: null },
  ];

  return (
    <>
      <PageHeader
        title="Compta — année"
        subtitle="Le dossier annuel, mois par mois — prêt pour la fiduciaire."
        actions={
          <>
            <YearNav year={year} />
            <ViewToggle active="annee" month={`${year}-01`} year={year} />
            <ExportMenu csvHref={`/api/compta/export?y=${year}`} pdfHref={`/api/compta/export/pdf?y=${year}`} />
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
              <Delta delta={k.delta} good={k.good} force={k.force} />
            </div>
            <p className="mt-1 truncate text-[11px] leading-tight text-zinc-400" title={k.subTitle ?? k.sub}>{k.sub}</p>
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
              <th className="hidden px-4 py-3 text-right sm:table-cell">Déplacements</th>
              <th className="px-4 py-3 text-right">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.i} className={cn("border-b border-zinc-100 last:border-0 even:bg-zinc-50/50 hover:bg-zinc-50", m.i === currentMonth && "bg-(--color-brand-soft) even:bg-(--color-brand-soft)")}>
                <td className="px-4 py-2.5 font-medium capitalize">
                  <Link href={`/compta?m=${year}-${String(m.i + 1).padStart(2, "0")}`} className="flex items-center gap-2 hover:underline">
                    {name(m.i)}
                    {m.i === currentMonth && <span className="size-2 shrink-0 rounded-full bg-(--color-brand)" title="Mois en cours" />}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="tabular-nums text-emerald-700">{m.rev ? chf(m.rev) : "—"}</span>
                  <span className="ml-auto mt-1 block h-1 w-full max-w-24 justify-self-end overflow-hidden rounded-full bg-zinc-100">
                    <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((m.rev / maxRev) * 100)}%` }} />
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-700">{m.exp ? chf(m.exp) : "—"}</td>
                <td className="hidden px-4 py-2.5 text-right tabular-nums text-zinc-500 sm:table-cell">{m.km ? chf(m.km) : "—"}</td>
                <td className={cn("px-4 py-2.5 text-right font-semibold tabular-nums", m.rev - m.exp < 0 ? "text-red-700" : "text-zinc-900")}>{m.rev || m.exp ? chf(m.rev - m.exp) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-zinc-300 bg-zinc-50 font-bold">
            <tr>
              <td className="px-4 py-3">Total {year}</td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{chf(totRev)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-red-700">{chf(totExp)}</td>
              <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-500 sm:table-cell">{chf(mileageYear)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{chf(totRev - totExp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Dossier fiscal — synthèse discrète sous le tableau */}
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px]">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-zinc-800">Résultat imposable estimé {year} : {chf(totRev - totExp - mileageYear)}</span>
          <span className="text-zinc-400">(encaissé − dépenses − déplacements{vatYear > 0 ? ` · dont TVA payée ${chf(vatYear)}` : ""})</span>
        </p>
      </div>
      <p className="mt-3 text-xs text-zinc-400">
        Le forfait kilométrique et l'assujettissement TVA sont à confirmer avec ta fiduciaire. Export CSV / PDF en haut de page.
      </p>
    </>
  );
}
