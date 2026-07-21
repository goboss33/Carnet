"use client";

/* Cellule « Événement » du bandeau résumé — toute la zone est cliquable
   (crayon indicatif près du label) et ouvre l'édition de la date. L'étiquette
   J-x est sous la date en mobile, sur la même ligne en desktop. */

import { useState, useTransition, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/ui";
import { setEventDate } from "@/app/actions";

export function EventDatePicker({ orderId, value, display, badge, badgeTone }: { orderId: string; value: string; display: string; badge: string | null; badgeTone: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.showPicker?.(); }
  }, [editing]);

  const commit = (v: string) => { setEditing(false); if (v !== value) start(() => setEventDate(orderId, v)); };

  if (editing) {
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Événement</span>
          <Pencil className="size-3.5 shrink-0 text-zinc-500" />
        </div>
        <input
          ref={ref}
          type="date"
          defaultValue={value}
          className="mt-1 w-full min-w-0 rounded-lg border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-(--color-brand)"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(e.currentTarget.value); }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} disabled={pending} className="group block w-full min-w-0 text-left">
      <span className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Événement</span>
        <Pencil className="size-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
      </span>
      <span className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="truncate text-sm font-medium text-zinc-900">{display}</span>
        {badge && <span className={cn("w-fit rounded px-1.5 py-0.5 text-[11px] font-semibold", badgeTone)}>{badge}</span>}
      </span>
    </button>
  );
}
