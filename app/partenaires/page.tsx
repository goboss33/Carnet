import { prisma, currentTenant } from "@/lib/db";
import { markCommissionPaid } from "@/app/actions";
import PartnerForm from "./PartnerForm";
import Shell from "@/app/components/Shell";
import Link from "next/link";
import { chf } from "@/lib/money";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  COMMERCE: "Commerce",
  PHOTOGRAPHE: "Photographe",
  WEDDING_PLANNER: "Wedding planner",
  SALLE: "Salle / domaine",
  AUTRE: "Autre",
};

export default async function Partenaires() {
  const tenant = await currentTenant();
  const partners = await prisma.partner.findMany({
    where: { tenantId: tenant.id },
    include: {
      orders: { include: { contact: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const site = "https://mamangateau.ch";

  return (
    <Shell>
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Partenaires</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-stone-500">
        Chaque partenaire a son lien (QR/flyers) : les demandes arrivées par ce lien lui sont
        rattachées automatiquement. La commission se calcule sur les commandes <b>livrées</b>.
      </p>

      <div className="mb-8">
        <PartnerForm />
      </div>

      <div className="space-y-5">
        {partners.map((p) => {
          const delivered = p.orders.filter((o) => o.status === "LIVRE" && o.priceQuoted);
          const due = delivered.filter((o) => !o.commissionPaidAt);
          const dueCents = due.reduce((a, o) => a + Math.round((o.priceQuoted ?? 0) * 100 * (p.ratePct / 100)), 0);
          const totalBrought = p.orders.reduce((a, o) => a + (o.priceQuoted ?? 0) * 100, 0);
          return (
            <section key={p.id} className="rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold">{p.name}</h2>
                <span className="text-sm text-stone-500">{TYPES[p.type]} · {p.ratePct} %</span>
                <code className="rounded bg-stone-100 px-2 py-0.5 text-xs font-bold text-stone-600">{p.code}</code>
                <span className="ml-auto text-sm text-stone-500">
                  {p.orders.length} demande{p.orders.length > 1 ? "s" : ""} · {chf(totalBrought)} apportés ·{" "}
                  <b className={dueCents > 0 ? "text-amber-700" : "text-stone-700"}>{chf(dueCents)} à verser</b>
                </span>
              </div>
              <p className="mt-2 text-xs text-stone-400">
                Lien à encoder dans le QR : <code className="select-all rounded bg-stone-50 px-1.5 py-0.5">{site}/?ref={p.code}</code>
              </p>
              {due.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm">
                  {due.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3">
                      <Link href={`/commandes/${o.id}`} className="font-semibold hover:underline">
                        {o.contact.firstName} {o.contact.lastName}
                      </Link>
                      <span className="text-stone-500">{o.occasion || "—"} · livré le {o.deliveredAt?.toLocaleDateString("fr-CH")}</span>
                      <span className="font-semibold">{chf(Math.round((o.priceQuoted ?? 0) * 100 * (p.ratePct / 100)))}</span>
                      <form action={markCommissionPaid.bind(null, o.id)}>
                        <button className="rounded-md border border-emerald-600/40 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                          Versé ✓
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {partners.length === 0 && (
          <p className="rounded-2xl border border-dashed border-stone-300 px-6 py-10 text-center text-stone-400">
            Aucun partenaire pour l'instant — crée le premier ci-dessus (ex. la boulangerie, code BOUL-PULLY).
          </p>
        )}
      </div>
    </Shell>
  );
}
