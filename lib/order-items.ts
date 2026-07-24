/* ---------------------------------------------------------------------------
   Lignes de commande — le détail d'un devis/d'une facture (« 800 × coffret
   CHF 10.– », « Pièce maîtresse CHF 1'700.– »). Stockées en Json sur Order ;
   la somme des lignes non optionnelles pilote priceQuoted (pipeline, KPI,
   compta inchangés). Pas de lignes = commande à prix unique, comme avant.
--------------------------------------------------------------------------- */
import { z } from "zod";

export type OrderItem = {
  id: string;
  label: string;
  detail?: string;
  qty?: number | null; // quantité (optionnelle — sinon forfait)
  unit?: number | null; // prix unitaire en centimes
  cents: number; // montant de la ligne en centimes (qty×unit ou forfait)
  opt?: boolean; // « en option » : affichée à part, hors total
};

const itemSchema = z.object({
  id: z.string().max(40),
  label: z.string().max(120).default(""),
  detail: z.string().max(300).optional(),
  qty: z.number().int().min(1).max(100000).nullish(),
  unit: z.number().int().min(0).max(100_000_000).nullish(),
  cents: z.number().int().min(0).max(1_000_000_000),
  opt: z.boolean().optional(),
});

/** Parse + assainit un JSON de lignes. Retourne null si illisible. */
export function parseItems(raw: unknown): OrderItem[] | null {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    const parsed = z.array(itemSchema).max(40).safeParse(arr);
    if (!parsed.success) return null;
    return parsed.data
      .map((it) => ({
        ...it,
        label: it.label.trim(),
        detail: it.detail?.trim() || undefined,
        cents: it.qty && it.unit ? it.qty * it.unit : it.cents,
      }))
      .filter((it) => it.label || it.cents > 0);
  } catch {
    return null;
  }
}

/** Total des lignes comptées (hors options), en centimes. */
export function itemsTotalCents(items: OrderItem[]): number {
  return items.filter((it) => !it.opt).reduce((a, it) => a + it.cents, 0);
}

/** Modèles proposés dans l'éditeur — guident sans figer. */
export const LINE_TEMPLATES: { label: string; detail?: string; qty?: number; unit?: number; opt?: boolean }[] = [
  { label: "Pièce maîtresse", detail: "Étages, hauteur, couleurs, éléments de décor…" },
  { label: "Parts de service", detail: "Entremets individuels ou parts traiteur", qty: 100, unit: 1000 },
  { label: "Livraison & installation sur site" },
  { label: "Dégustation", detail: "Séance de choix des saveurs", opt: true },
];
