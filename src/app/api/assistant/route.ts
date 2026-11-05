import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { buildAssistantContext } from "@/lib/assistantContext";
import { buildInstructions } from "@/lib/assistantPrompt";
import { assistantSettingsSchema, loadAssistantInfo, saveAssistantSettings } from "@/lib/assistantSettings";
import { RESET_MARKER, type AssistantProvider, type AssistantSettings, type ChatMessage } from "@/lib/assistantShared";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m.at(-1)?.role === "user", "Le dernier message doit être une question."),
});

type Send = (text: string) => void;

interface Run {
  provider: AssistantProvider;
  model: string;
  settings: AssistantSettings;
  instructions: string;
  context: string;
}

async function prepare(): Promise<Run | null> {
  const { settings, provider, model } = await loadAssistantInfo();
  if (!provider || !model) return null;
  return {
    provider,
    model,
    settings,
    instructions: buildInstructions(settings, settings.webSearch),
    context: await buildAssistantContext(settings),
  };
}

let anthropic: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

async function streamClaude(run: Run, messages: ChatMessage[], send: Send, signal: AbortSignal) {
  anthropic ??= new Anthropic();
  const stream = anthropic.beta.messages.stream(
    {
      model: run.model,
      max_tokens: 16000,
      output_config: { effort: run.settings.thinking },
      // On a safety decline, retry on the model Anthropic recommends.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(run.settings.webSearch ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 5 }] } : {}),
      system: [
        { type: "text", text: run.instructions },
        // Cached: follow-up questions reuse the same snapshot.
        { type: "text", text: run.context, cache_control: { type: "ephemeral" } },
      ],
      messages,
    },
    { signal }
  );
  for await (const event of stream) {
    if (event.type === "content_block_start" && event.content_block.type === "fallback") send(RESET_MARKER);
    else if (event.type === "content_block_delta" && event.delta.type === "text_delta") send(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") send("\n\n_Je ne peux pas répondre à cette demande._");
  else if (final.stop_reason === "max_tokens") send("\n\n_(Réponse coupée : trop longue.)_");
  else if (final.stop_reason === "pause_turn") send("\n\n_(Recherche interrompue : repose la question pour continuer.)_");
}

const GEMINI_THINKING = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const;

async function streamGemini(run: Run, messages: ChatMessage[], send: Send, signal: AbortSignal) {
  // GEMINI_VERTEX=true: Vertex AI on Google Cloud (billed to the Cloud billing
  // account) with a Vertex AI API key, instead of the AI Studio Gemini API.
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, vertexai: process.env.GEMINI_VERTEX === "true" });
  const stream = await gemini.models.generateContentStream({
    model: run.model,
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    config: {
      systemInstruction: `${run.instructions}\n\n${run.context}`,
      maxOutputTokens: 16000,
      thinkingConfig: { thinkingLevel: GEMINI_THINKING[run.settings.thinking] },
      tools: run.settings.webSearch ? [{ googleSearch: {} }] : undefined,
      abortSignal: signal,
    },
  });
  let finish: string | undefined;
  const sources = new Map<string, string>();
  for await (const chunk of stream) {
    const candidate = chunk.candidates?.[0];
    const text = candidate?.content?.parts
      ?.filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("");
    if (text) send(text);
    for (const g of candidate?.groundingMetadata?.groundingChunks ?? []) {
      if (g.web?.uri && /^https:\/\//.test(g.web.uri)) sources.set(g.web.uri, g.web.title || g.web.domain || "source");
    }
    finish = candidate?.finishReason ?? finish;
  }
  if (sources.size > 0) {
    const links = [...sources].slice(0, 8).map(([uri, title]) => `- [${title.replace(/[[\]]/g, "")}](${uri})`);
    send(`\n\n**Sources consultées**\n${links.join("\n")}`);
  }
  if (finish === "MAX_TOKENS") send("\n\n_(Réponse coupée : trop longue.)_");
  else if (finish && finish !== "STOP") send("\n\n_Je ne peux pas répondre à cette demande._");
}

function errorText(err: unknown, run: Run): string {
  if (err instanceof Anthropic.AuthenticationError) return "La clé API Anthropic est refusée : vérifie ANTHROPIC_API_KEY dans le fichier .env.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Cette clé API Anthropic n'a pas accès au modèle.";
  if (err instanceof Anthropic.NotFoundError) return `Modèle Claude introuvable (${run.model}) : choisis-en un autre dans les paramètres.`;
  if (err instanceof Anthropic.RateLimitError) return "Trop de demandes pour le moment, réessaie dans une minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Impossible de joindre Anthropic : vérifie la connexion internet.";
  if (err instanceof Anthropic.APIError) return `Erreur du service Anthropic (${err.status ?? "?"}). Réessaie plus tard.`;
  if (err instanceof GeminiApiError) {
    if (err.status === 400 && /api.?key/i.test(err.message)) return "La clé API Gemini est refusée : vérifie GEMINI_API_KEY dans le fichier .env.";
    if (err.status === 400 && /search|grounding|tool/i.test(err.message))
      return "La recherche web n'est pas disponible avec ce modèle : désactive-la dans les paramètres.";
    if (err.status === 402) return "Crédit Gemini épuisé : recharge le projet Google dans AI Studio (https://ai.studio/projects → Facturation).";
    if (err.status === 403) {
      return process.env.GEMINI_VERTEX === "true"
        ? "Cette clé n'a pas accès à Vertex AI : active « Vertex AI API » dans le projet et autorise-la dans les restrictions de la clé."
        : "Cette clé Google n'a pas accès à l'API Gemini (« Generative Language API ») : vérifie ses restrictions dans la console Google Cloud.";
    }
    if (err.status === 404) return `Modèle Gemini introuvable (${run.model}) : choisis-en un autre dans les paramètres.`;
    if (err.status === 429) return "Quota Gemini atteint, réessaie dans une minute.";
    return `Erreur du service Gemini (${err.status}). Réessaie plus tard.`;
  }
  return "Erreur inattendue.";
}

// Settings and exactly what the assistant receives (shown in its settings panel).
export async function GET() {
  await requireAuth();
  const info = await loadAssistantInfo();
  return NextResponse.json({
    ...info,
    instructions: buildInstructions(info.settings, info.settings.webSearch),
    context: await buildAssistantContext(info.settings),
  });
}

export async function PUT(request: NextRequest) {
  await requireAuth();
  const parsed = assistantSettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Paramètres invalides" }, { status: 400 });
  }
  await saveAssistantSettings(parsed.data);
  return GET();
}

// Chat with the assistant: the conversation so far in, the answer streamed
// back as plain text.
export async function POST(request: NextRequest) {
  await requireAuth();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const run = await prepare();
  if (!run) return NextResponse.json({ error: "missing_key" }, { status: 503 });

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (text) => controller.enqueue(encoder.encode(text));
      try {
        const stream = run.provider === "gemini" ? streamGemini : streamClaude;
        await stream(run, parsed.data.messages, send, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("assistant:", err);
          send(`\n\n_${errorText(err, run)}_`);
        }
      }
      if (!abort.signal.aborted) controller.close();
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
