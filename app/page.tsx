import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { STATUTS, fmtCHF } from "@/lib/statuts";
import { SOURCE_BADGE, avatar, fmtRel } from "@/lib/ui";
import { advanceStatus } from "@/app/actions";
import Shell from "@/app/components/Shell";

export const dynamic = "force-dynamic";

const TONE = {
  urgent: "bg-red-50 text-red-700",
  soon: "bg-amber-50 text-amber-700",
  normal: "bg-stone-100 text-stone-500",
  past: "bg-stone-100 text-stone-400",
};

export default async function Pipeline() {
  const tenant = await currentTenant();
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [orders, deliveredMonth] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId: tenant.id, status: { not: "ANNULE" } },
      include: { contact: true },
      orderBy: [{ eventDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.order.findMany({ where: { tenantId: tenant.id, status: "LIVRE", deliveredAt: { gte: monthStart } } }),
  ]);

  const active = orders.filter((o) => o.status !== "LIVRE");
  const week = active.filter(
    (o) => o.eventDate && o.eventDate.getTime() - Date.now() < 7 * 86400000 && o.eventDate.getTime() > Date.now() - 86400000
  );
  const caMonth = deliveredMonth.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const caPending = active.reduce((a, o) => a + (o.priceQuoted ?? 0), 0);
  const leads = active.filter((o) => o.status === "LEAD").length;

  const stats = [
    { label: "CA livré ce mois", value: `CHF ${caMonth}`, sub: `${deliveredMonth.length} commande${deliveredMonth.length > 1 ? "s" : ""}` },
    { label: "En cours", value: String(active.length), sub: `CHF ${caPending} au total` },
    { label: "Cette semaine", value: String(week.length), sub: "à produire / livrer" },
    { label: "Leads à traiter", value: String(leads), sub: leads ? "devis à envoyer" : "tout est traité 🎉" },
  ];

  return (
    <Shell>
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
        <Link href="/nouveau" className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700">
          + Fiche rapide
        </Link>
      </div>

      {/* Synthèse */}
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{s.label}</p>
            <p className="mt-0.5 text-xl font-bold tracking-tight">{s.value}</p>
            <p className="text-xs text-stone-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Colonnes */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STATUTS.map((col) => {
          const all = orders.filter((o) => o.status === col.id);
          const list = col.id === "LIVRE" ? all.slice(0, 5) : all;
          return (
            <section key={col.id} className="flex flex-col rounded-2xl bg-stone-100/70 p-2">
              <header className="flex items-center gap-2 px-2 py-2">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                <h2 className="text-[13px] font-bold uppercase tracking-wide text-stone-600">{col.label}</h2>
                <span className="ml-auto text-xs font-bold text-stone-400">{all.length}</span>
              </header>
              <ul className="space-y-2">
                {list.length === 0 && (
                  <li className="rounded-xl border border-dashed border-stone-200 px-3 py-5 text-center text-xs text-stone-400">
                    {col.hint}
                  </li>
                )}
                {list.map((o) => {
                  const av = avatar(`${o.contact.firstName} ${o.contact.lastName}`);
                  const rel = fmtRel(o.eventDate);
                  const src = SOURCE_BADGE[o.source] ?? SOURCE_BADGE.AUTRE;
                  return (
                    <li key={o.id} className="group rounded-xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-px hover:shadow-md">
                      <Link href={`/commandes/${o.id}`} className="block px-3.5 pb-2.5 pt-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${av.color}`}>
                            {av.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold leading-tight">
                              {o.contact.firstName} {o.contact.lastName}
                            </p>
                            <p className="truncate text-xs text-stone-400">{o.occasion || "occasion à préciser"}</p>
                          </div>
                          <span title={src.label} aria-label={src.label}>{src.emoji}</span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE[rel.tone]}`}>{rel.text}</span>
                          <span className="text-[13px] font-bold text-stone-700">{fmtCHF(o.priceQuoted)}</span>
                        </div>
                      </Link>
                      {col.id !== "LIVRE" && (
                        <form action={advanceStatus.bind(null, o.id)} className="border-t border-stone-100 px-1.5 py-1">
                          <button className="w-full rounded-lg py-1 text-[11px] font-semibold text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-700">
                            Étape suivante →
                          </button>
                        </form>
                      )}
                    </li>
                  );
                })}
                {col.id === "LIVRE" && all.length > 5 && (
                  <li className="px-2 py-1.5 text-center text-[11px] text-stone-400">
                    + {all.length - 5} plus anciennes — voir <Link href="/compta" className="underline">Compta</Link> & <Link href="/contacts" className="underline">Contacts</Link>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
