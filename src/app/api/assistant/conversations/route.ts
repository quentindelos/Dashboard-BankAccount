import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { conversationTitle, createConversation, listConversations, messageSchema } from "@/lib/assistantStore";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAuth();
  return NextResponse.json({ conversations: await listConversations() });
}

// Imports a conversation kept in the browser by an earlier version of the page.
const importSchema = z.object({ messages: z.array(messageSchema).min(2).max(200) });

export async function POST(request: NextRequest) {
  await requireAuth();
  const parsed = importSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Conversation invalide" }, { status: 400 });
  const first = parsed.data.messages.find((m) => m.role === "user")?.content ?? "Conversation";
  const conversation = await createConversation(conversationTitle(first), parsed.data.messages);
  return NextResponse.json({ id: conversation.id });
}
