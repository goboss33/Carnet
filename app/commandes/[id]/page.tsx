import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { STATUTS, SOURCES, fmtCHF, fmtDate } from "@/lib/statuts";
import { chf } from "@/lib/money";
import { paymentState } from "@/lib/payments";
import { waLink } from "@/lib/wa";
import { getSettings } from "@/lib/settings";
import { updateOrder, setStatus, addNote, setOrderPartner, recordPayment, markPaidInFull, refundDeposit, assistantSend } from "@/app/actions";
import Shell from "@/app/components/Shell";
import DeleteOrderButton from "./DeleteOrderButton";
import MediaViewer from "@/app/components/MediaViewer";
import CopyButton from "./CopyButton";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500";

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

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {c.firstName} {c.lastName}
        </h1>
        <span className="text-sm text-stone-500">
          {SOURCES.find((s) => s.id === order.source)?.label} · créé le {fmtDate(order.createdAt)}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {STATUTS.map((s) => (
            <form key={s.id} action={setStatus.bind(null, order.id, s.id as OrderStatus)}>
              <button
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  order.status === s.id
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 text-stone-500 hover:border-stone-500"
                }`}
              >
                {s.label}
              </button>
            </form>
          ))}
          <form action={setStatus.bind(null, order.id, "ANNULE" as OrderStatus)}>
            <button
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                order.status === "ANNULE"
                  ? "border-red-700 bg-red-700 text-white"
                  : "border-red-200 text-red-400 hover:border-red-400 hover:text-red-600"
              }`}
            >
              🗄 Annulé / sans suite
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* -------- commande -------- */}
        <form action={updateOrder.bind(null, order.id)} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <label><span className={label}>Occasion</span><input name="occasion" defaultValue={order.occasion} className={input} /></label>
            <label><span className={label}>Date de l'événement</span><input name="eventDate" type="date" defaultValue={d(order.eventDate)} className={input} /></label>
            <label><span className={label}>Prix (CHF)</span><input name="priceQuoted" type="number" defaultValue={order.priceQuoted ?? ""} className={input} /></label>
            <label><span className={label}>Fêté·e</span><input name="celebrant" defaultValue={order.celebrant} className={input} /></label>
            <label><span className={label}>Âge</span><input name="celebrantAge" type="number" defaultValue={order.celebrantAge ?? ""} className={input} /></label>
            <label><span className={label}>Parts</span><input name="parts" type="number" defaultValue={order.parts ?? ""} className={input} /></label>
            <label><span className={label}>Étages</span><input name="tiers" type="number" defaultValue={order.tiers ?? ""} className={input} /></label>
            <label><span className={label}>Biscuit</span><input name="biscuit" defaultValue={order.biscuit} className={input} /></label>
            <label><span className={label}>Style</span><input name="style" defaultValue={order.style} className={input} /></label>
            <label className="sm:col-span-3"><span className={label}>Thème / brief</span><input name="themeNote" defaultValue={order.themeNote} className={input} /></label>
            <label>
              <span className={label}>Remise</span>
              <select name="deliveryMode" defaultValue={order.deliveryMode} className={input}>
                <option value="retrait">Retrait atelier</option>
                <option value="livraison">Livraison</option>
              </select>
            </label>
            <label className="sm:col-span-2"><span className={label}>Adresse de livraison</span><input name="deliveryAddress" defaultValue={order.deliveryAddress} className={input} /></label>
          </div>
          <label><span className={label}>Notes internes</span><textarea name="notes" rows={3} defaultValue={order.notes} className={input} /></label>
          {order.fourrages.length > 0 && (
            <p className="text-sm text-stone-500">Fourrages demandés : <span className="font-medium text-stone-700">{order.fourrages.join(" + ")}</span></p>
          )}
          {order.inspirationPhotos.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Photos d’inspiration</p>
              <div className="flex flex-wrap gap-2">
                {order.inspirationPhotos.map((src, i) => (
                  <MediaViewer
                    key={i}
                    src={`/api/receipts/${src}`}
                    kind="image"
                    title={`Inspiration ${i + 1}`}
                    className="block h-24 w-24 overflow-hidden rounded-lg border border-stone-200 hover:border-stone-400"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/receipts/${src}`} alt={`Inspiration ${i + 1}`} className="h-full w-full object-cover" />
                  </MediaViewer>
                ))}
              </div>
            </div>
          )}
          <button className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-700">
            Enregistrer
          </button>
        </form>

        {/* -------- contact + journal -------- */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Contact</p>
              <Link href={`/contacts/${c.id}`} className="text-xs font-semibold text-stone-500 hover:text-stone-800">Fiche complète →</Link>
            </div>
            <Link href={`/contacts/${c.id}`} className="block text-[15px] font-bold text-stone-900 hover:underline">
              {c.firstName} {c.lastName}
            </Link>
            <p className="mb-3 mt-0.5 text-xs text-stone-400">
              {SOURCES.find((s) => s.id === c.source)?.label}
              {" · "}
              {c._count.orders > 1 ? `${c._count.orders} commandes` : "1re commande"}
              {" · client depuis "}
              {c.createdAt.getFullYear()}
            </p>
            <dl className="space-y-1.5">
              {c.phone && <div className="flex justify-between"><dt className="text-stone-500">Mobile</dt><dd><a className="font-medium hover:underline" href={`tel:${c.phone}`}>{c.phone}</a></dd></div>}
              {c.email && <div className="flex justify-between"><dt className="text-stone-500">E-mail</dt><dd><a className="font-medium hover:underline" href={`mailto:${c.email}`}>{c.email}</a></dd></div>}
              {c.instagram && <div className="flex justify-between"><dt className="text-stone-500">Instagram</dt><dd className="font-medium">{c.instagram}</dd></div>}
            </dl>
            {c.notes && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-stone-600">📝 {c.notes}</p>}
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

          {/* -------- assistant IA -------- */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Assistant — réponse au client</p>

            {order.aiMessages.length > 0 && (
              <div className="mb-3 max-h-80 space-y-2 overflow-y-auto">
                {order.aiMessages.map((m) => (
                  <div key={m.id} className={`rounded-lg p-2.5 ${m.role === "assistant" ? "bg-stone-50" : "bg-amber-50"}`}>
                    <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">{m.role === "assistant" ? "Assistant" : "Toi"}</p>
                    <p className="whitespace-pre-wrap text-stone-700">{m.content}</p>
                  </div>
                ))}
              </div>
            )}

            {lastAssistant && (
              <div className="mb-3 flex flex-wrap gap-2">
                {c.phone && (
                  <a href={waLink(c.phone, lastAssistant.content)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-600/30 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                    📲 WhatsApp
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
              <button className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700">
                {order.aiMessages.length ? "Envoyer" : "✍️ Générer"}
              </button>
            </form>
            {!eff.assistantActive && <p className="mt-2 text-[11px] text-amber-600">Assistant désactivé dans les réglages — message de base uniquement.</p>}
          </div>

          {/* -------- paiement -------- */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Paiement</p>
            <dl className="space-y-1.5">
              <div className="flex justify-between"><dt className="text-stone-500">Total</dt><dd className="font-medium">{fmtCHF(order.priceQuoted)}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">Acompte</dt><dd className="font-medium">{order.depositCents ? chf(order.depositCents) : "—"}{order.depositPaidAt ? ` · ${fmtDate(order.depositPaidAt)}` : ""}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">Solde</dt><dd className="font-medium">{order.balanceCents ? chf(order.balanceCents) : "—"}{order.balancePaidAt ? ` · ${fmtDate(order.balancePaidAt)}` : ""}</dd></div>
            </dl>
            {order.status === "ANNULE" ? (
              pay.paidCents > 0 && (
                <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2">
                  <p className="text-xs font-semibold text-stone-600">
                    Acompte conservé (annulation) : {chf(pay.paidCents)} — compté en recette.
                  </p>
                  <form action={refundDeposit.bind(null, order.id)} className="mt-1.5">
                    <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">
                      ↩️ Marquer remboursé (retirer des recettes)
                    </button>
                  </form>
                </div>
              )
            ) : (
              <>
                <div className={`mt-3 flex items-center justify-between rounded-lg px-3 py-2 font-semibold ${pay.isPaid ? "bg-emerald-50 text-emerald-700" : pay.dueCents > 0 ? "bg-amber-50 text-amber-700" : "bg-stone-50 text-stone-500"}`}>
                  <span>{pay.isPaid ? "✅ Soldé" : "Reste à encaisser"}</span>
                  {!pay.isPaid && <span>{pay.hasTotal ? chf(pay.dueCents) : "—"}</span>}
                </div>
                <form action={recordPayment.bind(null, order.id)} className="mt-4 flex flex-wrap items-end gap-2">
                  <label className="min-w-24 flex-1">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Acompte CHF</span>
                    <input name="depositChf" type="number" step="0.05" min="0" defaultValue={order.depositCents ? order.depositCents / 100 : ""} className={input} />
                  </label>
                  <label className="min-w-24 flex-1">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">Solde CHF</span>
                    <input name="balanceChf" type="number" step="0.05" min="0" defaultValue={order.balanceCents ? order.balanceCents / 100 : ""} className={input} />
                  </label>
                  <button className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700">OK</button>
                </form>
                {order.priceQuoted && !pay.isPaid && (
                  <form action={markPaidInFull.bind(null, order.id)} className="mt-2">
                    <button className="w-full rounded-lg border border-stone-300 py-1.5 text-xs font-semibold text-stone-500 hover:border-stone-500">
                      💯 Marquer payé en entier
                    </button>
                  </form>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5 text-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">Partenaire apporteur</p>
            <form action={setOrderPartner.bind(null, order.id)} className="flex items-center gap-2">
              <select name="partnerId" defaultValue={order.partnerId ?? ""} className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-600">
                <option value="">— Aucun (client direct)</option>
                {partners.map((pt) => (
                  <option key={pt.id} value={pt.id}>{pt.name} · {pt.ratePct} %</option>
                ))}
              </select>
              <button className="shrink-0 rounded-lg bg-stone-900 px-3 py-2 text-sm font-semibold text-white hover:bg-stone-700">OK</button>
            </form>
            {order.partner && order.priceQuoted && (
              <p className="mt-2 text-xs text-stone-500">
                Commission : CHF {Math.round((order.priceQuoted * order.partner.ratePct) / 100)}
                {order.commissionPaidAt ? ` · versée le ${order.commissionPaidAt.toLocaleDateString("fr-CH")}` : " · à verser après livraison"}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Journal</p>
              <DeleteOrderButton orderId={order.id} name={`${c.firstName} ${c.lastName}`.trim()} />
            </div>
            <form action={addNote.bind(null, order.id)} className="mb-4 flex gap-2">
              <input name="body" placeholder="Ajouter une note…" className={input} />
              <button className="shrink-0 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white hover:bg-stone-700">+</button>
            </form>
            <ul className="space-y-3 text-sm">
              {order.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-stone-200 pl-3">
                  <p className={a.type === "NOTE" ? "text-stone-800" : "text-stone-500"}>{a.body}</p>
                  <p className="mt-0.5 text-[11px] text-stone-400">{fmtDate(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Shell>
  );
}
