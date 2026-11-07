# Patrimoine Dashboard

Suivi de patrimoine personnel (assurance vie, livrets, CTO, PEA, PER...),
auto-hébergé, inspiré de Finary. La saisie est manuelle et les données restent
sur ton serveur.

- **Stack** : Next.js 16 (App Router), Prisma et SQLite, dans un conteneur Docker.
- **Saisie** : manuelle, par compte et par date. Aucune connexion bancaire.
- **Sécurité** : mot de passe (bcrypt) et 2FA TOTP obligatoire, sessions
  chiffrées, limitation des tentatives de connexion, en-têtes de sécurité,
  HTTPS via Caddy en option.
- **Portable** : la même image Docker tourne sur un Raspberry Pi (ARM64), une
  VM GCP ou en local. L'export/import JSON permet de déplacer l'historique
  d'une instance à l'autre.

## Démarrage rapide (Docker)

```bash
cp .env.example .env
# Dans .env, remplace SESSION_SECRET par une valeur générée avec :
openssl rand -base64 48

docker compose up -d --build
```

Ouvre `http://localhost:3000` (ou `http://<ip-du-raspberry>:3000` sur le
réseau local). Au premier lancement, la page `/setup` permet de créer ton
compte et de scanner le QR code 2FA (Google Authenticator, Aegis, Authy...).

Les données (base SQLite) sont dans `./data/` sur l'hôte. C'est le seul
dossier à sauvegarder.

### Mettre à jour

```bash
git pull
docker compose up -d --build
```

Les migrations de la base s'appliquent au démarrage du conteneur (voir
`entrypoint.sh`).

## Raspberry Pi

L'image part de `node:22-alpine`, qui existe en ARM64. Sur le Pi,
`docker compose up -d --build` suffit : le build se fait sur place. Pour
construire l'image depuis une machine x86 et la pousser :

```bash
docker buildx build --platform linux/arm64 -t patrimoine-dashboard:latest --push .
```

## HTTPS sur ton domaine

Le service Caddy (`docker-compose.yml`, profil `proxy`) obtient et renouvelle
un certificat Let's Encrypt :

1. Fais pointer l'enregistrement DNS A/AAAA de ton domaine vers l'IP publique
   du Raspberry Pi (ou de la VM GCP), et ouvre les ports 80 et 443 sur ta box
   ou ton pare-feu.
2. Remplace `patrimoine.exemple.fr` par ton domaine dans `Caddyfile`.
3. Mets `COOKIE_SECURE=true` dans `.env` (le cookie de session exige alors HTTPS).
4. `docker compose --profile proxy up -d --build`

Sans ce profil, l'app écoute en HTTP sur le port 3000, ce qui convient à un
usage sur le réseau local (`COOKIE_SECURE=false`).

## GCP

**VM Compute Engine** (le plus simple) : même procédure que sur le Raspberry
Pi. Une VM `e2-small` suffit. Installe Docker, clone le dépôt et lance
`docker compose up -d --build`, avec un disque persistant pour `./data/`.

**Cloud Run** : Cloud Run n'a pas de disque persistant, donc la base SQLite
serait perdue à chaque redémarrage. Il faut passer à Postgres (Cloud SQL) :

1. Dans `prisma/schema.prisma`, remplace `provider = "sqlite"` par
   `provider = "postgresql"`.
2. Fais pointer `DATABASE_URL` vers ton instance Cloud SQL.
3. Supprime `prisma/migrations/` et génère une migration Postgres :
   `npx prisma migrate dev --name init`.
4. Déploie l'image sur Cloud Run avec le connecteur Cloud SQL
   (`--add-cloudsql-instances`).

## Pages

- **Synthèse** : patrimoine total, courbe par période (de 1M à TOUT),
  plus-value latente, matelas de sécurité, niveau de risque, répartition et
  positions.
