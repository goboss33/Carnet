/* ---------------------------------------------------------------------------
   Tarifs — SOURCE DE VÉRITÉ de l'app et du site.

   Les prix vivaient en dur dans le configurateur (mamangateau.ch/lib/data.ts).
   Ils sont désormais réglables ici (Réglages → Tarifs) et exposés par
   GET /api/tarifs : le site les consomme, une hausse se répercute partout.

   Toutes les valeurs sont en CHF entiers (pas de centimes : ce sont des prix
   catalogue, pas des encaissements).
--------------------------------------------------------------------------- */

export type PriceBand = { max: number; price: number };
export type FourrageTarif = { id: string; label: string; sup: number };

export type Pricing = {
  bandsDefault: PriceBand[]; // prix « beau décor » 1 étage, par nombre de parts
  bandsMariage: PriceBand[];
  minPartPrice: number; // plancher CHF/part (arrondi aux 5.– supérieurs)
  tier2Surcharge: number; // supplément 2 étages
  cupcakePrice: number; // prix d'une boîte de 6 cupcakes
  miniCupcakePrice: number; // prix d'une boîte de 12 mini-cupcakes
  fourrages: FourrageTarif[]; // liste + supplément par fourrage
  kmFree: number; // km de livraison offerts
  kmRate: number; // CHF par km au-delà
};

/* Défauts = tarifs Maman Gâteau au 24.07.2026. Les trois coulis sont
   distincts (avant : une seule entrée « Coulis fraise, framboise ou fruits
   rouges » — impossible de savoir lequel la cliente voulait). */
export const DEFAULT_PRICING: Pricing = {
  bandsDefault: [
    { max: 15, price: 100 }, { max: 19, price: 125 }, { max: 25, price: 145 }, { max: 30, price: 185 },
    { max: 34, price: 210 }, { max: 40, price: 235 }, { max: 50, price: 270 }, { max: 60, price: 305 },
  ],
  bandsMariage: [
    { max: 15, price: 165 }, { max: 19, price: 200 }, { max: 25, price: 245 }, { max: 30, price: 295 },
    { max: 34, price: 330 }, { max: 40, price: 375 }, { max: 50, price: 430 }, { max: 60, price: 490 },
  ],
  minPartPrice: 7,
  tier2Surcharge: 25,
  cupcakePrice: 24,
  miniCupcakePrice: 28,
  fourrages: [
    { id: "ganache-noir", label: "Ganache chocolat noir", sup: 0 },
    { id: "ganache-lait", label: "Ganache chocolat lait", sup: 0 },
    { id: "ganache-blanc", label: "Ganache chocolat blanc", sup: 0 },
    { id: "creme-vanille", label: "Crème vanille", sup: 0 },
    { id: "creme-fruits-rouges", label: "Crème fruits rouges", sup: 0 },
    { id: "creme-fraise", label: "Crème fraise", sup: 0 },
    { id: "creme-framboise", label: "Crème framboise", sup: 0 },
    { id: "creme-noisettes", label: "Crème noisettes", sup: 0 },
    { id: "creme-oreo", label: "Crème Oreo & mascarpone", sup: 8 },
    { id: "creme-caramel", label: "Crème caramel beurre salé", sup: 8 },
    { id: "coulis-fraise", label: "Coulis fraise", sup: 10 },
    { id: "coulis-framboise", label: "Coulis framboise", sup: 10 },
    { id: "coulis-fruits-rouges", label: "Coulis fruits rouges", sup: 10 },
    { id: "fruits-frais", label: "Fruits frais (selon saison)", sup: 10 },
  ],
  kmFree: 10,
  kmRate: 1,
};

/* Fourrages proposés aux cupcakes (liste courte, 1 seul choix) — le coulis
   reste facturé, d'où l'importance de garder les suppléments ici. */
export const CUPCAKE_FOURRAGE_IDS = [
  "ganache-noir", "creme-vanille", "coulis-fraise", "coulis-framboise", "coulis-fruits-rouges",
] as const;
export const CUPCAKE_BISCUIT_IDS = ["vanille", "chocolat"] as const;
export const CUPCAKE_STEP = 6; // les cupcakes se vendent par 6
export const MINI_CUPCAKE_STEP = 12; // les minis par 12

