import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { accountTypeValues, expenseSchema } from "@/lib/validation";

const importSchema = z.object({
  // v1 exports have no `positions` field; they are accepted for backward compatibility.
  exportFormatVersion: z.union([z.literal(1), z.literal(2)]),
  // Optional: older exports have no expenses/settings.
  expenses: z.array(expenseSchema.extend({ id: z.string().min(1).max(50) })).default([]),
  settings: z.record(z.string(), z.string()).default({}),
  accounts: z.array(
    z.object({
      id: z.string().min(1).max(50),
      name: z.string().min(1).max(100),
      type: z.enum(accountTypeValues),
      institution: z.string().max(100).nullable().optional(),
      note: z.string().max(500).nullable().optional(),
      archived: z.boolean().optional(),
      emergencyFund: z.boolean().optional(),
      contributions: z.number().finite().nullable().optional(),
      details: z.string().max(20000).nullable().optional(),
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

const utcDay = (v: string) => {
  const day = new Date(v);
  day.setUTCHours(0, 0, 0, 0);
  return day;
};

function chunks<T>(items: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

  const { accounts, expenses, settings } = parsed.data;
  let entriesImported = 0;
  let positionsImported = 0;
  let latest = 0;

  // Everything in one transaction: on a Raspberry Pi's SD card, thousands of
  // separate writes (one per daily statement) take minutes; one commit takes
  // seconds. Same merge semantics as before: rows with the same key are
  // replaced, nothing else is deleted.
  await prisma.$transaction(
    async (tx) => {
      for (const acc of accounts) {
        const fields = {
          name: acc.name,
          type: acc.type,
          institution: acc.institution || null,
          note: acc.note || null,
          archived: acc.archived ?? false,
          emergencyFund: acc.emergencyFund ?? false,
          ...(acc.details !== undefined && { details: acc.details }),
        };
        await tx.account.upsert({
          where: { id: acc.id },
          create: { id: acc.id, ...fields, contributions: acc.contributions ?? null },
          update: { ...fields, ...(acc.contributions !== undefined && { contributions: acc.contributions }) },
        });

        // Entries: one per (account, day), the last one in the file wins.
        const byDay = new Map<number, (typeof acc.entries)[number]>();
        for (const entry of acc.entries) byDay.set(utcDay(entry.date).getTime(), entry);
        const days = [...byDay.keys()];
        for (const part of chunks(days)) {
          await tx.entry.deleteMany({ where: { accountId: acc.id, date: { in: part.map((t) => new Date(t)) } } });
        }
        const entryRows = [...byDay].map(([t, e]) => ({
          accountId: acc.id,
          date: new Date(t),
          value: e.value,
          invested: e.invested ?? null,
          note: e.note || null,
        }));
        for (const part of chunks(entryRows)) await tx.entry.createMany({ data: part });
        entriesImported += entryRows.length;
        // A loop, not Math.max(...days): spreading a very long history overflows the stack.
        for (const t of days) if (t > latest) latest = t;

        // Positions: one per (account, day, name).
        const byKey = new Map<string, { t: number; p: (typeof acc.positions)[number] }>();
        for (const p of acc.positions) {
          const t = utcDay(p.date).getTime();
          byKey.set(`${t}|${p.name}`, { t, p });
        }
        const namesByDay = new Map<number, string[]>();
        for (const { t, p } of byKey.values()) namesByDay.set(t, [...(namesByDay.get(t) ?? []), p.name]);
        for (const [t, names] of namesByDay) {
          await tx.position.deleteMany({ where: { accountId: acc.id, date: new Date(t), name: { in: names } } });
        }
        const positionRows = [...byKey.values()].map(({ t, p }) => ({
          accountId: acc.id,
          date: new Date(t),
          name: p.name,
          isin: p.isin || null,
          quantity: p.quantity,
          price: p.price,
          value: p.value,
          costBasis: p.costBasis ?? null,
        }));
        for (const part of chunks(positionRows)) await tx.position.createMany({ data: part });
        positionsImported += positionRows.length;
      }

      const knownAccounts = new Set((await tx.account.findMany({ select: { id: true } })).map((a) => a.id));
      for (const { id, ...expense } of expenses) {
        const data = {
          ...expense,
          note: expense.note || null,
          active: expense.active ?? true,
          accountId: expense.accountId && knownAccounts.has(expense.accountId) ? expense.accountId : null,
        };
        await tx.recurringExpense.upsert({ where: { id }, create: { id, ...data }, update: data });
      }
      for (const [key, value] of Object.entries(settings)) {
        if (key !== "cushionMonths") continue; // only known keys
        await tx.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
      }
    },
    { timeout: 120000, maxWait: 10000 },
  );

  const accountsImported = accounts.length;
  return NextResponse.json({
    success: true,
    accountsImported,
    entriesImported,
    positionsImported,
    expensesImported: expenses.length,
    latestDate: latest ? new Date(latest).toISOString().slice(0, 10) : null,
  });
}
