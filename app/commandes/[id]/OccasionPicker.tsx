"use client";

/* Occasion dans le bandeau résumé : pastille (icône + libellé court, une seule
   ligne) + crayon → menu type Apple. La liste reflète le configurateur du site
   (« Autre occasion » incluse). Pour préciser une « autre » occasion, on l'écrit
   dans les notes internes. Enregistre via setOccasion (hors auto-save). */

import { useState, useTransition } from "react";
import { Pencil, Check, Cake, Heart, Baby, Briefcase, PartyPopper, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/ui";
import { OCCASIONS } from "@/lib/order-options";
import { setOccasion } from "@/app/actions";

const ICONS: Record<string, LucideIcon> = {
  "Anniversaire d'enfant": PartyPopper,
  "Anniversaire d'adulte": Cake,
  Mariage: Heart,
  "Baby shower": Baby,
  "Événement d'entreprise": Briefcase,
  "Autre occasion": Sparkles,
};
const iconFor = (occ: string): LucideIcon => ICONS[occ] ?? Sparkles;

// Libellés courts pour la pastille (évite le retour à la ligne).
const SHORT: Record<string, string> = {
  "Anniversaire d'enfant": "Anniv. enfant",
  "Anniversaire d'adulte": "Anniv. adulte",
  "Événement d'entreprise": "Entreprise",
  "Autre occasion": "Autre",
};

export function OccasionPicker({ orderId, current }: { orderId: string; current: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const Icon = iconFor(current);
  const short = current ? SHORT[current] ?? current : "À définir";

  const choose = (occ: string) => { setOpen(false); if (occ !== current) start(() => setOccasion(orderId, occ)); };

  return (
    <div className="relative mt-1 flex items-center gap-1">
      <span
        title={current || undefined}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
          current ? "bg-(--color-brand-soft) text-(--color-brand)" : "bg-zinc-100 text-zinc-500",
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{short}</span>
      </span>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={pending} aria-label="Changer l'occasion" className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
        <Pencil className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {OCCASIONS.map((o) => {
              const I = iconFor(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => choose(o)}
                  className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", o === current ? "font-semibold text-zinc-900" : "text-zinc-600")}
                >
                  <I className="size-4 shrink-0 text-zinc-400" />
                  <span className="flex-1">{o}</span>
                  {o === current && <Check className="size-4 text-(--color-brand)" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
