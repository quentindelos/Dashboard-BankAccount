// Values the physical assets. Gold: fine weight × the day's gold price (Yahoo
// Finance, gold in USD per troy ounce converted to EUR), one entry per day.
// Vehicles: a market estimate made by the assistant's model with a web search
// (current listings and price guides), redone every 30 days or on demand.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { prisma } from "@/lib/db";
import { loadAssistantInfo } from "@/lib/assistantSettings";
import { makeLookup, yahooChart } from "@/lib/trHistory";
import {
  VEHICLE_CONDITIONS,
  VEHICLE_KINDS,
  fineGrams,
  parseGoldDetails,
  parseVehicleDetails,
  vehicleTitle,
  type VehicleDetails,
  type VehicleEstimate,
} from "@/lib/physicalAssets";

export const GOLD_NOTE = "Cours de l'or";
export const VEHICLE_NOTE = "Cote estimée par l'IA";

const TROY_OUNCE_GRAMS = 31.1035;
const VEHICLE_REFRESH_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

/** Calendar day in Paris, as YYYY-MM-DD. */
const parisDay = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
const utcDay = (d: string) => new Date(`${d}T00:00:00.000Z`);

function daysFrom(from: string, to: string): string[] {
  const out: string[] = [];
  const d = utcDay(from);
  const end = utcDay(to);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------- gold

/** Price of one gram of gold in EUR, by day (last known close on or before it). */
async function goldEurPerGram(from: string): Promise<((day: string) => number | null) | null> {
  const [gold, fx] = await Promise.all([yahooChart("GC=F", from), yahooChart("EURUSD=X", from)]);
  if (!gold || !fx) return null;
  const usdPerOunce = makeLookup(gold.closes);
  const usdPerEur = makeLookup(fx.closes);
  return (day) => {
    const g = usdPerOunce(day);
    const r = usdPerEur(day);
    return g && r ? g / r / TROY_OUNCE_GRAMS : null;
  };
}

/** Writes one entry per day, from the purchase date (or the last entry) to today. */
export async function valueGold(accountId: string): Promise<{ grams: number; value: number } | null> {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  const details = parseGoldDetails(account?.details ?? null);
  if (!account || !details) return null;
  const grams = fineGrams(details);
  const today = parisDay();
  if (grams <= 0) return { grams: 0, value: 0 };

  const last = await prisma.entry.findFirst({ where: { accountId, note: GOLD_NOTE }, orderBy: { date: "desc" } });
  const lastDay = last ? last.date.toISOString().slice(0, 10) : null;
  // Recompute from the purchase date when the description changed (no entry
  // yet), else only the days since the last one.
  const start = lastDay ?? (details.since && details.since < today ? details.since : today);
  const price = await goldEurPerGram(start);
  if (!price) throw new Error("Cours de l'or indisponible (Yahoo Finance injoignable ?)");

  const rows = daysFrom(start, today)
    .map((day) => ({ day, perGram: price(day) }))
    .filter((r): r is { day: string; perGram: number } => r.perGram !== null);
  await prisma.$transaction(
    rows.map((r) =>
      prisma.entry.upsert({
        where: { accountId_date: { accountId, date: utcDay(r.day) } },
        create: { accountId, date: utcDay(r.day), value: Number((grams * r.perGram).toFixed(2)), note: GOLD_NOTE },
        update: { value: Number((grams * r.perGram).toFixed(2)), note: GOLD_NOTE },
      }),
    ),
  );
  const latest = rows.at(-1);
  return { grams, value: latest ? Number((grams * latest.perGram).toFixed(2)) : 0 };
}

/** After the coins or bars change: forget the old valuation and rebuild it. */
export async function resetGold(accountId: string) {
  await prisma.entry.deleteMany({ where: { accountId, note: GOLD_NOTE } });
  return valueGold(accountId);
}

// ---------------------------------------------------------------- vehicles

function vehiclePrompt(v: VehicleDetails): string {
  return [
    "Tu estimes la valeur de marché actuelle, en France, d'un véhicule d'occasion vendu entre particuliers.",
    `Véhicule : ${VEHICLE_KINDS[v.kind].toLowerCase()} ${vehicleTitle(v)}, état ${VEHICLE_CONDITIONS[v.condition].toLowerCase()}.`,
    v.notes ? `Précisions du propriétaire : ${v.notes}` : "",
    "Cherche sur le web des annonces actuelles comparables (Leboncoin, La Centrale, AutoScout24, sites spécialisés youngtimers et collection) et les cotes publiées.",
    "Un véhicule ancien recherché (youngtimer, sportive, série limitée) peut prendre de la valeur : base-toi sur les prix réels du marché, pas sur une décote théorique. Ajuste selon le kilométrage et l'état.",
    'Réponds uniquement avec un objet JSON, sans texte autour : {"value": prix en euros, "low": bas de fourchette, "high": haut de fourchette, "summary": "2 ou 3 phrases : annonces et cotes retenues, tendance du marché", "sources": [{"title": "...", "url": "https://..."}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

function parseEstimate(text: string, extraSources: { title: string; url: string }[], model: string): VehicleEstimate {
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("L'IA n'a pas renvoyé d'estimation lisible. Réessaie dans un instant.");
  }
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("L'IA n'a pas trouvé de prix pour ce véhicule.");
  const low = Math.min(Number(raw.low) || value, value);
  const high = Math.max(Number(raw.high) || value, value);
  const listed = Array.isArray(raw.sources) ? (raw.sources as { title?: unknown; url?: unknown }[]) : [];
  const sources = [...listed.map((s) => ({ title: String(s.title ?? "source"), url: String(s.url ?? "") })), ...extraSources]
    .filter((s) => /^https:\/\//.test(s.url))
    .filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i)
    .slice(0, 8);
  return {
    date: new Date().toISOString(),
    value: Math.round(value),
    low: Math.round(low),
    high: Math.round(high),
    summary: String(raw.summary ?? "").slice(0, 1000),
    sources,
    model,
  };
}

async function askGemini(model: string, prompt: string): Promise<VehicleEstimate> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, vertexai: process.env.GEMINI_VERTEX === "true" });
  const res = await client.models.generateContent({
    model,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
  });
  const grounded = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .filter((g) => g.web?.uri)
    .map((g) => ({ title: g.web!.title || g.web!.domain || "source", url: g.web!.uri! }));
  return parseEstimate(res.text ?? "", grounded, model);
}

