"use client";

/* Paiement — géré entièrement depuis une modale (crayon dans le résumé).
   Total éditable (source unique du prix), barre de progression, acompte (défaut
   30 %) et solde (défaut = reste) guidés avec date d'encaissement, « payé en
   entier », et cas annulé (acompte conservé + remboursement).
   Rendu via portail pour échapper au transform de <main>. */

import { useState, useEffect, useRef } from "react";
import { useTransition } from "react";
import { createPortal } from "react-dom";
import { Pencil, X, Check } from "lucide-react";
import { cn } from "@/lib/ui";
import { setPrice, setDeposit, setBalance, markPaidInFull, refundDeposit } from "@/app/actions";
import type { OrderStatus } from "@prisma/client";

type Props = {
  orderId: string;
  priceQuoted: number | null;
  depositCents: number | null;
  balanceCents: number | null;
  depositPaidAt: string; // yyyy-mm-dd ou ""
  balancePaidAt: string;
  status: OrderStatus;
};

const inputCls = "w-full min-w-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const chf = (cents: number) => (cents / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " CHF";
const frDate = (iso: string) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-CH", { day: "numeric", month: "short", year: "numeric" }) : "");
const today = () => new Date().toISOString().slice(0, 10);

export function PaymentModal(props: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Gérer le paiement" className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
        <Pencil className="size-3.5" />
      </button>
      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
          <div className="relative z-10 max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <PaymentPanel key={`${props.priceQuoted}-${props.depositCents}-${props.balanceCents}-${props.depositPaidAt}-${props.balancePaidAt}`} {...props} onClose={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function PaymentPanel({ orderId, priceQuoted, depositCents, balanceCents, depositPaidAt, balancePaidAt, status, onClose }: Props & { onClose: () => void }) {
  const [pricePending, startPrice] = useTransition();
  const depRef = useRef<HTMLInputElement>(null);
  const balRef = useRef<HTMLInputElement>(null);

  const total = priceQuoted ?? 0;
  const paidCents = (depositCents ?? 0) + (balanceCents ?? 0);
  const totalCents = total * 100;
  const dueCents = Math.max(0, totalCents - paidCents);
  const hasTotal = totalCents > 0;
  const isPaid = hasTotal && dueCents === 0;
  const cancelled = status === "ANNULE";
  const pct = hasTotal ? Math.min(100, Math.round((paidCents / totalCents) * 100)) : 0;

  const sugDeposit = Math.round(total * 0.3);
  const sugBalance = Math.max(0, totalCents - (depositCents ?? 0)) / 100;

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Paiement</p>
        <button type="button" onClick={onClose} aria-label="Fermer" className="-mt-1 shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-5" /></button>
      </div>

      {/* Total */}
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Total du devis (CHF)</span>
        <input
          type="number"
          step="1"
          min="0"
          defaultValue={priceQuoted ?? ""}
          disabled={pricePending}
          onBlur={(e) => { const v = e.currentTarget.value; if (Number(v || 0) !== total) startPrice(() => setPrice(orderId, v)); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className={cn(inputCls, "text-base font-semibold")}
        />
      </label>

      {/* Progression */}
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className={cn("h-full rounded-full transition-all", isPaid ? "bg-emerald-500" : "bg-(--color-brand)")} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-zinc-500">{hasTotal ? `Encaissé ${chf(paidCents)}` : "Fixe d'abord un total"}</span>
          {isPaid ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><Check className="size-4" /> Soldé</span>
          ) : hasTotal ? (
            <span className="font-semibold text-amber-700">Reste {chf(dueCents)}</span>
          ) : null}
        </div>
      </div>

      {cancelled ? (
        paidCents > 0 && (
          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-zinc-600">Acompte conservé (annulation) : {chf(paidCents)} — compté en recette.</p>
            <form action={refundDeposit.bind(null, orderId)} className="mt-1.5">
              <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">Marquer remboursé (retirer des recettes)</button>
            </form>
          </div>
        )
      ) : (
        <>
          {/* Acompte */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Acompte</span>
              {depositCents ? <span className="text-[11px] text-zinc-400">reçu le {frDate(depositPaidAt)}</span> : null}
            </div>
            <form action={setDeposit.bind(null, orderId)} className="space-y-2">
              <div className="flex items-center gap-2">
                <input ref={depRef} name="depositChf" type="number" step="0.05" min="0" defaultValue={depositCents ? depositCents / 100 : ""} placeholder={hasTotal ? `≈ ${sugDeposit}` : "CHF"} className={inputCls} />
                {hasTotal && (
                  <button type="button" onClick={() => { if (depRef.current) depRef.current.value = String(sugDeposit); }} className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-2 text-[12px] font-semibold text-zinc-600 transition-colors hover:border-(--color-brand) hover:text-(--color-brand)">30 %</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input name="depositDate" type="date" defaultValue={depositPaidAt || today()} className={inputCls} />
                <button className="shrink-0 whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Enregistrer</button>
              </div>
            </form>
          </div>

          {/* Solde */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Solde</span>
              {balanceCents ? <span className="text-[11px] text-zinc-400">reçu le {frDate(balancePaidAt)}</span> : null}
            </div>
            <form action={setBalance.bind(null, orderId)} className="space-y-2">
              <div className="flex items-center gap-2">
                <input ref={balRef} name="balanceChf" type="number" step="0.05" min="0" defaultValue={balanceCents ? balanceCents / 100 : ""} placeholder={hasTotal ? `≈ ${sugBalance}` : "CHF"} className={inputCls} />
                {hasTotal && (
                  <button type="button" onClick={() => { if (balRef.current) balRef.current.value = String(sugBalance); }} className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-2 text-[12px] font-semibold text-zinc-600 transition-colors hover:border-(--color-brand) hover:text-(--color-brand)">= reste</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input name="balanceDate" type="date" defaultValue={balancePaidAt || today()} className={inputCls} />
                <button className="shrink-0 whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Encaisser</button>
              </div>
            </form>
          </div>

          {hasTotal && !isPaid && (
            <form action={markPaidInFull.bind(null, orderId)} className="mt-4">
              <button className="w-full rounded-lg border border-zinc-300 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-500">Marquer payé en entier</button>
            </form>
          )}
        </>
      )}
    </>
  );
}
