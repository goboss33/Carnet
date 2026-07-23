import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate, STATUTS, STATUS_TONE, SOURCES } from "@/lib/statuts";
import { paymentState } from "@/lib/payments";
import { occasionIcon, occasionShort } from "@/lib/occasions";
import { avatar, cn } from "@/lib/ui";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { PageHeader } from "@/components/ui/page-header";
import { SaveStatusProvider, SaveToast } from "@/app/commandes/[id]/SaveStatus";
import { MessageCircle } from "lucide-react";
import ContactForm from "./ContactForm";
import NewOrderForm from "./NewOrderForm";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.id, s.label]));
STATUS_LABEL.LEAD = "Lead";
STATUS_LABEL.ANNULE = "Annulé";

export default async function ContactFiche({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { orders: { orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }], include: { partner: true } } },
  });
  if (!contact) notFound();
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const av = avatar(name);
  // Encaissé réel cumulé (cohérent avec la colonne « Total » de la liste).
  const totalCents = contact.orders.reduce((a, o) => a + (o.depositCents ?? 0) + (o.balanceCents ?? 0) + (o.tipCents ?? 0), 0);
  const last = contact.orders[0];
  const fmtChf = (cents: number) => `CHF ${(cents / 100) % 1 ? (cents / 100).toFixed(2) : cents / 100}`;
  const waHref = contact.phone ? `https://wa.me/${contact.phone.replace(/[^0-9]/g, "")}` : null;

  return (
    <SaveStatusProvider>
      <SaveToast />
      <PageHeader
        eyebrow="Contact"
        title={
          <span className="flex items-center gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${av.color}`}>{av.initials}</span>
            <span className="min-w-0 truncate">{name}</span>
            <span title={SOURCES.find((s) => s.id === contact.source)?.label ?? ""} className="shrink-0">
              <ChannelIcon source={contact.source} className="size-5" />
            </span>
          </span>
        }
        actions={
          <>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-2.5 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
            <NewOrderForm contactId={contact.id} />
          </>
        }
      />

      {/* Résumé — mêmes codes que le bandeau de la fiche commande (2×2 sur mobile) */}
      <div className="mb-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-zinc-200 bg-white px-5 py-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Commandes</p>
          <p className="mt-0.5 text-[15px] font-semibold text-zinc-900">{contact.orders.length}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total encaissé</p>
          <p className="mt-0.5 text-[15px] font-semibold text-zinc-900">{totalCents > 0 ? fmtChf(totalCents) : "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Dernière commande</p>
          <p className="mt-0.5 whitespace-nowrap text-[15px] font-semibold text-zinc-900">{last?.eventDate ? fmtDate(last.eventDate) : "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Cliente depuis</p>
          <p className="mt-0.5 text-[15px] font-semibold text-zinc-900">{contact.createdAt.getFullYear()}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <ContactForm
          contact={{
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            phone: contact.phone,
            email: contact.email,
            instagram: contact.instagram,
            facebook: contact.facebook,
            source: contact.source,
            notes: contact.notes,
            consentNewsletter: contact.consentNewsletter,
          }}
          ordersCount={contact.orders.length}
        />

        {/* Historique — mêmes codes visuels que la table Historique */}
        <div className="min-w-0 self-start rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Historique</p>
          <ul className="space-y-2">
            {contact.orders.map((o) => {
              const OccIcon = occasionIcon(o.occasion);
              const pay = paymentState(o);
              const paid = pay.paidCents / 100;
              const pct = pay.totalCents > 0 ? Math.min(100, Math.round((pay.paidCents / pay.totalCents) * 100)) : 0;
              const tone = o.status === "ANNULE" || pay.totalCents === 0 ? "bg-zinc-300" : pay.paidCents >= pay.totalCents ? "bg-emerald-500" : pay.paidCents > 0 ? "bg-amber-500" : "bg-red-500";
              return (
                <li key={o.id}>
                  <Link href={`/commandes/${o.id}`} className="block rounded-xl border border-zinc-200 px-4 py-3 text-sm transition-shadow hover:shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-zinc-900">
                        <OccIcon className="size-3.5 shrink-0 text-(--color-brand)" />
                        <span className="truncate">{o.occasion ? occasionShort(o.occasion) : "—"}</span>
                      </span>
                      {o.orderNo ? <span className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-400">#{String(o.orderNo).padStart(4, "0")}</span> : null}
                      <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_TONE[o.status] ?? "bg-zinc-100 text-zinc-600")}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-end justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2 text-[12px] text-zinc-400">
                        <span className="whitespace-nowrap tabular-nums">{o.eventDate ? fmtDate(o.eventDate) : "date ?"}</span>
                        {o.partner && <span className="truncate rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">{o.partner.name}</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="whitespace-nowrap text-[12px] font-semibold tabular-nums text-zinc-800">
                          CHF {paid % 1 ? paid.toFixed(2) : paid} / {o.priceQuoted ?? "—"}
                        </span>
                        <span className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-zinc-100">
                          <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(pct, pay.paidCents > 0 ? 6 : 0)}%` }} />
                        </span>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
            {contact.orders.length === 0 && <li className="py-6 text-center text-sm text-zinc-400">Aucune commande — crée la première avec « + Nouvelle commande ».</li>}
          </ul>
        </div>
      </div>
    </SaveStatusProvider>
  );
}
