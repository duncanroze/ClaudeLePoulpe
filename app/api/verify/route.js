import { NextResponse } from "next/server";
import { verifyScores } from "../../../lib/oracle";
import { requireSecret } from "../../../lib/guard";

export const dynamic = "force-dynamic";

// Privé : bouton "Vérifier" du dashboard /bilan (mot de passe) ou cron
export async function POST(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    try {
        return NextResponse.json(await verifyScores());
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
