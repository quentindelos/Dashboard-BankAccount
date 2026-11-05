import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { MAX_MEMORY_LENGTH, deleteMemory, updateMemory } from "@/lib/assistantStore";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const bodySchema = z.object({ content: z.string().trim().min(1, "Texte vide").max(MAX_MEMORY_LENGTH) });

export async function PUT(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Texte invalide" }, { status: 400 });
  const memory = await updateMemory(Number((await params).id), parsed.data.content);
  if (!memory) return NextResponse.json({ error: "Élément introuvable" }, { status: 404 });
  return NextResponse.json({ memory });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  await deleteMemory(Number((await params).id));
  return NextResponse.json({ success: true });
}
