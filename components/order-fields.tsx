"use client";

/* Champs interactifs alignés sur le configurateur du site, partagés par la fiche
   commande ET le formulaire « Nouvelle fiche ». Tous s'appuient sur des contrôles
   NATIFS (radio / checkbox / range) pour que l'auto-save (AutoSaveForm) capte
   leurs événements sans bricolage, et pour qu'un simple <form> les lise au submit. */

import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import { cn } from "@/lib/ui";
import { FOURRAGES, MAX_FOURRAGES, TIERS_PARTS } from "@/lib/order-options";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { MapsLink } from "@/components/ui/map-link";

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

/* Fourrages : replié, on ne montre que les choisis (max 2) + « Modifier » ;
   déplié, toute la liste. Les cases restent dans le DOM (juste masquées) pour
   que l'auto-save continue de lire leur valeur. Garde d'éventuels choix hors liste. */
export function FourrageChips({ selected }: { selected: string[] }) {
  const extras = selected.filter((s) => !(FOURRAGES as readonly string[]).includes(s));
  const all = [...FOURRAGES, ...extras];
  const [chosen, setChosen] = useState<string[]>(selected);
  const [editing, setEditing] = useState(false);
  const toggle = (f: string) => {
    const isOn = chosen.includes(f);
    const next = isOn ? chosen.filter((x) => x !== f) : chosen.length < MAX_FOURRAGES ? [...chosen, f] : chosen;
    setChosen(next);
    // Atteindre le maximum (2ᵉ goût) replie automatiquement ; retirer ne replie pas.
    if (!isOn && next.length >= MAX_FOURRAGES) setEditing(false);
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fourrages (max {MAX_FOURRAGES})</span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-800">
          {editing ? <><Check className="size-3.5" /> Terminé</> : <><Pencil className="size-3.5" /> Modifier</>}
        </button>
      </div>

      {/* Aperçu replié : seulement les fourrages choisis */}
      {!editing && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.length === 0 ? (
            <span className="text-sm text-zinc-400">Aucun fourrage — clique sur « Modifier »</span>
          ) : (
            chosen.map((f) => (
              <span key={f} className="rounded-full border border-(--color-brand) bg-(--color-brand-soft) px-3 py-1 text-[12px] font-medium text-(--color-brand)">{f}</span>
            ))
          )}
        </div>
      )}

      {/* Liste complète — toujours montée (masquée si replié) pour l'auto-save */}
      <div className={cn("flex flex-wrap gap-1.5", !editing && "hidden")}>
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

/* Mode de livraison : toggle Retrait / Livraison ; l'adresse (autocomplétée
   Google Places) n'est visible que pour Livraison mais reste dans le DOM. */
export function DeliveryFields({ mode, address }: { mode: string; address: string }) {
  const [m, setM] = useState(mode === "livraison" ? "livraison" : "retrait");
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <span className={labelCls}>Mode</span>
        <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 text-[13px]">
          {(["retrait", "livraison"] as const).map((v) => (
            <label key={v} className={cn("cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors", m === v ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}>
              <input type="radio" name="deliveryMode" value={v} checked={m === v} onChange={() => setM(v)} className="sr-only" />
              {v === "retrait" ? "Retrait atelier" : "Livraison"}
            </label>
          ))}
        </div>
      </div>
      <div className={cn("sm:col-span-2", m !== "livraison" && "hidden")}>
        <span className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Adresse de livraison</span>
          {address && <MapsLink address={address} className="text-[11px]" />}
        </span>
        <AddressAutocomplete name="deliveryAddress" defaultValue={address} inputClassName={inputCls} placeholder="Commencez à taper l'adresse…" />
      </div>
    </div>
  );
}
