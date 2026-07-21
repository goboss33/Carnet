"use client";

/* Canal d'acquisition éditable depuis la fiche : clic sur l'icône → petit menu
   (type Apple) pour changer la source. Enregistre via setSource. */

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/ui";
import { SOURCES } from "@/lib/statuts";
import { ChannelIcon } from "@/components/ui/channel-icon";
import { setSource } from "@/app/actions";

export function ChannelPicker({ orderId, current }: { orderId: string; current: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const choose = (s: string) => { setOpen(false); if (s !== current) start(() => setSource(orderId, s)); };

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-label="Changer le canal d'acquisition"
        className="inline-flex items-center rounded p-0.5 transition-colors hover:bg-zinc-100"
      >
        <ChannelIcon source={current} className="size-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => choose(s.id)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-zinc-50", s.id === current ? "font-semibold text-zinc-900" : "text-zinc-600")}
              >
                <span className="flex size-4 shrink-0 items-center justify-center"><ChannelIcon source={s.id} className="size-4" /></span>
                <span className="flex-1">{s.label}</span>
                {s.id === current && <Check className="size-4 text-(--color-brand)" />}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
