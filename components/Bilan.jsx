"use client";

import { useState, useEffect } from "react";

// ---------------------------------------------------------------
// /bilan — dashboard privé du gardien du bassin (mot de passe).
// Stats du site (visites, GO par jour), budget The Odds API,
// et journal des prédictions vs scores réels.
// ---------------------------------------------------------------

const C = {
    abyss: "#04222e",
    aqua: "#2dd4bf",
    foam: "#e8f6f3",
    coral: "#ff7a59",
    gold: "#f4c95d",
    tealSoft: "rgba(45, 212, 191, 0.25)",
    tealText: "rgba(190, 235, 228, 0.75)",
};

const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
.bilan-root {
    font-family: 'Nunito', system-ui, sans-serif;
    color: ${C.foam};
    min-height: 100vh;
    background:
        radial-gradient(1200px 600px at 50% -10%, #11586e 0%, transparent 60%),
        linear-gradient(180deg, #06303f 0%, ${C.abyss} 70%);
}
.bilan-display { font-family: 'Fredoka', 'Nunito', sans-serif; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.bilan-fadeup { animation: fadeUp 0.5s ease-out both; }
.bilan-btn { transition: transform 0.15s ease, filter 0.15s ease; }
.bilan-btn:hover:not(:disabled) { transform: scale(1.04); filter: brightness(1.1); }
`;

const card = {
    borderRadius: 16,
    border: `1px solid ${C.tealSoft}`,
    background: "rgba(14, 74, 94, 0.5)",
};

function outcomeOf(score) {
    const [h, a] = String(score || "").split("-").map(Number);
    if (Number.isNaN(h) || Number.isNaN(a)) return null;
    return h > a ? "home" : h < a ? "away" : "draw";
}

const OUTCOME_SHORT = { home: "1", draw: "N", away: "2" };

async function api(path, pass, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pass}`,
            ...(options.headers || {}),
        },
    });
    if (response.status === 401) throw new Error("401");
    if (!response.ok) throw new Error(`Erreur serveur (${response.status})`);
    return response.json();
}

function StatCard({ icon, label, value, sub }) {
    return (
        <div className="p-4 text-center" style={card}>
            <div className="text-2xl">{icon}</div>
            <div className="bilan-display mt-1 text-2xl font-bold" style={{ color: C.gold }}>
                {value}
            </div>
            <div className="text-xs font-semibold" style={{ color: C.tealText }}>
                {label}
            </div>
            {sub && (
                <div className="mt-1 text-xs" style={{ color: "rgba(190,235,228,0.5)" }}>
                    {sub}
                </div>
            )}
        </div>
    );
}

