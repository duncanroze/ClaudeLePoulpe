import { cached } from "./cache";
import { takeBudget } from "./budget";

// The Odds API (the-odds-api.com) — plan gratuit 500 crédits/mois.
// Tout est caché en BDD : quelques requêtes par jour pour tous les visiteurs.

const BASE = "https://api.the-odds-api.com/v4";

function apiKey() {
    if (!process.env.ODDS_API_KEY) {
        throw new Error("Clé The Odds API non configurée (ODDS_API_KEY)");
    }
    return process.env.ODDS_API_KEY;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("Erreur The Odds API:", response.status, detail);
        throw new Error(`Erreur du fournisseur de cotes (${response.status})`);
    }
    return response.json();
}

// La liste des sports ne coûte aucun crédit ; on y retrouve la clé exacte
// du tournoi (ex: soccer_fifa_world_cup) sans la coder en dur.
export async function getSportKey() {
    return cached("sport-key", 24 * 3600, async () => {
        const sports = await fetchJson(`${BASE}/sports/?apiKey=${apiKey()}&all=true`);
        const candidates = sports.filter(
            (s) =>
                s.key.includes("fifa_world_cup") &&
                !s.key.includes("winner") &&
                !s.key.includes("qualifier")
        );
        const active = candidates.find((s) => s.active) || candidates[0];
        if (!active) throw new Error("Coupe du monde introuvable chez le fournisseur de cotes");
        return active.key;
    });
}

// Cotes 1N2 de tous les matchs à venir (région EU), cache 12 h → 2 appels/jour.
// Budget journalier strict : au-delà, on ressert le cache même périmé.
export async function getEvents() {
    const sport = await getSportKey();
    return cached("events", 12 * 3600, async () => {
        await takeBudget(1);
        return fetchJson(
            `${BASE}/sports/${sport}/odds/?apiKey=${apiKey()}&regions=eu&markets=h2h&oddsFormat=decimal`
        );
    });
}

// Scores finaux des 3 derniers jours, cache 6 h → en pratique le cron
// quotidien suffit, le bouton "Vérifier" ressert le cache. 2 crédits.
export async function getScores() {
    const sport = await getSportKey();
    return cached("scores", 6 * 3600, async () => {
        await takeBudget(2);
        return fetchJson(`${BASE}/sports/${sport}/scores/?apiKey=${apiKey()}&daysFrom=3`);
    });
}
