"use client";

/* Paiement — modale réactive ouverte par le crayon du résumé.
   Total éditable (source unique du prix), barre de progression EN TEMPS RÉEL,
   acompte via slider % + champ CHF liés (défaut 30 %), solde pré-calculé sur le
   reste courant. Une seule action « Enregistrer » persiste ce qui a changé.
   Rendu via portail pour échapper au transform de <main>. */

import { useState, useEffect, useTransition } from "react";
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
  status: OrderStatus;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const fmt = (n: number) => n.toLocaleString("fr-CH", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const inputCls = "w-full min-w-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";

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
            <PaymentPanel key={`${props.priceQuoted}-${props.depositCents}-${props.balanceCents}`} {...props} onClose={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function PaymentPanel({ orderId, priceQuoted, depositCents, balanceCents, status, onClose }: Props & { onClose: () => void }) {
  const [pending, start] = useTransition();
  const [pricePending, startPrice] = useTransition();

  const [total, setTotal] = useState(priceQuoted ?? 0);
  const [deposit, setDep] = useState(depositCents ? depositCents / 100 : 0);
  const [balance, setBal] = useState(balanceCents ? balanceCents / 100 : 0);

  const cancelled = status === "ANNULE";
  const savedDep = depositCents ? depositCents / 100 : 0;
  const savedBal = balanceCents ? balanceCents / 100 : 0;
  const depDirty = Math.abs(deposit - savedDep) > 0.005;
  const balDirty = Math.abs(balance - savedBal) > 0.005;
  const dirty = depDirty || balDirty;

  const paid = deposit + balance;
  const due = Math.max(0, round2(total - paid));
  const hasTotal = total > 0;
  const isPaid = hasTotal && due < 0.005;
  const pct = hasTotal ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const depPct = hasTotal ? Math.min(100, Math.round((deposit / total) * 100)) : 0;
  const rest = Math.max(0, round2(total - deposit)); // reste courant pour le solde

  const saveTotal = () => { if (round2(total) !== round2(priceQuoted ?? 0)) startPrice(() => setPrice(orderId, String(total))); };
  const save = () => start(async () => {
    if (depDirty) await setDeposit(orderId, deposit);
    if (balDirty) await setBalance(orderId, balance);
  });

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
          type="number" min="0" step="1"
          value={total === 0 ? "" : total}
          disabled={pricePending}
          onChange={(e) => setTotal(clamp(Number(e.target.value)))}
          onBlur={saveTotal}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          className={cn(inputCls, "text-base font-semibold")}
        />
      </label>

      {/* Barre de progression — temps réel */}
      <div className="mt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className={cn("h-full rounded-full transition-[width] duration-150", isPaid ? "bg-emerald-500" : "bg-(--color-brand)")} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-zinc-500">{hasTotal ? `Encaissé ${fmt(paid)} CHF` : "Fixe d'abord un total"}</span>
          {isPaid ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><Check className="size-4" /> Soldé</span>
          ) : hasTotal ? (
            <span className="font-semibold text-amber-700">Reste {fmt(due)} CHF</span>
          ) : null}
        </div>
      </div>

      {cancelled ? (
        paid > 0 && (
          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-zinc-600">Acompte conservé (annulation) : {fmt(paid)} CHF — compté en recette.</p>
            <form action={refundDeposit.bind(null, orderId)} className="mt-1.5">
              <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">Marquer remboursé (retirer des recettes)</button>
            </form>
          </div>
        )
      ) : (
        <>
          {/* Acompte : slider % + champ CHF liés */}
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Acompte</span>
              <span className="text-[12px] font-semibold text-(--color-brand)">{depPct}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={depPct} disabled={!hasTotal}
                onChange={(e) => setDep(Math.round((total * Number(e.target.value)) / 100))}
                className="h-2 flex-1 cursor-pointer accent-(--color-brand) disabled:opacity-40"
              />
              <div className="relative w-24 shrink-0">
                <input
                  type="number" min="0" step="0.05"
                  value={deposit === 0 ? "" : deposit}
                  placeholder={hasTotal ? String(Math.round(total * 0.3)) : "CHF"}
                  onChange={(e) => setDep(clamp(Number(e.target.value)))}
                  className={cn(inputCls, "pr-9 text-right")}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">CHF</span>
              </div>
            </div>
          </div>

          {/* Solde : champ pré-calculé sur le reste courant */}
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Solde</span>
              {hasTotal && (
                <button type="button" onClick={() => setBal(rest)} className="text-[12px] font-medium text-zinc-500 transition-colors hover:text-(--color-brand)">= reste ({fmt(rest)})</button>
              )}
            </div>
            <div className="relative">
              <input
                type="number" min="0" step="0.05"
                value={balance === 0 ? "" : balance}
                placeholder={hasTotal ? fmt(rest) : "CHF"}
                onChange={(e) => setBal(clamp(Number(e.target.value)))}
                className={cn(inputCls, "pr-9 text-right")}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">CHF</span>
            </div>
          </div>

          {/* Actions */}
          <button
            type="button" onClick={save} disabled={!dirty || pending}
            className="mt-5 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          {hasTotal && !isPaid && (
            <button
              type="button" onClick={() => start(() => markPaidInFull(orderId))} disabled={pending}
              className="mt-2 w-full rounded-lg border border-zinc-300 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-500 disabled:opacity-40"
            >
              Marquer payé en entier
            </button>
          )}
        </>
      )}
    </>
  );
}
