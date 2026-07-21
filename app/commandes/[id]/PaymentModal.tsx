"use client";

/* Paiement — modale réactive ouverte par le crayon du résumé.
   UN SEUL curseur « encaissé » (0 → 100 % du total) qui fait AUSSI office de
   barre de progression (color-codé). Raccourcis 20/30/50 % + « Soldé » (=100 %).
   • Auto-save (debounce 400 ms) + flush à la fermeture : aucune perte.
   • Code couleur : rien encaissé = rouge, partiel = orange, soldé = vert.
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

  const savedPaid = round2(((depositCents ?? 0) + (balanceCents ?? 0)) / 100);
  const [total, setTotal] = useState(priceQuoted ?? 0);
  const [collected, setCollected] = useState(savedPaid); // montant encaissé (acompte + solde)

  const savedTotal = priceQuoted ?? 0;
  const cancelled = status === "ANNULE";

  const due = Math.max(0, round2(total - collected));
  const hasTotal = total > 0;
  const isPaid = hasTotal && due < 0.005;
  const pct = hasTotal ? Math.min(100, Math.round((collected / total) * 100)) : 0;

  // code couleur : rien = rouge, partiel = orange, soldé = vert
  const tone: "zinc" | "red" | "amber" | "emerald" = !hasTotal ? "zinc" : isPaid ? "emerald" : collected > 0 ? "amber" : "red";
  const accent = { zinc: "accent-zinc-400", red: "accent-red-500", amber: "accent-amber-500", emerald: "accent-emerald-500" }[tone];
  const textCls = { zinc: "text-zinc-400", red: "text-red-600", amber: "text-amber-700", emerald: "text-emerald-600" }[tone];
  const saving = pricePending || payPending;

  // auto-save du total (debounce court)
  useEffect(() => {
    if (round2(total) === round2(savedTotal)) return;
    const t = setTimeout(() => startPrice(() => setPrice(orderId, String(total))), 400);
    return () => clearTimeout(t);
  }, [total, savedTotal, orderId, startPrice]);

  // auto-save de l'encaissé (debounce court) — tout stocké côté acompte
  useEffect(() => {
    if (Math.abs(collected - savedPaid) < 0.005) return;
    const t = setTimeout(() => startPay(() => savePayment(orderId, collected, 0)), 400);
    return () => clearTimeout(t);
  }, [collected, savedPaid, orderId, startPay]);

  // Filet de sécurité : à la fermeture, on force l'enregistrement non persisté.
  const latest = useRef({ total, collected, savedTotal, savedPaid });
  latest.current = { total, collected, savedTotal, savedPaid };
  useEffect(() => () => {
    const l = latest.current;
    if (round2(l.total) !== round2(l.savedTotal)) void setPrice(orderId, String(l.total));
    if (Math.abs(l.collected - l.savedPaid) > 0.005) void savePayment(orderId, l.collected, 0);
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

      {cancelled ? (
        collected > 0 && (
          <div className="mt-4 rounded-lg bg-zinc-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-zinc-600">Acompte conservé (annulation) : {fmt(collected)} CHF — compté en recette.</p>
            <form action={refundDeposit.bind(null, orderId)} className="mt-1.5">
              <button className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline">Marquer remboursé (retirer des recettes)</button>
            </form>
          </div>
        )
      ) : (
        <div className="mt-5">
          {/* Encaissé : le curseur EST la barre de progression */}
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Encaissé · {pct}%</span>
            <span className={cn("text-[12px] font-semibold", textCls)}>
              {!hasTotal ? "Fixe un total" : isPaid ? "✓ Soldé" : `Reste ${fmt(due)} CHF`}
            </span>
          </div>

          {/* Raccourcis */}
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {[20, 30, 50].map((p) => (
                <button
                  key={p} type="button" disabled={!hasTotal}
                  onClick={() => setCollected(Math.round((total * p) / 100))}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                    pct === p ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)" : "border-zinc-300 text-zinc-600 hover:border-zinc-400",
                    !hasTotal && "cursor-not-allowed opacity-40",
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
            <button
              type="button" disabled={!hasTotal} onClick={() => setCollected(total)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors",
                isPaid ? "border-emerald-500 bg-emerald-500 text-white" : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                !hasTotal && "cursor-not-allowed opacity-40",
              )}
            >
              <Check className="size-3.5" /> Soldé
            </button>
          </div>

          {/* Curseur + champ CHF */}
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={100} value={pct} disabled={!hasTotal}
              onChange={(e) => setCollected(Math.round((total * Number(e.target.value)) / 100))}
              className={cn("h-2 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40", accent)}
            />
            <div className="relative w-24 shrink-0">
              <input
                type="number" min="0" step="0.05"
                value={collected === 0 ? "" : collected}
                placeholder={hasTotal ? String(Math.round(total * 0.3)) : "CHF"}
                onChange={(e) => setCollected(clamp(Number(e.target.value)))}
                className={cn(inputCls, "pr-9 text-right")}
              />
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">CHF</span>
            </div>
          </div>
        </div>
      )}

      <button type="button" onClick={onClose} className="mt-6 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700">OK</button>
      <p className="mt-2 h-4 text-center text-[11px] text-zinc-400">{saving ? "Enregistrement…" : ""}</p>
    </>
  );
}
