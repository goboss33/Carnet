/* ---------------------------------------------------------------------------
   Extras du configurateur (boîtes de cupcakes…) — envoyés par le site avec le
   devis et stockés dans Order.extras.

   Règle métier : un extra est un COMPLÉMENT de commande, jamais une commande à
   lui seul. Son prix est DÉJÀ inclus dans priceQuoted (le site calcule
   gâteau + suppléments + extras + livraison), donc on ne le rechiffre nulle
   part : il s'affiche comme « compris ». Une boîte vendue seule se saisit à la
   main en Mode ligne.
--------------------------------------------------------------------------- */

export type OrderExtra = { label: string; qty: number; price: number }; // price = CHF unitaire

export function parseExtras(raw: unknown): OrderExtra[] {
  const arr = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const label = typeof o.label === "string" ? o.label.trim().slice(0, 80) : "";
      const qty = typeof o.qty === "number" && o.qty > 0 ? Math.round(o.qty) : 1;
      const price = typeof o.price === "number" && o.price >= 0 ? o.price : 0;
      return { label, qty, price };
    })
    .filter((x) => x.label)
    .slice(0, 10);
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

/** « Boîte de 6 cupcakes × 2 » — libellé court, sans montant. */
export function extraLabel(x: OrderExtra): string {
  return x.qty > 1 ? `${x.label} × ${x.qty}` : x.label;
}

/** Total des extras en CHF (info seulement : déjà compris dans le prix). */
export function extrasTotal(list: OrderExtra[]): number {
  return list.reduce((a, x) => a + x.price * x.qty, 0);
}
