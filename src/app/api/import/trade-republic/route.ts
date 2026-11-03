import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { accountTypeValues } from "@/lib/validation";

const positionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  isin: z.string().trim().max(32).nullable().optional(),
  quantity: z.number().finite(),
  price: z.number().finite(),
  value: z.number().finite(),
});

const accountSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(accountTypeValues),
  total: z.number().finite(),
  positions: z.array(positionSchema).default([]),
});

const importSchema = z.object({
  date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide"),
  accounts: z.array(accountSnapshotSchema).min(1),
});

// Daily/periodic snapshot import from an external broker (e.g. the
// tr_import.py script pulling Trade Republic's "net worth statement").
// For each named account: find-or-create it (matched by exact name on
// later runs), upsert the day's total as an Entry, and REPLACE that day's
// Position rows wholesale — a snapshot is a complete picture of the
// account's holdings on that date, not an incremental delta, so stale
// positions (e.g. something fully sold since the last import) must not
// linger from a previous run targeting the same date.
export async function POST(request: NextRequest) {
  await requireAuth();

  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Requête invalide" },
      { status: 400 }
    );
  }

  const day = new Date(parsed.data.date);
  day.setUTCHours(0, 0, 0, 0);

  const results: { account: string; positions: number }[] = [];

  for (const snapshot of parsed.data.accounts) {
    let account = await prisma.account.findFirst({ where: { name: snapshot.name } });
    if (!account) {
      account = await prisma.account.create({ data: { name: snapshot.name, type: snapshot.type } });
    }

    await prisma.entry.upsert({
      where: { accountId_date: { accountId: account.id, date: day } },
      create: { accountId: account.id, date: day, value: snapshot.total },
      update: { value: snapshot.total },
    });

    await prisma.position.deleteMany({ where: { accountId: account.id, date: day } });
    if (snapshot.positions.length > 0) {
      await prisma.position.createMany({
        data: snapshot.positions.map((p) => ({
          accountId: account!.id,
          date: day,
          name: p.name,
          isin: p.isin || null,
          quantity: p.quantity,
          price: p.price,
          value: p.value,
        })),
      });
    }

    results.push({ account: snapshot.name, positions: snapshot.positions.length });
  }

  return NextResponse.json({ success: true, date: parsed.data.date, results });
}
