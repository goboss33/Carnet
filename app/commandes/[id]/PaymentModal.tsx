"use client";

/* Paiement — modale réactive ouverte par le crayon du résumé.
   Modèle : un ACOMPTE (montant, slider % + champ CHF) + un état SOLDÉ (oui/non).
   Le solde est DÉRIVÉ (soldé ? total − acompte : 0) — jamais un montant figé,
   donc rebouger l'acompte ne casse jamais les calculs.
   • Auto-save (debounce 400 ms) + flush à la fermeture : aucune perte.
   • Code couleur : rien encaissé = rouge, acompte reçu = orange, soldé = vert.
   Rendu via portail pour échapper au transform de <main>. */

import { useState, useEffect, useRef, useTransition } from "react";
import { createPortal } from "react-dom";
import { Pencil, X, Check } from "lucide-react";
import { cn } from "@/lib/ui";
import { setPrice, savePayment, refundDeposit } from "@/app/actions";
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
  const [pricePending, startPrice] = useTransition();
  const [payPending, startPay] = useTransition();

  const [total, setTotal] = useState(priceQuoted ?? 0);
  const [deposit, setDepAmt] = useState(depositCents ? depositCents / 100 : 0);
  const [full, setFull] = useState((balanceCents ?? 0) > 0); // « soldé » = un solde a été encaissé

  const savedTotal = priceQuoted ?? 0;
  const savedDeposit = depositCents ? depositCents / 100 : 0;
  const savedBalance = balanceCents ? balanceCents / 100 : 0;
  const cancelled = status === "ANNULE";

  // Solde DÉRIVÉ de l'état soldé — jamais figé.
  const balance = full ? Math.max(0, round2(total - deposit)) : 0;
  const paid = round2(deposit + balance);
  const due = Math.max(0, round2(total - paid));
  const hasTotal = total > 0;
  const isPaid = hasTotal && due < 0.005;
  const pct = hasTotal ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const depPct = hasTotal ? Math.min(100, Math.round((deposit / total) * 100)) : 0;

  const tone: "zinc" | "red" | "amber" | "emerald" = !hasTotal ? "zinc" : isPaid ? "emerald" : paid > 0 ? "amber" : "red";
  const barCls = { zinc: "bg-zinc-300", red: "bg-red-500", amber: "bg-amber-500", emerald: "bg-emerald-500" }[tone];
  const textCls = { zinc: "text-zinc-400", red: "text-red-600", amber: "text-amber-700", emerald: "text-emerald-600" }[tone];
  const saving = pricePending || payPending;

  // auto-save du total (debounce court)
  useEffect(() => {
    if (round2(total) === round2(savedTotal)) return;
    const t = setTimeout(() => startPrice(() => setPrice(orderId, String(total))), 400);
    return () => clearTimeout(t);
  }, [total, savedTotal, orderId, startPrice]);

  // auto-save du paiement (acompte + solde dérivé, debounce court)
  useEffect(() => {
    if (Math.abs(deposit - savedDeposit) < 0.005 && Math.abs(balance - savedBalance) < 0.005) return;
    const t = setTimeout(() => startPay(() => savePayment(orderId, deposit, balance)), 400);
    return () => clearTimeout(t);
  }, [deposit, balance, savedDeposit, savedBalance, orderId, startPay]);

  // Filet de sécurité : à la fermeture, on force l'enregistrement de tout ce qui
  // n'a pas encore été persisté — aucune perte si on ferme vite.
  const latest = useRef({ total, deposit, balance, savedTotal, savedDeposit, savedBalance });
  latest.current = { total, deposit, balance, savedTotal, savedDeposit, savedBalance };
  useEffect(() => () => {
    const l = latest.current;
    if (round2(l.total) !== round2(l.savedTotal)) void setPrice(orderId, String(l.total));
    if (Math.abs(l.deposit - l.savedDeposit) > 0.005 || Math.abs(l.balance - l.savedBalance) > 0.005) void savePayment(orderId, l.deposit, l.balance);
  }, [orderId]);

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
          {/* Acompte : raccourcis (20/30/50 % + Soldé) + slider % + champ CHF */}
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Acompte</span>
              <span className="text-[12px] font-semibold text-(--color-brand)">{depPct}%</span>
            </div>
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {[20, 30, 50].map((p) => (
                  <button
                    key={p} type="button" disabled={!hasTotal || full}
                    onClick={() => { setFull(false); setDepAmt(Math.round((total * p) / 100)); }}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                      !full && depPct === p ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)" : "border-zinc-300 text-zinc-600 hover:border-zinc-400",
                      (!hasTotal || full) && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <button
                type="button" disabled={!hasTotal} onClick={() => setFull((f) => !f)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                  full ? "border-emerald-500 bg-emerald-500 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                  !hasTotal && "cursor-not-allowed opacity-40",
                )}
              >
                <Check className="size-3.5" /> Soldé
              </button>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} value={depPct} disabled={!hasTotal || full}
                onChange={(e) => setDepAmt(Math.round((total * Number(e.target.value)) / 100))}
                className="h-2 flex-1 cursor-pointer accent-(--color-brand) disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="relative w-24 shrink-0">
                <input
                  type="number" min="0" step="0.05" disabled={!hasTotal || full}
                  value={deposit === 0 ? "" : deposit}
                  placeholder={hasTotal ? String(Math.round(total * 0.3)) : "CHF"}
                  onChange={(e) => setDepAmt(clamp(Number(e.target.value)))}
                  className={cn(inputCls, "pr-9 text-right disabled:opacity-50")}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">CHF</span>
              </div>
            </div>
          </div>
        </>
      )}

      <button type="button" onClick={onClose} className="mt-6 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700">OK</button>
      <p className="mt-2 h-4 text-center text-[11px] text-zinc-400">{saving ? "Enregistrement…" : ""}</p>
    </>
  );
}
