import Link from "next/link";
import InspirationManager from "./InspirationManager";
import StudioPanel from "./StudioPanel";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SOURCES, fmtCHF, fmtDate } from "@/lib/statuts";
import { chf } from "@/lib/money";
import { paymentState } from "@/lib/payments";
import { waLink } from "@/lib/wa";
import { getSettings } from "@/lib/settings";
import { updateOrder, addNote, setOrderPartner, recordPayment, markPaidInFull, refundDeposit, assistantSend, setRevenueCategory } from "@/app/actions";
import DeleteOrderButton from "./DeleteOrderButton";
import MediaViewer from "@/app/components/MediaViewer";
import CopyButton from "./CopyButton";
import { PageHeader } from "@/components/ui/page-header";
import { AutoSaveForm, AutoSelect } from "./AutoSave";
import { SaveStatusProvider, SaveToast } from "./SaveStatus";
import { StatusPicker } from "./StatusPicker";
import { OccasionPicker } from "./OccasionPicker";
import { TiersParts, FourrageChips, DeliveryFields } from "./OrderFields";
import { BISCUITS } from "@/lib/order-options";
import { cn } from "@/lib/ui";
import { Phone, MessageCircle, Calendar, Cake, Truck, StickyNote, Images } from "lucide-react";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

export default async function Commande({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      contact: { include: { _count: { select: { orders: true } } } },
      partner: true,
      activities: { orderBy: { createdAt: "desc" }, take: 30 },
      aiMessages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();
  const partners = await prisma.partner.findMany({ where: { tenantId: order.tenantId, active: true }, orderBy: { name: "asc" } });
  const c = order.contact;
  const pay = paymentState(order);
  const eff = await getSettings(order.tenantId);
  const lastAssistant = order.aiMessages.filter((m) => m.role === "assistant").at(-1);
  const d = (x?: Date | null) => (x ? x.toISOString().slice(0, 10) : "");

  const days = order.eventDate ? Math.ceil((order.eventDate.getTime() - Date.now()) / 86400000) : null;
  const jx = days === null ? null : days < 0 ? "passé" : days === 0 ? "aujourd'hui" : days === 1 ? "demain" : `J-${days}`;
  const jxTone = days === null ? "" : days < 0 ? "bg-zinc-100 text-zinc-400" : days <= 1 ? "bg-red-50 text-red-600" : days <= 7 ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500";
  const payBadge =
    order.status === "ANNULE" ? null
    : pay.isPaid ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">Soldé</span>
    : pay.hasTotal && pay.dueCents > 0 ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">reste {chf(pay.dueCents)}</span>
    : null;

  return (
    <SaveStatusProvider>
      <SaveToast />
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={`${SOURCES.find((s) => s.id === order.source)?.label ?? ""} · créé le ${fmtDate(order.createdAt)}`}
        actions={
          c.phone ? (
            <>
              <a href={`tel:${c.phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-[13px] font-medium text-zinc-700 transition-colors hover:border-zinc-400"><Phone className="size-4" /> Appeler</a>
              <a href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"><MessageCircle className="size-4" /> WhatsApp</a>
            </>
          ) : undefined
        }
      />

      {/* bandeau résumé — l'essentiel d'un coup d'œil */}
      <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-(--color-line) bg-white p-4 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Statut</p>
          <div className="mt-1"><StatusPicker orderId={order.id} current={order.status} /></div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Occasion</p>
          <OccasionPicker orderId={order.id} current={order.occasion} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Événement</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{order.eventDate ? fmtDate(order.eventDate) : "—"}</p>
          {jx && <p className="mt-1"><span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold", jxTone)}>{jx}</span></p>}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Paiement</p>
          <p className="mt-1 text-sm font-medium text-zinc-900">{fmtCHF(order.priceQuoted)}</p>
          {payBadge && <p className="mt-1">{payBadge}</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* -------- commande (auto-save) -------- */}
        <div className="space-y-6">
          <AutoSaveForm action={updateOrder.bind(null, order.id)} className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
            <section>
              <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2 text-[13px] font-semibold text-zinc-700"><Calendar className="size-4 text-(--color-brand)" /> L'événement</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className={label}>Fêté·e</span><input name="celebrant" defaultValue={order.celebrant} className={input} /></label>
                <label><span className={label}>Âge</span><input name="celebrantAge" type="number" defaultValue={order.celebrantAge ?? ""} className={input} /></label>
                <label><span className={label}>Date de l'événement</span><input name="eventDate" type="date" defaultValue={d(order.eventDate)} className={input} /></label>
                <label className="sm:col-span-2"><span className={label} title="Heure du retrait ou de la livraison">RDV de remise</span><input name="handoverAt" type="datetime-local" defaultValue={order.handoverAt ? new Date(order.handoverAt.getTime() - order.handoverAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} className={input} /></label>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2 text-[13px] font-semibold text-zinc-700"><Cake className="size-4 text-(--color-brand)" /> Le gâteau</div>
              <div className="space-y-4">
                <TiersParts tiers={order.tiers} parts={order.parts} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className={label}>Prix (CHF)</span><input name="priceQuoted" type="number" defaultValue={order.priceQuoted ?? ""} className={input} /></label>
                  <label>
                    <span className={label}>Biscuit</span>
                    <select name="biscuit" defaultValue={order.biscuit} className={input}>
                      <option value="">—</option>
                      {BISCUITS.map((b) => <option key={b} value={b}>{b}</option>)}
                      {order.biscuit && !(BISCUITS as readonly string[]).includes(order.biscuit) && <option value={order.biscuit}>{order.biscuit}</option>}
                    </select>
                  </label>
                </div>
                <FourrageChips selected={order.fourrages} />
                <label className="block"><span className={label}>Thème & style</span><input name="themeNote" defaultValue={order.themeNote} className={input} placeholder="Ex. licorne pastel arc-en-ciel, semi-naked fleurs fraîches…" /></label>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2 text-[13px] font-semibold text-zinc-700"><Truck className="size-4 text-(--color-brand)" /> Remise</div>
              <DeliveryFields mode={order.deliveryMode} address={order.deliveryAddress} />
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2 text-[13px] font-semibold text-zinc-700"><StickyNote className="size-4 text-(--color-brand)" /> Notes internes</div>
              <textarea name="notes" rows={3} defaultValue={order.notes} className={input} />
            </section>
          </AutoSaveForm>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2 border-b border-zinc-100 pb-2 text-[13px] font-semibold text-zinc-700"><Images className="size-4 text-(--color-brand)" /> Photos d'inspiration</div>
            <InspirationManager orderId={order.id} photos={order.inspirationPhotos} />
          </div>
        </div>

        {/* -------- contact + journal -------- */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Contact</p>
              <Link href={`/contacts/${c.id}`} className="text-xs font-semibold text-zinc-500 hover:text-zinc-800">Fiche complète →</Link>
            </div>
            <Link href={`/contacts/${c.id}`} className="block text-[15px] font-bold text-zinc-900 hover:underline">
              {c.firstName} {c.lastName}
            </Link>
            <p className="mb-3 mt-0.5 text-xs text-zinc-400">
              {SOURCES.find((s) => s.id === c.source)?.label}
              {" · "}
              {c._count.orders > 1 ? `${c._count.orders} commandes` : "1re commande"}
              {" · client depuis "}
              {c.createdAt.getFullYear()}
            </p>
            <dl className="space-y-1.5">
              {c.phone && <div className="flex justify-between"><dt className="text-zinc-500">Mobile</dt><dd><a className="font-medium hover:underline" href={`tel:${c.phone}`}>{c.phone}</a></dd></div>}
              {c.email && <div className="flex justify-between"><dt className="text-zinc-500">E-mail</dt><dd><a className="font-medium hover:underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
              {c.instagram && <div className="flex justify-between"><dt className="text-zinc-500">Instagram</dt><dd className="font-medium">{c.instagram}</dd></div>}
            </dl>
            {c.notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-zinc-600">{c.notes}</p>}
            {c.consentNewsletter && <p className="mt-2 text-[11px] font-semibold text-emerald-600">✓ Accepte la newsletter</p>}
            {c.phone && (
              <a
                href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block rounded-lg border border-emerald-600/30 bg-emerald-50 py-2 text-center text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                Ouvrir WhatsApp
              </a>
            )}
          </div>

          <StudioPanel orderId={order.id} />

          {/* -------- assistant IA -------- */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Assistant — réponse au client</p>

            {order.aiMessages.length > 0 && (
              <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
                {order.aiMessages.map((m) => (
                  <div key={m.id} className={`rounded-lg p-2.5 ${m.role === "assistant" ? "bg-zinc-50" : "bg-amber-50"}`}>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{m.role === "assistant" ? "Assistant" : "Toi"}</p>
                    <p className="whitespace-pre-wrap text-zinc-700">{m.content}</p>
                  </div>
                ))}
              </div>
            )}

            {lastAssistant && (
              <div className="mb-3 flex flex-wrap gap-2">
                {c.phone && (
                  <a href={waLink(c.phone, lastAssistant.content)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                    WhatsApp
                  </a>
                )}
                <CopyButton text={lastAssistant.content} />
              </div>
            )}

            <form action={assistantSend.bind(null, order.id)} className="space-y-2">
              <textarea
                name="message"
                rows={2}
                placeholder={order.aiMessages.length ? "Dis ce qu'il faut changer, ou pose une question…" : "(optionnel) une consigne pour le 1er jet…"}
                className={input}
              />
              <button className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-zinc-700">
                {order.aiMessages.length ? "Envoyer" : "Générer"}
              </button>
            </form>
            {!eff.assistantActive && <p className="mt-2 text-[11px] text-amber-600">Assistant désactivé dans les réglages — message de base uniquement.</p>}
          </div>

          {/* -------- paiement -------- */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Paiement</p>
            <dl className="space-y-1.5">
              <div className="flex justify-between"><dt className="text-zinc-500">Total</dt><dd className="font-medium">{fmtCHF(order.priceQuoted)}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Acompte</dt><dd className="font-medium">{order.depositCents ? chf(order.depositCents) : "—"}{order.depositPaidAt ? ` · ${fmtDate(order.depositPaidAt)}` : ""}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">Solde</dt><dd className="font-medium">{order.balanceCents ? chf(order.balanceCents) : "—"}{order.balancePaidAt ? ` · ${fmtDate(order.balancePaidAt)}` : ""}</dd></div>
            </dl>
            {order.status === "ANNULE" ? (
              pay.paidCents > 0 && (
                <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2">
                  <p className="text-xs font-semibold text-zinc-600">
                    Acompte conservé (annulation) : {chf(pay.paidCents)} — compté en recette.
                  </p>
                  <form action={refundDeposit.bind(null, order.id)} className="mt-1.5">
                    <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">
                      Marquer remboursé (retirer des recettes)
                    </button>
                  </form>
                </div>
              )
            ) : (
              <>
                <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 font-semibold ${pay.isPaid ? "bg-emerald-50 text-emerald-700" : pay.dueCents > 0 ? "bg-amber-50 text-amber-700" : "bg-zinc-50 text-zinc-500"}`}>
                  <span>{pay.isPaid ? "Soldé" : "Reste à encaisser"}</span>
                  {!pay.isPaid && <span>{pay.hasTotal ? chf(pay.dueCents) : "—"}</span>}
                </div>
                <form action={recordPayment.bind(null, order.id)} className="mt-4 flex flex-wrap items-end gap-2">
                  <label className="min-w-24 flex-1">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Acompte CHF</span>
                    <input name="depositChf" type="number" step="0.05" min="0" defaultValue={order.depositCents ? order.depositCents / 100 : ""} className={input} />
                  </label>
                  <label className="min-w-24 flex-1">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Solde CHF</span>
                    <input name="balanceChf" type="number" step="0.05" min="0" defaultValue={order.balanceCents ? order.balanceCents / 100 : ""} className={input} />
                  </label>
                  <button className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700">OK</button>
                </form>
                {order.priceQuoted && !pay.isPaid && (
                  <form action={markPaidInFull.bind(null, order.id)} className="mt-2">
                    <button className="w-full rounded-lg border border-zinc-300 py-1.5 text-xs font-semibold text-zinc-500 hover:border-zinc-500">
                      Marquer payé en entier
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Catégorie de revenu (Cap)</p>
            <div className="mb-5">
              <AutoSelect action={setRevenueCategory.bind(null, order.id)} name="revenueCategory" defaultValue={order.revenueCategory} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)">
                <option value="SUR_MESURE">Sur-mesure</option>
                <option value="COLLECTION">Collection / standard</option>
                <option value="ATELIER">Atelier / cours</option>
                <option value="BON_CADEAU">Bon cadeau</option>
                <option value="DECORS">Décors / e-shop</option>
                <option value="B2B">Entreprise (B2B)</option>
              </AutoSelect>
            </div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Partenaire apporteur</p>
            <AutoSelect action={setOrderPartner.bind(null, order.id)} name="partnerId" defaultValue={order.partnerId ?? ""} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)">
              <option value="">— Aucun (client direct)</option>
              {partners.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name} · {pt.ratePct} %</option>
              ))}
            </AutoSelect>
            {order.partner && order.priceQuoted && (
              <p className="mt-2 text-xs text-zinc-500">
                Commission : CHF {Math.round((order.priceQuoted * order.partner.ratePct) / 100)}
                {order.commissionPaidAt ? ` · versée le ${order.commissionPaidAt.toLocaleDateString("fr-CH")}` : " · à verser après livraison"}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Activité</p>
              <DeleteOrderButton orderId={order.id} name={`${c.firstName} ${c.lastName}`.trim()} />
            </div>
            <form action={addNote.bind(null, order.id)} className="mb-4 flex gap-2">
              <input name="body" placeholder="Ajouter une note…" className={input} />
              <button className="shrink-0 rounded-lg bg-zinc-900 px-3 text-sm font-semibold text-white hover:bg-zinc-700">+</button>
            </form>
            <ul className="space-y-3 text-sm">
              {order.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-zinc-200 pl-3">
                  <p className={a.type === "NOTE" ? "text-zinc-800" : "text-zinc-500"}>{a.body}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{fmtDate(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SaveStatusProvider>
  );
}
