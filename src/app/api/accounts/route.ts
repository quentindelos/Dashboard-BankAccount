import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { accountSchema } from "@/lib/validation";

export async function GET() {
  await requireAuth();
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { date: "desc" }, take: 1 } },
  });
  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = accountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const { name, type, institution, note } = parsed.data;
  const account = await prisma.account.create({
    data: { name, type, institution: institution || null, note: note || null },
  });
  return NextResponse.json({ account }, { status: 201 });
}
