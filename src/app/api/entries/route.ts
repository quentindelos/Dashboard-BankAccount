import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { entrySchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const { accountId, date, value, note } = parsed.data;

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);

  // Upsert on (accountId, date): re-entering a value for a date you already
  // saved just corrects it, instead of erroring on the unique constraint.
  const entry = await prisma.entry.upsert({
    where: { accountId_date: { accountId, date: day } },
    create: { accountId, date: day, value, note: note || null },
    update: { value, note: note || null },
  });

  return NextResponse.json({ entry }, { status: 201 });
}
