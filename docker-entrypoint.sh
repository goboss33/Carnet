#!/bin/sh
set -e
echo "Carnet : synchronisation du schéma…"
# Transitoire (Journal, 2026-07) : retire les tables du montage vidéo abandonné.
# Idempotent — à supprimer dans un prochain commit une fois tous les déploiements passés.
echo 'DROP TABLE IF EXISTS "StudioPostAsset"; DROP TABLE IF EXISTS "StudioPost"; DROP TYPE IF EXISTS "StudioPostStatus";' \
  | /prisma-cli/node_modules/.bin/prisma db execute --stdin --schema prisma/schema.prisma || true
/prisma-cli/node_modules/.bin/prisma db push --skip-generate --schema prisma/schema.prisma
echo "Carnet : démarrage."
exec node server.js
