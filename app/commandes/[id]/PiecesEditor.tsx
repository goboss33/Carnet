"use client";

/* Les pièces à produire : un ou plusieurs gâteaux, des cupcakes, des minis.
   Chaque pièce a son bloc à fond léger. L'état est local et sérialisé dans un
   input caché contrôlé (l'auto-save lit toujours la valeur à jour) ; l'événement
   déclencheur part du conteneur — recette éprouvée du projet.
   Les cupcakes héritent par défaut des choix du premier gâteau : Annie ne
   re-saisit que ce qui diffère. */

import { useRef, useState } from "react";
import { Plus, X, Cake, Cookie, Pencil, Check } from "lucide-react";
import Range from "@/components/Range";
import {
  PIECE_LABEL, pieceStep, maxFourrages, piecePrice,
  type OrderPiece, type PieceType,
} from "@/lib/order-pieces";
import { CUPCAKE_BISCUIT_IDS, CUPCAKE_FOURRAGE_IDS, type Pricing } from "@/lib/pricing";
import { BISCUITS, TIERS_PARTS } from "@/lib/order-options";
import { cn } from "@/lib/ui";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const uid = () => `p${Date.now()}${Math.floor(Math.random() * 1000)}`;

/* Fourrages — replié on ne montre que les goûts choisis (la liste complète
   mangeait la moitié du bloc) ; « Modifier » déplie, et atteindre le maximum
   replie automatiquement. Même mécanique que l'ancienne fiche. */
