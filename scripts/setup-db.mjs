// Crée le schéma "poulpe" et ses tables dans la BDD Neon.
// Usage : pnpm setup-db  (lit DATABASE_URL depuis .env)
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL manquante (lance via `pnpm setup-db`)");
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

await sql`CREATE SCHEMA IF NOT EXISTS poulpe`;

// Chaque ligne = un événement (ouverture de page ou clic GO)
await sql`
    CREATE TABLE IF NOT EXISTS poulpe.events (
        id         serial PRIMARY KEY,
        type       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    )`;
await sql`CREATE INDEX IF NOT EXISTS events_type_idx ON poulpe.events (type, created_at)`;
// Libellé optionnel : pour les "go", le match concerné
await sql`ALTER TABLE poulpe.events ADD COLUMN IF NOT EXISTS label text`;

// Une ligne par match prédit : la prédiction de Claude + le score réel
// (rempli plus tard via "Vérifier les résultats réels")
await sql`
    CREATE TABLE IF NOT EXISTS poulpe.predictions (
        id              text PRIMARY KEY,
        day             date NOT NULL,
        home            text NOT NULL,
        away            text NOT NULL,
        match_time      text,
        prediction      text,
        probabilities   jsonb,
        predicted_score text,
        confidence      text,
        actual_score    text,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
    )`;
// Tirs au but des matchs à élimination directe (ex. "4-2", domicile-extérieur),
// affichés tels quels à côté du score réglementaire. Colonne ajoutée après coup
// → migration idempotente.
await sql`ALTER TABLE poulpe.predictions ADD COLUMN IF NOT EXISTS actual_penalties text`;

// Cache générique des réponses d'API externes (cotes, scores) :
// un fetch sert tous les visiteurs pendant le TTL
await sql`
    CREATE TABLE IF NOT EXISTS poulpe.cache (
        key        text PRIMARY KEY,
        value      jsonb NOT NULL,
        expires_at timestamptz NOT NULL
    )`;

// Réglages de l'app (dont le mot de passe des routes API, à la demande de Duncan)
await sql`
    CREATE TABLE IF NOT EXISTS poulpe.settings (
        key   text PRIMARY KEY,
        value text NOT NULL
    )`;
if (process.env.CRON_SECRET) {
    await sql`
        INSERT INTO poulpe.settings (key, value) VALUES ('api_password', ${process.env.CRON_SECRET})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

// Signalements de problèmes par les visiteurs (IP hashée pour l'anti-spam)
await sql`
    CREATE TABLE IF NOT EXISTS poulpe.reports (
        id         serial PRIMARY KEY,
        name       text,
        message    text NOT NULL,
        ip_hash    text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    )`;

// Budget journalier d'appels à The Odds API (plafond dur, voir lib/budget.js)
await sql`
    CREATE TABLE IF NOT EXISTS poulpe.api_budget (
        day  date PRIMARY KEY,
        used int NOT NULL DEFAULT 0
    )`;

const tables = await sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'poulpe'`;
console.log("Schéma poulpe prêt. Tables :", tables.map((t) => t.table_name).join(", "));
