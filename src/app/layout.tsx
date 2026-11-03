import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patrimoine",
  description: "Suivi de patrimoine personnel",
};

// Inline, pre-hydration script that applies the saved theme (or system
// preference) before first paint, avoiding a light/dark flash.
const themeInitScript = `
(function () {
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Matches the per-request nonce proxy.ts put in the CSP header, so this
  // inline script is allowed to run under our strict script-src policy.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="fr">
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
