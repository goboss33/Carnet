"use client";

/* Navigation de mois : flèches + popover maison (grille des 12 mois, année
   naviguable, raccourci « Ce mois »). Tout le label est cliquable. */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export default function MonthNav({ month, prev, next, label }: { month: string; prev: string; next: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [curY, curM] = month.split("-").map(Number);
  const [viewYear, setViewYear] = useState(curY);
  const [pos, setPos] = useState({ top: 60, left: 8 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const now = new Date();

  const go = (m: string) => { setOpen(false); router.push(`/compta?m=${m}`); };
  const pad = (n: number) => String(n).padStart(2, "0");

  // Panneau en position FIXE, centré sous le bouton mais clampé au viewport
  // (sinon tronqué à gauche sur mobile / à droite quand les actions sont à droite).
  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const w = 240; // w-60
      setPos({ top: r.bottom + 8, left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) });
    }
    setViewYear(curY);
    setOpen((v) => !v);
  };

  return (
    <div className="relative flex items-center gap-0.5 rounded-lg border border-zinc-300 bg-white p-0.5">
      <button type="button" onClick={() => go(prev)} aria-label="Mois précédent" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
        <ChevronLeft className="size-4" />
      </button>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-w-28 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold capitalize text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        {label} <ChevronDown className={cn("size-3.5 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      <button type="button" onClick={() => go(next)} aria-label="Mois suivant" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
        <ChevronRight className="size-4" />
      </button>

      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-60 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="Année précédente" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"><ChevronLeft className="size-4" /></button>
              <span className="text-[13px] font-bold tabular-nums text-zinc-800">{viewYear}</span>
              <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="Année suivante" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100"><ChevronRight className="size-4" /></button>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {MONTHS.map((mLabel, i) => {
                const isCur = viewYear === curY && i + 1 === curM;
                const isNow = viewYear === now.getFullYear() && i === now.getMonth();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => go(`${viewYear}-${pad(i + 1)}`)}
                    className={cn(
                      "rounded-lg px-1 py-1.5 text-[12px] font-medium transition-colors",
                      isCur ? "bg-(--color-brand) text-white" : isNow ? "bg-(--color-brand-soft) text-(--color-brand) hover:bg-zinc-100" : "text-zinc-600 hover:bg-zinc-100",
                    )}
                  >
                    {mLabel}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => go(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`)}
              className="mt-2 w-full rounded-lg border border-zinc-200 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900"
            >
              Ce mois
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
