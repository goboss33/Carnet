/* ---------------------------------------------------------------------------
   Pièces d'une commande — ce qu'Annie doit RÉELLEMENT produire : un ou
   plusieurs gâteaux, des cupcakes, des mini-cupcakes.

   À ne pas confondre avec les « lignes » (lib/order-items) qui décrivent le
   DEVIS d'un projet en Mode ligne : ici c'est la production.

   Rétrocompatibilité : une commande sans `pieces` est lue comme UN gâteau
   construit depuis les champs plats (tiers/parts/biscuit/fourrages/sansLactose).
   Réciproquement, la première pièce gâteau est re-synchronisée dans ces champs
   plats à l'enregistrement, pour que l'agenda, le bot, les crons et le Journal
   — qui les lisent tous — continuent de fonctionner sans être réécrits.
--------------------------------------------------------------------------- */
import { z } from "zod";
import { CUPCAKE_STEP, MINI_CUPCAKE_STEP, cakePrice, cupcakePrice, deliveryFee, discountAmount, type Discount, type Pricing } from "@/lib/pricing";

export type PieceType = "CAKE" | "CUPCAKE" | "MINI_CUPCAKE";

export type OrderPiece = {
  id: string;
  type: PieceType;
  qty: number; // CAKE : nombre de parts · CUPCAKE/MINI : nombre de pièces
  tiers?: number | null; // gâteaux seulement (1 ou 2)
  biscuit?: string;
  fourrages: string[]; // gâteau : 2 max · cupcakes : 1 max
  themeNote?: string;
  sansLactose?: boolean;
};

const pieceSchema = z.object({
  id: z.string().max(40),
  type: z.enum(["CAKE", "CUPCAKE", "MINI_CUPCAKE"]),
  qty: z.number().int().min(0).max(100000),
  tiers: z.number().int().min(1).max(2).nullish(),
  biscuit: z.string().max(60).optional(),
  fourrages: z.array(z.string().max(80)).max(4).default([]),
  themeNote: z.string().max(200).optional(),
  sansLactose: z.boolean().optional(),
});

export const PIECE_LABEL: Record<PieceType, string> = {
  CAKE: "Gâteau",
  CUPCAKE: "Cupcakes",
  MINI_CUPCAKE: "Mini-cupcakes",
};

export const pieceStep = (t: PieceType) => (t === "CUPCAKE" ? CUPCAKE_STEP : t === "MINI_CUPCAKE" ? MINI_CUPCAKE_STEP : 1);
export const maxFourrages = (t: PieceType) => (t === "CAKE" ? 2 : 1);

/** Parse défensif d'un JSON de pièces. Retourne null si illisible. */
export function parsePieces(raw: unknown): OrderPiece[] | null {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    const p = z.array(pieceSchema).max(20).safeParse(arr);
    if (!p.success) return null;
    return p.data.map((x) => ({
      ...x,
      fourrages: x.fourrages.slice(0, maxFourrages(x.type)),
      tiers: x.type === "CAKE" ? (x.tiers ?? 1) : null,
    }));
  } catch {
    return null;
  }
}

type FlatOrder = {
  pieces?: unknown;
  tiers?: number | null;
  parts?: number | null;
  biscuit?: string;
  fourrages?: string[];
  themeNote?: string;
  sansLactose?: boolean;
};

/** LA lecture à utiliser partout : pièces stockées, ou pièce unique dérivée
    des champs plats (commandes créées avant les pièces). */
export function piecesOf(order: FlatOrder): OrderPiece[] {
  const stored = parsePieces(order.pieces);
  if (stored?.length) return stored;
  const parts = order.parts ?? 0;
  const hasCake = parts > 0 || !!order.biscuit || (order.fourrages?.length ?? 0) > 0 || !!order.tiers;
  if (!hasCake) return [];
  return [{
    id: "p0",
    type: "CAKE",
    qty: parts,
    tiers: order.tiers ?? 1,
    biscuit: order.biscuit ?? "",
    fourrages: order.fourrages ?? [],
    themeNote: order.themeNote ?? "",
    sansLactose: order.sansLactose ?? false,
  }];
}