- **Analyse** : exposition par transparence (zones, secteurs, devises,
  principales sociétés détenues via les ETF), comparaison au marché mondial,
  volatilité estimée, scénarios de crise et conseils.
- **Dépenses** : revenus, charges et virements d'épargne du mois. C'est aussi
  là que se règle le matelas de sécurité : les livrets qui le composent et
  l'objectif en mois de charges.
- **Projection** : évolution possible du patrimoine selon tes versements, les
  rendements moyens et ton salaire après le diplôme.
- **Conseiller** : assistant IA sur tes données (voir plus bas).

### Positions et Trade Republic

En plus de la valeur totale d'un compte, l'app garde le détail des positions à
la date d'un relevé : instrument, ISIN, quantité, cours, valeur et prix de
revient unitaire.

Pour **Trade Republic** (PEA, CTO, crypto), exporte les transactions depuis
l'app (*Relevés > Exportation des transactions*, sur toute la période), puis
envoie le fichier CSV ou Excel dans *Réglages > Historique Trade Republic*.
Chaque opération est rejouée et le compte est valorisé jour par jour avec les
cours de clôture de Yahoo Finance, convertis en euros. L'historique de ces
comptes est remplacé à chaque import ; ils ne se saisissent pas à la main.

Les compositions d'ETF, volatilités et éligibilités PEA viennent d'un fichier
de référence : `src/lib/instruments.ts`. **Ajoutes-y chaque nouveau titre**
(clé = ISIN), sinon il apparaît comme « non reconnu » et n'est pas pris en
compte dans l'analyse.

Sur les courbes, deux relevés d'un compte de placement sont reliés en ligne
droite, pour ne pas afficher une fausse chute le jour du relevé suivant. Les
livrets restent en escalier.

### Or physique et véhicules

La page **Biens**, séparée des comptes, suit ce que tu possèdes plutôt que
des placements (bouton « + Ajouter un bien ») :

- **Or physique** : pièces (Napoléon, Krugerrand...) ou lingots en grammes.
  La valeur suit le cours de l'or du jour (Yahoo Finance, converti en
  euros), recalculée à l'ouverture de l'app, avec un historique depuis la
  date d'achat.
- **Véhicule** : marque, modèle, année, kilométrage, état et une photo. Le
  modèle du Conseiller (Gemini ou Claude) estime la cote à partir des
  annonces et cotes trouvées sur le web, tous les 30 jours ou à la demande.
  Il faut donc une clé d'IA (voir plus bas). Les photos sont rangées dans
  `data/photos/` et ne font pas partie de l'export JSON.

Les véhicules ne comptent pas dans le patrimoine : ni le total, ni les
courbes, ni l'analyse. Leur cote se consulte sur la page Biens. L'or physique,
lui, compte comme un placement.

### Rappels « À mettre à jour »

En haut de la Synthèse, et en pastille dans le menu, l'app liste ce qui est en
retard ou manquant : export Trade Republic de plus de 14 jours, solde d'un
livret ou d'une assurance vie vieux de plus d'un mois, total versé inconnu,
budget incomplet, matelas non choisi, et quelques infos qui améliorent
l'analyse. Chaque ligne disparaît une fois l'info saisie.

## Conseiller (IA)

La page **Conseiller** utilise Gemini ou Claude pour répondre sur la fiscalité
française, les montages d'optimisation légaux (prise de date PEA et assurance
vie, purge de plus-values, PER selon la TMI, épargne salariale...),
l'allocation et la performance, à partir de tes chiffres.

À chaque question, un résumé de ta situation du jour (profil, comptes,
positions, plus-values, répartition, budget, évolution, projection) est envoyé
à l'API choisie avec la conversation. Ces données quittent donc ton serveur
pour aller chez Google ou Anthropic.

