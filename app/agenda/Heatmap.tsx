"use client";

/* Heatmap de charge façon GitHub : colonnes = semaines, lignes = lun→dim.
   Une case s'allume (vert, intensité selon la charge en parts) quand au moins
   une commande confirmée/en production tombe ce jour ; le nombre de commandes
   s'affiche dans la case en vue 1/3 mois. Clic sur une case pleine → défile
   jusqu'à la commande du jour (ancre #day-YYYY-MM-DD). Aujourd'hui est cerclé.
   La grille défile HORIZONTALEMENT à l'intérieur de sa carte (initiales des
   jours fixes à gauche) — elle ne pousse jamais la largeur de la page. */

import { useState } from "react";
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

export default function Heatmap({ days, todayISO }: { days: Record<string, HeatDay>; todayISO: string }) {
  const [months, setMonths] = useState(3);

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

  // Étiquettes de mois (une par changement de mois, jamais deux trop proches).
  const labels: string[] = [];
  let lastLabeled = -10;
  const minGapCols = months === 12 ? 3 : 2;
  weeks.forEach((col, wi) => {
    const first = col.find((d) => d.getDate() === 1);
    if (wi === 0) { labels.push(MONTHS[col[0].getMonth()]); lastLabeled = 0; }
    else if (first && wi - lastLabeled >= minGapCols) { labels.push(MONTHS[first.getMonth()]); lastLabeled = wi; }
    else labels.push("");
  });

  const small = months === 12;
  const cell = small ? "size-3 rounded-[3px] text-[0px]" : months === 1 ? "size-8 rounded-md text-[11px]" : "size-6 rounded-[5px] text-[10px]";
  const gap = small ? "gap-[2px]" : "gap-[3px]";

  const jump = (dISO: string) => {
    document.getElementById(`day-${dISO}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="mb-7 min-w-0 max-w-full rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.months}
            type="button"
            onClick={() => setMonths(p.months)}
            aria-pressed={months === p.months}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              months === p.months ? "bg-(--color-brand) text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0">
        {/* Initiales des jours — fixes, hors de la zone qui défile */}
        <div className={cn("flex shrink-0 flex-col pr-1.5", gap)}>
          <div className={cn(cell, "invisible")} />
          {WEEKDAYS.map((w, i) => (
            <div key={i} className={cn(cell, "flex items-center justify-center bg-transparent font-medium text-zinc-400", small ? "text-[8px]" : "text-[10px]")}>{w}</div>
          ))}
        </div>

        {/* Grille — défile horizontalement dans la carte, sans pousser la page */}
        <div className="min-w-0 flex-1 overflow-x-auto pb-1">
          <div className={cn("flex w-max", gap)}>
            {weeks.map((col, wi) => (
              <div key={wi} className={cn("flex shrink-0 flex-col", gap)}>
                <div className={cn(cell, "flex items-end justify-start overflow-visible whitespace-nowrap bg-transparent font-medium text-zinc-400", small ? "text-[8px]" : "text-[10px]")}>
                  {labels[wi]}
                </div>
                {col.map((d) => {
                  const dISO = iso(d);
                  const past = d < today && dISO !== todayISO;
                  const isToday = dISO === todayISO;
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
                        cell,
                        "flex items-center justify-center font-semibold tabular-nums transition-transform",
                        filled ? cn(LEVEL_CLS[level(data!)], "cursor-pointer hover:scale-110") : past ? "cursor-default bg-zinc-50" : "cursor-default bg-zinc-100/80",
                        isToday && "ring-1 ring-zinc-900/50",
                      )}
                    >
                      {!small && filled ? data!.count : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
