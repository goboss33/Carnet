"use client";

/* Bascule Commande standard ↔ d'exception (B2B, grands événements).
   Action serveur immédiate (hors auto-save) : la fiche se réorganise
   aussitôt — lignes de devis à la place du slider/biscuit/fourrages. */

import { useTransition } from "react";
import { setOrderKind } from "@/app/actions";
import { cn } from "@/lib/ui";

export default function KindToggle({ orderId, exception }: { orderId: string; exception: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setOrderKind(orderId, !exception))}
      title="Commande d'exception : B2B, grands événements — la fiche passe en lignes de devis, les relances grand public (anniversaire, avis) se désactivent."
      className={cn("ml-auto flex cursor-pointer items-center gap-2 text-[12px] font-medium", pending && "opacity-50")}
    >
      <span className={cn("relative h-4.5 w-8 shrink-0 rounded-full transition-colors", exception ? "bg-(--color-brand)" : "bg-zinc-200")}>
        <span className={cn("absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform", exception && "translate-x-3.5")} />
      </span>
      <span className={exception ? "text-(--color-brand)" : "text-zinc-400"}>Commande d'exception</span>
    </button>
  );
}
