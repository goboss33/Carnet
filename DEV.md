# Carnet en local (Windows + PostgreSQL natif)

Objectif : lancer Carnet sur ta machine avec des données de test, pour itérer
sans redéployer. On travaille avec `npm run dev` (rechargement à chaud) — pas
besoin de `build`.

Prérequis déjà en place : **PostgreSQL 18** (port 5432, utilisateur `postgres`,
mot de passe `12345678`) et **Node.js**.

---

## 1. Créer la base (une seule fois)

Dans PowerShell :

```powershell
$env:PGPASSWORD = "12345678"
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres carnet
```

Si la base existe déjà, tu verras « database "carnet" already exists » — sans
gravité.

> Astuce : ajoute `C:\Program Files\PostgreSQL\18\bin` à ton PATH une bonne fois
> pour pouvoir taper `createdb` / `psql` directement.

---

## 2. Installer les dépendances (une seule fois, ou après un `npm install` de ma part)

```powershell
cd C:\Users\gbossens\Websites\Carnet
npm install
```

---

## 3. Créer les tables + le client Prisma

```powershell
npx prisma db push
```

Cette commande lit `prisma/schema.prisma`, crée toutes les tables dans la base
`carnet` et génère le client Prisma. À relancer **uniquement** quand le schéma
change (nouvelle colonne, etc.).

---

## 4. Remplir avec les données de test

```powershell
npm run db:seed
```

Crée le tenant Maman Gâteau, ~8 contacts, des commandes à tous les statuts
(lead, devis, acompte, production, livré, annulé) et 2 pages Journal. C'est
idempotent : relancer efface puis recrée un jeu propre.

Pour repartir de zéro (schéma + données) :

```powershell
npm run db:reset
```

---

## 5. Lancer l'app

```powershell
npm run dev
```

Ouvre **http://localhost:3000**.
Mot de passe de connexion (`ADMIN_PASSWORD` dans `.env`) : **`Carnet-2edf2225`**

---

## Le workflow d'itération avec Claude

1. Tu me demandes une modif.
2. Je code et je livre les fichiers dans le dossier (rsync vers le mount).
3. `next dev` recompile tout seul → **tu rafraîchis juste le navigateur**. Plus
   de push + redeploy Portainer pour voir un changement.
4. Si j'ai touché au **schéma Prisma**, relance `npx prisma db push` avant de
   rafraîchir. Si j'ai ajouté une **dépendance npm**, relance `npm install`.

---

## Voir la vraie data de prod (optionnel)

Ta base locale contient des données de test. Pour brancher l'app sur la **vraie**
base de prod (lecture seule dans les faits, mais prudence) :

1. Ouvre un tunnel SSH dans un terminal séparé :
   ```powershell
   ssh -N -L 5433:127.0.0.1:5433 root@31.220.92.70
   ```
2. Dans `.env`, commente la ligne `DATABASE_URL` locale et décommente la ligne du
   tunnel (port 5433).
3. Relance `npm run dev`. **Ne lance jamais `db:seed` / `db:reset` sur le tunnel**
   — ça écraserait la prod.

---

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Can't reach database server at localhost:5432` | service Postgres arrêté | Services Windows → démarrer `postgresql-x64-18` |
| `database "carnet" does not exist` | étape 1 oubliée | refais l'étape 1 |
| `password authentication failed` | mot de passe ≠ `.env` | vérifie `DATABASE_URL` dans `.env` |
| `Cannot find module 'tsx'` | dépendances pas à jour | `npm install` |
| Page blanche / erreur au login | mauvais mot de passe | `Carnet-2edf2225` |
