import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";

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
});

// GET → journal complet des prédictions (du plus récent au plus ancien)
export async function GET() {
    const rows = await sql`
        SELECT id, to_char(day, 'YYYY-MM-DD') AS day, home, away, match_time,
               prediction, probabilities, predicted_score, confidence, actual_score
        FROM poulpe.predictions
        ORDER BY day DESC, created_at DESC`;
    return NextResponse.json({ entries: rows.map(rowToEntry) });
}

// POST → journalise/met à jour une prédiction (une par match et par jour)
export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    const { id, day, home, away, time, prediction, probabilities, predictedScore, confidence } = body;
    if (!id || !day || !home || !away || typeof id !== "string" || id.length > 200) {
        return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }
    await sql`
        INSERT INTO poulpe.predictions
            (id, day, home, away, match_time, prediction, probabilities, predicted_score, confidence)
        VALUES
            (${id}, ${day}, ${home}, ${away}, ${time ?? null}, ${prediction ?? null},
             ${JSON.stringify(probabilities ?? null)}, ${predictedScore ?? null}, ${confidence ?? null})
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
