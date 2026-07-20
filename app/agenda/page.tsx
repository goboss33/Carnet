import Link from "next/link";
import { prisma, currentTenant } from "@/lib/db";
import { fmtCHF, fmtDate } from "@/lib/statuts";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function Agenda() {
  const tenant = await currentTenant();
  const orders = await prisma.order.findMany({
    where: {
      tenantId: tenant.id,
      status: { in: ["ACOMPTE_RECU", "EN_PRODUCTION", "DEVIS_ENVOYE"] },
      eventDate: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
    },
    include: { contact: true },
    orderBy: { eventDate: "asc" },
  });

  return (
    <>
      <PageHeader
        title="Agenda de production"
        subtitle="Les événements à venir, par date — ce qui doit sortir de l'atelier."
      />
      <ul className="space-y-3">
        {orders.map((o) => {
          const days = o.eventDate ? Math.ceil((o.eventDate.getTime() - Date.now()) / 86400000) : null;
          return (
            <li key={o.id}>
              <Link
                href={`/commandes/${o.id}`}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 transition-shadow hover:shadow-sm"
              >
                <div className="w-24 text-center">
                  <p className="text-lg font-bold leading-none">{fmtDate(o.eventDate)}</p>
                  {days != null && (
                    <p className={`mt-1 text-[11px] font-semibold ${days <= 7 ? "text-amber-600" : "text-zinc-400"}`}>
                      {days <= 0 ? "aujourd'hui" : `J-${days}`}
                    </p>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{o.contact.firstName} {o.contact.lastName} — {o.occasion || "à préciser"}</p>
                  <p className="text-sm text-zinc-500">
                    {o.parts ? `${o.parts} parts` : "parts ?"} · {o.deliveryMode === "livraison" ? "livraison" : "retrait"} · {fmtCHF(o.priceQuoted)}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                  {o.status === "EN_PRODUCTION" ? "en production" : o.status === "ACOMPTE_RECU" ? "confirmé" : "devis envoyé"}
                </span>
              </Link>
            </li>
          );
        })}
        {orders.length === 0 && <li className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center text-zinc-400">Rien de prévu — encore.</li>}
      </ul>
    </>
  );
}
