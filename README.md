# Carnet

**Le back-office des artisans et indépendants** — commandes, contacts, agenda de production,
saisie éclair par bot Telegram. Conçu pour être vendu en marque blanche : une stack Docker
par client, données chez le client.

Première instance : Maman Gâteau (cake design, Pully).

## Stack

Next.js 15 (App Router, server actions) · Prisma + PostgreSQL 16 · Tailwind v4 ·
bot Telegram (webhook) · Docker multi-stage.

## Démarrage local

```bash
cp .env.example .env        # remplir les variables
npm install
npx prisma generate
npx prisma db push          # nécessite un Postgres accessible (voir DATABASE_URL)
npm run dev
```

## Déploiement (Portainer, VPS)

1. **Repo GitHub privé** (le token du bot et la logique métier n'ont rien à faire en public).
2. Portainer → *Stacks* → *Add stack* → **Repository** → ce repo, compose path `docker-compose.yml`,
   GitOps polling activé (comme mamangateau).
3. Variables d'environnement de la stack : voir `.env.example`
   (`POSTGRES_PASSWORD`, `AUTH_SECRET`, `ADMIN_PASSWORD`, `HOOK_SECRET`,
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_IDS`, `APP_URL`).
   Générer les secrets : `openssl rand -hex 32`.
4. **Nginx Proxy Manager** : proxy host `carnet.mamangateau.ch` → `carnet:3000`
   (même réseau `proxy`), SSL Let's Encrypt, Websockets ON.
   DNS : enregistrement A `carnet` → IP du VPS.
5. Premier lancement : le schéma se synchronise (`prisma db push`) et le tenant se crée tout seul.
   Se connecter avec `ADMIN_PASSWORD` sur https://carnet.mamangateau.ch.

## Bot Telegram

1. Créer le bot chez @BotFather (fait) → token dans `TELEGRAM_BOT_TOKEN`.
2. Enregistrer le webhook (une fois, depuis n'importe quelle machine) :
   ```bash
   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy APP_URL=https://carnet.mamangateau.ch \
     node scripts/set-webhook.mjs
   ```
3. Envoyer `/start` au bot : il répond avec le chat id → l'ajouter à
   `TELEGRAM_ALLOWED_CHAT_IDS` (celui d'Annie + le tien), redéployer.
4. Commandes : `/lead` (fiche en 6 questions), `/jour` (la semaine), `/annule`, `/aide`.

## Intégration site (configurateur)

Le site POST chaque demande de devis sur `POST /api/hooks/devis`
avec le header `x-carnet-secret: $HOOK_SECRET`. Voir le patch dans le repo
mamangateau.ch (`CARNET_HOOK_URL` + `CARNET_HOOK_SECRET`).

## Multi-tenant

`tenantId` est présent sur toutes les tables. Aujourd'hui : un tenant résolu par
`TENANT_SLUG` (auto-créé). Demain : résolution par domaine/utilisateur, données déjà prêtes.

## Notes v1

- Le schéma se déploie via `prisma db push` (simple et sûr tant que le produit bouge).
  Passer à `prisma migrate` quand le schéma se stabilise.
- Sauvegardes : volume `carnet-pgdata` → `docker exec carnet-db pg_dump -U carnet carnet > backup.sql`
  (à programmer en cron).