// Graphique en barres des 14 derniers jours (visites + GO)
function DailyChart({ daily }) {
    const byDay = new Map();
    for (const row of daily || []) {
        const d = byDay.get(row.day) || { open: 0, go: 0 };
        d[row.type === "open" ? "open" : "go"] = row.count;
        byDay.set(row.day, d);
    }
    const days = [...byDay.keys()].sort().slice(-14);
    if (days.length === 0) {
        return (
            <div className="p-6 text-center text-sm" style={{ ...card, color: C.tealText }}>
                Pas encore de trafic enregistré.
            </div>
        );
    }
    const max = Math.max(1, ...days.map((d) => Math.max(byDay.get(d).open, byDay.get(d).go)));
    return (
        <div className="p-4" style={card}>
            <div className="flex items-end justify-around gap-1" style={{ height: 120 }}>
                {days.map((d) => {
                    const v = byDay.get(d);
                    return (
                        <div key={d} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
                            <div className="flex items-end gap-1" style={{ height: 90 }}>
                                <div
                                    title={`${v.open} visite(s)`}
                                    style={{
                                        width: 10,
                                        height: Math.max(3, (v.open / max) * 90),
                                        background: C.aqua,
                                        borderRadius: 3,
                                    }}
                                />
                                <div
                                    title={`${v.go} GO`}
                                    style={{
                                        width: 10,
                                        height: Math.max(3, (v.go / max) * 90),
                                        background: C.gold,
                                        borderRadius: 3,
                                    }}
                                />
                            </div>
                            <div className="text-xs" style={{ color: C.tealText }}>
                                {d.slice(8, 10)}/{d.slice(5, 7)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 flex justify-center gap-4 text-xs" style={{ color: C.tealText }}>
                <span><span style={{ color: C.aqua }}>■</span> Visites</span>
                <span><span style={{ color: C.gold }}>■</span> Oracles lancés (GO)</span>
            </div>
        </div>
    );
}

export default function Bilan() {
    const [pass, setPass] = useState("");
    const [authed, setAuthed] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState(null);
    const [entries, setEntries] = useState([]);
    const [checking, setChecking] = useState(false);
    const [notice, setNotice] = useState(null);

    const refresh = async (p) => {
        const [s, predictions] = await Promise.all([
            api("/api/stats", p),
            api("/api/predictions", p),
        ]);
        setStats(s);
        setEntries(predictions.entries || []);
    };

    const login = async (p) => {
        if (!p) return;
        setLoading(true);
        setAuthError(null);
        try {
            await refresh(p);
            setAuthed(true);
            localStorage.setItem("poulpe-pass", p);
        } catch (e) {
            localStorage.removeItem("poulpe-pass");
            setAuthError(
                e.message === "401"
                    ? "Le poulpe ne te reconnaît pas. 🐙"
                    : "Erreur de chargement, réessaie."
            );
        }
        setLoading(false);
    };

    useEffect(() => {
        const saved = localStorage.getItem("poulpe-pass");
        if (saved) {
            setPass(saved);
            login(saved);
        }
    }, []);

    const verifyNow = async () => {
        setChecking(true);
        setNotice(null);
        try {
            const r = await api("/api/verify", pass, { method: "POST" });
            setNotice(
                r.updated > 0
                    ? `${r.updated} score(s) réel(s) récupéré(s) !`
                    : "Aucun nouveau match terminé pour l'instant."
            );
            await refresh(pass);
        } catch (e) {
            setNotice(`Erreur de vérification (${e.message || e})`);
        }
        setChecking(false);
    };

    const logout = () => {
        localStorage.removeItem("poulpe-pass");
        setAuthed(false);
        setPass("");
        setStats(null);
        setEntries([]);
    };

    // Stats dérivées du journal
    const played = entries.filter((e) => e.actualScore);
    const goodOutcome = played.filter((e) => outcomeOf(e.actualScore) === e.prediction);
    const exactScore = played.filter((e) => e.actualScore === e.predictedScore);
    const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

    const statusOf = (e) => {
        if (!e.actualScore) return "⏳";
        if (e.actualScore === e.predictedScore) return "🎯";
        return outcomeOf(e.actualScore) === e.prediction ? "✅" : "❌";
    };

    const gate = (
        <div className="bilan-fadeup mx-auto w-full max-w-md px-4 pt-24 text-center">
            <div className="text-6xl">🔐</div>
            <div className="bilan-display mt-3 text-3xl font-bold">Le bilan du poulpe</div>
            <div className="mt-1 text-sm" style={{ color: C.tealText }}>
                Réservé au gardien du bassin.
            </div>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    login(pass);
                }}
                className="mt-6 flex justify-center gap-2"
            >
                <input
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="Mot de passe"
                    autoFocus
                    style={{
                        borderRadius: 999,
                        border: `1px solid ${C.tealSoft}`,
                        background: "rgba(4, 34, 46, 0.6)",
                        color: C.foam,
                        padding: "10px 18px",
                        outline: "none",
                    }}
                />
                <button
                    type="submit"
                    disabled={loading}
                    className="bilan-btn bilan-display rounded-full px-6 py-2 text-sm font-bold"
                    style={{
                        color: C.abyss,
                        background: `linear-gradient(135deg, ${C.gold}, ${C.coral})`,
                        opacity: loading ? 0.55 : 1,
                    }}
                >
                    {loading ? "…" : "Entrer"}
                </button>
            </form>
            {authError && (
                <div className="mt-3 text-sm" style={{ color: C.coral }}>
                    {authError}
                </div>
            )}
            <a href="/" className="bilan-display mt-8 inline-block text-sm" style={{ color: C.aqua }}>
                ← Retour au bassin public
            </a>
        </div>
    );

    const counters = stats?.counters || {};
    const budget = stats?.apiBudget;

    const dashboard = (
        <div className="bilan-fadeup mx-auto w-full max-w-4xl px-4 pb-16">
            <div className="flex items-center justify-between flex-wrap gap-2 pt-8">
                <div>
                    <div className="bilan-display text-3xl font-bold">📊 Le bilan du poulpe</div>
                    <div className="text-sm" style={{ color: C.tealText }}>
                        Tableau de bord privé — Mondial 2026
                    </div>
                </div>
                <div className="flex gap-2">
                    <a
                        href="/"
                        className="bilan-display rounded-full px-4 py-2 text-xs font-semibold"
                        style={{ border: `1px solid ${C.tealSoft}`, color: C.tealText }}
                    >
                        ← Le bassin
                    </a>
                    <button
                        onClick={() => refresh(pass).catch(() => {})}
                        className="bilan-display rounded-full px-4 py-2 text-xs font-semibold"
                        style={{ border: `1px solid ${C.tealSoft}`, color: C.tealText }}
                    >
                        ↺ Rafraîchir
                    </button>
                    <button
                        onClick={logout}
                        className="bilan-display rounded-full px-4 py-2 text-xs font-semibold"
                        style={{ border: `1px solid ${C.tealSoft}`, color: C.tealText }}
                    >
                        Sortir
                    </button>
                </div>
            </div>

            {/* Stats du site */}
            <div className="bilan-display mt-6 mb-2 text-sm font-semibold uppercase" style={{ letterSpacing: "0.15em", color: C.aqua }}>
                Le site
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard icon="🐙" label="Visites" value={counters.opens ?? "…"} />
                <StatCard icon="🔮" label="Oracles lancés (GO)" value={counters.goClicks ?? "…"} />
                <StatCard icon="📒" label="Prédictions journalisées" value={entries.length} />
                <StatCard
                    icon="🛟"
                    label="Budget API aujourd'hui"
                    value={budget ? `${budget.used}/${budget.limit}` : "…"}
                    sub="crédits The Odds API"
                />
            </div>
            <div className="mt-3">
                <DailyChart daily={stats?.daily} />
            </div>

            {/* Stats des prédictions */}
            <div className="bilan-display mt-8 mb-2 text-sm font-semibold uppercase" style={{ letterSpacing: "0.15em", color: C.aqua }}>
                Le poulpe vs la réalité
            </div>
            <div className="grid grid-cols-3 gap-3">
                <StatCard
                    icon="🏁"
                    label="Matchs vérifiés"
                    value={`${played.length}/${entries.length}`}
                />
                <StatCard
                    icon="✅"
                    label="Bon résultat (1N2)"
                    value={`${goodOutcome.length}/${played.length}`}
                    sub={pct(goodOutcome.length, played.length)}
                />
                <StatCard
                    icon="🎯"
                    label="Score exact"
                    value={`${exactScore.length}/${played.length}`}
                    sub={pct(exactScore.length, played.length)}
                />
            </div>

            {/* Journal */}
            <div className="mt-8 flex items-center justify-between flex-wrap gap-2">
                <div className="bilan-display text-sm font-semibold uppercase" style={{ letterSpacing: "0.15em", color: C.aqua }}>
                    Journal des prédictions
                </div>
                <button
                    onClick={verifyNow}
                    disabled={checking || entries.length === 0}
                    className="bilan-btn bilan-display rounded-full px-5 py-2 text-xs font-bold"
                    style={{
                        color: C.abyss,
                        background: `linear-gradient(135deg, ${C.gold}, ${C.coral})`,
                        opacity: checking || entries.length === 0 ? 0.55 : 1,
                    }}
                >
                    {checking ? "Vérification…" : "🔍 Vérifier maintenant"}
                </button>
            </div>
            {notice && (
                <div className="mt-2 text-sm" style={{ color: C.tealText }}>
                    {notice}
                </div>
            )}
            <div className="mt-3 flex flex-col gap-2">
                {entries.length === 0 && (
                    <div className="p-6 text-center text-sm" style={{ ...card, color: C.tealText }}>
                        Aucune prédiction journalisée — le journal se remplit quand les
                        visiteurs lancent l'oracle.
                    </div>
                )}
                {entries.map((e) => (
                    <div
                        key={e.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 text-sm flex-wrap"
                        style={card}
                    >
                        <div>
                            <span style={{ color: C.tealText }}>{e.day}</span>{" "}
                            <span className="bilan-display font-semibold">
                                {e.home} vs {e.away}
                            </span>
                            {e.time && (
                                <span className="ml-2 text-xs" style={{ color: C.tealText }}>
                                    {e.time}
                                </span>
                            )}
                            <div className="mt-1 text-xs" style={{ color: C.tealText }}>
                                prédit : {OUTCOME_SHORT[e.prediction] || "?"}
                                {e.probabilities &&
                                    ` (${e.probabilities.home}/${e.probabilities.draw}/${e.probabilities.away} %)`}
                                {e.confidence && ` · fiabilité ${e.confidence}`}
                            </div>
                        </div>
                        <div className="bilan-display font-semibold text-right" style={{ whiteSpace: "nowrap" }}>
                            {e.predictedScore || "?"} → {e.actualScore || "à venir"} {statusOf(e)}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-6 text-center text-xs" style={{ color: "rgba(190,235,228,0.4)" }}>
                Scores réels récupérés automatiquement chaque matin vers 9h (heure de Paris).
            </div>
        </div>
    );

    return (
        <div className="bilan-root">
            <style>{STYLE}</style>
            {authed ? dashboard : gate}
        </div>
    );
}
