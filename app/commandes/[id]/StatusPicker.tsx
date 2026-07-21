"use client";

/* Statut dans le bandeau résumé : pastille + crayon → petit menu (type Apple)
   pour changer le statut. Remplace la rangée de pastilles du bas. */

import { useState, useTransition } from "react";
import { Pencil, Check } from "lucide-react";
import { cn } from "@/lib/ui";
import { STATUTS } from "@/lib/statuts";
import { setStatus } from "@/app/actions";
import type { OrderStatus } from "@prisma/client";

const OPTIONS: { id: OrderStatus; label: string; dot: string }[] = [
  ...STATUTS.map((s) => ({ id: s.id, label: s.label, dot: s.dot })),
  { id: "ANNULE" as OrderStatus, label: "Annulé / sans suite", dot: "bg-red-500" },
];

const TONE: Record<string, string> = {
  LEAD: "bg-zinc-100 text-zinc-600",
  DEVIS_ENVOYE: "bg-blue-50 text-blue-700",
  ACOMPTE_RECU: "bg-amber-50 text-amber-700",
  EN_PRODUCTION: "bg-violet-50 text-violet-700",
  LIVRE: "bg-emerald-50 text-emerald-700",
  ANNULE: "bg-red-50 text-red-700",
};

export function StatusPicker({ orderId, current }: { orderId: string; current: OrderStatus }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const label = OPTIONS.find((o) => o.id === current)?.label ?? current;
  const choose = (s: OrderStatus) => { setOpen(false); if (s !== current) start(() => setStatus(orderId, s)); };

  return (
    <div className="relative inline-flex items-center gap-1">
      <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold", TONE[current] ?? "bg-zinc-100 text-zinc-600")}>{label}</span>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={pending} aria-label="Changer le statut" className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
        <Pencil className="size-3.5" />
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
    </div>
  );
}
