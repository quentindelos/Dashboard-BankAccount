import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { ApiError as GeminiApiError, GoogleGenAI, ThinkingLevel, type Content, type Part, type Tool } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { buildAssistantContext } from "@/lib/assistantContext";
import { buildInstructions } from "@/lib/assistantPrompt";
import { assistantSettingsSchema, loadAssistantInfo, saveAssistantSettings } from "@/lib/assistantSettings";
import type { AssistantProvider, AssistantSettings, ChatMessage, StreamEvent } from "@/lib/assistantShared";
import { conversationTitle, createConversation, deleteConversation, getConversation, saveConversation } from "@/lib/assistantStore";
import { MEMORY_TOOLS, SEARCH_TOOL, runTool, type NoteKind, type ToolDefinition, type WebSearch } from "@/lib/assistantTools";

export const dynamic = "force-dynamic";

/** Messages of the conversation sent to the model, to bound the cost of long ones. */
const HISTORY = 40;
/** Tool rounds per answer: the model may save several memories, then answer. */
const MAX_ROUNDS = 6;

const bodySchema = z.object({
  conversationId: z.string().max(40).nullish(),
  message: z.string().trim().min(1, "Question vide.").max(8000),
});

interface Run {
  provider: AssistantProvider;
  model: string;
  settings: AssistantSettings;
  instructions: string;
  context: string;
}

const NOTE_ICON: Record<NoteKind, string> = { memory: "🧠", search: "🔎" };

/** Collects what the model says and does, and streams it to the browser. */
interface Turn {
  text: (v: string) => void;
  reset: () => void;
  note: (kind: NoteKind, text: string) => void;
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

async function runClaude(run: Run, history: ChatMessage[], turn: Turn, signal: AbortSignal) {
  anthropic ??= new Anthropic();
  const tools: BetaToolUnion[] = MEMORY_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  if (run.settings.webSearch) tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
  const messages: BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = anthropic.beta.messages.stream(
      {
        model: run.model,
        max_tokens: 16000,
        output_config: { effort: run.settings.thinking },
        // On a safety decline, retry on the model Anthropic recommends.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        tools,
        system: [
          { type: "text", text: run.instructions },
          // Cached: follow-up questions and tool rounds reuse the same snapshot.
          { type: "text", text: run.context, cache_control: { type: "ephemeral" } },
        ],
        messages,
      },
      { signal }
    );
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "fallback") turn.reset();
      else if (event.type === "content_block_delta" && event.delta.type === "text_delta") turn.text(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: final.content as BetaContentBlockParam[] });
      const results: BetaContentBlockParam[] = [];
      for (const block of final.content) {
        if (block.type !== "tool_use") continue;
        const out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>);
        if (out.note) turn.note(out.note.kind, out.note.text);
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result) });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    if (final.stop_reason === "pause_turn") {
      // A long server-side web search: let the model carry on.
      messages.push({ role: "assistant", content: final.content as BetaContentBlockParam[] });
      continue;
    }
    if (final.stop_reason === "refusal") turn.text("\n\n_Je ne peux pas répondre à cette demande._");
    else if (final.stop_reason === "max_tokens") turn.text("\n\n_(Réponse coupée : trop longue.)_");
    return;
  }
}

const GEMINI_THINKING = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const;

