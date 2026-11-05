import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteConversation, getConversation } from "@/lib/assistantStore";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const conversation = await getConversation((await params).id);
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  return NextResponse.json({ conversation });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  await deleteConversation((await params).id);
  return NextResponse.json({ success: true });
}
