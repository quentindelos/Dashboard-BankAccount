import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { readSpreadsheet } from "@/lib/spreadsheet";
import { buildTrHistory, type TrBucket } from "@/lib/trHistory";
import { isTradeRepublic } from "@/lib/accountTypes";

const MAX_BYTES = 10 * 1024 * 1024;

const ACCOUNT_FOR: Record<TrBucket, { type: string; name: string }> = {
  PEA: { type: "PEA", name: "PEA" },
  CTO: { type: "CTO", name: "CTO" },
  CRYPTO: { type: "CRYPTO", name: "Crypto" },
};

const utcDay = (d: string) => new Date(`${d}T00:00:00.000Z`);

// Full history import from Trade Republic's "Exportation des transactions"
// (.xlsx or .csv). Rebuilds the daily value of the PEA, CTO and crypto
// accounts and REPLACES their existing entries and positions.
export async function POST(request: NextRequest) {
  await requireAuth();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Fichier trop volumineux (10 Mo max)." }, { status: 400 });

  let history;
  try {
    const rows = readSpreadsheet(Buffer.from(await file.arrayBuffer()));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
    history = await buildTrHistory(rows, new Date(`${today}T12:00:00Z`));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fichier illisible." }, { status: 400 });
  }

  const summary: { account: string; from: string; days: number; value: number; positions: number }[] = [];

  for (const acc of history.accounts) {
    const target = ACCOUNT_FOR[acc.bucket];
    const candidates = await prisma.account.findMany({ where: { type: target.type, archived: false }, orderBy: { createdAt: "asc" } });
    let account = candidates.find((a) => isTradeRepublic(a.institution)) ?? candidates[0];
    if (!account) {
      account = await prisma.account.create({ data: { name: target.name, type: target.type, institution: "Trade Republic" } });
    }
    const accountId = account.id;

    await prisma.$transaction(
      async (tx) => {
        await tx.entry.deleteMany({ where: { accountId } });
        await tx.position.deleteMany({ where: { accountId } });
        await tx.entry.createMany({
          data: acc.entries.map((e) => ({ accountId, date: utcDay(e.date), value: e.value, note: "Import Trade Republic" })),
        });
        await tx.position.createMany({
          data: acc.snapshots.flatMap((s) => s.positions.map((p) => ({ accountId, date: utcDay(s.date), ...p }))),
        });
      },
      { timeout: 60000 },
    );

    summary.push({
      account: account.name,
      from: acc.entries[0]?.date ?? history.firstDate,
      days: acc.entries.length,
      value: acc.entries.at(-1)?.value ?? 0,
      positions: acc.snapshots.at(-1)?.positions.length ?? 0,
    });
  }

  return NextResponse.json({ success: true, transactions: history.transactions, accounts: summary, unpriced: history.unpriced });
}
