// Moteur de prédiction — la même méthode que demandait l'ancien prompt,
// mais en pur calcul :
// 1. cotes 1N2 de chaque bookmaker → probabilités dé-margées
//    p(issue) = (1/cote_issue) / (1/cote_dom + 1/cote_nul + 1/cote_ext)
// 2. moyenne entre bookmakers = consensus du marché
// 3. modèle de Poisson calibré sur ce consensus → scores exacts les plus probables

const MAX_GOALS = 8;

function poissonPmf(lambda, k) {
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) p = (p * lambda) / i;
    return p;
}

// Matrice des probabilités de chaque score h-a pour des buts ~ Poisson(λ)
function scoreMatrix(lambdaHome, lambdaAway) {
    const ph = [], pa = [];
    for (let k = 0; k <= MAX_GOALS; k++) {
        ph.push(poissonPmf(lambdaHome, k));
        pa.push(poissonPmf(lambdaAway, k));
    }
    const m = [];
    for (let h = 0; h <= MAX_GOALS; h++) {
        m.push([]);
        for (let a = 0; a <= MAX_GOALS; a++) m[h].push(ph[h] * pa[a]);
    }
    return m;
}

function outcomeProbs(matrix) {
    let home = 0, draw = 0, away = 0;
    for (let h = 0; h <= MAX_GOALS; h++) {
        for (let a = 0; a <= MAX_GOALS; a++) {
            if (h > a) home += matrix[h][a];
            else if (h === a) draw += matrix[h][a];
            else away += matrix[h][a];
        }
    }
    return { home, draw, away };
}

// Cherche les λ (buts attendus) qui reproduisent au mieux les probabilités
// 1N2 du marché — balayage simple, largement assez précis ici.
function fitLambdas(pHome, pAway) {
    let best = { lh: 1.3, la: 1.1, err: Infinity };
    for (let lh = 0.2; lh <= 3.6; lh += 0.05) {
        for (let la = 0.2; la <= 3.6; la += 0.05) {
            const probs = outcomeProbs(scoreMatrix(lh, la));
            const err = (probs.home - pHome) ** 2 + (probs.away - pAway) ** 2;
            if (err < best.err) best = { lh, la, err };
        }
    }
    return best;
}

function outcomeOfScore(h, a) {
    return h > a ? "home" : h < a ? "away" : "draw";
}

const round2 = (x) => Math.round(x * 100) / 100;

// bookmakers: tableau The Odds API [{title, markets: [{key:"h2h", outcomes:[{name, price}]}]}]
export function buildAnalysis({ homeName, awayName, homeFr, awayFr, bookmakers }) {
    // Les cotes 1N2 portent sur le temps réglementaire : le nul existe aussi
    // en phase à élimination directe (avant prolongation/tirs au but). Si un
    // bookmaker ne propose que 2 issues, on dé-marge quand même sans le nul.
    const threeWay = [];
    const twoWay = [];
    for (const book of bookmakers || []) {
        const market = (book.markets || []).find((m) => m.key === "h2h");
        if (!market) continue;
        const price = (name) => market.outcomes.find((o) => o.name === name)?.price;
        const oh = price(homeName), oa = price(awayName), od = price("Draw");
        if (!oh || !oa) continue;
        if (od) {
            const total = 1 / oh + 1 / od + 1 / oa;
            threeWay.push({
                odds: { home: oh, draw: od, away: oa },
                probs: { home: 1 / oh / total, draw: 1 / od / total, away: 1 / oa / total },
            });
        } else {
            const total = 1 / oh + 1 / oa;
            twoWay.push({
                odds: { home: oh, draw: null, away: oa },
                probs: { home: 1 / oh / total, draw: 0, away: 1 / oa / total },
            });
        }
    }
    // On privilégie les bookmakers 3 issues ; repli 2 issues sinon
    const perBook = threeWay.length > 0 ? threeWay : twoWay;
    if (perBook.length === 0) throw new Error("Aucune cote 1N2 exploitable pour ce match");

    const avg = (sel) => perBook.reduce((s, b) => s + sel(b), 0) / perBook.length;
    const market = {
        home: avg((b) => b.probs.home),
        draw: avg((b) => b.probs.draw),
        away: avg((b) => b.probs.away),
    };
    const avgOdds = {
        home: round2(avg((b) => b.odds.home)),
        draw: threeWay.length > 0 ? round2(avg((b) => b.odds.draw)) : "—",
        away: round2(avg((b) => b.odds.away)),
    };

    // Probabilités entières sommant à 100
    const probabilities = {
        home: Math.round(market.home * 100),
        draw: Math.round(market.draw * 100),
        away: Math.round(market.away * 100),
    };
    probabilities.draw = 100 - probabilities.home - probabilities.away;

    const prediction = ["home", "draw", "away"].reduce((a, b) =>
        probabilities[a] >= probabilities[b] ? a : b
    );

    // Scores exacts via Poisson calibré sur le consensus du marché
    const { lh, la } = fitLambdas(market.home, market.away);
    const matrix = scoreMatrix(lh, la);
    const cells = [];
    for (let h = 0; h <= MAX_GOALS; h++)
        for (let a = 0; a <= MAX_GOALS; a++)
            cells.push({ h, a, p: matrix[h][a] });
    cells.sort((x, y) => y.p - x.p);

    // Le score n°1 doit être cohérent avec l'issue la plus probable
    const lead = cells.find((c) => outcomeOfScore(c.h, c.a) === prediction) || cells[0];
    const rest = cells.filter((c) => c !== lead);
    const topScores = [lead, ...rest.slice(0, 2)].map((c) => ({
        score: `${c.h}-${c.a}`,
        probability: Math.round(c.p * 100),
        scoreOdds: null,
    }));

    const maxP = Math.max(probabilities.home, probabilities.draw, probabilities.away);
    const confidence = maxP >= 55 ? "haute" : maxP >= 42 ? "moyenne" : "basse";

    const favLabel =
        prediction === "draw" ? "le match nul" : prediction === "home" ? homeFr : awayFr;
    const comment =
        prediction === "draw"
            ? `Marché indécis : le nul ressort en tête à ${maxP}%.`
            : `Le marché place ${favLabel} devant à ${maxP}%, score le plus crédible ${topScores[0].score}.`;

    const factors = [
        {
            label: "Cotes bookmakers",
            detail: `${perBook.length} bookmaker(s), cotes moyennes ${avgOdds.home} / ${avgOdds.draw} / ${avgOdds.away}`,
        },
        {
            label: "Consensus marché",
            detail: `${favLabel} donné en tête à ${maxP}% (marges retirées)`,
        },
        {
            label: "Buts attendus",
            detail: `${round2(lh)} pour ${homeFr}, ${round2(la)} pour ${awayFr}`,
        },
        {
            label: "Modèle de scores",
            detail: "Poisson calibré sur les probabilités du marché",
        },
    ];

    return { prediction, probabilities, topScores, factors, confidence, comment };
}
