import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { SOURCES, fmtDate } from "@/lib/statuts";
import Shell from "@/app/components/Shell";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const tenant = await currentTenant();
  const contacts = await prisma.contact.findMany({
    where: { tenantId: tenant.id },
    include: { orders: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <Shell>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Contacts</h1>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-left text-[11px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Dernière commande</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-3 font-semibold">
                  {c.orders[0] ? (
                    <Link href={`/commandes/${c.orders[0].id}`} className="hover:underline">
                      {c.firstName} {c.lastName}
                    </Link>
                  ) : (
                    <>{c.firstName} {c.lastName}</>
                  )}
                </td>
                <td className="px-4 py-3">{c.phone || "—"}</td>
                <td className="px-4 py-3">{c.email || "—"}</td>
                <td className="px-4 py-3">{SOURCES.find((s) => s.id === c.source)?.label}</td>
                <td className="px-4 py-3 text-stone-500">
                  {c.orders[0] ? `${c.orders[0].occasion || "—"} · ${fmtDate(c.orders[0].eventDate)}` : "—"}
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-400">Aucun contact pour l'instant — la première fiche les fera apparaître ici.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
