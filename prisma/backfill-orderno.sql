-- Numérotation séquentielle des commandes (affichée #0042).
-- Attribue un orderNo aux commandes qui n'en ont pas encore, par tenant, dans
-- l'ordre de création (createdAt, puis id en départage). Reprend après le plus
-- grand numéro déjà attribué pour le tenant → sûr même si des numéros existent.
-- Idempotent : une fois toutes les lignes numérotées, ne change plus rien.

WITH ranked AS (
  SELECT id, "tenantId",
         row_number() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", id) AS rn
  FROM "Order"
  WHERE "orderNo" IS NULL
),
base AS (
  SELECT "tenantId", COALESCE(MAX("orderNo"), 0) AS mx
  FROM "Order"
  GROUP BY "tenantId"
)
UPDATE "Order" o
SET "orderNo" = base.mx + ranked.rn
FROM ranked
JOIN base ON base."tenantId" = ranked."tenantId"
WHERE o.id = ranked.id;
