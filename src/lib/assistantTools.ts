// Tools the assistant can call while answering: its long-term memory about
// the user and, when enabled, a web search. Provider-neutral definitions (JSON
// Schema), run on the server.
import { addMemory, deleteMemory, updateMemory } from "@/lib/assistantStore";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

export type NoteKind = "memory" | "search";

export interface ToolOutcome {
  /** Sent back to the model. */
  result: Record<string, unknown>;
  /** Shown to the user under the answer. */
  note?: { kind: NoteKind; text: string };
}

/** Runs a web search and returns a factual summary with its sources. */
export type WebSearch = (query: string) => Promise<{ summary: string; sources: { title: string; uri: string }[] }>;

export const MEMORY_TOOLS: ToolDefinition[] = [
  {
    name: "memoriser",
    description:
      "Enregistre dans ta mémoire à long terme un fait durable appris de l'utilisateur (situation familiale ou fiscale, revenus, épargne salariale, projets, objectifs, préférences, décisions prises ou actions faites). Une info courte et autonome par appel, rédigée à la 3e personne avec la date si utile. Ne mémorise pas ce que l'instantané contient déjà ni ce qui est déjà en mémoire.",
    parameters: {
      type: "object",
      properties: { fait: { type: "string", description: "Le fait à retenir, en une phrase (500 caractères max)." } },
      required: ["fait"],
    },
  },
  {
    name: "modifier_memoire",
    description: "Remplace un élément de ta mémoire devenu inexact ou incomplet (par son numéro).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Numéro de l'élément en mémoire." },
        fait: { type: "string", description: "Le nouveau texte complet." },
      },
      required: ["id", "fait"],
    },
  },
  {
    name: "oublier",
    description: "Supprime un élément de ta mémoire qui n'est plus vrai ou que l'utilisateur te demande d'oublier.",
    parameters: {
      type: "object",
      properties: { id: { type: "integer", description: "Numéro de l'élément en mémoire." } },
      required: ["id"],
    },
  },
];

export const SEARCH_TOOL: ToolDefinition = {
  name: "recherche_web",
  description:
    "Cherche sur le web une information à jour : taux des livrets, plafonds et règles fiscales en vigueur, nouveautés législatives, frais ou caractéristiques d'un produit, cours. À utiliser seulement quand la réponse dépend d'un chiffre ou d'une règle qui a pu changer ; une requête précise par appel. Renvoie un résumé factuel et ses sources.",
  parameters: {
    type: "object",
    properties: { requete: { type: "string", description: "La question précise, en français, avec l'année si utile." } },
    required: ["requete"],
  },
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** A memory id from the model; -1 (no such row) when it isn't a valid integer. */
const int = (v: unknown) => {
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isSafeInteger(n) && n > 0 && n <= 2 ** 31 - 1 ? n : -1;
};

export async function runTool(name: string, args: Record<string, unknown>, search?: WebSearch): Promise<ToolOutcome> {
  try {
    if (name === "memoriser") {
      const fait = text(args.fait);
      if (!fait) return { result: { erreur: "fait vide" } };
      const m = await addMemory(fait);
      return { result: { ok: true, id: m.id }, note: { kind: "memory", text: `Mémorisé : ${m.content}` } };
    }
    if (name === "modifier_memoire") {
      const fait = text(args.fait);
      const m = fait ? await updateMemory(int(args.id), fait) : null;
      if (!m) return { result: { erreur: "élément introuvable ou texte vide" } };
      return { result: { ok: true }, note: { kind: "memory", text: `Mémoire mise à jour : ${m.content}` } };
    }
    if (name === "oublier") {
      const m = await deleteMemory(int(args.id));
      if (!m) return { result: { erreur: "élément introuvable" } };
      return { result: { ok: true }, note: { kind: "memory", text: `Oublié : ${m.content}` } };
    }
    if (name === "recherche_web" && search) {
      const requete = text(args.requete).slice(0, 300);
      if (!requete) return { result: { erreur: "requête vide" } };
      const found = await search(requete);
      // Its note is shown by the caller when the search starts.
      return { result: { resume: found.summary, sources: found.sources.map((s) => s.title) } };
    }
    return { result: { erreur: `outil inconnu : ${name}` } };
  } catch (err) {
    return { result: { erreur: err instanceof Error ? err.message : "échec" } };
  }
}