function FourragePicker({ options, chosen, max, onChange }: {
  options: { id: string; label: string; sup: number }[];
  chosen: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isOn = (f: { id: string; label: string }) => chosen.some((x) => x === f.id || x.toLowerCase() === f.label.toLowerCase());
  const labelOf = (v: string) => options.find((o) => o.id === v || o.label.toLowerCase() === v.toLowerCase())?.label ?? v;

  const toggle = (f: { id: string; label: string }) => {
    const on = isOn(f);
    const next = on
      ? chosen.filter((x) => x !== f.id && x.toLowerCase() !== f.label.toLowerCase())
      : [...chosen, f.id].slice(-max);
    onChange(next);
    if (!on && next.length >= max) setEditing(false); // au complet → on replie
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Fourrage{max > 1 ? `s (max ${max})` : ""}
        </span>
        <button type="button" onClick={() => setEditing((v) => !v)} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-800">
          {editing ? <><Check className="size-3.5" /> Terminé</> : <><Pencil className="size-3.5" /> Modifier</>}
        </button>
      </div>

      {!editing && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.length === 0 ? (
            <span className="text-sm text-zinc-400">Aucun fourrage — clique sur « Modifier »</span>
          ) : (
            chosen.map((c) => (
              <span key={c} className="rounded-full border border-(--color-brand) bg-(--color-brand-soft) px-3 py-1 text-[12px] font-medium text-(--color-brand)">
                {labelOf(c)}
              </span>
            ))
          )}
        </div>
      )}

      {editing && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((f) => {
            const on = isOn(f);
            const full = !on && chosen.length >= max;
            return (
              <button
                key={f.id} type="button" disabled={full} onClick={() => toggle(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] transition-colors",
                  on ? "border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand)"
                     : full ? "cursor-not-allowed border-zinc-200 text-zinc-300"
                            : "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400"
                )}
                title={f.sup ? `+ CHF ${f.sup}` : undefined}
              >
                {f.label}{f.sup ? ` +${f.sup}` : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PiecesEditor({ initial, pricing, occasion }: {
  initial: OrderPiece[];
  pricing: Pricing;
  occasion: string;
}) {
  const [pieces, setPieces] = useState<OrderPiece[]>(initial);
  const wrap = useRef<HTMLDivElement>(null);

  const commit = (next: OrderPiece[]) => {
    setPieces(next);
    setTimeout(() => wrap.current?.dispatchEvent(new Event("input", { bubbles: true })), 0);
  };
  const patch = (id: string, p: Partial<OrderPiece>) => commit(pieces.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const add = (type: PieceType) => {
    const cake = pieces.find((p) => p.type === "CAKE");
    const step = pieceStep(type);
    // Héritage : les cupcakes reprennent les choix du gâteau (modifiables ensuite).
    const inherited = type === "CAKE"
      ? { qty: 20, tiers: 1, biscuit: "", fourrages: [] as string[], themeNote: "", sansLactose: false }
      : {
          qty: step * 2,
          tiers: null,
          biscuit: cake?.biscuit && (CUPCAKE_BISCUIT_IDS as readonly string[]).some((b) => cake.biscuit?.toLowerCase().includes(b)) ? cake.biscuit : "",
          fourrages: cake?.fourrages?.slice(0, 1) ?? [],
          themeNote: cake?.themeNote ?? "",
          sansLactose: cake?.sansLactose ?? false,
        };
    commit([...pieces, { id: uid(), type, ...inherited }]);
  };

  const fourrageOptions = (type: PieceType) =>
    type === "CAKE"
      ? pricing.fourrages
      : pricing.fourrages.filter((f) => (CUPCAKE_FOURRAGE_IDS as readonly string[]).includes(f.id));

  const biscuitOptions = (type: PieceType) =>
    type === "CAKE" ? [...BISCUITS] : ["Vanille", "Chocolat"];

  return (
    <div ref={wrap} className="space-y-3">
      <input type="hidden" name="pieces" value={JSON.stringify(pieces)} readOnly />

      {pieces.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-200 px-3 py-6 text-center text-[13px] text-zinc-400">
          Aucune pièce — ajoute un gâteau, des cupcakes ou des mini-cupcakes.
        </p>
      )}

      {pieces.map((p) => {
        const step = pieceStep(p.type);
        const isCake = p.type === "CAKE";
        const range = isCake ? TIERS_PARTS[p.tiers === 2 ? 2 : 1] : { min: step, max: step * 20 };
        const max = maxFourrages(p.type);
        const price = piecePrice(pricing, p, occasion);
        return (
          <div key={p.id} className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
            {/* En-tête de pièce : type, prix catalogue, suppression */}
            <div className="mb-3 flex items-center gap-2 border-b border-zinc-200/70 pb-2">
              {isCake ? <Cake className="size-4 shrink-0 text-(--color-brand)" /> : <Cookie className="size-4 shrink-0 text-(--color-brand)" />}
              <span className="text-[13px] font-semibold text-zinc-700">{PIECE_LABEL[p.type]}</span>
              <span className="ml-auto text-[12px] font-medium tabular-nums text-zinc-500">CHF {price}</span>
              <button type="button" onClick={() => commit(pieces.filter((x) => x.id !== p.id))} title="Retirer cette pièce"
                className="shrink-0 rounded-md p-1 text-zinc-300 transition hover:bg-red-50 hover:text-red-500">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Étages (gâteau) + quantité */}
              <div className="flex items-center gap-3">
                {isCake && (
                  <div className="inline-flex shrink-0 rounded-lg border border-zinc-300 bg-white p-0.5 text-[13px]">
                    {[1, 2].map((n) => (
                      <button
                        key={n} type="button"
                        onClick={() => {
                          const r = TIERS_PARTS[n];
                          patch(p.id, { tiers: n, qty: Math.min(r.max, Math.max(r.min, p.qty)) });
                        }}
                        className={cn("rounded-md px-3 py-1.5 font-semibold transition-colors", p.tiers === n ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800")}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Range
                    min={range.min} max={range.max} step={step} value={p.qty}
                    onValueChange={(qty) => patch(p.id, { qty })}
                    className="min-w-0 flex-1 accent-(--color-brand)"
                  />
                  <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold text-zinc-800">
                    {p.qty} {isCake ? "parts" : p.type === "MINI_CUPCAKE" ? "minis" : "pièces"}
                  </span>
                </div>
              </div>
              {!isCake && (
                <p className="-mt-1.5 text-[11px] text-zinc-400">
                  Par {step} — soit {Math.ceil(p.qty / step)} boîte{Math.ceil(p.qty / step) > 1 ? "s" : ""} de {step}.
                </p>
              )}

              {/* Biscuit + fourrages */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={label}>Biscuit</span>
                  <select value={p.biscuit ?? ""} onChange={(e) => patch(p.id, { biscuit: e.target.value })} className={cn(input, "bg-white")}>
                    <option value="">—</option>
                    {biscuitOptions(p.type).map((b) => <option key={b} value={b}>{b}</option>)}
                    {p.biscuit && !biscuitOptions(p.type).includes(p.biscuit) && <option value={p.biscuit}>{p.biscuit}</option>}
                  </select>
                </label>
                <FourragePicker
                  options={fourrageOptions(p.type)}
                  chosen={p.fourrages}
                  max={max}
                  onChange={(next) => patch(p.id, { fourrages: next })}
                />
              </div>

              {/* Thème + sans lactose */}
              <label className="block">
                <span className={label}>Thème & style</span>
                <input
                  value={p.themeNote ?? ""} onChange={(e) => patch(p.id, { themeNote: e.target.value })}
                  className={cn(input, "bg-white")}
                  placeholder={isCake ? "Ex. licorne pastel arc-en-ciel…" : "Repris du gâteau si vide"}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2.5" title="Sans lactose">
                <input type="checkbox" checked={!!p.sansLactose} onChange={(e) => patch(p.id, { sansLactose: e.target.checked })} className="peer sr-only" />
                <span className="relative h-5 w-9 shrink-0 rounded-full bg-zinc-200 transition-colors peer-checked:bg-(--color-brand) after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4" />
                <span className="text-[13px] font-medium text-zinc-600">Sans lactose</span>
              </label>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["CAKE", "CUPCAKE", "MINI_CUPCAKE"] as PieceType[]).map((t) => (
          <button
            key={t} type="button" onClick={() => add(t)}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-2.5 py-1 text-[12px] font-medium text-zinc-500 transition hover:border-(--color-brand) hover:text-(--color-brand)"
          >
            <Plus className="size-3.5" /> {PIECE_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
