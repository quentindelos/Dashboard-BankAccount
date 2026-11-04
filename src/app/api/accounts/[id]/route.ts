import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { accountSchema } from "@/lib/validation";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({
    where: { id },
    include: { entries: { orderBy: { date: "asc" } } },
  });
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = accountSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const { name, type, institution, note, emergencyFund, contributions } = parsed.data;
  const account = await prisma.account
    .update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(institution !== undefined && { institution: institution || null }),
        ...(note !== undefined && { note: note || null }),
        ...(emergencyFund !== undefined && { emergencyFund }),
        ...(contributions !== undefined && { contributions }),
      },
    })
    .catch(() => null);
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  return NextResponse.json({ account });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  // Archive rather than hard-delete by default so historical entries aren't
  // silently lost; the UI can offer a separate "really delete forever" action
  // if needed, but the safe default is non-destructive.
  const account = await prisma.account.update({ where: { id }, data: { archived: true } }).catch(() => null);
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  return NextResponse.json({ success: true });
}
