import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { expenseSchema } from "@/lib/validation";

export async function GET() {
  await requireAuth();
  const expenses = await prisma.recurringExpense.findMany({ orderBy: [{ dayOfMonth: "asc" }, { name: "asc" }] });
  return NextResponse.json({ expenses });
}

export async function POST(request: NextRequest) {
  await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = expenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const expense = await prisma.recurringExpense.create({
    data: { ...parsed.data, note: parsed.data.note || null, active: parsed.data.active ?? true },
  });
  return NextResponse.json({ expense }, { status: 201 });
}
