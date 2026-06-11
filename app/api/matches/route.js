import { NextResponse } from "next/server";
import { getEvents } from "../../../lib/oddsApi";
import { teamInfo } from "../../../lib/teams";

export const dynamic = "force-dynamic";

const parisDay = (iso) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const parisTime = (iso) =>
    new Date(iso).toLocaleTimeString("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
    });

// GET → les matchs du jour (heure de Paris) avec équipes traduites
export async function GET() {
    try {
        const events = await getEvents();
        const today = parisDay(new Date().toISOString());
        const matches = events
            .filter((e) => parisDay(e.commence_time) === today)
            .sort((a, b) => a.commence_time.localeCompare(b.commence_time))
            .map((e) => {
                const home = teamInfo(e.home_team);
                const away = teamInfo(e.away_team);
                return {
                    id: e.id,
                    day: today,
                    home: home.fr,
                    away: away.fr,
                    homeCode: home.code,
                    awayCode: away.code,
                    time: parisTime(e.commence_time),
                    stadium: "Coupe du monde 2026",
                };
            });
        return NextResponse.json({ matches });
    } catch (e) {
        console.error("Erreur /api/matches :", e);
        return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 503 });
    }
}
