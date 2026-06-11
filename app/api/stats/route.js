import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";

const EVENT_TYPES = new Set(["open", "go"]);

// GET → compteurs globaux + détail par jour
export async function GET() {
    const [totals, daily] = await Promise.all([
        sql`SELECT type, count(*)::int AS count FROM poulpe.events GROUP BY type`,
        sql`SELECT to_char(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                   type, count(*)::int AS count
            FROM poulpe.events
            GROUP BY 1, 2
            ORDER BY 1 DESC`,
    ]);
    const counters = { opens: 0, goClicks: 0 };
    for (const row of totals) {
        if (row.type === "open") counters.opens = row.count;
        if (row.type === "go") counters.goClicks = row.count;
    }
    return NextResponse.json({ counters, daily });
}

// POST {type: "open" | "go"} → enregistre un clic
export async function POST(request) {
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
