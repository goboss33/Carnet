"use client";

/* Éditeur de lignes de devis — vit dans le formulaire auto-save de la fiche.
   L'état est local ; un input caché CONTRÔLÉ porte le JSON (la FormData lit
   toujours la valeur à jour) et l'événement « input » déclencheur est
   dispatché depuis le conteneur (même recette éprouvée que ChannelSelect).
   Montant : qté × PU quand les deux sont remplis, forfait sinon.
   Total (hors options) = prix de la commande, recalculé côté serveur. */

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { LINE_TEMPLATES, type OrderItem } from "@/lib/order-items";
import { cn } from "@/lib/ui";

const input = "rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-(--color-brand)";
const chf = (c: number) => `CHF ${(c / 100).toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Saisie CHF tolérante : « 1700 », « 1'700.50 », « 10.– » → centimes. */
const toCents = (s: string): number => {
  const n = parseFloat(s.replace(/[^\d.,]/g, "").replace(/'/g, "").replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100);
};

export default function ItemsEditor({ initial }: { initial: OrderItem[] | null }) {
  const [items, setItems] = useState<OrderItem[]>(initial ?? []);
  const wrap = useRef<HTMLDivElement>(null);

  const commit = (next: OrderItem[]) => {
    setItems(next);
    // Réveille l'auto-save (débounce) — la FormData sera lue après le re-render.
    setTimeout(() => wrap.current?.dispatchEvent(new Event("input", { bubbles: true })), 0);
  };
  const patch = (id: string, p: Partial<OrderItem>) =>
    commit(items.map((it) => (it.id === id ? { ...it, ...p, cents: recompute({ ...it, ...p }) } : it)));
  const recompute = (it: OrderItem) => (it.qty && it.unit ? it.qty * it.unit : it.cents);
  const add = (tpl?: (typeof LINE_TEMPLATES)[number]) =>
    commit([...items, {
      id: `l${Date.now()}${Math.floor(Math.random() * 1000)}`,
      label: tpl?.label ?? "",
      detail: tpl?.detail,
      qty: tpl?.qty ?? null,
      unit: tpl?.unit ?? null,
      cents: tpl?.qty && tpl?.unit ? tpl.qty * tpl.unit : 0,
      opt: tpl?.opt,
    }]);

  const total = items.filter((it) => !it.opt).reduce((a, it) => a + it.cents, 0);

  return (
    <div ref={wrap} className="space-y-3">
      <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />

      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className={cn("rounded-xl border p-3", it.opt ? "border-dashed border-zinc-300 bg-zinc-50/60" : "border-zinc-200 bg-white")}>
            <div className="flex items-center gap-2">
              <input
                value={it.label}
                onChange={(e) => patch(it.id, { label: e.target.value })}
                placeholder="Désignation (ex. Pièce maîtresse « La Route des 100 ans »)"
                className={cn(input, "min-w-0 flex-1 font-medium")}
              />
              {it.qty && it.unit ? (
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">{chf(it.cents)}</span>
              ) : (
                <input
                  defaultValue={it.cents ? (it.cents / 100).toFixed(2) : ""}
                  onChange={(e) => patch(it.id, { cents: toCents(e.target.value) })}
                  placeholder="CHF"
                  inputMode="decimal"
                  className={cn(input, "w-24 shrink-0 text-right tabular-nums")}
                />
              )}
              <button type="button" onClick={() => commit(items.filter((x) => x.id !== it.id))} title="Supprimer la ligne"
                className="shrink-0 rounded-md p-1 text-zinc-300 transition hover:bg-red-50 hover:text-red-500">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={it.detail ?? ""}
                onChange={(e) => patch(it.id, { detail: e.target.value })}
                placeholder="Détail (étages, saveurs, quantités… visible sur le devis)"
                className={cn(input, "min-w-40 flex-1 text-[13px] text-zinc-600")}
              />
              <label className="flex items-center gap-1 text-[11px] text-zinc-400" title="Quantité × prix unitaire">
                <input
                  defaultValue={it.qty ?? ""}
                  onChange={(e) => { const q = parseInt(e.target.value, 10); patch(it.id, { qty: q > 0 ? q : null }); }}
                  placeholder="qté" inputMode="numeric" className={cn(input, "w-14 text-right text-[12px]")}
                />
                ×
                <input
                  defaultValue={it.unit ? (it.unit / 100).toFixed(2) : ""}
                  onChange={(e) => { const u = toCents(e.target.value); patch(it.id, { unit: u > 0 ? u : null }); }}
                  placeholder="PU" inputMode="decimal" className={cn(input, "w-20 text-right text-[12px]")}
                />
              </label>
              <button
                type="button"
                onClick={() => patch(it.id, { opt: !it.opt })}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition",
                  it.opt ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-400 hover:text-zinc-600"
                )}
                title="En option : affichée sur le devis, hors total"
              >
                option
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => add()} className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[12px] font-medium text-zinc-600 transition hover:bg-zinc-50">
          <Plus className="size-3.5" /> Ligne
        </button>
        {LINE_TEMPLATES.map((t) => (
          <button key={t.label} type="button" onClick={() => add(t)} className="rounded-lg border border-dashed border-zinc-300 px-2.5 py-1 text-[12px] text-zinc-400 transition hover:border-(--color-brand) hover:text-(--color-brand)">
            + {t.label}
          </button>
        ))}
      </div>

      {items.length > 0 && (
        <p className="flex items-baseline justify-between border-t border-zinc-100 pt-2 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total (hors options) — devient le prix de la commande</span>
          <span className="font-semibold tabular-nums">{chf(total)}</span>
        </p>
      )}
    </div>
  );
}
