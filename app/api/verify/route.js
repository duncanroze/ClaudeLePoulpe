import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";
import { getScores } from "../../../lib/oddsApi";
import { teamInfo, slug } from "../../../lib/teams";

export const dynamic = "force-dynamic";

const parisDay = (iso) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

// Récupère les scores finaux réels (3 derniers jours) et complète le journal
// des prédictions. Appelé par le bouton "Vérifier" et par un cron quotidien.
async function verify() {
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

export async function POST() {
    try {
        return NextResponse.json(await verify());
    } catch (e) {
        console.error("Erreur /api/verify :", e);
        return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 503 });
    }
}

// GET pour le cron Vercel (les crons n'envoient que des GET)
export const GET = POST;
