# 🐙 Claude le Poulpe — L'Oracle du Mondial 2026

App Next.js déployée sur Vercel. Le poulpe liste les matchs du jour de la
Coupe du monde 2026 et, au "GO", prédit l'issue la plus probable et les
scores exacts les plus plausibles. **Aucun LLM, aucun prompt, aucun coût au
clic** : des cotes réelles + du calcul. Aucun conseil de pari.

## Comment ça prédit

1. Cotes 1N2 de plusieurs bookmakers via [The Odds API](https://the-odds-api.com/) (gratuit, 500 crédits/mois)
2. Dé-margeage : p(issue) = (1/cote) / Σ(1/cotes), puis moyenne entre bookmakers = consensus du marché
3. Modèle de Poisson calibré sur ce consensus → les 3 scores exacts les plus probables
4. Les scores finaux réels sont récupérés automatiquement (cron quotidien + bouton) pour le bilan prédictions vs réalité

Les cotes portent sur le temps réglementaire : le « nul » reste possible même
en phase à élimination directe (avant prolongation/tirs au but).

## Architecture

- `components/ClaudeLePoulpe.jsx` — toute l'UI (client component)
- `app/api/matches/route.js` — matchs du jour (cotes en cache BDD, ~6 crédits/jour)
- `app/api/analyze/route.js` — dé-margeage + Poisson (pur calcul, 0 crédit)
- `app/api/verify/route.js` — scores réels → journal (bouton + cron quotidien 07:00 UTC)
- `app/api/stats/route.js` — compteurs de visites (`open`) et de clics GO (`go`)
- `app/api/predictions/route.js` — journal des prédictions vs scores réels
- `lib/oddsApi.js` / `lib/predict.js` / `lib/teams.js` / `lib/cache.js` / `lib/db.js`
- `scripts/setup-db.mjs` — création du schéma/tables (`pnpm setup-db`)

## Base de données (Neon, schéma `poulpe`, séparé de CityTracker)

- `poulpe.events(id, type, created_at)` — une visite (`open`) ou un clic GO (`go`) = une ligne
- `poulpe.predictions(id, day, home, away, prediction, probabilities, predicted_score, confidence, actual_score, ...)` — le bilan des 5 semaines
- `poulpe.cache(key, value, expires_at)` — cache des réponses The Odds API

## Setup

```bash
pnpm install
cp .env.example .env   # remplir DATABASE_URL + ODDS_API_KEY
pnpm setup-db          # crée le schéma poulpe dans Neon
pnpm dev
```

## Déploiement

```bash
vercel link            # projet "claude-le-poulpe"
vercel env add DATABASE_URL production
vercel env add ODDS_API_KEY production
vercel --prod
```
