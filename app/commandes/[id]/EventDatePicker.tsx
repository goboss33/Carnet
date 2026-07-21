"use client";

/* Date de l'événement, éditable depuis le bandeau résumé : texte + crayon →
   champ date natif. Enregistre via setEventDate (hors formulaire auto-save). */

import { useState, useTransition, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { setEventDate } from "@/app/actions";

export function EventDatePicker({ orderId, value, display }: { orderId: string; value: string; display: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { ref.current?.focus(); ref.current?.showPicker?.(); }
  }, [editing]);

  const commit = (v: string) => { setEditing(false); if (v !== value) start(() => setEventDate(orderId, v)); };

  if (editing) {
    return (
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
    );
  }

  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="truncate text-sm font-medium text-zinc-900">{display}</span>
      <button type="button" onClick={() => setEditing(true)} disabled={pending} aria-label="Modifier la date" className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}
