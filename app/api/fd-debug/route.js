import { NextResponse } from "next/server";
import { requireSecret } from "../../../lib/guard";
import { getFootballDataDump } from "../../../lib/footballData";
import { categoryOf } from "../../../lib/stages";

// GET → diagnostic privé (bouton « Données football-data » du /bilan) : renvoie
// la liste brute des matchs football-data.org enrichie de NOTRE catégorisation
// (déduite de la date) pour repérer d'un coup d'œil les écarts de classement.
export async function GET(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    let dump;
    try {
        dump = await getFootballDataDump();
    } catch (e) {
        return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
    }
    const matches = (dump.matches || []).map((m) => {
        const day = (m.utcDate || "").slice(0, 10);
        const appCategory =
            day && m.home && m.away
                ? categoryOf({ day, home: m.home, away: m.away }).label
                : null;
        return { ...m, day, appCategory };
    });
    return NextResponse.json({ ...dump, matches });
}
