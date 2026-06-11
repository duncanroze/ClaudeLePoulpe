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

// Mondial en Amérique : les matchs de la nuit (jusqu'à 8h, heure de Paris)
// appartiennent à la "journée" de la veille pour un spectateur français.
const DAY_SHIFT_MS = 8 * 3600 * 1000;
const matchDayOf = (iso) =>
    parisDay(new Date(new Date(iso).getTime() - DAY_SHIFT_MS).toISOString());

// GET → les matchs d'une journée (8h → 8h, heure de Paris).
// ?d=0 aujourd'hui (défaut), ?d=1 demain… jusqu'à +3 jours.
export async function GET(request) {
    try {
        const raw = new URL(request.url).searchParams.get("d");
        const offset = Math.min(3, Math.max(0, parseInt(raw, 10) || 0));
        const events = await getEvents();
        const today = matchDayOf(
            new Date(Date.now() + offset * 24 * 3600 * 1000).toISOString()
        );
        const matches = events
            .filter((e) => matchDayOf(e.commence_time) === today)
            .sort((a, b) => a.commence_time.localeCompare(b.commence_time))
            .map((e) => {
                const home = teamInfo(e.home_team);
                const away = teamInfo(e.away_team);
                const realDay = parisDay(e.commence_time);
                return {
                    id: e.id,
                    // day = vraie date calendaire du coup d'envoi : c'est elle
                    // qui forme l'id de prédiction rattaché par /api/verify
                    day: realDay,
                    home: home.fr,
                    away: away.fr,
                    homeCode: home.code,
                    awayCode: away.code,
                    time: parisTime(e.commence_time) + (realDay !== today ? " (nuit)" : ""),
                    stadium: "Coupe du monde 2026",
                };
            });
        return NextResponse.json({ matches });
    } catch (e) {
        console.error("Erreur /api/matches :", e);
        return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 503 });
    }
}
