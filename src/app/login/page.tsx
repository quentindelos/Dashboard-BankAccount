import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { LOGIN_PENDING_MAX_MS, pendingExpired } from "@/lib/session";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await prisma.user.findFirst({ where: { totpEnabled: true } });
  if (!user) redirect("/setup");

  const session = await getSession();
  if (session.userId) redirect("/dashboard");

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <h1>Connexion</h1>
        <LoginForm initialStep={pendingExpired(session, LOGIN_PENDING_MAX_MS) ? "password" : "totp"} />
      </div>
    </div>
  );
}
