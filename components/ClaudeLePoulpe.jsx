"use client";

import { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------
// CLAUDE LE POULPE — L'Oracle du Mondial 2026
// Étape 1 : liste les matchs du jour (/api/matches, cotes The Odds API).
// Étape 2 : au "GO", /api/analyze dé-marge les cotes 1N2 de plusieurs
// bookmakers, en fait la moyenne (consensus du marché) et calibre un
// modèle de Poisson dessus pour les scores exacts les plus probables.
// Aucun LLM, aucun prompt : uniquement des données + du calcul.
// Stats de clics et journal des prédictions en BDD (/api/stats,
// /api/predictions) ; scores réels vérifiés via /api/verify.
// ---------------------------------------------------------------

const C = {
    abyss: "#04222e",
    water: "#0e4a5e",
    aqua: "#2dd4bf",
    foam: "#e8f6f3",
    coral: "#ff7a59",
    gold: "#f4c95d",
    tealSoft: "rgba(45, 212, 191, 0.25)",
    tealText: "rgba(190, 235, 228, 0.75)",
};

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');

.paul-root {
    font-family: 'Nunito', system-ui, sans-serif;
    color: ${C.foam};
    min-height: 100vh;
    background:
        radial-gradient(1200px 600px at 50% -10%, #11586e 0%, transparent 60%),
        linear-gradient(180deg, #06303f 0%, ${C.abyss} 70%);
}
.paul-display { font-family: 'Fredoka', 'Nunito', sans-serif; }

@keyframes paulFloat {
    0%, 100% { transform: translate(-50%, -50%) translateY(0) rotate(-2deg); }
    50%      { transform: translate(-50%, -50%) translateY(-10px) rotate(2deg); }
}
@keyframes paulThink {
    0%   { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
    20%  { transform: translate(-50%, -50%) rotate(-14deg) scale(1.06); }
    40%  { transform: translate(-50%, -50%) rotate(12deg) scale(0.96); }
    60%  { transform: translate(-50%, -50%) rotate(-10deg) scale(1.08); }
    80%  { transform: translate(-50%, -50%) rotate(8deg) scale(0.98); }
    100% { transform: translate(-50%, -50%) rotate(0deg) scale(1); }
}
@keyframes paulLand {
    0%   { transform: translate(-50%, -50%) scale(1.25, 0.75); }
    40%  { transform: translate(-50%, -50%) scale(0.85, 1.15); }
    70%  { transform: translate(-50%, -50%) scale(1.08, 0.92); }
    100% { transform: translate(-50%, -50%) scale(1, 1); }
}
@keyframes bubbleRise {
    0%   { transform: translateY(0) scale(0.6); opacity: 0; }
    15%  { opacity: 0.7; }
    100% { transform: translateY(-340px) scale(1.15); opacity: 0; }
}
@keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes popIn {
    0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.5); }
    70%  { transform: translate(-50%, -4px) scale(1.1); }
    100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes boxGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(244, 201, 93, 0); }
    50%      { box-shadow: 0 0 34px 6px rgba(244, 201, 93, 0.45); }
}
@keyframes seaweedSway {
    0%, 100% { transform: rotate(-4deg); }
    50%      { transform: rotate(5deg); }
}
@keyframes dotPulse {
    0%, 80%, 100% { opacity: 0.25; }
    40% { opacity: 1; }
}
@keyframes barGrow {
    from { width: 0; }
}

.paul-octopus { transition: left 1.6s cubic-bezier(0.45, 0, 0.25, 1), top 1.6s cubic-bezier(0.45, 0, 0.25, 1); }
.paul-octopus.idle     { animation: paulFloat 3.2s ease-in-out infinite; }
.paul-octopus.thinking { animation: paulThink 0.8s ease-in-out infinite; }
.paul-octopus.landed   { animation: paulLand 0.7s ease-out 1; }

.paul-bubble { animation: bubbleRise linear infinite; }
.paul-fadeup { animation: fadeUp 0.5s ease-out both; }
.paul-popin  { animation: popIn 0.5s ease-out both; }
.paul-glow   { animation: boxGlow 1.6s ease-in-out infinite; }
.paul-weed   { animation: seaweedSway 4s ease-in-out infinite; transform-origin: bottom center; }
.paul-dot    { animation: dotPulse 1.2s infinite; }
.paul-bar    { animation: barGrow 1s ease-out both; }

.paul-fab-tip { opacity: 0; transform: translateX(6px); transition: opacity 0.2s ease, transform 0.2s ease; pointer-events: none; }
.paul-fab:hover ~ .paul-fab-tip, .paul-fab:focus-visible ~ .paul-fab-tip { opacity: 1; transform: translateX(0); }

.paul-card { transition: transform 0.18s ease, border-color 0.18s ease; }
.paul-card:hover { transform: translateY(-3px); border-color: ${C.aqua} !important; }
.paul-go { transition: transform 0.15s ease, filter 0.15s ease; }
.paul-go:hover:not(:disabled) { transform: scale(1.05); filter: brightness(1.1); }
.paul-go:active:not(:disabled) { transform: scale(0.97); }

@media (prefers-reduced-motion: reduce) {
    .paul-root * { animation: none !important; transition-duration: 0.05s !important; }
}
`;

// Positions du poulpe dans le bassin (en %)
const SPOTS = {
    idle: { left: 50, top: 34 },
    home: { left: 18, top: 56 },
    away: { left: 82, top: 56 },
    draw: { left: 50, top: 70 },
};

const OUTCOME_LABEL = {
    home: (m) => `Victoire ${m.home}`,
    away: (m) => `Victoire ${m.away}`,
    draw: () => "Match nul",
};

function todayLabel() {
    return new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

// --------------------------- Données de l'oracle ---------------------------
// Plus aucun prompt ni LLM : /api/matches et /api/analyze servent des cotes
// réelles (The Odds API, cachées en BDD) et du calcul (dé-margeage + Poisson).

// Étape 1 : liste des matchs d'une journée (0 = aujourd'hui, 1 = demain…)
async function fetchMatches(dayOffset = 0) {
    const data = await api(`/api/matches?d=${dayOffset}`);
    return data.matches;
}

// Étape 2 : analyse d'un match (au "GO")
const analysisCache = new Map();

async function analyzeMatch(match) {
    if (analysisCache.has(match.id)) return analysisCache.get(match.id);
    const result = await api("/api/analyze", {
        method: "POST",
        body: JSON.stringify({ id: match.id }),
    });
    analysisCache.set(match.id, result);
    return result;
}

// --------------------------- Mémoire persistante (stats & journal) ---------------------------
// Stockage partagé entre tous les visiteurs du site : compteurs
// d'utilisation + journal des prédictions pour le bilan de fin de Mondial.
// Le tout vit dans la BDD Postgres (Neon) derrière les routes /api.

const slug = (s) =>
    String(s).normalize("NFD").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

const sortScores = (arr) =>
    [...(Array.isArray(arr) ? arr : [])].sort(
        (x, y) =>
            (y.probability ?? 0) - (x.probability ?? 0) ||
            (x.scoreOdds ?? Infinity) - (y.scoreOdds ?? Infinity)
    );

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`Erreur serveur (${response.status})`);
    return response.json();
}

async function bumpCounter(type) {
    try {
        await api("/api/stats", { method: "POST", body: JSON.stringify({ type }) });
    } catch (e) {
        console.error("Tracking indisponible :", e);
    }
}

async function logPrediction(match, analysis, predictedScore) {
    try {
        // Jour du match côté serveur (heure de Paris) : le même id que celui
        // reconstruit par /api/verify pour rattacher le score réel
        const day = match.day || new Date().toISOString().slice(0, 10);
        const id = `${day}-${slug(match.home)}-${slug(match.away)}`;
        await api("/api/predictions", {
            method: "POST",
            body: JSON.stringify({
                id,
                day,
                home: match.home,
                away: match.away,
                time: match.time,
                prediction: analysis.prediction,
                probabilities: analysis.probabilities,
                predictedScore: predictedScore || null,
                confidence: analysis.confidence,
            }),
        });
    } catch (e) {
        console.error("Journal indisponible :", e);
    }
}


// --------------------------- Drapeau ---------------------------

function Flag({ code, name, size = 56 }) {
    const [srcIndex, setSrcIndex] = useState(0);
    const sources = code
        ? [
              `https://flagcdn.com/w160/${code.toLowerCase()}.png`,
              `https://flagsapi.com/${code.toUpperCase()}/flat/64.png`,
          ]
        : [];

    if (!code || srcIndex >= sources.length) {
        return (
            <span
                className="paul-display inline-flex items-center justify-center font-bold"
                style={{
                    width: size,
                    height: size * 0.72,
                    fontSize: size * 0.34,
                    borderRadius: 8,
                    letterSpacing: "0.05em",
                    color: C.abyss,
                    background: `linear-gradient(135deg, ${C.aqua}, ${C.gold})`,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
            >
                {(code || "?").toUpperCase()}
            </span>
        );
    }
    return (
        <img
            src={sources[srcIndex]}
            alt={`Drapeau ${name}`}
            onError={() => setSrcIndex((i) => i + 1)}
            style={{
                width: size,
                height: "auto",
                borderRadius: 6,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
        />
    );
}

// --------------------------- Décor ---------------------------

function Bubbles({ count = 7, burst = false }) {
    const bubbles = Array.from({ length: burst ? 16 : count });
    return (
        <>
            {bubbles.map((_, i) => (
                <div
                    key={i}
                    className="paul-bubble absolute rounded-full"
                    style={{
                        left: `${8 + ((i * 37) % 85)}%`,
                        bottom: "-20px",
                        width: `${8 + ((i * 13) % 16)}px`,
                        height: `${8 + ((i * 13) % 16)}px`,
                        border: "1px solid rgba(180, 230, 222, 0.4)",
                        background: "rgba(200, 240, 235, 0.08)",
                        animationDuration: `${(burst ? 2.2 : 5) + ((i * 7) % 40) / 10}s`,
                        animationDelay: `${((i * 11) % 30) / 10}s`,
                    }}
                />
            ))}
        </>
    );
}

function Seaweed() {
    return (
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-6 pointer-events-none">
            {["🌿", "🪸", "🌿", "🪸", "🌿"].map((p, i) => (
                <span
                    key={i}
                    className="paul-weed text-3xl"
                    style={{ opacity: 0.5, animationDelay: `${i * 0.6}s` }}
                >
                    {p}
                </span>
            ))}
        </div>
    );
}

function FlagBox({ code, name, label, highlight, pos }) {
    return (
        <div
            className="flex flex-col items-center gap-2"
            style={{
                position: "absolute",
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: "translateX(-50%)",
                width: 120,
            }}
        >
            <div
                className={`paul-display flex items-center justify-center rounded-xl ${highlight ? "paul-glow" : ""}`}
                style={{
                    width: 96,
                    height: 76,
                    border: `2px solid ${highlight ? C.gold : C.tealSoft}`,
                    background: highlight ? "rgba(244, 201, 93, 0.15)" : "rgba(14, 74, 94, 0.7)",
                    backdropFilter: "blur(2px)",
                    fontSize: 38,
                }}
            >
                {code ? <Flag code={code} name={name} /> : label}
            </div>
            <span
                className="paul-display text-sm font-semibold text-center"
                style={{ lineHeight: 1.15 }}
            >
                {name}
            </span>
        </div>
    );
}

function ProbBar({ label, value, color }) {
    return (
        <div className="flex items-center gap-2">
            <span className="paul-display text-xs font-semibold" style={{ width: 110, textAlign: "right" }}>
                {label}
            </span>
            <div
                className="flex-1 rounded-full overflow-hidden"
                style={{ height: 14, background: "rgba(4, 34, 46, 0.6)" }}
            >
                <div
                    className="paul-bar h-full rounded-full"
                    style={{ width: `${value}%`, background: color }}
                />
            </div>
            <span className="paul-display text-xs font-bold" style={{ width: 38 }}>
                {value}%
            </span>
        </div>
    );
}

// --------------------------- Bassin de l'oracle ---------------------------

const THINKING_LINES = [
    "Claude relève les cotes de plusieurs bookmakers…",
    "Claude retire la marge des bookmakers…",
    "Claude fait la moyenne du marché…",
    "Claude calcule les scores les plus probables…",
    "Claude croise le tout dans ses 8 tentacules…",
];

function OracleTank({ match, onBack }) {
    // phase: idle → thinking (analyse réelle) → swim → landed | error
    const [phase, setPhase] = useState("idle");
    const [spot, setSpot] = useState(SPOTS.idle);
    const [showScore, setShowScore] = useState(false);
    const [analysis, setAnalysis] = useState(null);
    const [error, setError] = useState(null);
    const [thinkLine, setThinkLine] = useState(0);
    const timers = useRef([]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

    const choreography = (result) => {
        if (result.prediction === "draw") {
            // Hésitation : il tâte les deux boîtes puis se pose au centre
            setPhase("swim");
            setSpot(SPOTS.home);
            later(() => setSpot(SPOTS.away), 1700);
            later(() => setSpot(SPOTS.draw), 3400);
            later(() => setPhase("landed"), 5100);
            later(() => setShowScore(true), 5700);
        } else {
            setPhase("swim");
            setSpot(SPOTS[result.prediction]);
            later(() => setPhase("landed"), 1700);
            later(() => setShowScore(true), 2300);
        }
    };

    const launch = async () => {
        if (phase !== "idle") return;
        setError(null);
        setPhase("thinking");

        // Le calcul est instantané : on fait défiler les étapes pour le show
        THINKING_LINES.forEach((_, i) => later(() => setThinkLine(i), i * 950));

        try {
            const [result] = await Promise.all([
                analyzeMatch(match),
                new Promise((resolve) => setTimeout(resolve, 5000)),
            ]);
            setAnalysis(result);
            choreography(result);
            // Journal pour le bilan de fin de Mondial (BDD partagée)
            const bestPred = sortScores(result.topScores)[0];
            logPrediction(match, result, bestPred ? bestPred.score : null);
            bumpCounter("go");
        } catch (e) {
            console.error("Erreur analyse :", e);
            setError(e.message || "Erreur inconnue");
            setPhase("idle");
            setSpot(SPOTS.idle);
        }
    };

    const reset = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setSpot(SPOTS.idle);
        setShowScore(false);
        setThinkLine(0);
        setPhase("idle");
    };

    const done = phase === "landed";
    const a = analysis;
    const predLabel = done && a ? OUTCOME_LABEL[a.prediction](match) : "";
    // Tri par probabilité décroissante (et cote croissante en secours) :
    // le plus probable est toujours en n°1, même si l'oracle se trompe d'ordre.
    const topScores = done && a ? sortScores(a.topScores) : [];
    const best = topScores[0];
    const score = best ? (best.score || "?-?").replace("-", " - ") : "?-?";
    const probs = a?.probabilities || {};

    return (
        <div className="paul-fadeup mx-auto w-full max-w-2xl px-4 pb-12">
            <button
                onClick={onBack}
                className="paul-display mb-4 text-sm"
                style={{ color: C.aqua }}
            >
                ← Retour aux matchs du jour
            </button>

            <div className="mb-3 text-center">
                <div className="paul-display text-xl font-semibold flex items-center justify-center gap-3 flex-wrap">
                    <Flag code={match.homeCode} name={match.home} size={34} />
                    {match.home} <span style={{ color: C.aqua }}>vs</span> {match.away}
                    <Flag code={match.awayCode} name={match.away} size={34} />
                </div>
                <div className="text-sm" style={{ color: C.tealText }}>
                    {match.time} · {match.stadium}
                </div>
            </div>

            {/* Le bassin */}
            <div
                className="relative overflow-hidden"
                style={{
                    height: 440,
                    borderRadius: 24,
                    border: `2px solid ${C.tealSoft}`,
                    background:
                        "linear-gradient(180deg, rgba(20,90,110,0.55) 0%, rgba(8,50,64,0.85) 70%, rgba(5,35,46,1) 100%)",
                    boxShadow: "inset 0 0 60px rgba(0,0,0,0.45)",
                }}
            >
                <div
                    className="absolute left-0 right-0 top-0"
                    style={{ height: 40, background: "linear-gradient(180deg, rgba(220,245,240,0.15), transparent)" }}
                />
                <Bubbles burst={phase === "thinking"} />
                <Seaweed />

                <FlagBox
                    code={match.homeCode}
                    name={match.home}
                    pos={{ left: SPOTS.home.left, top: 48 }}
                    highlight={done && a?.prediction === "home"}
                />
                <FlagBox
                    code={match.awayCode}
                    name={match.away}
                    pos={{ left: SPOTS.away.left, top: 48 }}
                    highlight={done && a?.prediction === "away"}
                />
                <FlagBox
                    label="🤝"
                    name="Nul"
                    pos={{ left: SPOTS.draw.left, top: 62 }}
                    highlight={done && a?.prediction === "draw"}
                />

                {/* Claude le Poulpe */}
                <div
                    className={`paul-octopus absolute text-7xl ${
                        phase === "idle" ? "idle" : phase === "thinking" ? "thinking" : done ? "landed" : ""
                    }`}
                    style={{
                        left: `${spot.left}%`,
                        top: `${spot.top}%`,
                        transform: "translate(-50%, -50%)",
                        zIndex: 10,
                        filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.4))",
                    }}
                >
                    🐙
                </div>

                {/* Pancarte du score exact */}
                {showScore && (
                    <div
                        className="paul-popin paul-display absolute font-bold text-2xl"
                        style={{
                            left: `${spot.left}%`,
                            top: `${spot.top - 17}%`,
                            transform: "translateX(-50%)",
                            zIndex: 11,
                            background: C.foam,
                            color: C.abyss,
                            padding: "6px 18px",
                            borderRadius: 14,
                            border: `3px solid ${C.gold}`,
                            boxShadow: "0 6px 16px rgba(0,0,0,0.45)",
                        }}
                    >
                        {score}
                    </div>
                )}

                {/* Bulles de pensée : étapes réelles de l'analyse */}
                {phase === "thinking" && (
                    <div
                        className="paul-display absolute text-sm font-semibold text-center"
                        style={{
                            left: "50%", top: "8%", transform: "translateX(-50%)",
                            background: C.foam, color: C.abyss, maxWidth: "85%",
                            padding: "6px 16px", borderRadius: 999, zIndex: 12,
                        }}
                    >
                        {THINKING_LINES[Math.min(thinkLine, THINKING_LINES.length - 1)]}
                    </div>
                )}
                {phase === "swim" && a?.prediction === "draw" && (
                    <div
                        className="paul-fadeup paul-display absolute text-sm font-semibold"
                        style={{
                            left: "50%", top: "8%", transform: "translateX(-50%)",
                            background: C.foam, color: C.abyss,
                            padding: "6px 16px", borderRadius: 999, zIndex: 12,
                        }}
                    >
                        Hmm… il hésite ! 🤔
                    </div>
                )}
            </div>

            {/* Commande / erreur / résultat */}
            <div className="mt-5 flex flex-col items-center gap-4">
                {error && (
                    <div
                        className="paul-fadeup w-full p-4 text-center text-sm"
                        style={{
                            borderRadius: 14,
                            border: "1px solid rgba(255, 122, 89, 0.4)",
                            background: "rgba(255, 122, 89, 0.1)",
                        }}
                    >
                        🌊 L'analyse a été emportée par le courant ({error}). Réessaie !
                    </div>
                )}

                {!done && (
                    <button
                        onClick={launch}
                        disabled={phase !== "idle"}
                        className="paul-go paul-display rounded-full px-12 py-4 text-2xl font-bold"
                        style={{
                            color: C.abyss,
                            background: `linear-gradient(135deg, ${C.gold}, ${C.coral})`,
                            opacity: phase === "idle" ? 1 : 0.55,
                        }}
                    >
                        {phase === "idle" ? "GO 🐙" : "Analyse en cours…"}
                    </button>
                )}

                {done && a && (
                    <div
                        className="paul-fadeup w-full p-5"
                        style={{
                            borderRadius: 18,
                            border: `1px solid ${C.tealSoft}`,
                            background: "rgba(14, 74, 94, 0.6)",
                        }}
                    >
                        <div className="text-center">
                            <div className="paul-display text-lg font-bold" style={{ color: C.gold }}>
                                🔮 Claude a parlé : {predLabel}
                            </div>
                            <div className="paul-display mt-2 text-3xl font-bold">
                                {match.home} {score} {match.away}
                            </div>
                            {a.confidence && (
                                <div
                                    className="paul-display inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full"
                                    style={{ border: `1px solid ${C.tealSoft}`, color: C.tealText }}
                                >
                                    Fiabilité de l'analyse : {a.confidence}
                                </div>
                            )}
                        </div>

                        {/* Probabilités croisées 1N2 */}
                        <div className="mt-4 flex flex-col gap-2">
                            <ProbBar label={match.home} value={probs.home ?? 0} color={C.aqua} />
                            <ProbBar label="Nul" value={probs.draw ?? 0} color={C.tealText} />
                            <ProbBar label={match.away} value={probs.away ?? 0} color={C.coral} />
                        </div>

                        {/* Podium des scores */}
                        {topScores.length > 0 && (
                            <div className="mt-4 flex justify-center gap-2 flex-wrap">
                                {topScores.map((s, i) => (
                                    <div
                                        key={i}
                                        className="paul-display px-3 py-2 text-sm font-semibold"
                                        style={{
                                            borderRadius: 12,
                                            border: `1px solid ${i === 0 ? C.gold : C.tealSoft}`,
                                            background: i === 0 ? "rgba(244, 201, 93, 0.12)" : "rgba(4, 34, 46, 0.5)",
                                            color: i === 0 ? C.gold : C.foam,
                                        }}
                                    >
                                        {["🥇", "🥈", "🥉"][i]} {s.score}
                                        <span style={{ opacity: 0.7, fontWeight: 400 }}>
                                            {s.probability != null ? ` ~${s.probability}%` : ""}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Les sources croisées */}
                        {Array.isArray(a.factors) && a.factors.length > 0 && (
                            <div className="mt-4 flex flex-col gap-2">
                                {a.factors.map((f, i) => (
                                    <div key={i} className="text-sm flex gap-2">
                                        <span
                                            className="paul-display font-semibold shrink-0"
                                            style={{ color: C.aqua, minWidth: 130 }}
                                        >
                                            {["📊", "📈", "🤝", "🏟️", "🏥", "🧮"][i] || "•"} {f.label}
                                        </span>
                                        <span style={{ color: "rgba(210, 240, 235, 0.85)" }}>{f.detail}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {a.comment && (
                            <div className="mt-3 text-sm italic text-center" style={{ color: C.tealText }}>
                                « {a.comment} »
                            </div>
                        )}

                        <div className="text-center">
                            <button
                                onClick={reset}
                                className="paul-display mt-4 rounded-full px-6 py-2 text-sm font-semibold"
                                style={{ border: `1px solid ${C.tealSoft}`, color: C.foam }}
                            >
                                Rejouer l'oracle
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// --------------------------- Signaler un problème ---------------------------

function ReportWidget() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState(null); // null | "sending" | "sent" | message d'erreur

    const send = async (e) => {
        e.preventDefault();
        if (status === "sending") return;
        setStatus("sending");
        try {
            // "website" = honeypot anti-bot, laissé vide par les humains
            await api("/api/report", {
                method: "POST",
                body: JSON.stringify({ name, message, website: "" }),
            });
            setStatus("sent");
            setName("");
            setMessage("");
        } catch (err) {
            setStatus(err.message || "Erreur d'envoi");
        }
    };

    return (
        <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 50 }}>
            {open && (
                <form
                    onSubmit={send}
                    className="paul-fadeup mb-2 p-3"
                    style={{
                        width: 260,
                        borderRadius: 16,
                        border: `1px solid ${C.tealSoft}`,
                        background: "rgba(6, 48, 63, 0.97)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                >
                    <div className="paul-display text-sm font-semibold mb-2">
                        🛟 Un souci avec le poulpe ?
                    </div>
                    {status === "sent" ? (
                        <div className="text-sm" style={{ color: C.aqua }}>
                            Merci, c'est transmis ! 🐙
                        </div>
                    ) : (
                        <>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ptdr t ki ?"
                                maxLength={60}
                                style={{
                                    width: "100%",
                                    borderRadius: 10,
                                    border: `1px solid ${C.tealSoft}`,
                                    background: "rgba(4, 34, 46, 0.6)",
                                    color: C.foam,
                                    padding: "8px 10px",
                                    fontSize: 13,
                                    outline: "none",
                                    marginBottom: 8,
                                }}
                            />
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Décris le problème (10 caractères min)…"
                                rows={3}
                                maxLength={500}
                                style={{
                                    width: "100%",
                                    borderRadius: 10,
                                    border: `1px solid ${C.tealSoft}`,
                                    background: "rgba(4, 34, 46, 0.6)",
                                    color: C.foam,
                                    padding: "8px 10px",
                                    fontSize: 13,
                                    outline: "none",
                                    resize: "none",
                                }}
                            />
                            {/* Honeypot invisible pour les bots */}
                            <input
                                type="text"
                                name="website"
                                tabIndex={-1}
                                autoComplete="off"
                                style={{ position: "absolute", left: -9999, width: 1, height: 1 }}
                                aria-hidden="true"
                            />
                            <button
                                type="submit"
                                disabled={status === "sending" || message.trim().length < 10}
                                className="paul-go paul-display mt-2 w-full rounded-full px-4 py-2 text-sm font-bold"
                                style={{
                                    color: C.abyss,
                                    background: `linear-gradient(135deg, ${C.gold}, ${C.coral})`,
                                    opacity:
                                        status === "sending" || message.trim().length < 10 ? 0.55 : 1,
                                }}
                            >
                                {status === "sending" ? "Envoi…" : "Envoyer"}
                            </button>
                            {status && status !== "sending" && status !== "sent" && (
                                <div className="mt-2 text-xs" style={{ color: C.coral }}>
                                    {status}
                                </div>
                            )}
                        </>
                    )}
                </form>
            )}
            <div
                style={{
                    display: "flex",
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 10,
                }}
            >
                <button
                    onClick={() => {
                        setOpen(!open);
                        if (!open) setStatus(null);
                    }}
                    aria-label="Un bug, un avis ?"
                    className="paul-go paul-display paul-fab"
                    style={{
                        width: 88,
                        height: 88,
                        borderRadius: "50%",
                        fontSize: open ? 36 : 48,
                        border: `2px solid ${C.tealSoft}`,
                        background: "rgba(6, 48, 63, 0.95)",
                        boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
                    }}
                >
                    {open ? "✕" : "🛟"}
                </button>
                {!open && (
                    <span
                        className="paul-fab-tip paul-display text-sm font-semibold"
                        style={{
                            background: C.foam,
                            color: C.abyss,
                            padding: "8px 14px",
                            borderRadius: 999,
                            whiteSpace: "nowrap",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                        }}
                    >
                        Un bug, un avis ?
                    </span>
                )}
            </div>
        </div>
    );
}

// --------------------------- Liste des matchs ---------------------------

function MatchList({ matches, onSelect, dayLabel }) {
    if (matches.length === 0) {
        return (
            <div
                className="paul-fadeup mx-auto max-w-md p-8 text-center"
                style={{ borderRadius: 18, border: `1px solid ${C.tealSoft}`, background: "rgba(14, 74, 94, 0.5)" }}
            >
                <div className="text-5xl">😴</div>
                <div className="paul-display mt-3 text-lg font-semibold">
                    Pas de match {dayLabel}
                </div>
                <div className="mt-1 text-sm" style={{ color: C.tealText }}>
                    Claude fait la sieste dans son rocher.
                </div>
            </div>
        );
    }
    return (
        <div className="mx-auto grid w-full max-w-2xl gap-3 px-4">
            {matches.map((m, i) => (
                <button
                    key={i}
                    onClick={() => onSelect(m)}
                    className="paul-card paul-fadeup flex items-center justify-between px-5 py-4 text-left"
                    style={{
                        borderRadius: 18,
                        border: `1px solid ${C.tealSoft}`,
                        background: "rgba(14, 74, 94, 0.5)",
                        animationDelay: `${i * 0.08}s`,
                    }}
                >
                    <div className="flex items-center gap-3 flex-wrap">
                        <span
                            className="paul-display rounded-lg px-2 py-1 text-sm font-semibold"
                            style={{ background: "rgba(4, 34, 46, 0.6)", color: C.gold }}
                        >
                            {m.time}
                        </span>
                        <Flag code={m.homeCode} name={m.home} size={34} />
                        <span className="paul-display font-semibold">
                            {m.home} <span style={{ color: C.aqua }}>vs</span> {m.away}
                        </span>
                        <Flag code={m.awayCode} name={m.away} size={34} />
                    </div>
                    <span className="text-2xl">🐙</span>
                </button>
            ))}
        </div>
    );
}

// --------------------------- App ---------------------------

const DAY_TABS = [
    { offset: 0, label: "Aujourd'hui", empty: "aujourd'hui" },
    { offset: 1, label: "Demain", empty: "demain" },
];

export default function ClaudeLePoulpe() {
    const [matches, setMatches] = useState(null);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [dayOffset, setDayOffset] = useState(0);

    const load = async (offset = dayOffset) => {
        setError(null);
        setMatches(null);
        try {
            const result = await fetchMatches(offset);
            setMatches(Array.isArray(result) ? result : []);
        } catch (e) {
            console.error("Erreur oracle :", e);
            setError(e.message || "Erreur inconnue");
        }
    };

    const selectDay = (offset) => {
        if (offset === dayOffset) return;
        setDayOffset(offset);
        setSelected(null);
        load(offset);
    };

    useEffect(() => {
        load(0);
        bumpCounter("open");
    }, []);

    return (
        <div className="paul-root">
            <style>{STYLE}</style>

            <header className="px-4 pb-6 pt-10 text-center">
                <div className="paul-display text-4xl font-bold tracking-tight">
                    🐙 CLAUDE <span style={{ color: C.aqua }}>le Poulpe</span>
                </div>
                <div
                    className="paul-display mt-1 text-sm font-medium uppercase"
                    style={{ letterSpacing: "0.3em", color: C.gold }}
                >
                    L'oracle du Mondial 2026
                </div>
                <div className="mt-2 text-sm capitalize" style={{ color: C.tealText }}>
                    {todayLabel()}
                </div>
            </header>

            {selected ? (
                <OracleTank match={selected} onBack={() => setSelected(null)} />
            ) : (
                <main className="pb-14">
                    {/* Onglets de journée (les deux lisent le même cache : 0 appel API) */}
                    <div className="mb-5 flex justify-center gap-2">
                        {DAY_TABS.map((t) => (
                            <button
                                key={t.offset}
                                onClick={() => selectDay(t.offset)}
                                className="paul-display rounded-full px-5 py-2 text-sm font-semibold"
                                style={{
                                    border: `1px solid ${dayOffset === t.offset ? C.gold : C.tealSoft}`,
                                    background:
                                        dayOffset === t.offset
                                            ? "rgba(244, 201, 93, 0.15)"
                                            : "rgba(14, 74, 94, 0.5)",
                                    color: dayOffset === t.offset ? C.gold : C.tealText,
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {matches === null && !error && (
                        <div className="mx-auto max-w-md text-center">
                            <div className="text-6xl">🐙</div>
                            <div className="paul-display mt-3 text-lg">
                                Claude plonge chercher les matchs du jour
                                <span className="paul-dot">.</span>
                                <span className="paul-dot" style={{ animationDelay: "0.2s" }}>.</span>
                                <span className="paul-dot" style={{ animationDelay: "0.4s" }}>.</span>
                            </div>
                            <div className="mt-1 text-sm" style={{ color: C.tealText }}>
                                Le grand dé-margeage des cotes se fera au moment du GO 🐙
                            </div>
                        </div>
                    )}

                    {error && (
                        <div
                            className="paul-fadeup mx-auto max-w-md p-6 text-center"
                            style={{
                                borderRadius: 18,
                                border: "1px solid rgba(255, 122, 89, 0.4)",
                                background: "rgba(255, 122, 89, 0.1)",
                            }}
                        >
                            <div className="text-4xl">🌊</div>
                            <div className="paul-display mt-2 font-semibold">
                                Le courant a coupé la connexion
                            </div>
                            <div className="mt-1 text-sm" style={{ color: C.tealText }}>{error}</div>
                            <button
                                onClick={load}
                                className="paul-display mt-4 rounded-full px-6 py-2 text-sm font-semibold"
                                style={{ border: `1px solid ${C.tealSoft}`, color: C.foam }}
                            >
                                Replonger 🐙
                            </button>
                        </div>
                    )}

                    {matches !== null && !error && (
                        <MatchList
                            matches={matches}
                            onSelect={setSelected}
                            dayLabel={DAY_TABS[dayOffset].empty}
                        />
                    )}
                </main>
            )}

            <ReportWidget />

            <footer className="pb-6 px-4 text-center text-xs" style={{ color: "rgba(190, 235, 228, 0.4)" }}>
                Probabilités issues des cotes réelles de plusieurs bookmakers (marges retirées) et d'un modèle statistique — temps réglementaire, pas un conseil de pari. Aucune garantie : même le vrai Paul s'est trompé deux fois.
            </footer>
        </div>
    );
}
