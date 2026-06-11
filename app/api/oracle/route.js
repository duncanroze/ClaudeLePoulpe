import { NextResponse } from "next/server";

// L'analyse fait jusqu'à 3 recherches web : on laisse le temps à l'oracle.
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-5";

export async function POST(request) {
    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
            { error: "Clé API Anthropic non configurée sur le serveur" },
            { status: 503 }
        );
    }

    let prompt;
    try {
        ({ prompt } = await request.json());
    } catch {
        return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
    }
    if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > 10000) {
        return NextResponse.json({ error: "Prompt invalide" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: MODEL,
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }],
            tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        }),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("Erreur API Anthropic:", response.status, detail);
        return NextResponse.json(
            { error: `Erreur API Anthropic (${response.status})` },
            { status: 502 }
        );
    }

    const data = await response.json();
    const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

    return NextResponse.json({ text, stopReason: data.stop_reason });
}
