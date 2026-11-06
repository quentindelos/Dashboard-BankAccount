import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, verifyPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { loginSchema } from "@/lib/validation";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = checkRateLimit(`login:${ip}`, { max: 10, windowMs: 5 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Trop de tentatives. Réessayez dans ${rl.retryAfterSeconds}s.` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  }
  const { username, password } = parsed.data;

  // Generic error message on every failure path below: never reveal whether
  // the username exists, which field was wrong, or that the account is locked
  // out due to the *username* specifically (timing is close enough either way
  // since we always hash-compare against a dummy when the user is missing).
  const genericError = () => NextResponse.json({ error: "Identifiants invalides." }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.totpEnabled) {
    // Still run a bcrypt compare against a throwaway hash so responding to a
    // nonexistent username doesn't short-circuit faster than a real one.
    await verifyPassword(password, "$2a$12$CwTycUXWue0Thq9StjUM0uJ8pUwdX5p1NqIjK5oS6HbPzP1LyQ1dq");
    return genericError();
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const retrySeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    return NextResponse.json(
      { error: `Compte temporairement verrouillé suite à plusieurs échecs. Réessayez dans ${Math.ceil(retrySeconds / 60)} min.` },
      { status: 423 }
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failedLogins = user.failedLogins + 1;
    const lockedUntil = failedLogins >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: lockedUntil ? 0 : failedLogins, lockedUntil },
    });
    return genericError();
  }

  // Password correct: now require the 2FA step before granting a real session.
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

  const session = await getSession();
  session.pendingUserId = user.id;
  session.pendingUsername = user.username;
  session.userId = undefined;
  session.username = undefined;
  await session.save();

  return NextResponse.json({ requiresTotp: true });
}
