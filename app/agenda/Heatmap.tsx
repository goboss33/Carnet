"use client";

/* Heatmap de charge façon GitHub, vue unique 3 mois : colonnes = semaines,
   lignes = lun→dim. Une case s'allume (vert, intensité selon la charge en
   parts) quand au moins une commande confirmée/en production tombe ce jour,
   avec le nombre de commandes dedans. Clic sur une case pleine → défile
   jusqu'à la commande du jour (ancre #day-YYYY-MM-DD). Aujourd'hui est cerclé
   couleur marque. La grille occupe TOUTE la largeur : colonnes fluides (1fr),
   cases carrées plafonnées à 26px — jamais de débordement horizontal. */

import { cn } from "@/lib/ui";

export type HeatDay = { count: number; parts: number };

const MONTHS_N = 3;
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
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  // Lundi de la semaine courante → fin de période.
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(today.getFullYear(), today.getMonth() + MONTHS_N, today.getDate());

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

  // Cases FLUIDES : les colonnes (1fr, min 0) se partagent la largeur de la
  // carte (plafonnée à 380px) — la grille rétrécit d'elle-même sur les petits
  // écrans, jusqu'à des points s'il le faut : aucun scroll horizontal possible.
  const cellCls = "flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden rounded-[3px] text-[9px] font-semibold tabular-nums sm:rounded-[4px] sm:text-[10px]";

  return (
    <div className="mx-auto mb-7 w-full max-w-[380px] rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
      <div
        className="grid w-full gap-[2px] sm:gap-[3px]"
        style={{ gridTemplateColumns: `auto repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {/* Rangée des étiquettes de mois — en absolu pour ne pas élargir les colonnes */}
        <div className="h-4" />
        {weeks.map((col, wi) => {
          const first = col.find((d) => d.getDate() === 1);
          const label = wi === 0 ? MONTHS[col[0].getMonth()] : first ? MONTHS[first.getMonth()] : "";
          return (
            <div key={`m-${wi}`} className="relative h-4">
              {label && <span className="absolute bottom-0 left-0 whitespace-nowrap text-[10px] font-medium leading-tight text-zinc-400">{label}</span>}
            </div>
          );
        })}

        {/* 7 rangées : initiale du jour + une case par semaine */}
        {WEEKDAYS.map((w, ri) => (
          [
            <div key={`w-${ri}`} className="flex items-center pr-1.5 text-[10px] font-medium text-zinc-400">{w}</div>,
            ...weeks.map((col, wi) => {
              const d = col[ri];
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
                    cellCls,
                    "transition-transform",
                    filled ? cn(LEVEL_CLS[level(data!)], "cursor-pointer hover:scale-110") : past ? "cursor-default bg-zinc-50" : "cursor-default bg-zinc-100/80",
                    isToday && "ring-[1.5px] ring-inset ring-(--color-brand)",
                  )}
                >
                  {filled ? data!.count : ""}
                </button>
              );
            }),
          ]
        ))}
      </div>
    </div>
  );
}
