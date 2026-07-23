"use client";

/* Pouls de performance : 4 KPI (Leads, Confirmé, Conversion, Panier moyen) sur
   une période réglable (1 / 3 / 12 mois). Les 3 périodes sont calculées côté
   serveur ; ici on bascule instantanément. Une seule période est visible à la
   fois : on change via les pastilles OU par un swipe tactile (glissement
   horizontal du doigt), et la nouvelle vue apparaît en fondu — pas de scroll,
   pas d'ascenseur. Chaque carte superpose la courbe de la période (pleine) et
   de la précédente (pointillée), façon Shopify. */

import { useRef, useState } from "react";
import { ArrowUpRight, ArrowDownRight, Percent, ShoppingBasket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { STATUTS } from "@/lib/statuts";
import { cn } from "@/lib/ui";

export type KpiMetric = { value: string; deltaText: string; dir: "up" | "down" | "flat"; cur: number[]; prev: number[] };
export type KpiPeriod = { key: string; label: string; comparison: string; metrics: KpiMetric[] };

const leadDot = STATUTS.find((s) => s.id === "LEAD")?.dot ?? "bg-sky-500";
const confDot = STATUTS.find((s) => s.id === "ACOMPTE_RECU")?.dot ?? "bg-violet-500";
const SLOTS: { label: string; dot?: string; Icon?: LucideIcon; sub?: string }[] = [
  { label: "Leads", dot: leadDot },
  { label: "Confirmé", dot: confDot },
  { label: "Conversion", Icon: Percent, sub: "demandes → confirmées" },
  { label: "Panier moyen", Icon: ShoppingBasket, sub: "par commande confirmée" },
];

/* Chemin lissé (Catmull-Rom → Bézier) pour des courbes arrondies. */
function smoothPath(pts: [number, number][]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/* Deux courbes lissées sur le même axe. La période précédente est toujours
   complète (N+1 points) et sert de référence de largeur ; la période en cours
   s'arrête à aujourd'hui. */
function twoSpark(cur: number[], prev: number[]) {
  const N = Math.max(1, prev.length - 1);
  const all = [...cur, ...prev, 0];
  const max = Math.max(...all, 1), min = Math.min(...all, 0), range = max - min || 1;
  const X = (i: number) => (i / N) * 110;
  const Y = (v: number) => 4 + 18 * (1 - (v - min) / range);
  const toPts = (line: number[]): [number, number][] => line.map((v, i) => [Math.round(X(i)), Math.round(Y(v))]);
  return { cur: smoothPath(toPts(cur)), prev: smoothPath(toPts(prev)) };
}

export default function KpiPulse({ periods }: { periods: KpiPeriod[] }) {
  const [active, setActive] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clamp = (i: number) => Math.max(0, Math.min(periods.length - 1, i));

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    // Swipe horizontal net (et pas un scroll vertical) → période suivante/précédente.
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) setActive((i) => clamp(i + (dx < 0 ? 1 : -1)));
  };

  const p = periods[active];

  return (
    <div className="mb-7">
      <div className="mb-3 flex gap-1.5">
        {periods.map((per, i) => (
          <button
            key={per.key}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              i === active ? "bg-(--color-brand) text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
            )}
          >
            {per.label}
          </button>
        ))}
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="touch-pan-y select-none">
        <div key={active} className="animate-kpi-fade grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
          {p.metrics.map((m, i) => {
            const slot = SLOTS[i];
            const Icon = slot.Icon;
            const sub = i < 2 ? p.comparison : slot.sub;
            const sp = twoSpark(m.cur, m.prev);
            return (
              <div key={i} className="flex h-full flex-col rounded-xl border border-(--color-line) bg-white px-4 py-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase leading-tight tracking-wider text-zinc-400">
                  {slot.dot && <span className={cn("size-2 shrink-0 rounded-full", slot.dot)} />}
                  {Icon && <Icon className="size-3.5 shrink-0 text-zinc-400" />}
                  {slot.label}
                </p>
                <p className="mt-1 text-[11px] leading-tight text-zinc-400">{sub}</p>
                <div className="mt-auto flex items-baseline gap-2 pt-2">
                  <p className="text-base font-semibold tracking-tight text-zinc-900">{m.value}</p>
                  {m.deltaText && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                        m.dir === "up" ? "bg-emerald-50 text-emerald-700" : m.dir === "down" ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-500",
                      )}
                    >
                      {m.dir === "up" ? <ArrowUpRight className="size-3" /> : m.dir === "down" ? <ArrowDownRight className="size-3" /> : null}
                      {m.deltaText}
                    </span>
                  )}
                </div>
                <svg viewBox="0 0 110 26" preserveAspectRatio="none" aria-hidden className="mt-2 block h-6 w-full">
                  <path d={sp.prev} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="text-zinc-300" />
                  <path d={sp.cur} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className={m.dir === "up" ? "text-emerald-500" : m.dir === "down" ? "text-red-500" : "text-zinc-400"} />
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
