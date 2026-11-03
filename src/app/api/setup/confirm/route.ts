import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyTotpToken } from "@/lib/totp";
import { totpTokenSchema } from "@/lib/validation";

// Final step of setup: user scanned the QR code and types back the current
// 6-digit code to prove it was set up correctly before we lock the account in.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.pendingUserId) {
    return NextResponse.json({ error: "Aucune configuration en cours. Recommencez." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = totpTokenSchema.safeParse(body?.token);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Code invalide" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.pendingUserId } });
  if (!user) {
    session.destroy();
    await session.save();
    return NextResponse.json({ error: "Session invalide. Recommencez la configuration." }, { status: 400 });
  }

  if (!(await verifyTotpToken(parsed.data, user.totpSecret))) {
    return NextResponse.json({ error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." }, { status: 400 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });

  session.userId = user.id;
  session.username = user.username;
  session.pendingUserId = undefined;
  session.pendingUsername = undefined;
  await session.save();

  return NextResponse.json({ success: true });
}
