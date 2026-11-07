import { z } from "zod";
import { EXPENSE_CATEGORIES, FREQUENCIES } from "@/lib/expenses";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "3 caractères minimum")
  .max(50, "50 caractères maximum")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Lettres, chiffres, '.', '_' et '-' uniquement");

export const passwordSchema = z
  .string()
  .min(12, "12 caractères minimum")
  .max(200, "200 caractères maximum");

export const totpTokenSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Code à 6 chiffres attendu");

export const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const accountTypeValues = ["ASSURANCE_VIE", "LIVRET", "CTO", "PEA", "PER", "EPARGNE_SALARIALE", "CRYPTO", "AUTRE"] as const;

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  type: z.enum(accountTypeValues),
  institution: z.string().trim().max(100).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional().or(z.literal("")),
  emergencyFund: z.boolean().optional(),
  contributions: z.number().finite().min(0).max(1_000_000_000).nullable().optional(),
});

export const settingsSchema = z.object({
  cushionMonths: z.number().int().min(1).max(24),
});

export const expenseSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  amount: z.number().finite().min(0, "Montant invalide").max(1_000_000),
  category: z.enum(EXPENSE_CATEGORIES),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  frequency: z.enum(FREQUENCIES),
  startMonth: z.number().int().min(1).max(12),
  active: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  accountId: z.string().min(1).max(50).nullable().optional(),
  inCushion: z.boolean().optional(),
});

export const entrySchema = z.object({
  accountId: z.string().min(1),
  date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide"),
  value: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
