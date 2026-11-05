// Shared by the assistant API route and the chat page (no server imports).

/** Sent in the answer stream when the model hands over to a fallback model:
 * the client drops what it has shown of this answer and starts again. */
export const RESET_MARKER = "\u0000RESET\u0000";

export type AssistantProvider = "gemini" | "claude";

export const PROVIDER_LABEL: Record<AssistantProvider, string> = {
  gemini: "Gemini (Google)",
  claude: "Claude (Anthropic)",
};

/** Providers whose API key is set, Gemini first. */
export function availableProviders(env: Record<string, string | undefined>): AssistantProvider[] {
  const list: AssistantProvider[] = [];
  if (env.GEMINI_API_KEY) list.push("gemini");
  if (env.ANTHROPIC_API_KEY) list.push("claude");
  return list;
}

/** Which AI answers: the preferred one if its key is set, else the first available. */
export function assistantProvider(
  env: Record<string, string | undefined>,
  preferred?: AssistantProvider | "auto"
): AssistantProvider | null {
  const list = availableProviders(env);
  if (preferred && preferred !== "auto" && list.includes(preferred)) return preferred;
  return list[0] ?? null;
}

export interface ModelOption {
  id: string;
  label: string;
  hint: string;
}

export const MODELS: Record<AssistantProvider, ModelOption[]> = {
  gemini: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", hint: "rapide et peu cher (par défaut)" },
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", hint: "version stable précédente" },
    { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", hint: "le plus expert, plus lent et ~4× plus cher" },
  ],
  claude: [
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "le plus expert (par défaut)" },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "bon équilibre coût / qualité" },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "rapide et peu cher" },
  ],
};

export function modelLabel(id: string): string {
  for (const list of Object.values(MODELS)) {
    const found = list.find((m) => m.id === id);
    if (found) return found.label;
  }
  return id;
}

export const THINKING_LABEL = { low: "Rapide", medium: "Équilibrée", high: "Approfondie" } as const;
export const DETAIL_LABEL = { short: "Concises", long: "Détaillées" } as const;
export const RISK_LABEL = { prudent: "Prudent", balanced: "Équilibré", dynamic: "Dynamique", aggressive: "Offensif" } as const;
export const TMI_OPTIONS = [0, 11, 30, 41, 45] as const;

export interface AssistantSettings {
  provider: AssistantProvider | "auto";
  /** Empty: the provider's default model. */
  model: string;
  thinking: keyof typeof THINKING_LABEL;
  webSearch: boolean;
  detail: keyof typeof DETAIL_LABEL;
  risk: keyof typeof RISK_LABEL;
  /** Marginal income tax rate in %, null when unknown (the assistant estimates it). */
  tmi: number | null;
  horizon: string;
  goals: string;
  profile: string;
  instructions: string;
}

export const DEFAULT_PROFILE = [
  "Alternant chez Thales, en Master Cloud Computing, Systèmes et Réseaux (Bac+5).",
  "Diplôme prévu en octobre 2027, puis embauche en CDI chez Thales envisagée.",
  "Atteint 25 ans en 2029 : le Livret Jeune doit être clôturé au plus tard le 31 décembre 2029.",
  "Comptes d'investissement chez Trade Republic (PEA, CTO, crypto), livrets au Crédit Mutuel, assurance vie à La Banque Postale.",
].join("\n");

export const DEFAULT_SETTINGS: AssistantSettings = {
  provider: "auto",
  model: "",
  thinking: "medium",
  webSearch: true,
  detail: "short",
  risk: "dynamic",
  tmi: null,
  horizon: "Long terme (plus de 10 ans) pour les placements, achat de la résidence principale possible après le CDI.",
  goals: "Faire croître mon patrimoine le plus efficacement possible en payant le moins d'impôts légalement.",
  profile: DEFAULT_PROFILE,
  instructions: "",
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
