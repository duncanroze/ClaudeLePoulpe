import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";
import { budgetStatus } from "../../../lib/budget";
import { isAuthorized, requireSecret } from "../../../lib/guard";

const EVENT_TYPES = new Set(["open", "go"]);

// GET → compteurs globaux + détail par jour (privé : mot de passe requis)
export async function GET(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const [totals, daily, apiBudget] = await Promise.all([
        sql`SELECT type, count(*)::int AS count FROM poulpe.events GROUP BY type`,
        sql`SELECT to_char(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                   type, count(*)::int AS count
            FROM poulpe.events
            GROUP BY 1, 2
            ORDER BY 1 DESC`,
        budgetStatus(),
    ]);
    const counters = { opens: 0, goClicks: 0 };
    for (const row of totals) {
        if (row.type === "open") counters.opens = row.count;
        if (row.type === "go") counters.goClicks = row.count;
    }
    return NextResponse.json({ counters, daily, apiBudget });
}

// POST {type: "open" | "go"} → enregistre un clic
export async function POST(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    let type;
    try {
        ({ type } = await request.json());
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    if (!EVENT_TYPES.has(type)) {
        return NextResponse.json({ error: "Type d'événement inconnu" }, { status: 400 });
    }
    await sql`INSERT INTO poulpe.events (type) VALUES (${type})`;
    return NextResponse.json({ ok: true });
}
