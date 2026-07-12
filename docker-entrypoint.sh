#!/bin/sh
set -e
echo "Carnet : synchronisation du schéma…"
/prisma-cli/node_modules/.bin/prisma db push --skip-generate --schema prisma/schema.prisma
echo "Carnet : démarrage."
exec node server.js
