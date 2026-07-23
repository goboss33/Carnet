import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { chf, mileageCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { paymentState } from "@/lib/payments";
import { Download, ArrowUpRight, ArrowDownRight, HandCoins } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import MonthNav from "./MonthNav";
import ExpensesSection, { type ExpenseRow } from "./ExpensesSection";
import RecettesTable, { type PayRow } from "./RecettesTable";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

/* Pastille de variation vs mois précédent. good : le sens « heureux » (up pour
   les recettes, null = neutre → gris). force : couleur imposée quel que soit le
   signe — utilisée pour les Dépenses, jugées sur le TAUX (dépenses ÷ recettes)
   et non sur le montant (plus de ventes = plus d'achats, c'est normal). */
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

export default async function Compta({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { start, end } = monthRange(month);
  const prevD = new Date(start); prevD.setUTCMonth(prevD.getUTCMonth() - 1);
  const nextD = new Date(start); nextD.setUTCMonth(nextD.getUTCMonth() + 1);
  const fmtM = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const tenant = await currentTenant();
  const pRange = { gte: prevD, lt: start };
  const [expenses, payments, payPrevAgg, delivered, delivPrev, unpaidDelivered] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "desc" } }),
    // Journal des encaissements du mois — LA source des recettes (comptabilité de trésorerie).
    prisma.payment.findMany({
      where: { tenantId: tenant.id, paidAt: { gte: start, lt: end } },
      include: { order: { include: { contact: true } } },
      orderBy: { paidAt: "desc" },
    }),
    prisma.payment.aggregate({ where: { tenantId: tenant.id, paidAt: pRange }, _sum: { cents: true } }),
    // Livraisons du mois : uniquement pour les km déductibles (pas du cash).
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, select: { deliveryMode: true, deliveryKm: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: pRange }, select: { deliveryMode: true, deliveryKm: true } }),
    // Créances : livrées dont il reste de l'argent à encaisser (toutes dates).
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", priceQuoted: { not: null } }, include: { contact: true }, orderBy: { deliveredAt: "desc" }, take: 100 }),
  ]);

  const s = await getSettings(tenant.id);
  const mileage = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);
  const kmTotal = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" && o.deliveryKm ? o.deliveryKm * 2 : 0), 0);
  const prevMileage = delivPrev.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);

  const totalExp = expenses.reduce((a, e) => a + e.totalCents, 0);
  const totalRev = payments.reduce((a, p) => a + p.cents, 0);
  const prevRev = payPrevAgg._sum.cents ?? 0;
  const prevExp = (await prisma.expense.aggregate({ where: { tenantId: tenant.id, status: "CONFIRMED", date: pRange }, _sum: { totalCents: true } }))._sum.totalCents ?? 0;

  // Créances (à encaisser) — hors CA tant que l'argent n'est pas là.
  const receivables = unpaidDelivered
    .map((o) => ({ o, pay: paymentState(o) }))
    .filter((x) => !x.pay.isPaid && x.pay.dueCents > 0);
  const receivablesTotal = receivables.reduce((a, x) => a + x.pay.dueCents, 0);

  const label = start.toLocaleDateString("fr-CH", { month: "long", year: "numeric", timeZone: "UTC" });

  const expenseRows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    dateISO: e.date.toISOString().slice(0, 10),
    dateLabel: e.date.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
    merchant: e.merchant,
    category: e.category,
    totalCents: e.totalCents,
    notes: e.notes,
    receiptPath: e.receiptPath,
  }));

  // Dépenses jugées au TAUX (dépenses ÷ encaissé) : vert si la marge s'améliore,
  // même quand le montant monte — plus de ventes = plus d'achats, c'est normal.
  const ratio = totalRev > 0 ? totalExp / totalRev : null;
  const prevRatio = prevRev > 0 ? prevExp / prevRev : null;
  const depForce: "good" | "bad" | "neutral" = ratio !== null && prevRatio !== null ? (ratio <= prevRatio ? "good" : "bad") : "neutral";
  const depSub = `${expenses.length} ticket${expenses.length > 1 ? "s" : ""}${ratio !== null ? ` · ${Math.round(ratio * 100)} % de l'encaissé` : ""}`;

  const kpis: { label: string; value: string; tone: string; sub: string; delta: number; good: "up" | "down" | null; force?: "good" | "bad" | "neutral" }[] = [
    { label: "Encaissé", value: chf(totalRev), tone: "text-emerald-700", sub: `${payments.length} encaissement${payments.length > 1 ? "s" : ""}`, delta: totalRev - prevRev, good: "up" },
    { label: "Dépenses", value: chf(totalExp), tone: "text-red-700", sub: depSub, delta: totalExp - prevExp, good: null, force: depForce },
    { label: "Résultat", value: chf(totalRev - totalExp), tone: totalRev - totalExp >= 0 ? "text-zinc-900" : "text-red-700", sub: "encaissé − dépenses", delta: totalRev - totalExp - (prevRev - prevExp), good: "up" },
    { label: "Déplacements", value: chf(mileage), tone: "text-zinc-900", sub: `${kmTotal} km A/R déductibles`, delta: mileage - prevMileage, good: null },
  ];

  return (
    <>
      <PageHeader
        title="Compta"
        subtitle="Encaissements, dépenses et déductions du mois."
        actions={
          <>
            <MonthNav month={month} prev={fmtM(prevD)} next={fmtM(nextD)} label={label} />
            <Link href={`/compta/annee?y=${month.slice(0, 4)}`} className="inline-flex h-8 items-center rounded-lg border border-zinc-300 px-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900">
              Année
            </Link>
            <a href={`/api/compta/export?m=${month}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-[13px] font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 [&_svg]:size-4">
              <Download /> CSV
            </a>
          </>
        }
      />

      {/* Synthèse — deltas vs mois précédent */}
      <div className="mb-7 grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex h-full flex-col rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-zinc-400">{k.label}</p>
            <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-2">
              <p className={cn("text-base font-semibold tracking-tight", k.tone)}>{k.value}</p>
              <Delta delta={k.delta} good={k.good} force={k.force} />
            </div>
            <p className="mt-1 text-[11px] leading-tight text-zinc-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Encaissements du mois — journal (une ligne par mouvement d'argent) */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-bold text-zinc-700">Encaissements du mois</p>
          <span className="text-xs tabular-nums text-zinc-400">{payments.length} · {chf(totalRev)}</span>
        </div>
        <RecettesTable
          rows={payments.map((p): PayRow => ({
            id: p.id,
            orderId: p.orderId,
            dateISO: p.paidAt.toISOString(),
            dateLabel: p.paidAt.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" }),
            name: `${p.order.contact.firstName} ${p.order.contact.lastName}`.trim(),
            orderNo: p.order.orderNo,
            occasion: p.order.occasion,
            kind: p.kind,
            cents: p.cents,
          }))}
        />

        {/* Créances — livré mais pas encore payé (hors CA tant que l'argent n'est pas là) */}
        {receivables.length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
              <HandCoins className="size-4" /> À encaisser — {chf(receivablesTotal)}
            </p>
            <ul className="space-y-1">
              {receivables.slice(0, 6).map(({ o, pay }) => (
                <li key={o.id}>
                  <Link href={`/commandes/${o.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[13px] hover:bg-white/70">
                    <span className="truncate font-medium text-zinc-800">{o.contact.firstName} {o.contact.lastName}</span>
                    <span className="text-[11px] text-zinc-400">livrée {o.deliveredAt?.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
                    <span className="ml-auto whitespace-nowrap font-semibold tabular-nums text-amber-700">{chf(pay.dueCents)}</span>
                  </Link>
                </li>
              ))}
              {receivables.length > 6 && <li className="px-2 text-[12px] text-amber-700/70">+ {receivables.length - 6} autre{receivables.length - 6 > 1 ? "s" : ""}…</li>}
            </ul>
          </div>
        )}
      </div>

      <ExpensesSection rows={expenseRows} />

      <p className="mt-4 text-xs text-zinc-400">
        Comptabilité d'encaissement : chaque paiement compte à sa date de réception (un acompte de décembre et un solde de mars tombent chacun dans leur année). À confirmer avec ta fiduciaire.
      </p>
    </>
  );
}
