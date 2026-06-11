import { sql } from "./db";

// Cache générique en BDD : un fetch externe sert tous les visiteurs
// pendant le TTL — les clics ne consomment pas le quota des API.
export async function cached(key, ttlSeconds, fetcher) {
    const rows = await sql`
        SELECT value FROM poulpe.cache WHERE key = ${key} AND expires_at > now()`;
    if (rows.length > 0) return rows[0].value;

    const value = await fetcher();
    await sql`
        INSERT INTO poulpe.cache (key, value, expires_at)
        VALUES (${key}, ${JSON.stringify(value)}, now() + make_interval(secs => ${ttlSeconds}))
        ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
    return value;
}
