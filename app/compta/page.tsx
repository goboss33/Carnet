import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { chf, CATEGORIES, mileageCents } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { paymentState } from "@/lib/payments";
import { occasionIcon, occasionShort } from "@/lib/occasions";
import { updateExpense, deleteExpense, purgeEmptyDrafts } from "@/app/actions";
import { FileText, Camera, Download, ArrowUpRight, ArrowDownRight } from "lucide-react";
import MediaViewer from "@/app/components/MediaViewer";
import { PageHeader } from "@/components/ui/page-header";
import MonthNav from "./MonthNav";
import ExpensesSection, { type ExpenseRow } from "./ExpensesSection";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

const input = "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-(--color-brand)";

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

/* Pastille de variation vs mois précédent. good : le sens « heureux » (up pour
   les recettes, down pour les dépenses, null = neutre → gris). */
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
  const [expenses, drafts, delivered, cancelledKept, expPrev, delivPrev, keptPrev] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "desc" } }),
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "DRAFT" }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, include: { contact: true }, orderBy: { deliveredAt: "desc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "ANNULE", cancelledAt: { gte: start, lt: end }, OR: [{ depositCents: { gt: 0 } }, { balanceCents: { gt: 0 } }] }, include: { contact: true }, orderBy: { cancelledAt: "desc" } }),
    prisma.expense.aggregate({ where: { tenantId: tenant.id, status: "CONFIRMED", date: pRange }, _sum: { totalCents: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: pRange }, select: { priceQuoted: true, tipCents: true, deliveryMode: true, deliveryKm: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "ANNULE", cancelledAt: pRange, OR: [{ depositCents: { gt: 0 } }, { balanceCents: { gt: 0 } }] }, select: { depositCents: true, balanceCents: true, priceQuoted: true } }),
  ]);

  const s = await getSettings(tenant.id);
  const mileage = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);
  const kmTotal = delivered.reduce((a, o) => a + (o.deliveryMode === "livraison" && o.deliveryKm ? o.deliveryKm * 2 : 0), 0);
  const totalExp = expenses.reduce((a, e) => a + e.totalCents, 0);
  const keptRev = cancelledKept.reduce((a, o) => a + paymentState(o).paidCents, 0);
  const totalRev = delivered.reduce((a, o) => a + (o.priceQuoted ?? 0) * 100 + (o.tipCents ?? 0), 0) + keptRev;

  // Mois précédent (deltas)
  const prevExp = expPrev._sum.totalCents ?? 0;
  const prevRev =
    delivPrev.reduce((a, o) => a + (o.priceQuoted ?? 0) * 100 + (o.tipCents ?? 0), 0) +
    keptPrev.reduce((a, o) => a + paymentState(o).paidCents, 0);
  const prevMileage = delivPrev.reduce((a, o) => a + (o.deliveryMode === "livraison" ? mileageCents(o.deliveryKm, s.kmRate) : 0), 0);

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

  const kpis = [
    { label: "Recettes", value: chf(totalRev), tone: "text-emerald-700", sub: `${delivered.length + cancelledKept.length} recette${delivered.length + cancelledKept.length > 1 ? "s" : ""}`, delta: totalRev - prevRev, good: "up" as const },
    { label: "Dépenses", value: chf(totalExp), tone: "text-red-700", sub: `${expenses.length} ticket${expenses.length > 1 ? "s" : ""}`, delta: totalExp - prevExp, good: "down" as const },
    { label: "Résultat", value: chf(totalRev - totalExp), tone: totalRev - totalExp >= 0 ? "text-zinc-900" : "text-red-700", sub: "recettes − dépenses", delta: totalRev - totalExp - (prevRev - prevExp), good: "up" as const },
    { label: "Déplacements déductibles", value: chf(mileage), tone: "text-zinc-900", sub: `${kmTotal} km A/R · pour la fiduciaire`, delta: mileage - prevMileage, good: null },
  ];

  return (
    <>
      <PageHeader
        title="Compta"
        subtitle="Recettes, dépenses et déductions du mois."
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
              <Delta delta={k.delta} good={k.good} />
            </div>
            <p className="mt-1 text-[11px] leading-tight text-zinc-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Recettes du mois — langage de l'Historique */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-bold text-zinc-700">Recettes du mois</p>
          <span className="text-xs tabular-nums text-zinc-400">{delivered.length + cancelledKept.length} · {chf(totalRev)}</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {delivered.map((o) => {
            const pay = paymentState(o);
            const OccIcon = occasionIcon(o.occasion);
            return (
              <Link
                key={o.id}
                href={`/commandes/${o.id}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-zinc-100 px-3.5 py-2.5 text-sm transition-colors last:border-b-0 even:bg-zinc-50/50 hover:bg-zinc-50"
              >
                <span className="w-10 shrink-0 whitespace-nowrap text-[12px] tabular-nums text-zinc-400">{o.deliveredAt?.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <OccIcon className="size-3.5 shrink-0 text-(--color-brand)" />
                  <span className="truncate font-medium text-zinc-900">{o.contact.firstName} {o.contact.lastName}</span>
                </span>
                {o.orderNo ? <span className="hidden text-[11px] tabular-nums text-zinc-300 sm:inline">#{String(o.orderNo).padStart(4, "0")}</span> : null}
                {o.deliveryMode === "livraison" && o.deliveryKm ? (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500" title={`Déduction ${chf(mileageCents(o.deliveryKm, s.kmRate))}`}>
                    {o.deliveryKm * 2} km · {chf(mileageCents(o.deliveryKm, s.kmRate))}
                  </span>
                ) : null}
                {!pay.isPaid && pay.dueCents > 0 && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">reste {chf(pay.dueCents)}</span>
                )}
                <span className="ml-auto whitespace-nowrap font-semibold tabular-nums text-zinc-900">
                  {chf((o.priceQuoted ?? 0) * 100)}
                  {o.tipCents ? <span className="ml-1 text-[11px] font-normal text-emerald-600">+{chf(o.tipCents)}</span> : null}
                </span>
              </Link>
            );
          })}
          {cancelledKept.map((o) => (
            <Link
              key={o.id}
              href={`/commandes/${o.id}`}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-zinc-100 px-3.5 py-2.5 text-sm transition-colors last:border-b-0 even:bg-zinc-50/50 hover:bg-zinc-50"
            >
              <span className="w-10 shrink-0 whitespace-nowrap text-[12px] tabular-nums text-zinc-400">{o.cancelledAt?.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
              <span className="truncate font-medium text-zinc-900">{o.contact.firstName} {o.contact.lastName}</span>
              <span className="text-[12px] italic text-zinc-400">acompte conservé — annulation</span>
              <span className="ml-auto whitespace-nowrap font-semibold tabular-nums text-zinc-900">{chf(paymentState(o).paidCents)}</span>
            </Link>
          ))}
          {delivered.length === 0 && cancelledKept.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-zinc-400">Aucune recette ce mois-ci — les livraisons du mois apparaîtront ici.</p>
          )}
        </div>
      </div>

      {/* Tickets à compléter (bot) */}
      {drafts.length > 0 && (
        <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-800">{drafts.length} ticket{drafts.length > 1 ? "s" : ""} à compléter</p>
            <form action={purgeEmptyDrafts}>
              <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">Vider les brouillons vides</button>
            </form>
          </div>
          <div className="space-y-3">
            {drafts.map((e) => (
              <form key={e.id} action={updateExpense.bind(null, e.id)} className="grid grid-cols-2 items-center gap-2 rounded-xl border border-amber-200/70 bg-white/60 p-2.5 sm:flex sm:flex-wrap">
                {e.receiptPath && (
                  <MediaViewer
                    src={`/api/receipts/${e.receiptPath}`}
                    kind={e.receiptPath.endsWith(".pdf") ? "pdf" : "image"}
                    className="col-span-2 inline-flex w-fit items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-zinc-600 hover:border-zinc-400 sm:col-span-1"
                    title="Voir le justificatif"
                  >
                    {e.receiptPath.endsWith(".pdf") ? <FileText className="size-4" /> : <Camera className="size-4" />} Justificatif
                  </MediaViewer>
                )}
                <input name="date" type="date" defaultValue={e.date.toISOString().slice(0, 10)} className={input} />
                <input name="totalChf" type="number" step="0.05" min="0" placeholder="CHF *" required defaultValue={e.totalCents ? e.totalCents / 100 : ""} className={cn(input, "font-semibold sm:w-28")} />
                <input name="merchant" placeholder="Commerçant" defaultValue={e.merchant} className={input} />
                <select name="category" defaultValue={e.category} className={input}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
                <div className="col-span-2 flex items-center justify-end gap-3 sm:col-span-1 sm:ml-auto">
                  <button formAction={deleteExpense.bind(null, e.id)} className="text-[13px] text-zinc-400 hover:text-red-600">Supprimer</button>
                  <button className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700">Valider</button>
                </div>
              </form>
            ))}
          </div>
        </div>
      )}

      <ExpensesSection rows={expenseRows} />
    </>
  );
}
