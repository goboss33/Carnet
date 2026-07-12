import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUTS, fmtCHF, fmtDate } from "@/lib/statuts";
import { advanceStatus } from "@/app/actions";
import Shell from "@/app/components/Shell";

export const dynamic = "force-dynamic";

export default async function Pipeline() {
  const tenant = await currentTenant();
  const orders = await prisma.order.findMany({
    where: { tenantId: tenant.id, status: { not: "ANNULE" } },
    include: { contact: true },
    orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
  });

  return (
    <Shell>
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <p className="text-sm text-stone-500">
          {orders.length} commande{orders.length > 1 ? "s" : ""} en cours
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STATUTS.map((col) => {
          const list = orders.filter((o) => o.status === col.id);
          return (
            <section key={col.id} className="rounded-xl border border-stone-200 bg-white">
              <header className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-500">
                  {list.length}
                </span>
              </header>
              <ul className="space-y-2 p-3">
                {list.length === 0 && <li className="px-1 py-2 text-xs text-stone-400">{col.hint}</li>}
                {list.map((o) => (
                  <li key={o.id} className="group rounded-lg border border-stone-200 p-3 transition-shadow hover:shadow-sm">
                    <Link href={`/commandes/${o.id}`} className="block">
                      <p className="font-semibold leading-tight">
                        {o.contact.firstName} {o.contact.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {o.occasion || "—"} · {fmtDate(o.eventDate)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {o.parts ? `${o.parts} parts · ` : ""}
                        <span className="font-semibold text-stone-700">{fmtCHF(o.priceQuoted)}</span>
                      </p>
                    </Link>
                    {col.id !== "LIVRE" && (
                      <form action={advanceStatus.bind(null, o.id)}>
                        <button className="mt-2 w-full rounded-md border border-stone-200 py-1 text-xs font-semibold text-stone-500 opacity-0 transition-opacity hover:bg-stone-50 group-hover:opacity-100">
                          Étape suivante →
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
