import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";
import { getScores } from "../../../lib/oddsApi";
import { teamInfo, slug } from "../../../lib/teams";
import { requireSecret } from "../../../lib/guard";

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

// Privé : bouton "Vérifier" du dashboard /bilan (mot de passe) ou cron
export async function POST(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    try {
        return NextResponse.json(await verify());
    } catch (e) {
        console.error("Erreur /api/verify :", e);
        return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 503 });
    }
}

// GET réservé au cron Vercel : il envoie automatiquement
// "Authorization: Bearer CRON_SECRET"
export async function GET(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    return POST(request);
}
