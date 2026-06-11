// Garde des routes sensibles : la requête doit venir du site lui-même
// (en-tête Origin/Referer du même host) ou porter le mot de passe
// (Authorization: Bearer CRON_SECRET — envoyé automatiquement par le cron Vercel).

export function isAuthorized(request) {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
        return true;
    }
    const host = request.headers.get("host");
    const source = request.headers.get("origin") || request.headers.get("referer");
    if (!host || !source) return false;
    try {
        return new URL(source).host === host;
    } catch {
        return false;
    }
}

export function requireSecret(request) {
    const secret = process.env.CRON_SECRET;
    return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