/* --------------------------------------------------------------- lecture */

const isBands = (v: unknown): v is PriceBand[] =>
  Array.isArray(v) && v.every((b) => b && typeof (b as PriceBand).max === "number" && typeof (b as PriceBand).price === "number");

/** Fusionne le JSON stocké en base avec les défauts (tolérant : un réglage
    partiel ou corrompu ne casse jamais le calcul). */
export function readPricing(raw: unknown): Pricing {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : d);
  return {
    bandsDefault: isBands(o.bandsDefault) && o.bandsDefault.length ? [...o.bandsDefault].sort((a, b) => a.max - b.max) : DEFAULT_PRICING.bandsDefault,
    bandsMariage: isBands(o.bandsMariage) && o.bandsMariage.length ? [...o.bandsMariage].sort((a, b) => a.max - b.max) : DEFAULT_PRICING.bandsMariage,
    minPartPrice: num(o.minPartPrice, DEFAULT_PRICING.minPartPrice),
    tier2Surcharge: num(o.tier2Surcharge, DEFAULT_PRICING.tier2Surcharge),
    cupcakePrice: num(o.cupcakePrice, DEFAULT_PRICING.cupcakePrice),
    miniCupcakePrice: num(o.miniCupcakePrice, DEFAULT_PRICING.miniCupcakePrice),
    fourrages: Array.isArray(o.fourrages) && o.fourrages.length
      ? (o.fourrages as FourrageTarif[]).filter((f) => f && typeof f.id === "string" && typeof f.label === "string").map((f) => ({ id: f.id, label: f.label, sup: num(f.sup, 0) }))
      : DEFAULT_PRICING.fourrages,
    kmFree: num(o.kmFree, DEFAULT_PRICING.kmFree),
    kmRate: num(o.kmRate, DEFAULT_PRICING.kmRate),
  };
}

/* --------------------------------------------------------------- calculs */

/** Prix d'un gâteau : bande dégressive selon les parts, plancher au CHF/part,
    + supplément 2 étages, + suppléments des fourrages choisis. */
export function cakePrice(p: Pricing, opts: { parts: number; tiers?: number | null; occasion?: string | null; fourrages?: string[] }): number {
  const parts = Math.max(1, Math.round(opts.parts || 0));
  const mariage = /mariage/i.test(opts.occasion ?? "");
  const bands = mariage ? p.bandsMariage : p.bandsDefault;
  const band = bands.find((b) => parts <= b.max) ?? bands[bands.length - 1];
  const floor = Math.ceil((parts * p.minPartPrice) / 5) * 5;
  const base = Math.max(band?.price ?? 0, floor) + (opts.tiers === 2 ? p.tier2Surcharge : 0);
  return base + fourrageSup(p, opts.fourrages ?? []);
}

/** Somme des suppléments des fourrages (par id OU par libellé — les fiches
    historiques stockent des libellés). */
export function fourrageSup(p: Pricing, chosen: string[]): number {
  return chosen.reduce((a, c) => {
    const f = p.fourrages.find((x) => x.id === c || x.label.toLowerCase() === c.toLowerCase());
    return a + (f?.sup ?? 0);
  }, 0);
}

/** Prix de cupcakes : proportionnel aux boîtes (6 ou 12 selon le format),
    + supplément du fourrage rapporté au nombre de boîtes. */
export function cupcakePrice(p: Pricing, opts: { qty: number; mini?: boolean; fourrages?: string[] }): number {
  const step = opts.mini ? MINI_CUPCAKE_STEP : CUPCAKE_STEP;
  const boxes = Math.max(1, Math.ceil((opts.qty || 0) / step));
  const unit = opts.mini ? p.miniCupcakePrice : p.cupcakePrice;
  return boxes * (unit + fourrageSup(p, opts.fourrages ?? []));
}

/** Frais de livraison : offerts jusqu'à kmFree, puis kmRate par km (aller). */
export function deliveryFee(p: Pricing, km?: number | null): number {
  if (km == null || km <= p.kmFree) return 0;
  return Math.round((km - p.kmFree) * p.kmRate);
}
