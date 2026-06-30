import { sql } from "./db";
import { getEvents, getScores } from "./oddsApi";
import { getPenaltyShootouts, pairKey } from "./footballData";
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

// Buts d'une équipe tels que renvoyés par The Odds API : en général un simple
// entier ("1"). On retire une éventuelle parenthèse parasite pour ne garder
// que les buts (temps réglementaire / prolongation).
function parseGoals(raw) {
    const m = String(raw ?? "").replace(/\([^)]*\)/, "").match(/-?\d+/);
    return m ? Number(m[0]) : null;
}

// --- Vérification : récupère les scores finaux réels (3 derniers jours) -----
// et complète le journal des prédictions.
export async function verifyScores() {
    const scores = await getScores();
    const completed = (scores || []).filter((s) => s.completed && Array.isArray(s.scores));
    // Tirs au but des matchs à élimination directe via football-data.org :
    // The Odds API ne les fournit pas. Source optionnelle → repli silencieux,
    // on ne fait jamais planter la vérification si elle est indisponible.
    let penMap = {};
    try {
        penMap = await getPenaltyShootouts();
    } catch (e) {
        console.error("Tirs au but indisponibles :", e?.message || e);
    }

    let updated = 0;
    for (const s of completed) {
        const day = parisDay(s.commence_time);
        const home = teamInfo(s.home_team);
        const away = teamInfo(s.away_team);
        const id = `${day}-${slug(home.fr)}-${slug(away.fr)}`;
        const raw = (name) => s.scores.find((x) => x.name === name)?.score;
        const gh = parseGoals(raw(s.home_team));
        const ga = parseGoals(raw(s.away_team));
        if (gh == null || ga == null) continue;
        // Pénos orientés selon NOTRE domicile/extérieur (celui affiché), quel
        // que soit l'ordre choisi par football-data.org. Affichés tels quels,
        // aucune prédiction dessus.
        const pens = penMap[pairKey(home.fr, away.fr)];
        const penalties =
            pens && pens[slug(home.fr)] != null && pens[slug(away.fr)] != null
                ? `${pens[slug(home.fr)]}-${pens[slug(away.fr)]}`
                : null;
        const rows = await sql`
            UPDATE poulpe.predictions
            SET actual_score = ${`${gh}-${ga}`},
                actual_penalties = ${penalties},
                updated_at = now()
            WHERE id = ${id} AND actual_score IS NULL
            RETURNING id`;
        updated += rows.length;
        // Pénos parfois publiés un peu après le score : on complète après coup
        // sans toucher au score réglementaire déjà figé.
        if (penalties) {
            await sql`
                UPDATE poulpe.predictions
                SET actual_penalties = ${penalties}, updated_at = now()
                WHERE id = ${id} AND actual_penalties IS NULL`;
        }
    }
    return { ok: true, completed: completed.length, updated };
}
