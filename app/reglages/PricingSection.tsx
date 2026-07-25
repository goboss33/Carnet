"use client";

/* Tarifs — source de vérité de l'app ET du site (le configurateur les lit via
   /api/tarifs). Tout est éditable ; un champ vidé reprend le défaut.
   L'état est local, sérialisé dans un input caché contrôlé lu par saveSettings
   (même recette que les autres champs composites de l'app). */

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { DEFAULT_PRICING, type Pricing, type PriceBand } from "@/lib/pricing";
import { cn } from "@/lib/ui";

const input = "w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

export default function PricingSection({ initial }: { initial: Pricing }) {
  const [p, setP] = useState<Pricing>(initial);
  const set = <K extends keyof Pricing>(k: K, v: Pricing[K]) => setP((c) => ({ ...c, [k]: v }));

  const bandRows = (key: "bandsDefault" | "bandsMariage") => (
    <div className="space-y-1.5">
      {p[key].map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[12px] text-zinc-400">jusqu'à</span>
          <input
            type="number" min="1" value={b.max}
            onChange={(e) => { const v = [...p[key]]; v[i] = { ...v[i], max: Number(e.target.value) || 0 }; set(key, v); }}
            className={cn(input, "w-20 text-right tabular-nums")}
          />
          <span className="shrink-0 text-[12px] text-zinc-400">parts →</span>
          <input
            type="number" min="0" value={b.price}
            onChange={(e) => { const v = [...p[key]]; v[i] = { ...v[i], price: Number(e.target.value) || 0 }; set(key, v); }}
            className={cn(input, "w-24 text-right tabular-nums")}
          />
          <span className="shrink-0 text-[12px] text-zinc-400">CHF</span>
          <button type="button" onClick={() => set(key, p[key].filter((_, j) => j !== i))} className="rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => { const last = p[key][p[key].length - 1] as PriceBand | undefined; set(key, [...p[key], { max: (last?.max ?? 10) + 10, price: (last?.price ?? 100) + 35 }]); }}
        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-2.5 py-1 text-[12px] text-zinc-400 hover:border-(--color-brand) hover:text-(--color-brand)"
      >
        <Plus className="size-3.5" /> Tranche
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <input type="hidden" name="pricing" value={JSON.stringify(p)} readOnly />

      <p className="text-[11px] leading-relaxed text-zinc-400">
        Ces tarifs pilotent l'estimation des commandes dans Carnet <b>et</b> le configurateur du site :
        une hausse saisie ici se répercute des deux côtés.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={label}>Grille standard</span>
          {bandRows("bandsDefault")}
        </div>
        <div>
          <span className={label}>Grille mariage</span>
          {bandRows("bandsMariage")}
        </div>
      </div>

      <div className="grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-3">
        <label className="block">
          <span className={label}>Plancher CHF / part</span>
          <input type="number" min="0" step="0.5" value={p.minPartPrice} onChange={(e) => set("minPartPrice", Number(e.target.value) || 0)} className={input} />
          <span className="mt-1 block text-[11px] text-zinc-400">Jamais moins que ce prix par part (arrondi aux 5.–).</span>
        </label>
        <label className="block">
          <span className={label}>Supplément 2 étages</span>
          <input type="number" min="0" value={p.tier2Surcharge} onChange={(e) => set("tier2Surcharge", Number(e.target.value) || 0)} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={label}>Km offerts</span>
            <input type="number" min="0" value={p.kmFree} onChange={(e) => set("kmFree", Number(e.target.value) || 0)} className={input} />
          </label>
          <label className="block">
            <span className={label}>CHF / km</span>
            <input type="number" min="0" step="0.5" value={p.kmRate} onChange={(e) => set("kmRate", Number(e.target.value) || 0)} className={input} />
          </label>
        </div>
      </div>

      <div className="grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Boîte de 6 cupcakes</span>
          <input type="number" min="0" value={p.cupcakePrice} onChange={(e) => set("cupcakePrice", Number(e.target.value) || 0)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Boîte de 12 mini-cupcakes</span>
          <input type="number" min="0" value={p.miniCupcakePrice} onChange={(e) => set("miniCupcakePrice", Number(e.target.value) || 0)} className={input} />
        </label>
      </div>

      <div className="border-t border-zinc-100 pt-5">
        <p className="mb-1 text-[13px] font-semibold text-zinc-700">Fourrages & suppléments</p>
        <p className="mb-3 text-[11px] text-zinc-400">Le supplément s'ajoute au prix du gâteau (et à chaque boîte de cupcakes).</p>
        <div className="space-y-1.5">
          {p.fourrages.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input
                value={f.label}
                onChange={(e) => { const v = [...p.fourrages]; v[i] = { ...v[i], label: e.target.value }; set("fourrages", v); }}
                className={cn(input, "min-w-0 flex-1")}
              />
              <input
                type="number" min="0" value={f.sup}
                onChange={(e) => { const v = [...p.fourrages]; v[i] = { ...v[i], sup: Number(e.target.value) || 0 }; set("fourrages", v); }}
                className={cn(input, "w-20 text-right tabular-nums")}
              />
              <span className="shrink-0 text-[12px] text-zinc-400">CHF</span>
              <button type="button" onClick={() => set("fourrages", p.fourrages.filter((_, j) => j !== i))} className="rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500">
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set("fourrages", [...p.fourrages, { id: `f${Date.now()}`, label: "", sup: 0 }])}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-2.5 py-1 text-[12px] text-zinc-400 hover:border-(--color-brand) hover:text-(--color-brand)"
          >
            <Plus className="size-3.5" /> Fourrage
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setP(DEFAULT_PRICING)}
        className="text-[12px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-700 hover:underline"
      >
        Réinitialiser aux tarifs par défaut
      </button>
    </div>
  );
}
