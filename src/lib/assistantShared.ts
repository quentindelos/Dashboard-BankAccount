// Shared by the assistant API route and the chat page (no server imports).

/** Sent in the answer stream when the model hands over to a fallback model:
 * the client drops what it has shown of this answer and starts again. */
export const RESET_MARKER = "\u0000RESET\u0000";

export type AssistantProvider = "gemini" | "claude";

/** Which AI answers: Gemini when its key is set, else Claude, else none. */
export function assistantProvider(env: Record<string, string | undefined>): AssistantProvider | null {
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
