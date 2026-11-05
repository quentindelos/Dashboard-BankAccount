import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { MAX_MEMORY_LENGTH, addMemory, listMemories } from "@/lib/assistantStore";

export const dynamic = "force-dynamic";

const memoryBodySchema = z.object({ content: z.string().trim().min(1, "Texte vide").max(MAX_MEMORY_LENGTH) });

export async function GET() {
  await requireAuth();
  return NextResponse.json({ memories: await listMemories() });
}

export async function POST(request: NextRequest) {
  await requireAuth();
  const parsed = memoryBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Texte invalide" }, { status: 400 });
  try {
    return NextResponse.json({ memory: await addMemory(parsed.data.content) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 400 });
  }
}
