# 🐙 Claude le Poulpe — L'Oracle du Mondial 2026

App Next.js déployée sur Vercel. Claude (API Anthropic + recherche web) liste
les matchs du jour de la Coupe du monde 2026 et, au "GO", prédit l'issue la
plus probable et le score exact le plus plausible. Aucun conseil de pari.

## Architecture

- `components/ClaudeLePoulpe.jsx` — toute l'UI (client component)
- `app/api/oracle/route.js` — proxy vers l'API Anthropic (la clé reste côté serveur)
- `app/api/stats/route.js` — compteurs de clics (ouvertures + lancements d'oracle)
- `app/api/predictions/route.js` — journal des prédictions vs scores réels
- `lib/db.js` — connexion Neon Postgres (schéma `poulpe`, séparé de CityTracker)
- `scripts/setup-db.mjs` — création du schéma/tables (`pnpm setup-db`)

## Base de données (Neon, schéma `poulpe`)

- `poulpe.events(id, type, created_at)` — un clic = une ligne (`open` ou `go`)
- `poulpe.predictions(id, day, home, away, match_time, prediction, probabilities, predicted_score, confidence, actual_score, ...)` — pour le bilan des 5 semaines : prédiction de Claude vs score réel

## Setup

```bash
pnpm install
cp .env.example .env   # remplir DATABASE_URL + ANTHROPIC_API_KEY
pnpm setup-db          # crée le schéma poulpe dans Neon
pnpm dev
```

## Déploiement

```bash
vercel link            # projet "claude-le-poulpe"
vercel env add DATABASE_URL production
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

## Coût API

Chaque "GO" ≈ 3-4 recherches web (10 $/1000 recherches) + tokens Sonnet,
soit ~0,05 $ par analyse. La liste des matchs du jour coûte ~0,02 $ par visiteur
(cache navigateur par session uniquement).
