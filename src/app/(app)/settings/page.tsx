import { cookies } from "next/headers";
import Link from "next/link";
import { parseTheme } from "@/lib/themes";
import SettingsPanel from "@/components/SettingsPanel";
import ThemePicker from "@/components/ThemePicker";
import TradeRepublicImport from "@/components/TradeRepublicImport";

export default async function SettingsPage() {
  const theme = parseTheme((await cookies()).get("theme")?.value);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Réglages</h1>
          <p className="muted">
            Le matelas de sécurité se règle dans <Link href="/expenses">Dépenses</Link>. Ton profil et ton mot de passe sont dans{" "}
            <Link href="/profile">Mon compte</Link>.
          </p>
        </div>
      </div>
      <ThemePicker current={theme} />
      <TradeRepublicImport />
      <SettingsPanel />
    </>
  );
}
