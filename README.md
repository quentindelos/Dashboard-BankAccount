# Patrimoine Dashboard

Suivi d'historique de patrimoine personnel (assurance vie, livrets, CTO, PEA,
PER...) à la manière de Finary — en auto-hébergé, saisie manuelle, données
chez toi uniquement.

- **Stack** : Next.js 16 (App Router) + Prisma + SQLite, conteneurisé.
- **Saisie** : manuelle, par compte et par date (pas de connexion bancaire).
- **Sécurité** : mot de passe (bcrypt) + 2FA TOTP obligatoire, sessions
  chiffrées, rate-limiting anti brute-force, en-têtes de sécurité, HTTPS via
  Caddy en option.
- **Portable** : tourne sur Raspberry Pi (ARM64), sur une VM GCP, ou en local
  — même image Docker partout. Export/import JSON pour migrer l'historique
  d'une instance à l'autre.

## Démarrage rapide (Docker, recommandé)

```bash
cp .env.example .env
# Édite .env : remplace SESSION_SECRET par une valeur générée avec :
openssl rand -base64 48

docker compose up -d --build
```

Ouvre `http://localhost:3000` (ou `http://<ip-du-raspberry>:3000` sur le
réseau local). Au premier lancement, tu es redirigé vers `/setup` pour créer
ton compte et scanner le QR code 2FA (Google Authenticator, Aegis, Authy...).

Les données (base SQLite) vivent dans `./data/` sur l'hôte — c'est le seul
dossier à sauvegarder.

### Mettre à jour

```bash
git pull
docker compose up -d --build
```

Les migrations de base de données s'appliquent automatiquement au démarrage
du conteneur (voir `entrypoint.sh`).

## Déploiement sur Raspberry Pi

L'image est construite depuis `node:22-alpine`, compatible ARM64 nativement.
Sur le Pi lui-même, `docker compose up -d --build` suffit (le build se fait
sur place, pas besoin de cross-compilation). Si tu préfères builder depuis ta
machine x86 et pousser l'image :

```bash
docker buildx build --platform linux/arm64 -t patrimoine-dashboard:latest --push .
```

## Exposer l'app sur ton domaine (HTTPS)

Un service Caddy optionnel (`docker-compose.yml`, profil `proxy`) obtient et
renouvelle automatiquement un certificat Let's Encrypt :

1. Pointe l'enregistrement DNS A/AAAA de ton domaine vers l'IP publique du
   Raspberry Pi (ou de la VM GCP), et ouvre les ports 80/443 sur ta box/pare-feu.
2. Remplace `patrimoine.exemple.fr` dans `Caddyfile` par ton vrai domaine.
3. Passe `COOKIE_SECURE=true` dans `.env` (le cookie de session exige alors HTTPS).
4. `docker compose --profile proxy up -d --build`

Sans ce profil, l'app n'écoute que sur le port 3000 en HTTP — adapté à un
usage strictement local/LAN (`COOKIE_SECURE=false`).

## Déploiement sur GCP

**Option recommandée — VM Compute Engine** : identique au Raspberry Pi.
Installe Docker sur une VM `e2-small` (largement suffisant), clone le repo,
`docker compose up -d --build` avec un disque persistant pour `./data/`. Même
image, même configuration, zéro changement de code.

**Option Cloud Run (serverless)** : Cloud Run n'offre pas de disque local
persistant entre déploiements, donc SQLite n'y survit pas aux redémarrages.
Il faut d'abord migrer vers Postgres (Cloud SQL) :

1. Dans `prisma/schema.prisma`, remplace `provider = "sqlite"` par
   `provider = "postgresql"`.
2. Pointe `DATABASE_URL` vers ton instance Cloud SQL.
3. Supprime `prisma/migrations/` et régénère une migration Postgres :
   `npx prisma migrate dev --name init`.
4. Déploie l'image sur Cloud Run, avec Cloud SQL connecté via le connecteur
   natif (`--add-cloudsql-instances`).

## Positions, analyse et conseils

En plus de la valeur totale d'un compte, l'app stocke le détail des positions
(instrument, ISIN, quantité, cours, valeur, prix de revient unitaire) pour une
date de relevé.

**Trade Republic** (PEA, CTO, crypto) : dans l'app Trade Republic, *Relevés →
Exportation des transactions* sur toute la période, puis envoie le fichier
(CSV ou Excel) dans *Réglages → Historique Trade Republic*. Les opérations sont
rejouées une par une et valorisées chaque jour avec les cours de clôture
(Yahoo Finance, convertis en euros) ; l'historique de ces comptes est
remplacé. Les comptes Trade Republic ne se saisissent pas à la main.

- **Synthèse** : patrimoine total, courbe par période (1M → TOUT), plus-value
  latente, matelas de sécurité, niveau de risque, répartition, positions.
- **Analyse** : exposition par transparence (zones, secteurs, devises,
  principales sociétés détenues via les ETF), comparaison au marché mondial,
  volatilité estimée, scénarios de crise et conseils automatiques.
- **Matelas de sécurité** (Réglages) : choisis le ou les livrets qui le
  composent et tes dépenses mensuelles pour suivre le nombre de mois couverts.

Les compositions d'ETF, volatilités et éligibilités PEA viennent d'un
référentiel statique : `src/lib/instruments.ts`. **Ajoute-y chaque nouveau
titre acheté** (clé = ISIN) pour qu'il soit pris en compte dans l'analyse ;
un titre absent est signalé comme « non reconnu ».