async function runGemini(run: Run, history: ChatMessage[], turn: Turn, signal: AbortSignal) {
  // GEMINI_VERTEX=true: Vertex AI on Google Cloud (billed to the Cloud billing
  // account) with a Vertex AI API key, instead of the AI Studio Gemini API.
  const client = (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, vertexai: process.env.GEMINI_VERTEX === "true" }));
  const sources = new Map<string, string>();

  // Web search as a tool the model calls when it needs it: Google Search
  // grounding on every request would slow down every answer by ~10 s.
  const search: WebSearch = async (query) => {
    const res = await client.models.generateContent({
      model: run.model,
      contents: query,
      config: {
        systemInstruction:
          "Réponds de façon factuelle et concise (10 lignes au plus) : chiffres exacts, dates d'entrée en vigueur, conditions. Privilégie les sources officielles françaises (service-public.fr, impots.gouv.fr, economie.gouv.fr, Banque de France, AMF).",
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        tools: [{ googleSearch: {} }],
        abortSignal: signal,
      },
    });
    const found: { title: string; uri: string }[] = [];
    for (const g of res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
      if (!g.web?.uri || !/^https:\/\//.test(g.web.uri)) continue;
      const title = g.web.title || g.web.domain || "source";
      sources.set(g.web.uri, title);
      found.push({ title, uri: g.web.uri });
    }
    return { summary: res.text ?? "", sources: found };
  };

  const declared: ToolDefinition[] = run.settings.webSearch ? [...MEMORY_TOOLS, SEARCH_TOOL] : MEMORY_TOOLS;
  const tools: Tool[] = [
    { functionDeclarations: declared.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) },
  ];
  const contents: Content[] = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  let finish: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await client.models.generateContentStream({
      model: run.model,
      contents,
      config: {
        systemInstruction: `${run.instructions}\n\n${run.context}`,
        maxOutputTokens: 16000,
        thinkingConfig: { thinkingLevel: GEMINI_THINKING[run.settings.thinking] },
        tools,
        abortSignal: signal,
      },
    });
    // Every part is kept as received (thought signatures included): the model
    // needs them back with the tool results.
    const parts: Part[] = [];
    for await (const chunk of stream) {
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) turn.text(part.text);
      }
      finish = candidate?.finishReason ?? finish;
    }
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length === 0) break;
    contents.push({ role: "model", parts });
    const responses: Part[] = [];
    for (const { functionCall } of calls) {
      if (functionCall!.name === SEARCH_TOOL.name) turn.note("search", `Recherche web : ${String(functionCall!.args?.requete ?? "")}`);
      const out = await runTool(functionCall!.name ?? "", (functionCall!.args ?? {}) as Record<string, unknown>, search);
      if (out.note) turn.note(out.note.kind, out.note.text);
      responses.push({ functionResponse: { id: functionCall!.id, name: functionCall!.name, response: out.result } });
    }
    contents.push({ role: "user", parts: responses });
  }

  if (sources.size > 0) {
    const links = [...sources].slice(0, 8).map(([uri, title]) => `- [${title.replace(/[[\]]/g, "")}](${uri})`);
    turn.text(`\n\n**Sources consultées**\n${links.join("\n")}`);
  }
  if (finish === "MAX_TOKENS") turn.text("\n\n_(Réponse coupée : trop longue.)_");
  else if (finish && finish !== "STOP") turn.text("\n\n_Je ne peux pas répondre à cette demande._");
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
    if (err.status === 400 && /search|grounding|tool|function/i.test(err.message))
      return "Ce modèle n'accepte pas les outils demandés : désactive la recherche web ou change de modèle dans les paramètres.";
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

// Ask a question in a conversation (a new one when no id is given). The answer
// streams back as newline-delimited JSON events (see StreamEvent), and the
// conversation is saved once the answer is complete.
export async function POST(request: NextRequest) {
  await requireAuth();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  const run = await prepare();
  if (!run) return NextResponse.json({ error: "missing_key" }, { status: 503 });

  const { message } = parsed.data;
  const conversation = parsed.data.conversationId
    ? await getConversation(parsed.data.conversationId)
    : await createConversation(conversationTitle(message)).then((c) => ({ id: c.id, title: c.title, messages: [] as ChatMessage[] }));
  if (!conversation) return NextResponse.json({ error: "Conversation introuvable." }, { status: 404 });
  const history: ChatMessage[] = [...conversation.messages, { role: "user", content: message }];

  const encoder = new TextEncoder();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      let answer = "";
      let afterTool = false;
      const notes: string[] = [];
      const turn: Turn = {
        text: (v) => {
          // Text after a tool call starts a new paragraph.
          if (afterTool && answer && !answer.endsWith("\n\n")) v = `\n\n${v.trimStart()}`;
          afterTool = false;
          answer += v;
          emit({ t: "text", v });
        },
        reset: () => {
          answer = "";
          emit({ t: "reset" });
        },
        note: (kind, text) => {
          afterTool = true;
          const v = `${NOTE_ICON[kind]} ${text}`;
          notes.push(v);
          emit({ t: "note", kind, v });
        },
      };

      emit({ t: "conversation", id: conversation.id, title: conversation.title });
      try {
        const runModel = run.provider === "gemini" ? runGemini : runClaude;
        await runModel(run, history.slice(-HISTORY), turn, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("assistant:", err);
          emit({ t: "error", v: errorText(err, run) });
        }
      }
      if (abort.signal.aborted && answer) answer += "\n\n_(Arrêté.)_";
      // Keep the question only with an answer: after an error it goes back in
      // the input box to be asked again.
      if (answer || notes.length) {
        history.push({ role: "assistant", content: answer, ...(notes.length ? { notes } : {}) });
        await saveConversation(conversation.id, history).catch((err) => console.error("assistant save:", err));
      } else if (conversation.messages.length === 0) {
        // Nothing answered in a new conversation: don't list it.
        await deleteConversation(conversation.id).catch(() => undefined);
      }
      if (!abort.signal.aborted) controller.close();
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
