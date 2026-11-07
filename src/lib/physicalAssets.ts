// Description of the physical assets (Account.details, JSON): what the app
// needs to value them. Gold is valued from its fine weight and the day's gold
// price; a vehicle from a market estimate (see valuations.ts).
import { z } from "zod";

// ---------------------------------------------------------------- gold

/** Fine gold per coin, in grams. Bars and other items are entered in grams. */
export const GOLD_ITEMS = {
  NAPOLEON_20F: { label: "Napoléon 20 francs", fineGrams: 5.806 },
  SUISSE_20F: { label: "20 francs suisse (Vreneli)", fineGrams: 5.806 },
  SOUVERAIN: { label: "Souverain", fineGrams: 7.322 },
  KRUGERRAND: { label: "Krugerrand (1 once)", fineGrams: 31.103 },
  MAPLE_LEAF: { label: "Maple Leaf (1 once)", fineGrams: 31.103 },
  PHILHARMONIQUE: { label: "Philharmonique (1 once)", fineGrams: 31.103 },
  PESO_50: { label: "50 pesos mexicains", fineGrams: 37.5 },
  LINGOT: { label: "Lingot ou lingotin (poids en grammes)", fineGrams: null },
} as const;

export type GoldItemKind = keyof typeof GOLD_ITEMS;

const goldItemSchema = z.object({
  kind: z.enum(Object.keys(GOLD_ITEMS) as [GoldItemKind, ...GoldItemKind[]]),
  /** Number of coins, or of bars of `grams` each. */
  count: z.number().int().min(1).max(100_000),
  /** Weight of one bar, in grams of fine gold (bars only). */
  grams: z.number().positive().max(1_000_000).optional(),
});

export const goldDetailsSchema = z.object({
  items: z.array(goldItemSchema).max(50),
  /** When the gold was bought: the history is valued from that day. */
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type GoldDetails = z.infer<typeof goldDetailsSchema>;

export function fineGrams(details: GoldDetails): number {
  return details.items.reduce((sum, item) => {
    const perUnit = GOLD_ITEMS[item.kind].fineGrams ?? item.grams ?? 0;
    return sum + perUnit * item.count;
  }, 0);
}

// ---------------------------------------------------------------- vehicles

export const VEHICLE_KINDS = { VOITURE: "Voiture", MOTO: "Moto", AUTRE: "Autre" } as const;
export const VEHICLE_CONDITIONS = { EXCELLENT: "Excellent", BON: "Bon", MOYEN: "Moyen", A_RESTAURER: "À restaurer" } as const;

const estimateSchema = z.object({
  date: z.string(),
  value: z.number(),
  low: z.number(),
  high: z.number(),
  summary: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  model: z.string(),
});

export const vehicleDetailsSchema = z.object({
  kind: z.enum(Object.keys(VEHICLE_KINDS) as [keyof typeof VEHICLE_KINDS, ...(keyof typeof VEHICLE_KINDS)[]]),
  make: z.string().trim().min(1, "Marque requise").max(60),
  model: z.string().trim().min(1, "Modèle requis").max(80),
  version: z.string().trim().max(120).optional(),
  year: z.number().int().min(1900).max(2100),
  mileage: z.number().int().min(0).max(5_000_000),
  condition: z.enum(Object.keys(VEHICLE_CONDITIONS) as [keyof typeof VEHICLE_CONDITIONS, ...(keyof typeof VEHICLE_CONDITIONS)[]]),
  notes: z.string().trim().max(1000).optional(),
  /** Last market estimate, written by the app (never sent by the browser). */
  estimate: estimateSchema.optional(),
});

export type VehicleDetails = z.infer<typeof vehicleDetailsSchema>;
export type VehicleEstimate = z.infer<typeof estimateSchema>;

/** "Peugeot 106 S16, 1998, 150 000 km" */
export function vehicleTitle(v: VehicleDetails): string {
  const km = new Intl.NumberFormat("fr-FR").format(v.mileage);
  return `${v.make} ${v.model}${v.version ? ` ${v.version}` : ""}, ${v.year}, ${km} km`;
}

/** Address of an account's photo; the file name in it changes with each new photo. */
export const photoUrl = (accountId: string, photo: string) => `/api/accounts/${accountId}/photo?v=${encodeURIComponent(photo)}`;

// ---------------------------------------------------------------- parsing

export function parseGoldDetails(raw: string | null): GoldDetails | null {
  if (!raw) return null;
  try {
    const parsed = goldDetailsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseVehicleDetails(raw: string | null): VehicleDetails | null {
  if (!raw) return null;
  try {
    const parsed = vehicleDetailsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
