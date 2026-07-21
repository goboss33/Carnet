"use client";

/* Statut dans le bandeau résumé : pastille + crayon → petit menu (type Apple).
   Cas « Annulé » : si de l'argent a été encaissé, on demande d'abord
   « Avez-vous remboursé ? » (non / oui / en partie) pour bien traiter la recette. */

import { useState, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/ui";
import { STATUTS } from "@/lib/statuts";
import { setStatus, cancelOrder } from "@/app/actions";
import type { OrderStatus } from "@prisma/client";

const OPTIONS: { id: OrderStatus; label: string; dot: string }[] = [
  ...STATUTS.map((s) => ({ id: s.id, label: s.label, dot: s.dot })),
  { id: "ANNULE" as OrderStatus, label: "Annulé / sans suite", dot: "bg-red-500" },
];

// Pastilles alignées sur les points de couleur du menu (dot de STATUTS).
const TONE: Record<string, string> = {
  LEAD: "bg-sky-50 text-sky-700",
  DEVIS_ENVOYE: "bg-amber-50 text-amber-700",
  ACOMPTE_RECU: "bg-violet-50 text-violet-700",
  EN_PRODUCTION: "bg-orange-50 text-orange-700",
  LIVRE: "bg-emerald-50 text-emerald-700",
  ANNULE: "bg-red-50 text-red-700",
};

const fmt = (cents: number) => (cents / 100).toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function StatusPicker({ orderId, current, paidCents }: { orderId: string; current: OrderStatus; paidCents: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [cancel, setCancel] = useState<null | "ask" | "partial">(null);
  const [refund, setRefund] = useState(0); // montant remboursé (CHF) en mode partiel
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!cancel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCancel(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);

  const label = OPTIONS.find((o) => o.id === current)?.label ?? current;

  const choose = (s: OrderStatus) => {
    setOpen(false);
    if (s === current) return;
    if (s === "ANNULE" && paidCents > 0) { setRefund(0); setCancel("ask"); return; }
    start(() => setStatus(orderId, s));
  };

  const doCancel = (keptCents: number) => { setCancel(null); start(() => cancelOrder(orderId, Math.max(0, keptCents))); };
  const kept = Math.max(0, paidCents - Math.round((Number(refund) || 0) * 100));

  return (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={pending} className="group block w-full text-left">
        <span className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Statut</span>
          <Pencil className="size-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
        </span>
        <span className={cn("mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold", TONE[current] ?? "bg-zinc-100 text-zinc-600")}>{label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", o.id === current ? "font-semibold text-zinc-900" : "text-zinc-600")}
              >
                <span className={cn("size-2 shrink-0 rounded-full", o.dot)} />
                <span className="flex-1">{o.label}</span>
                {o.id === current && <Check className="size-4 text-(--color-brand)" />}
              </button>
            ))}
          </div>
        </>
      )}

      {mounted && cancel && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]" onClick={() => setCancel(null)} />
          <div className="relative z-10 w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-[15px] font-bold text-zinc-900">Annuler la commande</p>
              <button type="button" onClick={() => setCancel(null)} aria-label="Fermer" className="-mt-1 shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-5" /></button>
            </div>
            <p className="mb-4 text-sm text-zinc-600"><span className="font-semibold text-zinc-900">{fmt(paidCents)} CHF</span> ont été encaissés. Avez-vous remboursé le client ?</p>

            {cancel === "ask" ? (
              <div className="space-y-2">
                <button type="button" onClick={() => doCancel(paidCents)} className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-left text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400">
                  Non — j'ai gardé l'argent
                  <span className="block text-[12px] font-normal text-zinc-400">Conservé en recette : {fmt(paidCents)} CHF</span>
                </button>
                <button type="button" onClick={() => doCancel(0)} className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-left text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400">
                  Oui — remboursé en entier
                  <span className="block text-[12px] font-normal text-zinc-400">Recette : 0 CHF</span>
                </button>
                <button type="button" onClick={() => setCancel("partial")} className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-left text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400">
                  Remboursé en partie…
                </button>
              </div>
            ) : (
              <div>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Montant remboursé (CHF)</span>
                  <input
                    type="number" min="0" step="0.05" autoFocus
                    value={refund === 0 ? "" : refund}
                    onChange={(e) => setRefund(Math.min(paidCents / 100, Math.max(0, Number(e.target.value) || 0)))}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)"
                  />
                </label>
                <p className="mt-2 text-[13px] text-zinc-500">Conservé en recette : <span className="font-semibold text-zinc-800">{fmt(kept)} CHF</span></p>
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setCancel("ask")} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-400">Retour</button>
                  <button type="button" onClick={() => doCancel(kept)} className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Annuler la commande</button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
