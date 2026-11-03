import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import SetupWizard from "@/components/SetupWizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await prisma.user.findFirst({ where: { totpEnabled: true } });
  if (user) redirect("/login");

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <h1>Configuration initiale</h1>
        <p className="secondary" style={{ marginTop: -6, marginBottom: 18 }}>
          Crée ton compte d'accès. L'authentification à deux facteurs (2FA) est obligatoire.
        </p>
        <SetupWizard />
      </div>
    </div>
  );
}
