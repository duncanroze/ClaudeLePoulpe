import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";
import { isAuthorized, requireSecret } from "../../../lib/guard";

const rowToEntry = (r) => ({
    id: r.id,
    day: r.day,
    home: r.home,
    away: r.away,
    time: r.match_time,
    prediction: r.prediction,
    probabilities: r.probabilities,
    predictedScore: r.predicted_score,
    confidence: r.confidence,
    actualScore: r.actual_score,
    actualPenalties: r.actual_penalties,
});

// GET → journal complet des prédictions (privé : mot de passe requis)
export async function GET(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const rows = await sql`
        SELECT id, to_char(day, 'YYYY-MM-DD') AS day, home, away, match_time,
               prediction, probabilities, predicted_score, confidence, actual_score,
               actual_penalties
        FROM poulpe.predictions
        ORDER BY day DESC, created_at DESC`;
    return NextResponse.json({ entries: rows.map(rowToEntry) });
}

// POST → journalise/met à jour une prédiction (une par match et par jour)
export async function POST(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    const { id, day, home, away, time, prediction, probabilities, predictedScore, confidence } = body;

    // Validation stricte : formats fermés, listes blanches, tailles bornées
    const isStr = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
    const scoreRe = /^\d{1,2}-\d{1,2}$/;
    const probInt = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
    const valid =
        isStr(id, 140) && /^\d{4}-\d{2}-\d{2}-[a-z0-9]{1,60}-[a-z0-9]{1,60}$/.test(id) &&
        isStr(day, 10) && /^\d{4}-\d{2}-\d{2}$/.test(day) && id.startsWith(day) &&
        isStr(home, 60) && isStr(away, 60) &&
        (time == null || (isStr(time, 14) && /^\d{2}:\d{2}( \(nuit\))?$/.test(time))) &&
        (prediction == null || ["home", "draw", "away"].includes(prediction)) &&
        (confidence == null || ["haute", "moyenne", "basse"].includes(confidence)) &&
        (predictedScore == null || (isStr(predictedScore, 5) && scoreRe.test(predictedScore))) &&
        (probabilities == null ||
            (typeof probabilities === "object" &&
                probInt(probabilities.home) && probInt(probabilities.draw) && probInt(probabilities.away)));
    if (!valid) {
        return NextResponse.json({ error: "Données de prédiction invalides" }, { status: 400 });
    }
    const probs = probabilities
        ? { home: probabilities.home, draw: probabilities.draw, away: probabilities.away }
        : null;

    await sql`
        INSERT INTO poulpe.predictions
            (id, day, home, away, match_time, prediction, probabilities, predicted_score, confidence)
        VALUES
            (${id}, ${day}, ${home}, ${away}, ${time ?? null}, ${prediction ?? null},
             ${JSON.stringify(probs)}, ${predictedScore ?? null}, ${confidence ?? null})
        ON CONFLICT (id) DO UPDATE SET
            prediction      = EXCLUDED.prediction,
            probabilities   = EXCLUDED.probabilities,
            predicted_score = COALESCE(EXCLUDED.predicted_score, poulpe.predictions.predicted_score),
            confidence      = EXCLUDED.confidence,
            match_time      = COALESCE(EXCLUDED.match_time, poulpe.predictions.match_time),
            updated_at      = now()`;
    return NextResponse.json({ ok: true });
}

// PATCH {results: [{id, actualScore}]} → enregistre les scores réels vérifiés
export async function PATCH(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    let results;
    try {
        ({ results } = await request.json());
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    if (!Array.isArray(results)) {
        return NextResponse.json({ error: "results doit être un tableau" }, { status: 400 });
    }
    let updated = 0;
    for (const r of results.slice(0, 30)) {
        if (!r?.id || typeof r.actualScore !== "string" || !/^\d{1,2}-\d{1,2}$/.test(r.actualScore)) continue;
        const res = await sql`
            UPDATE poulpe.predictions
            SET actual_score = ${r.actualScore}, updated_at = now()
            WHERE id = ${r.id}
            RETURNING id`;
        updated += res.length;
    }
    return NextResponse.json({ ok: true, updated });
}