Les courbes relient deux relevés d'un compte de placement par une ligne droite
(au lieu de garder l'ancienne valeur puis de chuter le jour du relevé
suivant) ; les livrets restent en escalier.

## Conseiller (IA)

La page **Conseiller** est un conseiller patrimonial IA (Gemini ou Claude) :
fiscalité française, montages d'optimisation légaux (prise de date PEA/assurance
vie, purge de plus-values, PER selon la TMI, épargne salariale…), allocation et
performance, à partir de tes vrais chiffres. À chaque question, un résumé de ta
situation du jour (profil, comptes, positions, plus-values, répartition,
budget, évolution, projection) est envoyé à l'API choisie avec la
conversation ; rien n'est stocké côté serveur, la conversation reste dans ton
navigateur.

C'est un agent : il utilise des outils pendant qu'il répond. Il **mémorise**
de lui-même ce que tu lui apprends de durable (situation familiale, épargne
salariale, projets, décisions) et s'en sert dans les conversations suivantes,
et il lance une **recherche web** quand une réponse dépend d'un taux ou d'une
règle à jour. Les conversations sont enregistrées dans la base (`./data/`) :
la colonne *Conversations* permet de revenir aux précédentes depuis n'importe
quel appareil.

Le bouton **Paramètres** de la page règle le modèle, la profondeur de
réflexion, la recherche web (vérification des taux et règles du moment, avec
sources), la longueur des réponses, ton profil d'investisseur (risque, TMI,
horizon, objectifs, situation) et des consignes libres. Il montre et permet
de corriger sa mémoire, et exactement ce que reçoit l'IA.

### Rappels « À mettre à jour »

En haut de la Synthèse (et en pastille dans le menu), l'app liste ce qui est
en retard ou manquant : export Trade Republic de plus de 14 jours, solde d'un
livret ou d'une assurance vie non mis à jour depuis un mois, total versé
inconnu, budget incomplet, matelas non choisi, plus quelques conseils pour
affiner l'analyse. Chaque ligne disparaît dès que l'info est saisie.

1. Crée une clé API (paiement à l'usage, quelques centimes par question) :
   - **Gemini via Google Cloud (Vertex AI)** : console Google Cloud →
     *Agent Platform → Clés API → Créer une clé API*, restreinte à « API Agent
     Platform », dans un projet où la facturation est activée.
   - **Gemini via AI Studio** : clé de https://ai.studio, restreinte à
     « Generative Language API » (projet prépayé).
   - **Claude** : https://console.anthropic.com/settings/keys
2. Ajoute-la dans `.env` : `GEMINI_API_KEY="..."` (plus `GEMINI_VERTEX="true"`
   pour une clé Google Cloud) ou `ANTHROPIC_API_KEY="sk-ant-..."`. Si les deux
   sont là, le fournisseur se choisit dans les paramètres.
3. Redémarre : `docker compose up -d` (ou `npm run dev` en local).

Sans clé, la page explique comment la configurer et le reste de l'app
fonctionne normalement.

## Migrer ton historique vers une nouvelle instance

C'est le flux "je clone le repo ailleurs et je récupère mon historique" :

1. Sur l'ancienne instance : **Réglages → Export de l'historique** (ou
   `GET /api/export`), télécharge le fichier JSON.
2. Sur la nouvelle instance (après `git clone` + premier démarrage + setup du
   compte/2FA) : **Réglages → Import**, sélectionne le fichier JSON.

L'import fusionne (upsert) sans jamais rien supprimer : tu peux l'exécuter
plusieurs fois sans risque. Le mot de passe et le secret 2FA ne font jamais
partie de l'export — tu configures l'authentification à neuf sur chaque
instance.

## Développement local (sans Docker)

Nécessite Node.js ≥ 22.13.

```bash
npm install
cp .env.example .env   # adapte SESSION_SECRET et DATABASE_URL
npx prisma migrate deploy
npm run dev
```

## Sécurité — ce qui est en place

- Mots de passe hashés avec bcrypt (12 rounds), jamais stockés en clair.
- **2FA (TOTP) obligatoire** dès la création du compte — pas de connexion
  possible sans code à 6 chiffres.
- Sessions chiffrées (iron-session) dans un cookie `httpOnly`, `sameSite=strict`,
  `secure` dès que `COOKIE_SECURE=true`.
- Verrouillage de compte après 5 échecs (mot de passe ou 2FA) pendant 15 min,
  plus un rate-limit par IP sur les routes d'authentification.
- En-têtes de sécurité (CSP stricte, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, HSTS quand servi en HTTPS).
- `noindex, nofollow` pour éviter l'indexation par les moteurs de recherche.
- Changer son mot de passe exige le mot de passe actuel **et** un code 2FA
  valide — une session seule ne suffit pas.
- Toutes les routes (pages et API) sont privées par défaut ; seules
  `/login`, `/setup` et leurs API associées sont publiques.
- Image unique, zéro dépendance bancaire tierce : tes données ne quittent
  jamais ta machine, sauf export volontaire de ta part.

### Recommandations complémentaires

- Change `SESSION_SECRET` et ne le commite jamais (déjà exclu par `.gitignore`).
- Sauvegarde régulièrement `./data/dashboard.db` (ou utilise l'export JSON).
- Si tu exposes l'app sur Internet, utilise le profil Caddy (HTTPS) et mets
  `COOKIE_SECURE=true`.
- Garde l'image à jour (`docker compose pull && docker compose up -d --build`
  après un `git pull`) pour profiter des correctifs de sécurité de Next.js et
  des autres dépendances.
