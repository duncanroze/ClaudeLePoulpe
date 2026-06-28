// Classification d'un match en "type" (phase + groupe) pour le bilan.
//
// Deux infos indépendantes :
//  1. la PHASE, déduite de la date du coup d'envoi (calendrier officiel
//     Mondial 2026 : 11 juin → 19 juillet) ;
//  2. pour la phase de groupes, le GROUPE (A→L), déduit des deux équipes
//     via le tirage (deux équipes d'un même groupe ⇒ match de poule).
//
// Aucune dépendance externe : tout est calculé à partir du jour (YYYY-MM-DD)
// et des noms d'équipes français déjà stockés dans poulpe.predictions.

// --- Phases, par bornes de dates (comparaison lexicographique d'ISO) -------
// Bornes choisies pour couvrir chaque fenêtre réelle et absorber les jours
// de repos vers la phase qui suit.
const PHASES = [
    { key: "groupes", label: "Phase de groupes", upTo: "2026-06-27", order: 0 },
    { key: "r32", label: "16es de finale", upTo: "2026-07-03", order: 20 },
    { key: "r16", label: "8es de finale", upTo: "2026-07-08", order: 21 },
    { key: "qf", label: "Quarts de finale", upTo: "2026-07-13", order: 22 },
    { key: "sf", label: "Demi-finales", upTo: "2026-07-16", order: 23 },
    { key: "tp", label: "Petite finale", upTo: "2026-07-18", order: 24 },
    { key: "final", label: "Finale", upTo: "9999-12-31", order: 25 },
];

export function phaseOf(day) {
    const d = String(day || "");
    return PHASES.find((p) => d <= p.upTo) || PHASES[PHASES.length - 1];
}

// --- Tirage des 12 groupes (confirmé par Duncan) ---------------------------
// Noms français exactement tels que dans lib/teams.js.
const GROUPS = {
    A: ["Mexique", "Afrique du Sud", "Corée du Sud", "Tchéquie"],
    B: ["Suisse", "Canada", "Bosnie-Herzégovine", "Qatar"],
    C: ["Brésil", "Maroc", "Écosse", "Haïti"],
    D: ["États-Unis", "Australie", "Paraguay", "Turquie"],
    E: ["Allemagne", "Côte d'Ivoire", "Équateur", "Curaçao"],
    F: ["Pays-Bas", "Japon", "Suède", "Tunisie"],
    G: ["Belgique", "Égypte", "Iran", "Nouvelle-Zélande"],
    H: ["Espagne", "Cap-Vert", "Uruguay", "Arabie saoudite"],
    I: ["France", "Norvège", "Sénégal", "Irak"],
    J: ["Argentine", "Autriche", "Algérie", "Jordanie"],
    K: ["Colombie", "Portugal", "RD Congo", "Ouzbékistan"],
    L: ["Angleterre", "Croatie", "Ghana", "Panama"],
};

// Clé robuste aux accents/casse/ponctuation pour retrouver une équipe.
const keyOf = (s) =>
    String(s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

const GROUP_BY_TEAM = new Map();
for (const [letter, teams] of Object.entries(GROUPS)) {
    for (const t of teams) GROUP_BY_TEAM.set(keyOf(t), letter);
}

// Lettre de groupe d'une équipe (nom français), ou null si inconnue.
export function groupOf(frName) {
    return GROUP_BY_TEAM.get(keyOf(frName)) || null;
}

// --- Catégorie complète d'un match -----------------------------------------
// Renvoie { key, label, order } : pour la phase de groupes, c'est le groupe
// (clé "g-A", libellé "Groupe A") ; sinon la phase à élimination directe.
export function categoryOf({ day, home, away }) {
    const phase = phaseOf(day);
    if (phase.key === "groupes") {
        // Deux équipes du même groupe → ce groupe. Repli sûr si une équipe
        // est inconnue : on garde un bloc "Phase de groupes" générique.
        const gh = groupOf(home);
        const ga = groupOf(away);
        const letter = gh && gh === ga ? gh : gh || ga || null;
        if (letter) {
            return {
                key: `g-${letter}`,
                label: `Groupe ${letter}`,
                order: letter.charCodeAt(0) - 65, // A→0 … L→11
            };
        }
        return { key: "groupes", label: "Phase de groupes", order: 12 };
    }
    return { key: phase.key, label: phase.label, order: phase.order };
}
