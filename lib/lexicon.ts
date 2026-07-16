/* ---------------------------------------------------------------------------
   Lexique métier (marque blanche) — les mots qui changent d'un artisan à
   l'autre. Défauts : cake design (Maman Gâteau). Un tenant peut surcharger
   n'importe quelle clé via Settings.lexicon (Json).
   Règle : tout NOUVEAU texte visible côté web passe par ce lexique.
--------------------------------------------------------------------------- */
import { prisma } from "@/lib/db";

export const DEFAULT_LEXICON = {
  product: "gâteau",
  products: "gâteaux",
  productArticle: "le gâteau", // « le gâteau », « la prestation »
  unit: "part",
  units: "parts",
  client: "cliente",
  clients: "clientes",
  workshop: "l'atelier",
  order: "commande",
  orders: "commandes",
  occasion: "occasion",
  deliveryVerb: "livrer",
  pickupLabel: "retrait atelier",
} as const;

export type Lexicon = { [K in keyof typeof DEFAULT_LEXICON]: string };

export async function getLexicon(tenantId: string): Promise<Lexicon> {
  try {
    const s = await prisma.settings.findUnique({ where: { tenantId }, select: { lexicon: true } });
    const over = (s?.lexicon ?? {}) as Partial<Lexicon>;
    return { ...DEFAULT_LEXICON, ...Object.fromEntries(Object.entries(over).filter(([, v]) => typeof v === "string" && v)) };
  } catch {
    return { ...DEFAULT_LEXICON };
  }
}
