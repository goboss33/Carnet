import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { fmtDate, fmtCHF, STATUTS } from "@/lib/statuts";
import { avatar } from "@/lib/ui";
import Shell from "@/app/components/Shell";
import ContactForm from "./ContactForm";
import NewOrderForm from "./NewOrderForm";

export const dynamic = "force-dynamic";

export default async function ContactFiche({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { orders: { orderBy: { createdAt: "desc" }, include: { partner: true } } },
  });
  if (!contact) notFound();
  const av = avatar(`${contact.firstName} ${contact.lastName}`);
  const total = contact.orders.filter((o) => o.status === "LIVRE").reduce((a, o) => a + (o.priceQuoted ?? 0), 0);

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-4">
        <span className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold ${av.color}`}>{av.initials}</span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{contact.firstName} {contact.lastName}</h1>
          <p className="text-sm text-stone-500">
            {contact.orders.length} commande{contact.orders.length > 1 ? "s" : ""} · CHF {total} au total · client depuis {fmtDate(contact.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <ContactForm
          contact={{
            id: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            phone: contact.phone,
            email: contact.email,
            instagram: contact.instagram,
            source: contact.source,
            notes: contact.notes,
            consentNewsletter: contact.consentNewsletter,
          }}
          ordersCount={contact.orders.length}
        />

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Historique</p>
            <NewOrderForm contactId={contact.id} />
          </div>
          <ul className="space-y-2">
            {contact.orders.map((o) => {
              const st = STATUTS.find((s) => s.id === o.status);
              return (
                <li key={o.id}>
                  <Link href={`/commandes/${o.id}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 text-sm transition-shadow hover:shadow-sm">
                    <span className={`h-2 w-2 rounded-full ${st?.dot ?? "bg-stone-300"}`} />
                    <span className="font-semibold">{o.occasion || "—"}</span>
                    <span className="text-stone-400">{fmtDate(o.eventDate)}</span>
                    {o.partner && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">🤝 {o.partner.name}</span>}
                    <span className="ml-auto font-bold">{fmtCHF(o.priceQuoted)}</span>
                  </Link>
                </li>
              );
            })}
            {contact.orders.length === 0 && <li className="py-6 text-center text-sm text-stone-400">Aucune commande.</li>}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
