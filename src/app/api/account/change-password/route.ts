import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, hashPassword, verifyPassword } from "@/lib/auth";
import { verifyTotpToken } from "@/lib/totp";
import { checkRateLimit } from "@/lib/rateLimit";
import { passwordSchema, totpTokenSchema } from "@/lib/validation";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
  token: totpTokenSchema,
});

// Changing the password requires the current password AND a valid 2FA code,
// not just an active session, since a session cookie alone shouldn't be
// enough to take over long-term access to the account.
export async function POST(request: NextRequest) {
  const { userId } = await requireAuth();
  // Keyed on the account: whoever holds the session cookie must not be able to
  // try current passwords endlessly.
  const rl = checkRateLimit(`change-password:${userId}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.retryAfterSeconds / 60)} min.` }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const { currentPassword, newPassword, token } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

  const validPassword = await verifyPassword(currentPassword, user.passwordHash);
  if (!validPassword || !(await verifyTotpToken(token, user.totpSecret))) {
    return NextResponse.json({ error: "Mot de passe actuel ou code 2FA incorrect." }, { status: 401 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return NextResponse.json({ success: true });
}
