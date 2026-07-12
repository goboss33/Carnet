#!/bin/sh
set -e
echo "Carnet : synchronisation du schéma…"
./node_modules/.bin/prisma db push --skip-generate --accept-data-loss=false 2>/dev/null || ./node_modules/.bin/prisma db push --skip-generate
echo "Carnet : démarrage."
exec node server.js
