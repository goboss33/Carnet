"use client";

/* Occasion dans le bandeau résumé : pastille (icône + libellé) + crayon → menu
   type Apple. « Autre occasion… » bascule en champ libre. Enregistre via
   l'action setOccasion (hors formulaire auto-save). */

import { useState, useTransition, useRef, useEffect } from "react";
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
};
const iconFor = (occ: string): LucideIcon => ICONS[occ] ?? Sparkles;

export function OccasionPicker({ orderId, current }: { orderId: string; current: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const isStd = (OCCASIONS as readonly string[]).includes(current);
  const label = current || "À définir";
  const Icon = iconFor(current);

  const save = (value: string) => { if (value !== current) start(() => setOccasion(orderId, value)); };
  const choose = (occ: string) => { setOpen(false); save(occ); };
  const commit = (raw: string) => { setCustom(false); save(raw.trim()); };

  useEffect(() => { if (custom) inputRef.current?.focus(); }, [custom]);

  if (custom) {
    return (
      <input
        ref={inputRef}
        defaultValue={isStd ? "" : current}
        placeholder="Préciser l'occasion…"
        className="mt-1 w-full min-w-0 rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-(--color-brand)"
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget.value); }
          if (e.key === "Escape") setCustom(false);
        }}
        onBlur={(e) => commit(e.currentTarget.value)}
      />
    );
  }

  return (
    <div className="relative mt-1 flex max-w-full items-start gap-1">
      <span className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full bg-(--color-brand-soft) px-2.5 py-0.5 text-[12px] font-semibold text-(--color-brand)", !current && "bg-zinc-100 text-zinc-500")}>
        <Icon className="size-3.5 shrink-0" />
        <span className="whitespace-normal break-words leading-tight">{label}</span>
      </span>
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={pending} aria-label="Changer l'occasion" className="mt-0.5 shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
        <Pencil className="size-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
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
            <button
              type="button"
              onClick={() => { setOpen(false); setCustom(true); }}
              className={cn("flex w-full items-center gap-2.5 border-t border-zinc-100 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", current && !isStd ? "font-semibold text-zinc-900" : "text-zinc-600")}
            >
              <Sparkles className="size-4 shrink-0 text-zinc-400" />
              <span className="flex-1">Autre occasion…</span>
              {current && !isStd && <Check className="size-4 text-(--color-brand)" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
