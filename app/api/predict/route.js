import { NextResponse } from "next/server";
import { predictUpcoming } from "../../../lib/oracle";
import { isAuthorized } from "../../../lib/guard";

export const dynamic = "force-dynamic";

// Lance la prédiction automatique de tous les matchs à cotes disponibles
// ("clique GO" automatique). Manuel : bouton du /bilan (origine ou mot de
// passe). Le cron quotidien passe par /api/cron.
export async function POST(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    try {
        return NextResponse.json(await predictUpcoming());
    } catch (e) {
        console.error("Erreur /api/predict :", e);
        return NextResponse.json({ error: e.message || "Erreur serveur" }, { status: 503 });
    }
}