/** Champs plats à réécrire depuis les pièces (1er gâteau = miroir). */
export function flatFromPieces(pieces: OrderPiece[]) {
  const cakes = pieces.filter((p) => p.type === "CAKE");
  const main = cakes[0];
  return {
    // parts = somme des GÂTEAUX (les cupcakes ne pèsent pas pareil : voir agenda)
    parts: cakes.length ? cakes.reduce((a, c) => a + (c.qty || 0), 0) : null,
    tiers: main?.tiers ?? null,
    biscuit: main?.biscuit ?? "",
    fourrages: (main?.fourrages ?? []).slice(0, 2),
    // sans lactose au niveau commande = AU MOINS une pièce concernée (allergie : on ne rate rien)
    sansLactose: pieces.some((p) => p.sansLactose),
  };
}

export const cupcakeCount = (pieces: OrderPiece[]) =>
  pieces.filter((p) => p.type !== "CAKE").reduce((a, p) => a + (p.qty || 0), 0);

/** Prix catalogue d'une pièce (moteur tarifaire = source de vérité). */
export function piecePrice(p: Pricing, piece: OrderPiece, occasion?: string | null): number {
  if (piece.type === "CAKE") return cakePrice(p, { parts: piece.qty, tiers: piece.tiers, occasion, fourrages: piece.fourrages });
  return cupcakePrice(p, { qty: piece.qty, mini: piece.type === "MINI_CUPCAKE", fourrages: piece.fourrages });
}

/** Total catalogue des pièces (hors livraison). */
export function piecesTotal(p: Pricing, pieces: OrderPiece[], occasion?: string | null): number {
  return pieces.reduce((a, piece) => a + piecePrice(p, piece, occasion), 0);
}

/* --------------------------------------------------------- total commande */

export type OrderTotal = {
  pieces: number; // sous-total des pièces
  delivery: number; // forfait de livraison
  discount: number; // remise appliquée (montant)
  total: number; // à payer
};

/** LE calcul d'une commande : pièces + livraison − remise.
    Recalculé à chaque modification (ajout de cupcakes, changement d'adresse…) :
    la remise vit à part, donc rien n'est jamais figé ni perdu. */
export function orderTotal(
  p: Pricing,
  o: { pieces: OrderPiece[]; occasion?: string | null; deliveryMode?: string; deliveryKm?: number | null; discount?: Discount | null }
): OrderTotal {
  const pieces = piecesTotal(p, o.pieces, o.occasion);
  const delivery = o.deliveryMode === "livraison" ? deliveryFee(p, o.deliveryKm) : 0;
  const sub = pieces + delivery;
  const discount = discountAmount(sub, o.discount);
  return { pieces, delivery, discount, total: Math.max(0, sub - discount) };
}

/** Libellé lisible d'un fourrage : les pièces stockent des identifiants
    (« coulis-framboise »), les fiches historiques des libellés — les deux
    doivent s'afficher proprement. */
export function fourrageLabel(p: Pricing | undefined, value: string): string {
  const f = p?.fourrages.find((x) => x.id === value || x.label.toLowerCase() === value.toLowerCase());
  return f?.label ?? value;
}

/** Résumé court d'une pièce — agenda, PDF, brief Journal. */
export function pieceSummary(piece: OrderPiece, p?: Pricing): string {
  const gouts = piece.fourrages.map((f) => fourrageLabel(p, f));
  if (piece.type === "CAKE") {
    const bits = [
      piece.tiers && piece.tiers > 1 ? `${piece.tiers} étages` : null,
      piece.qty ? `${piece.qty} parts` : null,
      piece.biscuit || null,
      gouts.length ? gouts.join(" + ") : null,
      piece.themeNote || null,
    ].filter(Boolean);
    return `Gâteau${bits.length ? ` — ${bits.join(" · ")}` : ""}`;
  }
  const bits = [piece.biscuit || null, gouts[0] || null, piece.themeNote || null].filter(Boolean);
  return `${piece.qty} ${piece.type === "MINI_CUPCAKE" ? "mini-cupcakes" : "cupcakes"}${bits.length ? ` — ${bits.join(" · ")}` : ""}`;
}
