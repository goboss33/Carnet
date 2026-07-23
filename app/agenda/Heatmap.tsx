"use client";

/* Heatmap de charge façon GitHub : colonnes = semaines, lignes = lun→dim.
   Une case s'allume (vert, intensité selon la charge en parts) quand au moins
   une commande confirmée/en production tombe ce jour, avec le nombre de
   commandes dans la case. Clic sur une case pleine → défile jusqu'à la commande
   du jour (ancre #day-YYYY-MM-DD). Aujourd'hui est cerclé couleur marque.
   Taille de case UNIQUE pour les 3 vues → hauteur identique ; la vue 12 mois
   défile horizontalement dans la carte. Swipe horizontal (hors 12 mois, où le
   geste sert à faire défiler la grille) → change de vue, avec fondu. */

import { useRef, useState } from "react";
import { cn } from "@/lib/ui";

export type HeatDay = { count: number; parts: number };

const PERIODS = [
  { months: 1, label: "1 mois" },
  { months: 3, label: "3 mois" },
  { months: 12, label: "12 mois" },
];

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Niveau d'intensité par charge (parts ; à défaut ~15 parts par commande). */
function level(d: HeatDay): number {
  const charge = d.parts > 0 ? d.parts : d.count * 15;
  if (charge <= 15) return 0;
  if (charge <= 30) return 1;
  if (charge <= 60) return 2;
  return 3;
}
const LEVEL_CLS = [
  "bg-emerald-100 text-emerald-900",
  "bg-emerald-300 text-emerald-950",
  "bg-emerald-500 text-white",
  "bg-emerald-700 text-white",
];

const CELL = "size-4 rounded-[4px] text-[10px]";
const GAP = "gap-[2px]";

export default function Heatmap({ days, todayISO }: { days: Record<string, HeatDay>; todayISO: string }) {
  const [idx, setIdx] = useState(1); // 3 mois par défaut
  const months = PERIODS[idx].months;
  const touch = useRef<{ x: number; y: number } | null>(null);

  const [ty, tm, td] = todayISO.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  // Lundi de la semaine courante → fin de période.
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());

  // Colonnes de semaines (chaque colonne = 7 jours).
  const weeks: Date[][] = [];
  for (let d = new Date(start); d < end; ) {
    const col: Date[] = [];
    for (let i = 0; i < 7; i++) { col.push(new Date(d)); d.setDate(d.getDate() + 1); }
    weeks.push(col);
  }

  const jump = (dISO: string) => {
    document.getElementById(`day-${dISO}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Swipe (hors 12 mois : le geste horizontal y fait défiler la grille).
  const swipeable = months !== 12;
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || !swipeable) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) setIdx((i) => Math.max(0, Math.min(PERIODS.length - 1, i + (dx < 0 ? 1 : -1))));
  };

  return (
    <div className="mb-7 min-w-0 max-w-full rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex gap-1.5">
        {PERIODS.map((p, i) => (
          <button
            key={p.months}
            type="button"
            onClick={() => setIdx(i)}
            aria-pressed={i === idx}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              i === idx ? "bg-(--color-brand) text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div key={months} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className={cn("animate-kpi-fade flex min-w-0", swipeable && "touch-pan-y")}>
        {/* Initiales des jours — fixes, hors de la zone qui défile */}
        <div className={cn("flex shrink-0 flex-col pr-1.5", GAP)}>
          <div className={cn(CELL, "invisible")} />
          {WEEKDAYS.map((w, i) => (
            <div key={i} className={cn(CELL, "flex items-center justify-center bg-transparent text-[9px] font-medium text-zinc-400")}>{w}</div>
          ))}
        </div>

        {/* Grille — défile horizontalement dans la carte, sans pousser la page */}
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className={cn("flex w-max", GAP)}>
            {weeks.map((col, wi) => {
              const first = col.find((d) => d.getDate() === 1);
              const label = wi === 0 ? MONTHS[col[0].getMonth()] : first ? MONTHS[first.getMonth()] : "";
              return (
                <div key={wi} className={cn("flex shrink-0 flex-col", GAP)}>
                  <div className={cn(CELL, "flex items-end justify-start overflow-visible whitespace-nowrap bg-transparent text-[9px] font-medium text-zinc-400")}>
                    {label}
                  </div>
                  {col.map((d) => {
                    const dISO = iso(d);
                    const isToday = dISO === todayISO;
                    const past = d < today && !isToday;
                    const data = days[dISO];
                    const filled = !!data && !past;
                    const title = `${d.toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long" })}${data ? ` — ${data.count} commande${data.count > 1 ? "s" : ""}${data.parts ? ` · ${data.parts} parts` : ""}` : ""}`;
                    return (
                      <button
                        key={dISO}
                        type="button"
                        tabIndex={filled ? 0 : -1}
                        onClick={filled ? () => jump(dISO) : undefined}
                        title={title}
                        aria-label={title}
                        className={cn(
                          CELL,
                          "flex items-center justify-center font-semibold tabular-nums transition-transform",
                          filled ? cn(LEVEL_CLS[level(data!)], "cursor-pointer hover:scale-110") : past ? "cursor-default bg-zinc-50" : "cursor-default bg-zinc-100/80",
                          isToday && "ring-2 ring-(--color-brand) ring-offset-1",
                        )}
                      >
                        {filled ? data!.count : ""}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
