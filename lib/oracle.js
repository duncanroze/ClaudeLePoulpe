import { sql } from "./db";
import { getEvents, getScores } from "./oddsApi";
import { teamInfo, slug } from "./teams";
import { buildAnalysis } from "./predict";

// Logique métier partagée entre les routes manuelles (/api/predict,
// /api/verify) et le cron quotidien (/api/cron).

const parisDay = (iso) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const parisTime = (iso) =>
    new Date(iso).toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
    });

// --- Auto-prédiction : "clique GO" automatique une fois par jour -----------
// Pour chaque match dont les cotes sont disponibles, calcule la prédiction
// (dé-margeage + Poisson, exactement comme un GO visiteur) et la journalise.
// Tant que le score réel n'est pas connu, la prédiction est rafraîchie chaque
// jour avec les cotes les plus récentes ; une fois vérifiée, elle est figée.
export async function predictUpcoming() {
    const events = await getEvents();
    let predicted = 0;
    let skipped = 0;

    for (const event of events || []) {
        const home = teamInfo(event.home_team);
        const away = teamInfo(event.away_team);
        let analysis;
        try {
            analysis = buildAnalysis({
                homeName: event.home_team,
                awayName: event.away_team,
                homeFr: home.fr,
                awayFr: away.fr,
                bookmakers: event.bookmakers,
            });
        } catch {
            // Pas de cotes 1N2 exploitables pour ce match : on passe.
            skipped++;
            continue;
        }

        const day = parisDay(event.commence_time);
        const id = `${day}-${slug(home.fr)}-${slug(away.fr)}`;
        const predictedScore = analysis.topScores?.[0]?.score ?? null;
        const probs = analysis.probabilities
            ? {
                  home: analysis.probabilities.home,
                  draw: analysis.probabilities.draw,
                  away: analysis.probabilities.away,
              }
            : null;

        const rows = await sql`
            INSERT INTO poulpe.predictions
                (id, day, home, away, match_time, prediction, probabilities, predicted_score, confidence)
            VALUES
                (${id}, ${day}, ${home.fr}, ${away.fr}, ${parisTime(event.commence_time)},
                 ${analysis.prediction}, ${JSON.stringify(probs)}, ${predictedScore}, ${analysis.confidence})
            ON CONFLICT (id) DO UPDATE SET
                prediction      = EXCLUDED.prediction,
                probabilities   = EXCLUDED.probabilities,
                predicted_score = EXCLUDED.predicted_score,
                confidence      = EXCLUDED.confidence,
                match_time      = COALESCE(EXCLUDED.match_time, poulpe.predictions.match_time),
                updated_at      = now()
            WHERE poulpe.predictions.actual_score IS NULL
            RETURNING id`;
        // RETURNING vide = conflit sur un match déjà vérifié (laissé figé).
        predicted += rows.length;
    }

    return { ok: true, total: (events || []).length, predicted, skipped };
}

// --- Vérification : récupère les scores finaux réels (3 derniers jours) -----
// et complète le journal des prédictions.
export async function verifyScores() {
    const scores = await getScores();
    const completed = (scores || []).filter((s) => s.completed && Array.isArray(s.scores));

    let updated = 0;
    for (const s of completed) {
        const day = parisDay(s.commence_time);
        const home = teamInfo(s.home_team);
        const away = teamInfo(s.away_team);
        const id = `${day}-${slug(home.fr)}-${slug(away.fr)}`;
        const goals = (name) => s.scores.find((x) => x.name === name)?.score;
        const gh = goals(s.home_team);
        const ga = goals(s.away_team);
        if (gh == null || ga == null) continue;
        const rows = await sql`
            UPDATE poulpe.predictions
            SET actual_score = ${`${gh}-${ga}`}, updated_at = now()
            WHERE id = ${id} AND actual_score IS NULL
            RETURNING id`;
        updated += rows.length;
    }
    return { ok: true, completed: completed.length, updated };
}
