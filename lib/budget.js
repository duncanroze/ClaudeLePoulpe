import { sql } from "./db";

// Plafond dur : crédits The Odds API consommables par jour (heure de Paris).
// Journée type : 2 rafraîchissements de cotes (2 crédits) + 1 relevé de
// scores (2 crédits) = 4 crédits. Plafond à 8 = ~240/mois maxi (quota : 500).
export const DAILY_LIMIT = 8;

export const parisToday = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

export class BudgetExceededError extends Error {
    constructor() {
        super("Budget d'appels API du jour épuisé");
        this.name = "BudgetExceededError";
    }
}

// Réserve `cost` crédits sur le budget du jour, de façon atomique.
// Lève BudgetExceededError si le plafond serait dépassé.
export async function takeBudget(cost) {
    const day = parisToday();
    const rows = await sql`
        INSERT INTO poulpe.api_budget (day, used) VALUES (${day}, ${cost})
        ON CONFLICT (day) DO UPDATE SET used = poulpe.api_budget.used + ${cost}
        WHERE poulpe.api_budget.used + ${cost} <= ${DAILY_LIMIT}
        RETURNING used`;
    if (rows.length === 0) throw new BudgetExceededError();
}

// Quota mensuel du plan gratuit The Odds API
export const MONTH_QUOTA = 500;

export async function budgetStatus() {
    const day = parisToday();
    const monthStart = `${day.slice(0, 7)}-01`;
    const rows = await sql`
        SELECT
            COALESCE(SUM(used) FILTER (WHERE day = ${day}), 0)::int        AS today,
            COALESCE(SUM(used) FILTER (WHERE day >= ${monthStart}), 0)::int AS month
        FROM poulpe.api_budget`;
    return {
        day,
        used: rows[0].today,
        limit: DAILY_LIMIT,
        monthUsed: rows[0].month,
        monthQuota: MONTH_QUOTA,
    };
}
