import { NextResponse } from "next/server";
import { predictUpcoming, verifyScores } from "../../../lib/oracle";
import { requireSecret } from "../../../lib/guard";

export const dynamic = "force-dynamic";

// Cron quotidien unique (Vercel envoie "Authorization: Bearer CRON_SECRET") :
//  1. récupère les scores réels de la veille (verify) ;
//  2. journalise automatiquement les prédictions du jour (predict).
// Un seul cron pour rester dans les limites du plan Hobby et regrouper le
// budget The Odds API (verify = 2 crédits, predict = 0 si cotes déjà en cache).
export async function GET(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    // verify d'abord : il fige les matchs terminés, que predict laissera donc
    // tranquilles juste après.
    const verify = await verifyScores().catch((e) => ({ error: e.message }));
    const predict = await predictUpcoming().catch((e) => ({ error: e.message }));
    return NextResponse.json({ ok: true, verify, predict });
}
