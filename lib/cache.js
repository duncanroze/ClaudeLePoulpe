import { sql } from "./db";

// Cache générique en BDD : un fetch externe sert tous les visiteurs
// pendant le TTL — les clics ne consomment pas le quota des API.
// force : ignore la valeur en cache et refetch (le résultat est tout de même
// réécrit pour les appels suivants). Sert à rafraîchir à la demande une donnée
// qui vient d'être publiée côté fournisseur (ex. tirs au but tardifs).
export async function cached(key, ttlSeconds, fetcher, { force = false } = {}) {
    if (!force) {
        const rows = await sql`
            SELECT value FROM poulpe.cache WHERE key = ${key} AND expires_at > now()`;
        if (rows.length > 0) return rows[0].value;
    }

    let value;
    try {
        value = await fetcher();
    } catch (e) {
        // Budget du jour épuisé ou API en panne : on ressert la dernière
        // valeur connue même périmée plutôt que de planter.
        const stale = await sql`SELECT value FROM poulpe.cache WHERE key = ${key}`;
        if (stale.length > 0) return stale[0].value;
        throw e;
    }
    await sql`
        INSERT INTO poulpe.cache (key, value, expires_at)
        VALUES (${key}, ${JSON.stringify(value)}, now() + make_interval(secs => ${ttlSeconds}))
        ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
    return value;
}
