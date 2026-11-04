import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { expenseSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = expenseSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const expense = await prisma.recurringExpense
    .update({
      where: { id },
      data: { ...parsed.data, ...(parsed.data.note !== undefined && { note: parsed.data.note || null }) },
    })
    .catch(() => null);
  if (!expense) return NextResponse.json({ error: "Charge introuvable" }, { status: 404 });
  return NextResponse.json({ expense });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const deleted = await prisma.recurringExpense.delete({ where: { id } }).catch(() => null);
  if (!deleted) return NextResponse.json({ error: "Charge introuvable" }, { status: 404 });
  return NextResponse.json({ success: true });
}
