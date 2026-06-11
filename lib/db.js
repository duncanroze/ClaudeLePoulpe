import { neon } from "@neondatabase/serverless";

// Connexion Neon (serverless, compatible Vercel). Les tables vivent dans le
// schéma "poulpe" pour ne pas toucher aux tables CityTracker du même Neon.
export const sql = neon(process.env.DATABASE_URL);
