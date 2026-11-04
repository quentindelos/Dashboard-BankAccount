import type { Metadata } from "next";
import { cookies } from "next/headers";
import { parseTheme } from "@/lib/themes";
import "./themes.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patrimoine",
  description: "Suivi de patrimoine personnel",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The theme picked in Réglages lives in a cookie, so the server renders the
  // right `data-theme` directly: no flash, and no inline script needed.
  const theme = parseTheme((await cookies()).get("theme")?.value);

  return (
    <html lang="fr" data-theme={theme}>
      <head>
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body>{children}</body>
    </html>
  );
}
