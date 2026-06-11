import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "../../../lib/db";
import { isAuthorized, requireSecret } from "../../../lib/guard";

// Signalement de problème par les visiteurs → stocké en BDD + email à Duncan.
// Anti-spam : garde d'origine, honeypot, taille bornée, 3/jour par IP
// (hashée, jamais stockée en clair) et 12/jour au total — l'email ne part
// que dans ces limites, donc pas de bombardement de boîte mail possible.

const MAX_PER_IP_PER_DAY = 10;
const MAX_PER_DAY = 100;

function ipHash(request) {
    const ip = (request.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
    const salt = process.env.CRON_SECRET || "poulpe";
    return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

async function sendEmail(message, name) {
    if (!process.env.RESEND_API_KEY || !process.env.REPORT_EMAIL) return;
    const who = name || "Un visiteur anonyme";
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
            from: "Claude le Poulpe <onboarding@resend.dev>",
            to: process.env.REPORT_EMAIL,
            subject: `🐙 Signalement de ${who} sur Claude le Poulpe`,
            text: `${who} signale :\n\n${message}\n\n— https://claude-le-poulpe.vercel.app/bilan`,
        }),
    });
    if (!response.ok) {
        console.error("Erreur Resend:", response.status, await response.text().catch(() => ""));
    }
}

export async function POST(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }

    // Honeypot : champ invisible que seuls les bots remplissent.
    // On répond "ok" pour ne pas leur donner d'indice.
    if (body.website) return NextResponse.json({ ok: true });

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message.length < 10 || message.length > 500) {
        return NextResponse.json(
            { error: "Le message doit faire entre 10 et 500 caractères" },
            { status: 400 }
        );
    }
    const name =
        typeof body.name === "string" && body.name.trim()
            ? body.name.trim().slice(0, 60)
            : null;

    const hash = ipHash(request);
    const [counts] = await sql`
        SELECT
            count(*) FILTER (WHERE ip_hash = ${hash})::int AS per_ip,
            count(*)::int AS total
        FROM poulpe.reports
        WHERE created_at > now() - interval '24 hours'`;
    if (counts.per_ip >= MAX_PER_IP_PER_DAY || counts.total >= MAX_PER_DAY) {
        return NextResponse.json(
            { error: "Trop de signalements pour aujourd'hui, réessaie demain" },
            { status: 429 }
        );
    }

    await sql`INSERT INTO poulpe.reports (name, message, ip_hash) VALUES (${name}, ${message}, ${hash})`;
    await sendEmail(message, name);
    return NextResponse.json({ ok: true });
}

// GET → liste des signalements (privé, pour /bilan)
export async function GET(request) {
    if (!requireSecret(request)) {
        return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const rows = await sql`
        SELECT id, name, message, to_char(created_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI') AS at
        FROM poulpe.reports
        ORDER BY created_at DESC
        LIMIT 100`;
    return NextResponse.json({ reports: rows });
}
