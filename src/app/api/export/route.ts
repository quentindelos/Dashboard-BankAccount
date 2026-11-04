import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Full data export (accounts + their valuation history), used to carry your
// history over when you spin up a new instance (e.g. `git clone` + deploy
// on GCP later). Deliberately excludes the User row: credentials/2FA secret
// never leave the machine via export, you set those up fresh on each instance.
export async function GET() {
  await requireAuth();

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      entries: { orderBy: { date: "asc" } },
      positions: { orderBy: { date: "asc" } },
    },
  });

  const [expenses, settings] = await Promise.all([
    prisma.recurringExpense.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.setting.findMany(),
  ]);

  const payload = {
    exportFormatVersion: 2,
    expenses: expenses.map((e) => ({
      id: e.id,
      name: e.name,
      amount: e.amount,
      category: e.category,
      dayOfMonth: e.dayOfMonth,
      frequency: e.frequency,
      startMonth: e.startMonth,
      active: e.active,
      note: e.note,
      accountId: e.accountId,
    })),
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      note: a.note,
      archived: a.archived,
      emergencyFund: a.emergencyFund,
      contributions: a.contributions,
      entries: a.entries.map((e) => ({ date: e.date.toISOString(), value: e.value, invested: e.invested, note: e.note })),
      positions: a.positions.map((p) => ({
        date: p.date.toISOString(),
        name: p.name,
        isin: p.isin,
        quantity: p.quantity,
        price: p.price,
        value: p.value,
        costBasis: p.costBasis,
      })),
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="patrimoine-export-${payload.exportedAt.slice(0, 10)}.json"`,
    },
  });
}