async function askClaude(model: string, prompt: string): Promise<VehicleEstimate> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  for (let round = 0; round < 4; round++) {
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages,
    });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseEstimate(text, [], model);
  }
  throw new Error("La recherche a pris trop de temps. Réessaie dans un instant.");
}

const inFlight = new Map<string, Promise<VehicleEstimate>>();

/** Asks the assistant's model for the vehicle's market value and records it. */
export function estimateVehicle(accountId: string): Promise<VehicleEstimate> {
  const running = inFlight.get(accountId);
  if (running) return running;
  const job = (async () => {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    const details = parseVehicleDetails(account?.details ?? null);
    if (!account || !details) throw new Error("Remplis d'abord la fiche du véhicule.");
    const { provider, model } = await loadAssistantInfo();
    if (!provider || !model) throw new Error("Aucune clé d'IA configurée (voir la page Conseiller).");

    const prompt = vehiclePrompt(details);
    const estimate = provider === "claude" ? await askClaude(model, prompt) : await askGemini(model, prompt);
    const today = parisDay();
    await prisma.$transaction([
      prisma.account.update({ where: { id: accountId }, data: { details: JSON.stringify({ ...details, estimate }) } }),
      prisma.entry.upsert({
        where: { accountId_date: { accountId, date: utcDay(today) } },
        create: { accountId, date: utcDay(today), value: estimate.value, note: VEHICLE_NOTE },
        update: { value: estimate.value, note: VEHICLE_NOTE },
      }),
    ]);
    return estimate;
  })().finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, job);
  return job;
}

// ---------------------------------------------------------------- on visit

let lastRun = 0;

/**
 * Brings the physical assets up to date when a page opens: gold gets the
 * day's price (awaited, a few seconds at most), vehicles whose estimate is
 * older than 30 days get a new one in the background (shown on next visit).
 * Runs at most once an hour.
 */
export async function refreshValuations(): Promise<void> {
  if (Date.now() - lastRun < 3600 * 1000) return;
  lastRun = Date.now();
  const accounts = await prisma.account.findMany({ where: { archived: false, type: { in: ["OR", "VEHICULE"] } } });
  const today = parisDay();

  const gold = accounts
    .filter((a) => a.type === "OR")
    .map(async (a) => {
      const last = await prisma.entry.findFirst({ where: { accountId: a.id, note: GOLD_NOTE }, orderBy: { date: "desc" } });
      if (last?.date.toISOString().slice(0, 10) !== today) await valueGold(a.id);
    });
  const timeout = new Promise((resolve) => setTimeout(resolve, 8000));
  await Promise.race([Promise.allSettled(gold), timeout]);

  for (const a of accounts.filter((x) => x.type === "VEHICULE")) {
    const details = parseVehicleDetails(a.details);
    if (!details) continue;
    const age = details.estimate ? Date.now() - Date.parse(details.estimate.date) : Infinity;
    if (age > VEHICLE_REFRESH_DAYS * DAY_MS) {
      estimateVehicle(a.id).catch((err) => console.error(`[cote] ${a.name} :`, err instanceof Error ? err.message : err));
    }
  }
}
