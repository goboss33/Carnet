-- Rétro-remplissage des dates d'acquisition (KPI de période).
-- Les commandes importées ont un createdAt / depositPaidAt horodaté au jour de
-- l'import : impossible de mesurer une tendance dans le temps. On les rebase sur
-- la date d'événement (seul axe temporel réel de l'historique).
--
-- Idempotent et sûr : ne touche QUE les lignes dont la date d'acquisition est
-- POSTÉRIEURE à l'événement (impossible pour une vraie demande en temps réel,
-- qui précède toujours l'événement). Les vraies nouvelles fiches ne sont donc
-- jamais modifiées, et rejouer le script ne change plus rien.

UPDATE "Order" SET "createdAt" = "eventDate"
  WHERE "eventDate" IS NOT NULL AND "createdAt" > "eventDate";

UPDATE "Order" SET "depositPaidAt" = "eventDate"
  WHERE "eventDate" IS NOT NULL AND "depositPaidAt" IS NOT NULL AND "depositPaidAt" > "eventDate";
