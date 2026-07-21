"use client";

/* Champs interactifs de la fiche commande alignés sur le configurateur du site.
   Tous s'appuient sur des contrôles NATIFS (select / radio / checkbox / range)
   pour que l'auto-save (AutoSaveForm) capte leurs événements sans bricolage. */

import { useState } from "react";
import { cn } from "@/lib/ui";
import { FOURRAGES, MAX_FOURRAGES, TIERS_PARTS } from "@/lib/order-options";

const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

/* Étages 1 / 2 (toggle) + slider de parts dont les bornes suivent l'étage. */
export function TiersParts({ tiers, parts }: { tiers: number | null; parts: number | null }) {
  const init = tiers === 2 ? 2 : 1;
  const [t, setT] = useState(init);
  const [p, setP] = useState(parts ?? TIERS_PARTS[init].min);
  const r = TIERS_PARTS[t];
  const setTier = (n: number) => { setT(n); const nr = TIERS_PARTS[n]; setP((c) => Math.min(nr.max, Math.max(nr.min, c))); };
  return (
    <div>
      <span className={labelCls} title="Nombre d'étages">Étages & parts</span>
      <div className="flex items-center gap-3">
        <div className="inline-flex shrink-0 rounded-lg border border-zinc-300 p-0.5 text-[13px]">
          {[1, 2].map((n) => (
            <label key={n} className={cn("cursor-pointer rounded-md px-3 py-1.5 text-center font-semibold transition-colors", t === n ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}>
              <input type="radio" name="tiers" value={n} checked={t === n} onChange={() => setTier(n)} className="sr-only" />
              {n}
            </label>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input type="range" name="parts" min={r.min} max={r.max} value={p} onChange={(e) => setP(Number(e.target.value))} className="min-w-0 flex-1 accent-(--color-brand)" />
          <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold text-zinc-800">{p} parts</span>
        </div>
      </div>
    </div>
  );
}

/* Fourrages : puces à cocher, maximum 2 (garde d'éventuels choix hors liste). */
export function FourrageChips({ selected }: { selected: string[] }) {
  const extras = selected.filter((s) => !(FOURRAGES as readonly string[]).includes(s));
  const all = [...FOURRAGES, ...extras];
  const [chosen, setChosen] = useState<string[]>(selected);
  const toggle = (f: string) => setChosen((c) => (c.includes(f) ? c.filter((x) => x !== f) : c.length < MAX_FOURRAGES ? [...c, f] : c));
  return (
    <div>
      <span className={labelCls}>Fourrages (max {MAX_FOURRAGES})</span>
      <div className="flex flex-wrap gap-1.5">
        {all.map((f) => {
          const on = chosen.includes(f);
          const disabled = !on && chosen.length >= MAX_FOURRAGES;
          return (
            <label key={f} className={cn("rounded-full border px-3 py-1 text-[12px] transition-colors", on ? "cursor-pointer border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)" : disabled ? "cursor-not-allowed border-zinc-200 text-zinc-300" : "cursor-pointer border-zinc-300 text-zinc-600 hover:border-zinc-400")}>
              <input type="checkbox" name="fourrages" value={f} checked={on} disabled={disabled} onChange={() => toggle(f)} className="sr-only" />
              {f}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* Mode de livraison : toggle Retrait / Livraison ; l'adresse n'est visible que
   pour Livraison (mais reste dans le DOM pour ne pas perdre la valeur). */
export function DeliveryFields({ mode, address }: { mode: string; address: string }) {
  const [m, setM] = useState(mode === "livraison" ? "livraison" : "retrait");
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <span className={labelCls}>Mode</span>
        <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 text-[13px]">
          {(["retrait", "livraison"] as const).map((v) => (
            <label key={v} className={cn("cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors", m === v ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}>
              <input type="radio" name="deliveryMode" value={v} checked={m === v} onChange={() => setM(v)} className="sr-only" />
              {v === "retrait" ? "Retrait atelier" : "Livraison"}
            </label>
          ))}
        </div>
      </div>
      <label className={cn("sm:col-span-2", m !== "livraison" && "hidden")}>
        <span className={labelCls}>Adresse de livraison</span>
        <input name="deliveryAddress" defaultValue={address} className={inputCls} />
      </label>
    </div>
  );
}
