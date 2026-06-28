import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
    title: "Claude le Poulpe — L'Oracle du Mondial 2026",
    description:
        "Claude le Poulpe analyse les matchs de la Coupe du monde 2026 et prédit le résultat le plus probable. Aucun conseil de pari.",
    icons: {
        icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐙</text></svg>",
    },
};

export const viewport = {
    themeColor: "#04222e",
};

export default function RootLayout({ children }) {
    return (
        <html lang="fr">
            <body style={{ margin: 0, background: "#04222e" }}>
                {children}
                <Analytics />
            </body>
        </html>
    );
}
