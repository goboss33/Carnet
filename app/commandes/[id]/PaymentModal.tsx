"use client";

/* Paiement — modale réactive ouverte par le crayon du résumé.
   • Total + acompte s'enregistrent automatiquement (debounce), pas de bouton.
   • Acompte = slider % + champ CHF liés (défaut 30 %).
   • Solde = un seul bouton d'action « Marquer soldé » (encaisse le reste).
   • Code couleur : rien encaissé = rouge, acompte reçu = orange, soldé = vert.
   Rendu via portail pour échapper au transform de <main>. */

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { Pencil, X, Check } from "lucide-react";
import { cn } from "@/lib/ui";
import { setPrice, setDeposit, setBalance, refundDeposit } from "@/app/actions";
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
            <PaymentPanel {...props} onClose={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function PaymentPanel({ orderId, priceQuoted, depositCents, balanceCents, status, onClose }: Props & { onClose: () => void }) {
  const [depPending, startDep] = useTransition();
  const [pricePending, startPrice] = useTransition();
  const [balPending, startBal] = useTransition();

  const [total, setTotal] = useState(priceQuoted ?? 0);
  const [deposit, setDepAmt] = useState(depositCents ? depositCents / 100 : 0);
  const [balance, setBalAmt] = useState(balanceCents ? balanceCents / 100 : 0);

  const savedTotal = priceQuoted ?? 0;
  const savedDep = depositCents ? depositCents / 100 : 0;
  const cancelled = status === "ANNULE";

  const paid = deposit + balance;
  const due = Math.max(0, round2(total - paid));
  const hasTotal = total > 0;
  const isPaid = hasTotal && due < 0.005;
  const pct = hasTotal ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const depPct = hasTotal ? Math.min(100, Math.round((deposit / total) * 100)) : 0;
  const rest = Math.max(0, round2(total - deposit));

  // code couleur : rien encaissé = rouge, acompte reçu = orange, soldé = vert
  const tone: "zinc" | "red" | "amber" | "emerald" = !hasTotal ? "zinc" : isPaid ? "emerald" : paid > 0 ? "amber" : "red";
  const barCls = { zinc: "bg-zinc-300", red: "bg-red-500", amber: "bg-amber-500", emerald: "bg-emerald-500" }[tone];
  const textCls = { zinc: "text-zinc-400", red: "text-red-600", amber: "text-amber-700", emerald: "text-emerald-600" }[tone];
  const saving = depPending || pricePending || balPending;

  // auto-save du total (debounce)
  useEffect(() => {
    if (round2(total) === round2(savedTotal)) return;
    const t = setTimeout(() => startPrice(() => setPrice(orderId, String(total))), 800);
    return () => clearTimeout(t);
  }, [total, savedTotal, orderId, startPrice]);

  // auto-save de l'acompte (debounce)
  useEffect(() => {
    if (Math.abs(deposit - savedDep) < 0.005) return;
    const t = setTimeout(() => startDep(() => setDeposit(orderId, deposit)), 800);
    return () => clearTimeout(t);
  }, [deposit, savedDep, orderId, startDep]);

  const markSolde = () => { setBalAmt(rest); startBal(() => setBalance(orderId, rest)); };

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
          onChange={(e) => setTotal(clamp(Number(e.target.value)))}
          className={cn(inputCls, "text-base font-semibold")}
        />
      </label>

      {/* Barre de progression — temps réel + code couleur */}
      <div className="mt-4">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className={cn("h-full rounded-full transition-[width] duration-150", barCls)} style={{ width: `${Math.max(pct, hasTotal && paid > 0 ? 4 : 0)}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-sm">
          <span className="text-zinc-500">{hasTotal ? `Encaissé ${fmt(paid)} CHF` : "Fixe d'abord un total"}</span>
          {isPaid ? (
            <span className={cn("inline-flex items-center gap-1 font-semibold", textCls)}><Check className="size-4" /> Soldé</span>
          ) : hasTotal ? (
            <span className={cn("font-semibold", textCls)}>Reste {fmt(due)} CHF</span>
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
          {/* Acompte : slider % + champ CHF liés (auto-save) */}
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Acompte</span>
              <span className="text-[12px] font-semibold text-(--color-brand)">{depPct}%</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={depPct} disabled={!hasTotal}
                onChange={(e) => setDepAmt(Math.round((total * Number(e.target.value)) / 100))}
                className="h-2 flex-1 cursor-pointer accent-(--color-brand) disabled:opacity-40"
              />
              <div className="relative w-24 shrink-0">
                <input
                  type="number" min="0" step="0.05"
                  value={deposit === 0 ? "" : deposit}
                  placeholder={hasTotal ? String(Math.round(total * 0.3)) : "CHF"}
                  onChange={(e) => setDepAmt(clamp(Number(e.target.value)))}
                  className={cn(inputCls, "pr-9 text-right")}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">CHF</span>
              </div>
            </div>
          </div>

          {/* Solde : action unique */}
          <div className="mt-5">
            {isPaid ? (
              <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700">
                <Check className="size-4" /> Soldé
              </div>
            ) : (
              <button
                type="button" onClick={markSolde} disabled={!hasTotal || balPending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
              >
                <Check className="size-4" /> Marquer soldé{hasTotal ? ` · ${fmt(due)} CHF` : ""}
              </button>
            )}
          </div>
        </>
      )}

      <p className="mt-3 h-4 text-center text-[11px] text-zinc-400">{saving ? "Enregistrement…" : ""}</p>
    </>
  );
}
