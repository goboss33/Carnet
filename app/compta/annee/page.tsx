import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { chf } from "@/lib/money";
import Shell from "@/app/components/Shell";

export const dynamic = "force-dynamic";

export default async function Annee({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const { y } = await searchParams;
  const year = /^\d{4}$/.test(y ?? "") ? Number(y) : new Date().getFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const tenant = await currentTenant();
  const [expenses, delivered] = await Promise.all([
    prisma.expense.findMany({ where: { tenantId: tenant.id, status: "CONFIRMED", date: { gte: start, lt: end } } }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: start, lt: end } } }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const rev = delivered.filter((o) => o.deliveredAt!.getUTCMonth() === i).reduce((a, o) => a + (o.priceQuoted ?? 0) * 100, 0);
    const exp = expenses.filter((e) => e.date.getUTCMonth() === i).reduce((a, e) => a + e.totalCents, 0);
    return { i, rev, exp };
  });
  const totRev = months.reduce((a, m) => a + m.rev, 0);
  const totExp = months.reduce((a, m) => a + m.exp, 0);
  const name = (i: number) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString("fr-CH", { month: "long", timeZone: "UTC" });

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Compta — année</h1>
        <nav className="flex items-center gap-1 text-sm font-semibold text-stone-500">
          <Link href={`/compta/annee?y=${year - 1}`} className="rounded-md px-2 py-1 hover:bg-stone-100">←</Link>
          <span className="w-16 text-center text-stone-800">{year}</span>
          <Link href={`/compta/annee?y=${year + 1}`} className="rounded-md px-2 py-1 hover:bg-stone-100">→</Link>
        </nav>
        <div className="ml-auto flex gap-2">
          <Link href="/compta" className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-600 hover:border-stone-500">Vue mensuelle</Link>
          <a href={`/api/compta/export?y=${year}`} className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-600 hover:border-stone-500">⬇ Export {year}</a>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[11px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3">Mois</th>
              <th className="px-4 py-3 text-right">Recettes</th>
              <th className="px-4 py-3 text-right">Dépenses</th>
              <th className="px-4 py-3 text-right">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.i} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-2.5 font-semibold capitalize">
                  <Link href={`/compta?m=${year}-${String(m.i + 1).padStart(2, "0")}`} className="hover:underline">{name(m.i)}</Link>
                </td>
                <td className="px-4 py-2.5 text-right text-emerald-700">{m.rev ? chf(m.rev) : "—"}</td>
                <td className="px-4 py-2.5 text-right text-red-700">{m.exp ? chf(m.exp) : "—"}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${m.rev - m.exp < 0 ? "text-red-700" : ""}`}>{m.rev || m.exp ? chf(m.rev - m.exp) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-bold">
            <tr>
              <td className="px-4 py-3">Total {year}</td>
              <td className="px-4 py-3 text-right text-emerald-700">{chf(totRev)}</td>
              <td className="px-4 py-3 text-right text-red-700">{chf(totExp)}</td>
              <td className="px-4 py-3 text-right">{chf(totRev - totExp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Shell>
  );
}
