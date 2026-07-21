/* Options standard reprises du configurateur du site mamangateau.ch (lib/data.ts).
   Les deux repos sont séparés : on recopie ici les listes (elles bougent rarement). */

/* Doit rester STRICTEMENT identique aux `label` du configurateur du site
   (mamangateau.ch → lib/data.ts OCCASIONS) : le hook /api/hooks/devis stocke
   le label tel quel, donc toute divergence ferait tomber un lead « hors liste ». */
export const OCCASIONS = [
  "Anniversaire d'enfant",
  "Anniversaire d'adulte",
  "Mariage",
  "Baby shower",
  "Événement d'entreprise",
  "Autre occasion",
] as const;

export const BISCUITS = ["Vanille", "Chocolat", "Citron", "Cannelle", "Orange", "Nature"] as const;

export const FOURRAGES = [
  "Ganache chocolat noir",
  "Ganache chocolat lait",
  "Ganache chocolat blanc",
  "Crème vanille",
  "Crème fruits rouges",
  "Crème fraise",
  "Crème framboise",
  "Crème noisettes",
  "Crème Oreo & mascarpone",
  "Crème caramel beurre salé",
  "Coulis fraise, framboise ou fruits rouges",
  "Fruits frais (selon saison)",
] as const;

export const MAX_FOURRAGES = 2;

/** Bornes de parts selon le nombre d'étages (comme le configurateur). */
export const TIERS_PARTS: Record<number, { min: number; max: number }> = {
  1: { min: 12, max: 30 },
  2: { min: 26, max: 60 },
};
