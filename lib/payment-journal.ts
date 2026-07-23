/* ---------------------------------------------------------------------------
   Journal des encaissements — synchronisation par DIFFÉRENCE.
   Après toute mutation des champs de paiement d'une commande (depositCents /
   balanceCents / tipCents), on compare l'état de la commande à la somme du
   journal et on écrit l'écart en écritures datées :
     · argent ↑ : ACOMPTE (si journal vide) puis SOLDE
     · argent ↓ : CORRECTION (négative — remboursement)
     · pourboire ± : POURBOIRE
   Avantage : peu importe QUEL code a modifié la commande (fiche, bot, import,
   annulation…), un appel après coup suffit et le journal reste juste.
--------------------------------------------------------------------------- */
import { prisma } from "@/lib/db";
import type { PaymentKind } from "@prisma/client";

export async function syncPaymentJournal(orderId: string, paidAt: Date = new Date()): Promise<void> {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { tenantId: true, depositCents: true, balanceCents: true, tipCents: true },
  });
  if (!o) return;
  const rows = await prisma.payment.findMany({ where: { orderId }, select: { kind: true, cents: true } });

  const moneyNow = (o.depositCents ?? 0) + (o.balanceCents ?? 0);
  const tipNow = o.tipCents ?? 0;
  const moneyJournal = rows.filter((r) => r.kind !== "POURBOIRE").reduce((a, r) => a + r.cents, 0);
  const tipJournal = rows.filter((r) => r.kind === "POURBOIRE").reduce((a, r) => a + r.cents, 0);

  const writes: { kind: PaymentKind; cents: number }[] = [];
  const dMoney = moneyNow - moneyJournal;
  if (dMoney !== 0) writes.push({ kind: dMoney > 0 ? (moneyJournal <= 0 ? "ACOMPTE" : "SOLDE") : "CORRECTION", cents: dMoney });
  const dTip = tipNow - tipJournal;
  if (dTip !== 0) writes.push({ kind: "POURBOIRE", cents: dTip });

  if (writes.length) {
    await prisma.payment.createMany({
      data: writes.map((w) => ({ tenantId: o.tenantId, orderId, kind: w.kind, cents: w.cents, paidAt })),
    });
  }
}
