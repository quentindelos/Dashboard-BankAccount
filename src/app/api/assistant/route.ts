import Anthropic from "@anthropic-ai/sdk";
import { ApiError as GeminiApiError, GoogleGenAI } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { buildAssistantContext } from "@/lib/assistantContext";
import { RESET_MARKER, assistantProvider, type ChatMessage } from "@/lib/assistantShared";

export const dynamic = "force-dynamic";

const CLAUDE_MODEL = "claude-opus-5-5";
const GEMINI_MODEL = "gemini-3.8-flash";

const INSTRUCTIONS = `Tu es le conseiller patrimonial personnel de l'utilisateur, intégré à son tableau de bord. Tu tutoies, en français.

Tu reçois plus bas un instantané de sa situation du jour : comptes, positions avec prix de revient, plus-values, répartition, budget mensuel, évolution et hypothèses de projection. Appuie chaque réponse sur ces chiffres : cite les montants, les comptes et les lignes concernés, fais les calculs. Donne des actions concrètes (quoi, combien, sur quel compte, quand) plutôt que des généralités, et explique brièvement pourquoi.

Tiens compte des règles françaises qui s'appliquent : plafonds et taux des livrets, PEA (plafond de versements, fiscalité avant et après 5 ans), CTO (prélèvement forfaitaire), assurance vie (avantages après 8 ans), Livret Jeune à clôturer à 25 ans, prélèvement à la source. Si une règle ou un taux a pu changer récemment, dis-le.

Si une donnée manque pour répondre (par exemple un objectif, un horizon, une date), dis ce qui manque et propose une réponse sous une hypothèse que tu annonces. N'invente jamais de montant absent de l'instantané. Quand une décision comporte un risque (concentration, crypto, horizon court), dis-le simplement.

Format : réponses courtes et lisibles. Paragraphes brefs, listes à puces, **gras** pour les chiffres clés. Pas de tableaux ni de titres de plus de 3 niveaux. Pas de formule de politesse ni de rappel générique en fin de réponse.`;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m.at(-1)?.role === "user", "Le dernier message doit être une question."),
});

type Send = (text: string) => void;

let anthropic: Anthropic | null = null;
let gemini: GoogleGenAI | null = null;

async function streamClaude(messages: ChatMessage[], context: string, send: Send, signal: AbortSignal) {
  anthropic ??= new Anthropic();
  const stream = anthropic.beta.messages.stream(
    {
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // On a safety decline, retry on the model Anthropic recommends.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: INSTRUCTIONS },
        // Cached: follow-up questions reuse the same snapshot.
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
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
}

async function streamGemini(messages: ChatMessage[], context: string, send: Send, signal: AbortSignal) {
  // GEMINI_VERTEX=true: Vertex AI on Google Cloud (billed to the Cloud billing
  // account) with a Vertex AI API key, instead of the AI Studio Gemini API.
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, vertexai: process.env.GEMINI_VERTEX === "true" });
  const stream = await gemini.models.generateContentStream({
    model: process.env.GEMINI_MODEL || GEMINI_MODEL,
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    config: { systemInstruction: `${INSTRUCTIONS}\n\n${context}`, maxOutputTokens: 16000, abortSignal: signal },
  });
  let finish: string | undefined;
  for await (const chunk of stream) {
    const text = chunk.candidates?.[0]?.content?.parts
      ?.filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("");
    if (text) send(text);
    finish = chunk.candidates?.[0]?.finishReason ?? finish;
  }
  if (finish === "MAX_TOKENS") send("\n\n_(Réponse coupée : trop longue.)_");
  else if (finish && finish !== "STOP") send("\n\n_Je ne peux pas répondre à cette demande._");
}

function errorText(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "La clé API Anthropic est refusée : vérifie ANTHROPIC_API_KEY dans le fichier .env.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Cette clé API Anthropic n'a pas accès au modèle.";
  if (err instanceof Anthropic.RateLimitError) return "Trop de demandes pour le moment, réessaie dans une minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Impossible de joindre Anthropic : vérifie la connexion internet.";
  if (err instanceof Anthropic.APIError) return `Erreur du service Anthropic (${err.status ?? "?"}). Réessaie plus tard.`;
  if (err instanceof GeminiApiError) {
    if (err.status === 400 && /api.?key/i.test(err.message)) return "La clé API Gemini est refusée : vérifie GEMINI_API_KEY dans le fichier .env.";
    if (err.status === 402) return "Crédit Gemini épuisé : recharge le projet Google dans AI Studio (https://ai.studio/projects → Facturation).";
    if (err.status === 403) {
      return process.env.GEMINI_VERTEX === "true"
        ? "Cette clé n'a pas accès à Vertex AI : active « Vertex AI API » dans le projet et autorise-la dans les restrictions de la clé."
        : "Cette clé Google n'a pas accès à l'API Gemini (« Generative Language API ») : vérifie ses restrictions dans la console Google Cloud.";
    }
    if (err.status === 404) return `Modèle Gemini introuvable (${process.env.GEMINI_MODEL || GEMINI_MODEL}).`;
    if (err.status === 429) return "Quota Gemini atteint, réessaie dans une minute.";
    return `Erreur du service Gemini (${err.status}). Réessaie plus tard.`;
  }
  return "Erreur inattendue.";
}

// Chat with the assistant: the conversation so far in, the answer streamed
// back as plain text.
export async function POST(request: NextRequest) {
  await requireAuth();

  const provider = assistantProvider(process.env);
  if (!provider) return NextResponse.json({ error: "missing_key" }, { status: 503 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }

  const context = await buildAssistantContext();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (text) => controller.enqueue(encoder.encode(text));
      try {
        const run = provider === "gemini" ? streamGemini : streamClaude;
        await run(parsed.data.messages, context, send, abort.signal);
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("assistant:", err);
          send(`\n\n_${errorText(err)}_`);
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
