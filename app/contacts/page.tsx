import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { fmtDate } from "@/lib/statuts";
import { SOURCE_BADGE, avatar } from "@/lib/ui";
import Shell from "@/app/components/Shell";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const COLS = [
  { id: "nom", label: "Nom" },
  { id: "canal", label: "Canal" },
  { id: "date", label: "Ajouté le" },
  { id: "commande", label: "Dernière commande" },
] as const;

export default async function Contacts({ searchParams }: { searchParams: Promise<{ tri?: string; dir?: string }> }) {
  const { tri = "date", dir = "desc" } = await searchParams;
  const d: "asc" | "desc" = dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.ContactOrderByWithRelationInput =
    tri === "nom" ? { firstName: d } : tri === "canal" ? { source: d } : { createdAt: d };

  const tenant = await currentTenant();
  const contacts = await prisma.contact.findMany({
    where: { tenantId: tenant.id },
    include: { orders: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy,
  });

  const arrow = (c: string) => (tri === c ? (d === "asc" ? " ↑" : " ↓") : "");
  const flip = (c: string) => (tri === c && d === "desc" ? "asc" : "desc");

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Contacts <span className="text-base font-semibold text-stone-400">({contacts.length})</span>
        </h1>
        <div className="flex gap-2">
          <Link href="/import" className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-600 hover:border-stone-500">
            ⬆ Importer
          </Link>
          <Link href="/nouveau" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">
            + Nouvelle fiche
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[11px] uppercase tracking-wider text-stone-500">
            <tr>
              {COLS.map((c) =>
                c.id === "commande" ? (
                  <th key={c.id} className="px-4 py-3">{c.label}</th>
                ) : (
                  <th key={c.id} className="px-4 py-3">
                    <Link href={`/contacts?tri=${c.id}&dir=${flip(c.id)}`} className="hover:text-stone-800">
                      {c.label}{arrow(c.id)}
                    </Link>
                  </th>
                )
              )}
              <th className="px-4 py-3">Mobile</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const av = avatar(`${c.firstName} ${c.lastName}`);
              const src = SOURCE_BADGE[c.source] ?? SOURCE_BADGE.AUTRE;
              const o = c.orders[0];
              return (
                <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5 font-semibold hover:underline">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${av.color}`}>
                        {av.initials}
                      </span>
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{src.emoji} {src.label}</td>
                  <td className="px-4 py-2.5 text-stone-500">{fmtDate(c.createdAt)}</td>
                  <td className="px-4 py-2.5 text-stone-500">
                    {o ? (
                      <Link href={`/commandes/${o.id}`} className="hover:underline">
                        {o.occasion || "—"} · {fmtDate(o.eventDate)}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5">{c.phone || "—"}</td>
                </tr>
              );
            })}
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-400">Aucun contact — crée ta première fiche.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
