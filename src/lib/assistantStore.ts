// Assistant conversations and memory, stored in the database so every device
// sees the same history.
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { ChatMessage } from "@/lib/assistantShared";

export const MAX_MEMORIES = 100;
export const MAX_MEMORY_LENGTH = 500;

export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(40000),
  notes: z.array(z.string().max(600)).max(20).optional(),
});

function parseMessages(json: string): ChatMessage[] {
  try {
    const parsed = z.array(messageSchema).safeParse(JSON.parse(json));
    if (parsed.success) return parsed.data;
  } catch {
    // corrupted row: show it empty
  }
  return [];
}

export function conversationTitle(question: string): string {
  const flat = question.replace(/\s+/g, " ").trim();
  return flat.length > 70 ? `${flat.slice(0, 67).trimEnd()}…` : flat;
}

export async function listConversations() {
  return prisma.assistantConversation.findMany({
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function getConversation(id: string) {
  const row = await prisma.assistantConversation.findUnique({ where: { id } });
  return row ? { id: row.id, title: row.title, updatedAt: row.updatedAt, messages: parseMessages(row.messages) } : null;
}

export async function createConversation(title: string, messages: ChatMessage[] = []) {
  return prisma.assistantConversation.create({ data: { title, messages: JSON.stringify(messages) } });
}

export async function saveConversation(id: string, messages: ChatMessage[]) {
  await prisma.assistantConversation.update({ where: { id }, data: { messages: JSON.stringify(messages) } });
}

export async function deleteConversation(id: string) {
  await prisma.assistantConversation.deleteMany({ where: { id } });
}

export async function listMemories() {
  return prisma.assistantMemory.findMany({ orderBy: { id: "asc" } });
}

export async function addMemory(content: string) {
  const count = await prisma.assistantMemory.count();
  if (count >= MAX_MEMORIES) throw new Error(`Mémoire pleine (${MAX_MEMORIES} éléments) : supprime ou fusionne des souvenirs.`);
  return prisma.assistantMemory.create({ data: { content: content.trim().slice(0, MAX_MEMORY_LENGTH) } });
}

export async function updateMemory(id: number, content: string) {
  const found = await prisma.assistantMemory.findUnique({ where: { id } });
  if (!found) return null;
  return prisma.assistantMemory.update({ where: { id }, data: { content: content.trim().slice(0, MAX_MEMORY_LENGTH) } });
}

export async function deleteMemory(id: number) {
  const found = await prisma.assistantMemory.findUnique({ where: { id } });
  if (found) await prisma.assistantMemory.delete({ where: { id } });
  return found;
}
