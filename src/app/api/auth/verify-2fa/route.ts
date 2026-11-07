import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { LOGIN_PENDING_MAX_MS, pendingExpired } from "@/lib/session";
import { verifyTotpToken } from "@/lib/totp";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { totpTokenSchema } from "@/lib/validation";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(`totp:${ip}`, { max: 15, windowMs: 5 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${rl.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const session = await getSession();
  if (pendingExpired(session, LOGIN_PENDING_MAX_MS)) {
    return NextResponse.json({ error: "Connectez-vous d'abord avec votre mot de passe.", restart: true }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = totpTokenSchema.safeParse(body?.token);
  if (!parsed.success) {
    return NextResponse.json({ error: "Code à 6 chiffres attendu." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.pendingUserId } });
  if (!user) {
    session.destroy();
    await session.save();
    return NextResponse.json({ error: "Session invalide. Reconnectez-vous." }, { status: 400 });
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return NextResponse.json({ error: "Compte temporairement verrouillé. Réessayez plus tard." }, { status: 423 });
  }

  if (!(await verifyTotpToken(parsed.data, user.totpSecret))) {
    const failedLogins = user.failedLogins + 1;
    const lockedUntil = failedLogins >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: lockedUntil ? 0 : failedLogins, lockedUntil },
    });
    return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

  session.userId = user.id;
  session.username = user.username;
  session.pendingUserId = undefined;
  session.pendingUsername = undefined;
  session.pendingAt = undefined;
  await session.save();

  return NextResponse.json({ success: true });
}
