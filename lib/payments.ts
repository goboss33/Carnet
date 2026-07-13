/* ---------------------------------------------------------------------------
   État de paiement d'une commande — source unique de vérité pour la fiche,
   la compta, le bot et l'historique.
   ⚠️ Unités : priceQuoted est en CHF entiers ; depositCents / balanceCents
   sont en centimes. Tout est ramené aux centimes ici.
--------------------------------------------------------------------------- */

export type PaymentInput = {
  priceQuoted?: number | null;
  depositCents?: number | null;
  balanceCents?: number | null;
};

export type PaymentState = {
  totalCents: number;
  paidCents: number;
  dueCents: number;
  isPaid: boolean; // total connu et intégralement encaissé
  hasTotal: boolean; // un prix a été fixé
};

export function paymentState(o: PaymentInput): PaymentState {
  const totalCents = (o.priceQuoted ?? 0) * 100;
  const paidCents = (o.depositCents ?? 0) + (o.balanceCents ?? 0);
  const dueCents = Math.max(0, totalCents - paidCents);
  return {
    totalCents,
    paidCents,
    dueCents,
    isPaid: totalCents > 0 && dueCents === 0,
    hasTotal: totalCents > 0,
  };
}
