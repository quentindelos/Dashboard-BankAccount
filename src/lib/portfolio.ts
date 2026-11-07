import { prisma } from "@/lib/db";
import { buildNetWorthSeries, type NetWorthPoint } from "@/lib/networth";
import { investedSeries } from "@/lib/invested";

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
  accounts: { id: string; name: string; type: string; institution: string | null; contributions: number | null; photo: string | null }[];
  series: NetWorthPoint[];
  total: number;
  /** Latest position snapshot of every account that has one. */
  holdings: HoldingRow[];
  otherAssets: OtherAssetRow[];
  /** Amount invested per account at each series date, for the accounts that
   * record it daily (Trade Republic import). accountId -> date -> amount. */
  investedAt: Record<string, Record<string, number>>;
}

export async function loadPortfolio(): Promise<PortfolioData> {
  const accounts = await prisma.account.findMany({
    // Vehicles are only followed on the Biens page: not part of the net worth.
    where: { archived: false, type: { not: "VEHICULE" } },
    include: { entries: { orderBy: { date: "asc" } }, positions: true },
    orderBy: { createdAt: "asc" },
  });

  const series = buildNetWorthSeries(
    accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    accounts.flatMap((a) => a.entries.map((e) => ({ accountId: a.id, date: e.date, value: e.value })))
  );
  const latest = series.at(-1);

  const investedAt: PortfolioData["investedAt"] = {};
  for (const a of accounts) {
    const invested = investedSeries(a.entries, a.positions);
    if (!invested || invested.some((v) => v === null)) continue;
    const list = a.entries.map((e, i) => ({ day: e.date.toISOString().slice(0, 10), invested: invested[i] ?? 0 }));
    const byDate: Record<string, number> = {};
    let i = -1;
    for (const p of series) {
      while (i + 1 < list.length && list[i + 1].day <= p.date) i += 1;
      byDate[p.date] = i >= 0 ? list[i].invested : 0;
    }
    investedAt[a.id] = byDate;
  }

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
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, institution: a.institution, contributions: a.contributions, photo: a.photo })),
    series,
    total: latest?.total ?? 0,
    holdings,
    otherAssets,
    investedAt,
  };
}
