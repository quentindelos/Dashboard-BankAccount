import { prisma } from "@/lib/db";
import { buildNetWorthSeries, type NetWorthPoint } from "@/lib/networth";

export interface HoldingRow {
  accountId: string;
  accountName: string;
  accountType: string;
  date: string;
  name: string;
  isin: string | null;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
}

/** An account tracked only by its total value (no position detail). */
export interface OtherAssetRow {
  accountId: string;
  accountName: string;
  accountType: string;
  value: number;
  emergencyFund: boolean;
}

export interface PortfolioData {
  accounts: { id: string; name: string; type: string; institution: string | null; contributions: number | null }[];
  series: NetWorthPoint[];
  total: number;
  /** Latest position snapshot of every account that has one. */
  holdings: HoldingRow[];
  otherAssets: OtherAssetRow[];
}

export async function loadPortfolio(): Promise<PortfolioData> {
  const accounts = await prisma.account.findMany({
    where: { archived: false },
    include: { entries: true, positions: true },
    orderBy: { createdAt: "asc" },
  });

  const series = buildNetWorthSeries(
    accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    accounts.flatMap((a) => a.entries.map((e) => ({ accountId: a.id, date: e.date, value: e.value })))
  );
  const latest = series.at(-1);

  const holdings: HoldingRow[] = [];
  const otherAssets: OtherAssetRow[] = [];

  for (const a of accounts) {
    const lastDate = a.positions.reduce<number | null>((max, p) => Math.max(max ?? 0, p.date.getTime()), null);
    if (lastDate === null) {
      const value = latest?.byAccount[a.id] ?? 0;
      if (value !== 0 || a.emergencyFund) {
        otherAssets.push({ accountId: a.id, accountName: a.name, accountType: a.type, value, emergencyFund: a.emergencyFund });
      }
      continue;
    }
    for (const p of a.positions.filter((p) => p.date.getTime() === lastDate)) {
      holdings.push({
        accountId: a.id,
        accountName: a.name,
        accountType: a.type,
        date: p.date.toISOString().slice(0, 10),
        name: p.name,
        isin: p.isin,
        quantity: p.quantity,
        price: p.price,
        value: p.value,
        costBasis: p.costBasis,
      });
    }
  }

  holdings.sort((x, y) => y.value - x.value);

  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, institution: a.institution, contributions: a.contributions })),
    series,
    total: latest?.total ?? 0,
    holdings,
    otherAssets,
  };
}
