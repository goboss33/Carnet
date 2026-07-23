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

/** Rabat un texte libre (« anniversaire 30 ans », « bday de Léa »…) sur la liste
    standard OCCASIONS. L'âge (celebrantAge ou détecté dans le texte) départage
    enfant/adulte (enfant ≤ 15 ans). Inconnu → « Autre occasion » ; vide → "". */
export function normalizeOccasion(raw: string, age?: number | null): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  const exact = OCCASIONS.find((o) => o.toLowerCase() === s);
  if (exact) return exact;
  if (/mariage|wedding/.test(s)) return "Mariage";
  if (/baby\s*shower|naissance/.test(s)) return "Baby shower";
  if (/entreprise|corporate|b2b|société|societe|bureau|team/.test(s)) return "Événement d'entreprise";
  if (/anniv|birthday|bday|\bans\b/.test(s)) {
    const m = s.match(/(\d{1,3})\s*(ans|e\b|ème|eme)?/);
    const a = age ?? (m ? parseInt(m[1], 10) : null);
    if (a != null && a <= 15) return "Anniversaire d'enfant";
    if (a != null) return "Anniversaire d'adulte";
    if (/enfant|fille|garçon|garcon|kid/.test(s)) return "Anniversaire d'enfant";
    return "Anniversaire d'adulte";
  }
  return "Autre occasion";
}

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
