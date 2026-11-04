import { z } from "zod";
import { prisma } from "@/lib/db";

const KEY = "projection";

export const projectionSettingsSchema = z.object({
  years: z.number().int().min(1).max(50).optional(),
  realTerms: z.boolean().optional(),
  overflowTo: z.string().max(64).nullable().optional(),
  career: z
    .object({
      start: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      gross: z.number().finite().min(0).max(1_000_000),
      raise: z.number().finite().min(-0.2).max(0.5),
      share: z.number().finite().min(0).max(1),
      to: z.string().max(64),
      stops: z.array(z.string().max(64)).max(50),
    })
    .nullable()
    .optional(),
  accounts: z.record(
    z.string().max(64),
    z.object({
      monthly: z.number().finite().min(0).max(1_000_000),
      rate: z.number().finite().min(-0.5).max(1),
    })
  ),
});

export type ProjectionSettings = z.infer<typeof projectionSettingsSchema>;

export async function loadProjectionSettings(): Promise<ProjectionSettings> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  try {
    const parsed = projectionSettingsSchema.safeParse(JSON.parse(row?.value ?? ""));
    if (parsed.success) return parsed.data;
  } catch {
    // no saved assumptions yet
  }
  return { accounts: {} };
}

export async function saveProjectionSettings(value: ProjectionSettings): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
}
