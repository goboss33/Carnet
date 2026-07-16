import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { chf, CATEGORIES, catLabel } from "@/lib/money";
import { fmtCHF } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { updateExpense, createExpense, deleteExpense, purgeEmptyDrafts } from "@/app/actions";
import Shell from "@/app/components/Shell";
import { Save, Trash2, FileText, Camera, Download } from "lucide-react";
import MediaViewer from "@/app/components/MediaViewer";

export const dynamic = "force-dynamic";

const input = "rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-(--color-brand)";

function monthRange(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

export default async function Compta({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { start, end } = monthRange(month);
  const prev = new Date(start); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(start); next.setUTCMonth(next.getUTCMonth() + 1);
  const fmtM = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const tenant = await currentTenant();
  const [expenses, drafts, delivered, cancelledKept] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } }, orderBy: { date: "desc" } }),
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "DRAFT" }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } }, include: { contact: true } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "ANNULE", cancelledAt: { gte: start, lt: end }, OR: [{ depositCents: { gt: 0 } }, { balanceCents: { gt: 0 } }] }, include: { contact: true }, orderBy: { cancelledAt: "desc" } }),
  ]);

  const totalExp = expenses.reduce((a, e) => a + e.totalCents, 0);
  const keptRev = cancelledKept.reduce((a, o) => a + paymentState(o).paidCents, 0);
  const totalRev = delivered.reduce((a, o) => a + (o.priceQuoted ?? 0) * 100, 0) + keptRev;
  const byCat = CATEGORIES.map((c) => ({ ...c, total: expenses.filter((e) => e.category === c.id).reduce((a, e) => a + e.totalCents, 0) })).filter((c) => c.total > 0);
  const label = start.toLocaleDateString("fr-CH", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Compta</h1>
        <nav className="flex items-center gap-1 text-sm font-semibold text-zinc-500">
          <Link href={`/compta?m=${fmtM(prev)}`} className="rounded-md px-2 py-1 hover:bg-zinc-100">←</Link>
          <form className="inline">
            <input
              key={month}
              type="month"
              name="m"
              defaultValue={month}
              onChange={undefined}
              className="rounded-md border border-transparent px-2 py-1 text-center font-semibold text-zinc-800 hover:border-zinc-300"
            />
            <button className="ml-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">OK</button>
          </form>
          <Link href={`/compta?m=${fmtM(next)}`} className="rounded-md px-2 py-1 hover:bg-zinc-100">→</Link>
          <Link href={`/compta/annee?y=${month.slice(0, 4)}`} className="ml-2 rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100">
            Vue annuelle
          </Link>
        </nav>
        <a href={`/api/compta/export?m=${month}`} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 [&_svg]:size-4">
          <Download /> Export CSV
        </a>
      </div>

      {/* Synthèse */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Recettes (livrées)</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{chf(totalRev)}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{delivered.length} commande{delivered.length > 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Dépenses</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{chf(totalExp)}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{expenses.length} ticket{expenses.length > 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Résultat du mois</p>
          <p className={`mt-1 text-2xl font-bold ${totalRev - totalExp >= 0 ? "text-zinc-900" : "text-red-700"}`}>{chf(totalRev - totalExp)}</p>
          <p className="mt-0.5 text-xs text-zinc-400">{byCat.map((c) => `${c.label} ${chf(c.total)}`).join(" · ") || "—"}</p>
        </div>
      </div>

      {/* Recettes du mois */}
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-bold text-zinc-700">Recettes du mois</p>
          <span className="text-xs text-zinc-400">{delivered.length + cancelledKept.length} · {chf(totalRev)}</span>
        </div>
        <div className="space-y-0.5 rounded-2xl border border-zinc-200 bg-white p-3">
          {delivered.map((o) => {
            const pay = paymentState(o);
            return (
              <Link
                key={o.id}
                href={`/commandes/${o.id}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50"
              >
                <span className="w-12 shrink-0 text-zinc-400">{o.deliveredAt?.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
                <span className="font-semibold">{o.contact.firstName} {o.contact.lastName}</span>
                <span className="text-zinc-500">{o.occasion || "—"}</span>
                {!pay.isPaid && pay.dueCents > 0 && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">reste {chf(pay.dueCents)}</span>
                )}
                <span className="ml-auto font-semibold">{fmtCHF(o.priceQuoted)}</span>
              </Link>
            );
          })}
          {cancelledKept.map((o) => (
            <Link
              key={o.id}
              href={`/commandes/${o.id}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50"
            >
              <span className="w-12 shrink-0 text-zinc-400">{o.cancelledAt?.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
              <span className="font-semibold">{o.contact.firstName} {o.contact.lastName}</span>
              <span className="italic text-zinc-400">acompte conservé — annulation</span>
              <span className="ml-auto font-semibold">{chf(paymentState(o).paidCents)}</span>
            </Link>
          ))}
          {delivered.length === 0 && cancelledKept.length === 0 && (
            <p className="px-4 py-8 text-center text-zinc-400">Aucune recette ce mois-ci.</p>
          )}
        </div>
      </div>

      {/* Brouillons à compléter */}
      {drafts.length > 0 && (
        <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-800">{drafts.length} ticket{drafts.length > 1 ? "s" : ""} à compléter</p>
            <form action={purgeEmptyDrafts}>
              <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">
                Supprimer les brouillons vides
              </button>
            </form>
          </div>
          <div className="space-y-3">
            {drafts.map((e) => (
              <form key={e.id} action={updateExpense.bind(null, e.id)} className="flex flex-wrap items-center gap-2">
                {e.receiptPath && (
                  <MediaViewer src={`/api/receipts/${e.receiptPath}`} kind={e.receiptPath.endsWith(".pdf") ? "pdf" : "image"} className="text-zinc-500" title="Voir le justificatif">
                    {e.receiptPath.endsWith(".pdf") ? <FileText className="size-4" /> : <Camera className="size-4" />}
                  </MediaViewer>
                )}
                <input name="date" type="date" defaultValue={e.date.toISOString().slice(0, 10)} className={input} />
                <input name="merchant" placeholder="Commerçant" defaultValue={e.merchant} className={input} />
                <input name="totalChf" type="number" step="0.05" min="0" placeholder="CHF" defaultValue={e.totalCents ? e.totalCents / 100 : ""} className={`${input} w-28`} />
                <select name="category" defaultValue={e.category} className={input}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700">Valider</button>
                <button formAction={deleteExpense.bind(null, e.id)} className="text-sm text-zinc-400 hover:text-red-600">Supprimer</button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* Dépenses du mois */}
      <div className="space-y-1.5 rounded-2xl border border-zinc-200 bg-white p-3">
        {expenses.map((e) => (
          <form
            key={e.id}
            action={updateExpense.bind(null, e.id)}
            className="group flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50"
          >
            <input name="date" type="date" defaultValue={e.date.toISOString().slice(0, 10)} className={`${input} border-transparent bg-transparent group-hover:border-zinc-300`} />
            <input name="merchant" defaultValue={e.merchant} placeholder="Commerçant" className={`${input} w-44 border-transparent bg-transparent font-semibold group-hover:border-zinc-300`} />
            <select name="category" defaultValue={e.category} className={`${input} border-transparent bg-transparent group-hover:border-zinc-300`}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <div className="ml-auto flex items-center gap-2">
              <input name="totalChf" type="number" step="0.05" min="0" defaultValue={(e.totalCents / 100).toFixed(2)} className={`${input} w-24 border-transparent bg-transparent text-right font-semibold group-hover:border-zinc-300`} />
              {e.receiptPath ? (
                <MediaViewer src={`/api/receipts/${e.receiptPath}`} kind={e.receiptPath.endsWith(".pdf") ? "pdf" : "image"} title="Voir le justificatif">
                  {e.receiptPath.endsWith(".pdf") ? <FileText className="size-4 text-zinc-500" /> : <Camera className="size-4 text-zinc-500" />}
                </MediaViewer>
              ) : (
                <span className="w-5 text-center text-zinc-300">—</span>
              )}
              <button className="rounded-md border border-zinc-300 p-1.5 text-zinc-500 opacity-0 transition-opacity hover:bg-zinc-100 group-focus-within:opacity-100 group-hover:opacity-100" title="Enregistrer">
                <Save className="size-3.5" />
              </button>
              <button formAction={deleteExpense.bind(null, e.id)} className="rounded-md p-1.5 text-zinc-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" title="Supprimer">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </form>
        ))}
        {expenses.length === 0 && (
          <p className="px-4 py-10 text-center text-zinc-400">Aucune dépense ce mois-ci — envoie une photo de ticket au bot.</p>
        )}
      </div>

      {/* Saisie manuelle */}
      <details className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-600">+ Ajouter une dépense manuelle</summary>
        <form action={createExpense} className="mt-4 flex flex-wrap items-center gap-2">
          <input name="date" type="date" className={input} />
          <input name="merchant" placeholder="Commerçant" className={input} />
          <input name="totalChf" type="number" step="0.05" min="0" placeholder="CHF" className={`${input} w-28`} required />
          <select name="category" className={input}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input name="notes" placeholder="Note (optionnel)" className={input} />
          <button className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700">Ajouter</button>
        </form>
      </details>
    </Shell>
  );
}
