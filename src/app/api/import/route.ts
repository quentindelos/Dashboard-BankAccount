import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { accountTypeValues, expenseSchema } from "@/lib/validation";

const importSchema = z.object({
  // v1 exports have no `positions` field — accepted for backward compatibility.
  exportFormatVersion: z.union([z.literal(1), z.literal(2)]),
  // Optional: older exports have no expenses/settings.
  expenses: z.array(expenseSchema.extend({ id: z.string().min(1) })).default([]),
  settings: z.record(z.string(), z.string()).default({}),
  accounts: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(100),
      type: z.enum(accountTypeValues),
      institution: z.string().max(100).nullable().optional(),
      note: z.string().max(500).nullable().optional(),
      archived: z.boolean().optional(),
      emergencyFund: z.boolean().optional(),
      contributions: z.number().finite().nullable().optional(),
      entries: z.array(
        z.object({
          date: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
          value: z.number().finite(),
          invested: z.number().finite().nullable().optional(),
          note: z.string().max(500).nullable().optional(),
        })
      ),
      positions: z
        .array(
          z.object({
            date: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
            name: z.string().min(1).max(200),
            isin: z.string().max(32).nullable().optional(),
            quantity: z.number().finite(),
            price: z.number().finite(),
            value: z.number().finite(),
            costBasis: z.number().finite().nullable().optional(),
          })
        )
        .default([]),
    })
  ),
});

// Import is a MERGE, never a wipe: accounts are upserted by their original
// id, entries are upserted by (account, date), and positions are upserted
// by (account, date, name). Nothing existing is deleted. This is the safe
// counterpart to /api/export for moving your history to a fresh instance
// (e.g. after cloning the repo onto a new box).
export async function POST(request: NextRequest) {
  await requireAuth();

  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Fichier d'import invalide : " + (parsed.error.issues[0]?.message ?? "format inattendu") },
      { status: 400 }
    );
  }

  let accountsImported = 0;
  let entriesImported = 0;
  let positionsImported = 0;

  for (const acc of parsed.data.accounts) {
    await prisma.account.upsert({
      where: { id: acc.id },
      create: {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        institution: acc.institution || null,
        note: acc.note || null,
        archived: acc.archived ?? false,
        emergencyFund: acc.emergencyFund ?? false,
        contributions: acc.contributions ?? null,
      },
      update: {
        name: acc.name,
        type: acc.type,
        institution: acc.institution || null,
        note: acc.note || null,
        archived: acc.archived ?? false,
        emergencyFund: acc.emergencyFund ?? false,
        ...(acc.contributions !== undefined && { contributions: acc.contributions }),
      },
    });
    accountsImported += 1;

    for (const entry of acc.entries) {
      const day = new Date(entry.date);
      day.setUTCHours(0, 0, 0, 0);
      await prisma.entry.upsert({
        where: { accountId_date: { accountId: acc.id, date: day } },
        create: { accountId: acc.id, date: day, value: entry.value, invested: entry.invested ?? null, note: entry.note || null },
        update: { value: entry.value, invested: entry.invested ?? null, note: entry.note || null },
      });
      entriesImported += 1;
    }

    for (const position of acc.positions) {
      const day = new Date(position.date);
      day.setUTCHours(0, 0, 0, 0);
      await prisma.position.upsert({
        where: { accountId_date_name: { accountId: acc.id, date: day, name: position.name } },
        create: {
          accountId: acc.id,
          date: day,
          name: position.name,
          isin: position.isin || null,
          quantity: position.quantity,
          price: position.price,
          value: position.value,
          costBasis: position.costBasis ?? null,
        },
        update: {
          isin: position.isin || null,
          quantity: position.quantity,
          price: position.price,
          value: position.value,
          costBasis: position.costBasis ?? null,
        },
      });
      positionsImported += 1;
    }
  }

  const knownAccounts = new Set((await prisma.account.findMany({ select: { id: true } })).map((a) => a.id));
  for (const { id, ...expense } of parsed.data.expenses) {
    const data = {
      ...expense,
      note: expense.note || null,
      active: expense.active ?? true,
      accountId: expense.accountId && knownAccounts.has(expense.accountId) ? expense.accountId : null,
    };
    await prisma.recurringExpense.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  for (const [key, value] of Object.entries(parsed.data.settings)) {
    if (key !== "cushionMonths") continue; // only known keys
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }

  return NextResponse.json({
    success: true,
    accountsImported,
    entriesImported,
    positionsImported,
    expensesImported: parsed.data.expenses.length,
  });
}
