import { NextResponse } from "next/server";
import { getEvents } from "../../../lib/oddsApi";
import { teamInfo } from "../../../lib/teams";
import { buildAnalysis } from "../../../lib/predict";

// POST {id} → analyse d'un match : dé-margeage des cotes + modèle de Poisson.
// Pur calcul sur les cotes déjà en cache : un clic ne coûte rien.
export async function POST(request) {
    let id;
    try {
        ({ id } = await request.json());
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    try {
        const events = await getEvents();
        const event = events.find((e) => e.id === id);
        if (!event) {
            return NextResponse.json({ error: "Match introuvable" }, { status: 404 });
        }
        const analysis = buildAnalysis({
            homeName: event.home_team,
            awayName: event.away_team,
            homeFr: teamInfo(event.home_team).fr,
            awayFr: teamInfo(event.away_team).fr,
            bookmakers: event.bookmakers,
        });
        return NextResponse.json(analysis);
    } catch (e) {
        console.error("Erreur /api/analyze :", e);
        return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 503 });
    }
}
