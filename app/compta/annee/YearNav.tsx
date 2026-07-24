"use client";

/* Navigation d'année : flèches + popover (grille d'années) au clic sur le
   label. Portail + position clampée au viewport (transform de .animate-page). */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/ui";

export default function YearNav({ year }: { year: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 60, left: 8 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const now = new Date().getFullYear();
  const years = Array.from({ length: now + 1 - 2023 + 1 }, (_, i) => 2023 + i); // 2023 → année prochaine
  const go = (y: number) => { setOpen(false); router.push(`/compta/annee?y=${y}`); };

  const toggle = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const w = 176; // w-44
      setPos({ top: r.bottom + 8, left: Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8) });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-zinc-300 bg-white p-0.5">
      <button type="button" onClick={() => go(year - 1)} aria-label="Année précédente" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
        <ChevronLeft className="size-4" />
      </button>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-w-16 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold tabular-nums text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        {year} <ChevronDown className={cn("size-3.5 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      <button type="button" onClick={() => go(year + 1)} aria-label="Année suivante" className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
        <ChevronRight className="size-4" />
      </button>

      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-44 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
            <div className="grid grid-cols-2 gap-1">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => go(y)}
                  className={cn(
                    "rounded-lg px-1 py-1.5 text-[13px] font-medium tabular-nums transition-colors",
                    y === year ? "bg-(--color-brand) text-white" : y === now ? "bg-(--color-brand-soft) text-(--color-brand) hover:bg-zinc-100" : "text-zinc-600 hover:bg-zinc-100",
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
