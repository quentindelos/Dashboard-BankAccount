import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { generateTotpSecret, generateTotpQrCodeDataUrl } from "@/lib/totp";
import { setupSchema } from "@/lib/validation";

// This app is single-user. Setup can only run once a *confirmed* account
// exists (totpEnabled === true); until then, re-posting here is allowed so
// an interrupted setup (e.g. tab closed before scanning the QR code) can be
// restarted cleanly instead of leaving the install stuck.
export async function POST(request: NextRequest) {
  const existing = await prisma.user.findFirst();
  if (existing?.totpEnabled) {
    return NextResponse.json(
      { error: "L'application est déjà configurée. Utilisez la page de connexion." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const { username, password } = parsed.data;

  const passwordHash = await hashPassword(password);
  const totpSecret = generateTotpSecret();

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { username, passwordHash, totpSecret, totpEnabled: false, failedLogins: 0, lockedUntil: null },
      })
    : await prisma.user.create({ data: { username, passwordHash, totpSecret, totpEnabled: false } });

  const qrCodeDataUrl = await generateTotpQrCodeDataUrl(username, totpSecret);

  const session = await getSession();
  session.pendingUserId = user.id;
  session.pendingUsername = user.username;
  await session.save();

  return NextResponse.json({ qrCodeDataUrl, secret: totpSecret });
}
