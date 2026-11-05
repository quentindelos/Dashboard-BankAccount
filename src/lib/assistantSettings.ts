import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  DEFAULT_SETTINGS,
  DETAIL_LABEL,
  MODELS,
  RISK_LABEL,
  THINKING_LABEL,
  TMI_OPTIONS,
  assistantProvider,
  availableProviders,
  type AssistantProvider,
  type AssistantSettings,
} from "@/lib/assistantShared";

const KEY = "assistant";

const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

export const assistantSettingsSchema = z.object({
  provider: z.enum(["auto", "gemini", "claude"]),
  model: z.string().max(80).regex(/^[a-z0-9.\-]*$/, "Identifiant de modèle invalide"),
  thinking: z.enum(keys(THINKING_LABEL)),
  webSearch: z.boolean(),
  detail: z.enum(keys(DETAIL_LABEL)),
  risk: z.enum(keys(RISK_LABEL)),
  tmi: z
    .number()
    .refine((n) => (TMI_OPTIONS as readonly number[]).includes(n), "Tranche d'imposition invalide")
    .nullable(),
  horizon: z.string().max(500),
  goals: z.string().max(2000),
  profile: z.string().max(4000),
  instructions: z.string().max(4000),
});

/** Saved settings merged over the defaults (fields added later keep their default). */
export async function loadAssistantSettings(): Promise<AssistantSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  try {
    const parsed = assistantSettingsSchema.partial().safeParse(JSON.parse(row?.value ?? ""));
    if (parsed.success) return { ...DEFAULT_SETTINGS, ...parsed.data } as AssistantSettings;
  } catch {
    // nothing saved yet
  }
  return DEFAULT_SETTINGS;
}

export async function saveAssistantSettings(value: AssistantSettings): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
}

/** The model that answers: the saved choice when it belongs to the provider, else its default. */
export function resolveModel(provider: AssistantProvider, settings: AssistantSettings): string {
  if (settings.model.startsWith(provider)) return settings.model;
  if (provider === "gemini" && process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  return MODELS[provider][0].id;
}

/** What the chat page shows about the assistant. */
export async function loadAssistantInfo() {
  const settings = await loadAssistantSettings();
  const provider = assistantProvider(process.env, settings.provider);
  return {
    settings,
    providers: availableProviders(process.env),
    provider,
    model: provider ? resolveModel(provider, settings) : null,
    vertex: process.env.GEMINI_VERTEX === "true",
  };
}
