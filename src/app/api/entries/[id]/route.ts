import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isTradeRepublic } from "@/lib/accountTypes";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const entry = await prisma.entry.findUnique({ where: { id }, include: { account: { select: { institution: true } } } });
  if (entry && isTradeRepublic(entry.account.institution)) {
    return NextResponse.json({ error: "Ce compte se met à jour par l'export Trade Republic (Réglages)." }, { status: 400 });
  }
  await prisma.entry.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
