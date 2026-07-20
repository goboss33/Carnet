import { prisma, currentTenant } from "@/lib/db";
import { markCommissionPaid, togglePartnerActive, deletePartner } from "@/app/actions";
import PartnerForm from "./PartnerForm";
import Applications, { type AppRow } from "./Applications";
import { waLink } from "@/lib/wa";
import { Printer } from "lucide-react";
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
  const pendingApps = await prisma.partnerApplication.findMany({
    where: { tenantId: tenant.id, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  const appRows: AppRow[] = pendingApps.map((a) => ({
    id: a.id,
    business: a.business,
    typeLabel: a.typeLabel || TYPES[a.type] || a.type,
    contactName: a.contactName,
    phone: a.phone,
    city: a.city,
    message: a.message,
    waUrl: a.phone ? waLink(a.phone, `Bonjour ${a.contactName || ""} ! C'est Annie de Maman Gâteau — merci pour votre message, je serais ravie d'en discuter.`) : null,
  }));

  const partners = await prisma.partner.findMany({
    where: { tenantId: tenant.id },
    include: {
      orders: { include: { contact: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const site = "https://mamangateau.ch";

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Partenaires</h1>
        <a href="/api/flyer" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 [&_svg]:size-4">
          <Printer /> Flyer générique
        </a>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-zinc-500">
        Chaque partenaire a son lien (QR/flyers) : les demandes arrivées par ce lien lui sont
        rattachées automatiquement. La commission se calcule sur les commandes <b>livrées</b>.
      </p>

      <Applications apps={appRows} />

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
            <section key={p.id} className={`rounded-2xl border border-zinc-200 bg-white p-6 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold">{p.name}</h2>
                {!p.active && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-500">Inactif</span>}
                <span className="text-sm text-zinc-500">{TYPES[p.type]} · {p.ratePct} %</span>
                <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-bold text-zinc-600">{p.code}</code>
                <a href={`/api/partenaires/${p.id}/flyer`} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 [&_svg]:size-3" title="Flyer A6 avec son QR">
                  <Printer /> Flyer
                </a>
                <span className="ml-auto text-sm text-zinc-500">
                  {p.orders.length} demande{p.orders.length > 1 ? "s" : ""} · {chf(totalBrought)} apportés ·{" "}
                  <b className={dueCents > 0 ? "text-amber-700" : "text-zinc-700"}>{chf(dueCents)} à verser</b>
                </span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Lien à encoder dans le QR : <code className="select-all rounded bg-zinc-50 px-1.5 py-0.5">{site}/?ref={p.code}</code>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-3">
                <form action={togglePartnerActive.bind(null, p.id)}>
                  <button className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">
                    {p.active ? "⏸ Désactiver" : "▶ Réactiver"}
                  </button>
                </form>
                {p.orders.length === 0 ? (
                  <form action={deletePartner.bind(null, p.id)}>
                    <button className="text-xs font-semibold text-red-500 hover:text-red-700">Supprimer</button>
                  </form>
                ) : (
                  <span className="text-xs text-zinc-400">
                    Suppression impossible ({p.orders.length} commande{p.orders.length > 1 ? "s" : ""}) — désactive plutôt.
                  </span>
                )}
              </div>
              {due.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-zinc-100 pt-4 text-sm">
                  {due.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3">
                      <Link href={`/commandes/${o.id}`} className="font-semibold hover:underline">
                        {o.contact.firstName} {o.contact.lastName}
                      </Link>
                      <span className="text-zinc-500">{o.occasion || "—"} · livré le {o.deliveredAt?.toLocaleDateString("fr-CH")}</span>
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
          <p className="rounded-2xl border border-dashed border-zinc-300 px-6 py-10 text-center text-zinc-400">
            Aucun partenaire pour l'instant — crée le premier ci-dessus (ex. la boulangerie, code BOUL-PULLY).
          </p>
        )}
      </div>
    </>
  );
}
