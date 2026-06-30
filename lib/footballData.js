import { cached } from "./cache";
import { teamInfo, slug } from "./teams";

// football-data.org — tier gratuit (en-tête X-Auth-Token). Sert UNIQUEMENT à
// récupérer le score des tirs au but des matchs à élimination directe : The
// Odds API ne donne que le score réglementaire (ex. 1-1), sans le vainqueur.
// Aucune prédiction là-dessus, on affiche juste le résultat des pénos.
// Source optionnelle : sans token (FOOTBALL_DATA_TOKEN), on renvoie un objet
// vide et le reste du site fonctionne comme avant.

const BASE = "https://api.football-data.org/v4";
// Code compétition Coupe du monde chez football-data.org (surchargeable au cas
// où il changerait pour 2026, sans toucher au code).
const WORLD_CUP = process.env.FOOTBALL_DATA_COMPETITION || "WC";

// Clé d'un match indépendante de l'ordre domicile/extérieur : sur terrain
// neutre, The Odds API et football-data.org peuvent désigner des "domiciles"
// différents pour un même match. On retrouve donc le match par la paire
// d'équipes (triée), puis on oriente les pénos par équipe.
export const pairKey = (frA, frB) => [slug(frA), slug(frB)].sort().join("|");

// → { [pairKey]: { [slug(fr)]: butsAuxTirsAuBut } } pour les seuls matchs finis
// aux tirs au but. Objet vide si pas de token, erreur réseau ou aucun match
// concerné — jamais d'exception qui ferait planter la vérification.
// force : contourne le cache 6 h pour refetcher tout de suite (les pénos sont
// parfois publiés après le score réglementaire ; un « Vérifier » manuel doit
// alors pouvoir les récupérer sans attendre l'expiration du cache).
export async function getPenaltyShootouts({ force = false } = {}) {
    if (!process.env.FOOTBALL_DATA_TOKEN) return {};
    return cached("penalties", 6 * 3600, async () => {
        const res = await fetch(
            `${BASE}/competitions/${WORLD_CUP}/matches?status=FINISHED`,
            { headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN } }
        );
        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            console.error("Erreur football-data.org:", res.status, detail);
            throw new Error(`Erreur football-data.org (${res.status})`);
        }
        const data = await res.json();
        const out = {};
        for (const m of data?.matches || []) {
            const pens = m?.score?.penalties;
            // v4 utilise {home, away} ; on tolère l'ancien {homeTeam, awayTeam}.
            const ph = pens?.home ?? pens?.homeTeam;
            const pa = pens?.away ?? pens?.awayTeam;
            if (m?.score?.duration !== "PENALTY_SHOOTOUT" || ph == null || pa == null) {
                continue;
            }
            const home = teamInfo(m.homeTeam?.name).fr;
            const away = teamInfo(m.awayTeam?.name).fr;
            out[pairKey(home, away)] = {
                [slug(home)]: ph,
                [slug(away)]: pa,
            };
        }
        return out;
    }, { force });
}

// Diagnostic : liste BRUTE de tous les matchs renvoyés par football-data.org
// (tous statuts), avec les champs utiles au classement — surtout `stage` et
// `group`, la vérité officielle pour réconcilier notre catégorisation déduite
// de la date. Jamais caché, jamais d'exception avalée : on veut voir l'état réel.
export async function getFootballDataDump() {
    if (!process.env.FOOTBALL_DATA_TOKEN) {
        return { tokenPresent: false, count: 0, matches: [] };
    }
    const res = await fetch(`${BASE}/competitions/${WORLD_CUP}/matches`, {
        headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_TOKEN },
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return {
            tokenPresent: true,
            ok: false,
            status: res.status,
            detail: detail.slice(0, 1000),
            count: 0,
            matches: [],
        };
    }
    const data = await res.json();
    const matches = (data?.matches || []).map((m) => {
        const home = teamInfo(m.homeTeam?.name).fr;
        const away = teamInfo(m.awayTeam?.name).fr;
        const s = m.score || {};
        return {
            utcDate: m.utcDate ?? null,
            status: m.status ?? null,
            matchday: m.matchday ?? null,
            stage: m.stage ?? null, // ex. GROUP_STAGE, LAST_32, LAST_16…
            group: m.group ?? null, // ex. GROUP_K (null en élimination directe)
            homeRaw: m.homeTeam?.name ?? null,
            awayRaw: m.awayTeam?.name ?? null,
            home,
            away,
            pairKey: pairKey(home, away),
            winner: s.winner ?? null,
            duration: s.duration ?? null,
            fullTime: s.fullTime ?? null,
            regularTime: s.regularTime ?? null,
            penalties: s.penalties ?? null,
        };
    });
    return {
        tokenPresent: true,
        ok: true,
        status: res.status,
        competition: WORLD_CUP,
        count: matches.length,
        resultSet: data?.resultSet ?? null,
        matches,
    };
}
