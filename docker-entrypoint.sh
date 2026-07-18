#!/bin/sh
set -e
echo "Carnet : synchronisation du schéma…"
# Transitoire (Journal, 2026-07) : retire les tables du montage vidéo abandonné.
# Idempotent — à supprimer dans un prochain commit une fois tous les déploiements passés.
echo 'DROP TABLE IF EXISTS "StudioPostAsset"; DROP TABLE IF EXISTS "StudioPost"; DROP TYPE IF EXISTS "StudioPostStatus";' \
  | /prisma-cli/node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma || true
# Transitoire (fusion style→thème, 2026-07) : le thème existant prime, le style
# ne sert de valeur que si le thème est vide ; puis la colonne disparaît.
printf '%s' 'UPDATE "Order" SET "themeNote" = "style" WHERE ("themeNote" IS NULL OR "themeNote" = '"'"''"'"') AND "style" IS NOT NULL AND "style" <> '"'"''"'"'; ALTER TABLE "Order" DROP COLUMN IF EXISTS "style";' \
  | /prisma-cli/node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma || true
/prisma-cli/node_modules/.bin/prisma db push --skip-generate --schema prisma/schema.prisma
echo "Carnet : démarrage."
exec node server.js
