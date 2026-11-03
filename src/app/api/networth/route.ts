import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { buildNetWorthSeries } from "@/lib/networth";

export async function GET() {
  await requireAuth();

  const accounts = await prisma.account.findMany({
    where: { archived: false },
    include: { entries: true },
    orderBy: { createdAt: "asc" },
  });

  const entries = accounts.flatMap((a) => a.entries.map((e) => ({ accountId: a.id, date: e.date, value: e.value })));
  const series = buildNetWorthSeries(
    accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    entries
  );

  const latest = series.at(-1);
  const breakdown = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    value: latest?.byAccount[a.id] ?? 0,
  }));

  return NextResponse.json({
    series,
    breakdown,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    total: latest?.total ?? 0,
  });
}
