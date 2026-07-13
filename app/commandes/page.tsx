import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { fmtCHF, fmtDate, SOURCES } from "@/lib/statuts";
import { chf } from "@/lib/money";
import { paymentState } from "@/lib/payments";
import Shell from "@/app/components/Shell";
import type { OrderStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUT: Record<string, { label: string; cls: string }> = {
  LEAD: { label: "Lead", cls: "bg-sky-100 text-sky-700" },
  DEVIS_ENVOYE: { label: "Devis envoyé", cls: "bg-amber-100 text-amber-700" },
  ACOMPTE_RECU: { label: "Acompte reçu", cls: "bg-violet-100 text-violet-700" },
  EN_PRODUCTION: { label: "En production", cls: "bg-orange-100 text-orange-700" },
  LIVRE: { label: "Livré", cls: "bg-emerald-100 text-emerald-700" },
  ANNULE: { label: "Annulé", cls: "bg-stone-200 text-stone-500" },
};
const STATUT_IDS = Object.keys(STATUT) as OrderStatus[];

const input = "rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm outline-none focus:border-amber-600";

export default async function Historique({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; annee?: string; occasion?: string }>;
}) {
  const sp = await searchParams;
  const tenant = await currentTenant();
  const now = new Date();
  const q = (sp.q ?? "").trim();
  const occasion = (sp.occasion ?? "").trim();
  const statut = sp.statut && STATUT_IDS.includes(sp.statut as OrderStatus) ? (sp.statut as OrderStatus) : "";
  // Recherche par nom → on élargit à toutes les années par défaut.
  const yearParam = sp.annee ?? (q ? "all" : String(now.getFullYear()));
  const allYears = yearParam === "all";
  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getFullYear();

  const where: Prisma.OrderWhereInput = { tenantId: tenant.id };
  if (!allYears) where.eventDate = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
  if (statut) where.status = statut;
  if (occasion) where.occasion = { contains: occasion, mode: "insensitive" };
  if (q) where.contact = { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] };

  const orders = await prisma.order.findMany({
    where,
    include: { contact: true },
    orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const total = orders.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const years: string[] = [];
  for (let yy = now.getFullYear(); yy >= 2023; yy--) years.push(String(yy));

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Historique</h1>
        <span className="text-sm text-stone-500">
          {orders.length} commande{orders.length > 1 ? "s" : ""} · {fmtCHF(total)}
          {orders.length >= 300 ? " · 300 max" : ""}
        </span>
      </div>

      {/* Filtres */}
      <form className="mb-5 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Rechercher un client…" className={`${input} min-w-40 flex-1`} />
        <input name="occasion" defaultValue={occasion} placeholder="Occasion" className={`${input} w-32`} />
        <select name="statut" defaultValue={statut} className={input}>
          <option value="">Tous statuts</option>
          {STATUT_IDS.map((s) => (
            <option key={s} value={s}>{STATUT[s].label}</option>
          ))}
        </select>
        <select name="annee" defaultValue={allYears ? "all" : String(year)} className={input}>
          {years.map((yy) => (
            <option key={yy} value={yy}>{yy}</option>
          ))}
          <option value="all">Toutes années</option>
        </select>
        <button className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-700">Filtrer</button>
        {(q || occasion || statut || sp.annee) && (
          <Link href="/commandes" className="text-sm text-stone-400 hover:text-stone-700">Réinitialiser</Link>
        )}
      </form>

      {/* Liste */}
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[11px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Occasion</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3 text-right">Montant</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const pay = paymentState(o);
              const st = STATUT[o.status] ?? STATUT.LEAD;
              return (
                <tr key={o.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-stone-500">
                    {o.eventDate ? fmtDate(o.eventDate) : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/commandes/${o.id}`} className="font-semibold hover:underline">
                      {o.contact.firstName} {o.contact.lastName}
                    </Link>
                    <span className="ml-1.5 text-xs text-stone-400">{SOURCES.find((s) => s.id === o.source)?.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">{o.occasion || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <span className="font-semibold">{fmtCHF(o.priceQuoted)}</span>
                    {o.status !== "ANNULE" && !pay.isPaid && pay.dueCents > 0 && (
                      <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-700">
                        reste {chf(pay.dueCents)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-stone-400">Aucune commande ne correspond.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