Le conseiller garde en **mémoire** ce que tu lui apprends de durable
(situation familiale, épargne salariale, projets, décisions) et s'en sert dans
les conversations suivantes. Il peut aussi faire une **recherche web** quand
la réponse dépend d'un taux ou d'une règle récente. Les conversations sont
enregistrées dans la base (`./data/`) et accessibles depuis n'importe quel
appareil.

Le bouton **Paramètres** règle le modèle, la profondeur de réflexion, la
recherche web, la longueur des réponses, ton profil d'investisseur (risque,
TMI, horizon, objectifs, situation) et des consignes libres. Il permet aussi de
corriger la mémoire et de voir exactement ce qui est envoyé à l'IA.

### Configuration

1. Crée une clé API (paiement à l'usage, quelques centimes par question) :
   - **Gemini via Google Cloud (Vertex AI)** : dans la console Google Cloud,
     *Agent Platform > Clés API > Créer une clé API*, restreinte à « API Agent
     Platform », dans un projet où la facturation est activée.
   - **Gemini via AI Studio** : clé créée sur https://ai.studio, restreinte à
     « Generative Language API » (projet prépayé).
   - **Claude** : https://console.anthropic.com/settings/keys
2. Ajoute-la dans `.env` : `GEMINI_API_KEY="..."` (avec `GEMINI_VERTEX="true"`
   pour une clé Google Cloud) ou `ANTHROPIC_API_KEY="sk-ant-..."`. Si les deux
   sont présentes, le fournisseur se choisit dans les paramètres.
3. Redémarre : `docker compose up -d` (ou `npm run dev` en local).

Sans clé, la page explique comment la configurer. Le reste de l'app fonctionne
normalement.

## Migrer l'historique vers une nouvelle instance

1. Sur l'ancienne instance : **Réglages > Export de l'historique** (ou
   `GET /api/export`) pour télécharger le fichier JSON.
2. Sur la nouvelle instance, après le premier démarrage et la création du
   compte et de la 2FA : **Réglages > Import**, puis choisis le fichier.

L'import fusionne les données sans rien supprimer, on peut donc le relancer
plusieurs fois. Le mot de passe et le secret 2FA ne sont pas exportés : il
faut reconfigurer la connexion sur chaque instance.

## Développement local (sans Docker)

Nécessite Node.js 22.13 ou plus récent.

```bash
npm install
cp .env.example .env   # adapte SESSION_SECRET et DATABASE_URL
npx prisma migrate deploy
npm run dev
```

## Sécurité

- Mots de passe hashés avec bcrypt (12 rounds).
- **2FA (TOTP) obligatoire** dès la création du compte : pas de connexion sans
  le code à 6 chiffres.
- Sessions chiffrées (iron-session) dans un cookie `httpOnly`,
  `sameSite=strict`, et `secure` quand `COOKIE_SECURE=true`.
- Compte verrouillé 15 minutes après 5 échecs (mot de passe ou 2FA), et
  limitation par IP sur les routes d'authentification.
- En-têtes de sécurité : CSP stricte, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, HSTS en HTTPS.
- `noindex, nofollow` pour ne pas être indexé par les moteurs de recherche.
- Changer de mot de passe demande le mot de passe actuel **et** un code 2FA :
  une session ouverte ne suffit pas.
- Toutes les pages et routes API sont privées par défaut. Seules `/login`,
  `/setup` et leurs API sont publiques.
- Aucun service bancaire tiers. Tes chiffres ne quittent le serveur que si tu
  poses une question au Conseiller ou si tu exportes l'historique.

### Bonnes pratiques

- Change `SESSION_SECRET` et ne le commite pas (`.env` est déjà dans `.gitignore`).
- Sauvegarde régulièrement `./data/dashboard.db`, ou utilise l'export JSON.
- Si l'app est accessible depuis Internet, active le profil Caddy (HTTPS) et
  mets `COOKIE_SECURE=true`.
- Mets l'image à jour (`git pull` puis `docker compose up -d --build`) pour
  récupérer les correctifs de sécurité de Next.js et des dépendances.
