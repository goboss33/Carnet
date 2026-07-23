-- Journal des encaissements — rétro-remplissage depuis les champs de commande.
-- Une écriture par mouvement connu : acompte à sa date, solde à la sienne,
-- pourboire à la livraison, acomptes conservés des annulations à l'annulation.
-- Idempotent : chaque insert vérifie qu'aucune écriture du même type n'existe
-- déjà pour la commande. Les nouvelles écritures viennent du code applicatif.

-- Acomptes (commandes non annulées)
INSERT INTO "Payment" (id, "tenantId", "orderId", kind, cents, "paidAt", "createdAt")
SELECT gen_random_uuid()::text, o."tenantId", o.id, 'ACOMPTE', o."depositCents", o."depositPaidAt", now()
FROM "Order" o
WHERE o.status <> 'ANNULE'
  AND COALESCE(o."depositCents", 0) > 0
  AND o."depositPaidAt" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id AND p.kind = 'ACOMPTE');

-- Soldes (commandes non annulées)
INSERT INTO "Payment" (id, "tenantId", "orderId", kind, cents, "paidAt", "createdAt")
SELECT gen_random_uuid()::text, o."tenantId", o.id, 'SOLDE', o."balanceCents", COALESCE(o."balancePaidAt", o."deliveredAt", o."depositPaidAt"), now()
FROM "Order" o
WHERE o.status <> 'ANNULE'
  AND COALESCE(o."balanceCents", 0) > 0
  AND COALESCE(o."balancePaidAt", o."deliveredAt", o."depositPaidAt") IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id AND p.kind = 'SOLDE');

-- Pourboires (à la livraison)
INSERT INTO "Payment" (id, "tenantId", "orderId", kind, cents, "paidAt", "createdAt")
SELECT gen_random_uuid()::text, o."tenantId", o.id, 'POURBOIRE', o."tipCents", COALESCE(o."deliveredAt", o."balancePaidAt", now()), now()
FROM "Order" o
WHERE COALESCE(o."tipCents", 0) > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id AND p.kind = 'POURBOIRE');

-- Annulations historiques avec argent conservé
INSERT INTO "Payment" (id, "tenantId", "orderId", kind, cents, "paidAt", "createdAt")
SELECT gen_random_uuid()::text, o."tenantId", o.id, 'ACOMPTE_CONSERVE',
       COALESCE(o."depositCents", 0) + COALESCE(o."balanceCents", 0),
       COALESCE(o."cancelledAt", o."depositPaidAt", now()), now()
FROM "Order" o
WHERE o.status = 'ANNULE'
  AND COALESCE(o."depositCents", 0) + COALESCE(o."balanceCents", 0) > 0
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o.id);
