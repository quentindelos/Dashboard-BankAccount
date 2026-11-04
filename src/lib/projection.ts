// Future value of each account under simple, editable assumptions: a fixed
// yearly return, a fixed monthly deposit, compounded monthly. The "fourchette"
// widens the return by ± one standard deviation of the account's volatility
// over the elapsed time (σ/√years), i.e. roughly the 16th-84th percentile.

export interface ProjectionAccount {
  id: string;
  name: string;
  type: string;
  color: string;
  value: number;
  /** Monthly deposit (EUR). */
  monthly: number;
  /** Expected yearly return (fraction, 0.06 = 6 %). */
  rate: number;
  /** Annualised volatility (fraction). */
  volatility: number;
}

export interface ProjectionRow {
  t: number;
  total: number;
  low: number;
  high: number;
  band: [number, number];
  paid: number;
  [key: string]: number | [number, number];
}

export const DEFAULT_RATE: Record<string, number> = {
  LIVRET: 0.015,
  ASSURANCE_VIE: 0.025,
  PER: 0.05,
  PEA: 0.06,
  CTO: 0.06,
  CRYPTO: 0.05,
  AUTRE: 0.02,
};

export const DEFAULT_VOLATILITY: Record<string, number> = {
  LIVRET: 0,
  ASSURANCE_VIE: 0.01,
  PER: 0.12,
  PEA: 0.18,
  CTO: 0.18,
  CRYPTO: 0.6,
  AUTRE: 0.1,
};

export const DEFAULT_INFLATION = 0.02;

export function futureValue(value: number, monthly: number, yearlyRate: number, months: number): number {
  const r = Math.max(yearlyRate, -0.99);
  const m = Math.pow(1 + r, 1 / 12) - 1;
  const growth = Math.pow(1 + m, months);
  return value * growth + (Math.abs(m) < 1e-12 ? monthly * months : (monthly * (growth - 1)) / m);
}

export function project(
  accounts: ProjectionAccount[],
  years: number,
  { inflation = 0, start = new Date() }: { inflation?: number; start?: Date } = {}
): ProjectionRow[] {
  const totalMonths = years * 12;
  const step = years <= 10 ? 1 : 3;
  const rows: ProjectionRow[] = [];
  for (let k = 0; k <= totalMonths; k += step) {
    const elapsed = k / 12;
    const deflate = Math.pow(1 + inflation, elapsed);
    const spread = (vol: number) => vol / Math.sqrt(Math.max(elapsed, 1));
    // Sum of the k monthly deposits, each expressed in today's euros.
    const q = Math.pow(1 + inflation, -1 / 12);
    const depositUnits = q === 1 ? k : (q * (1 - Math.pow(q, k))) / (1 - q);
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1));
    const row: ProjectionRow = { t: date.getTime(), total: 0, low: 0, high: 0, band: [0, 0], paid: 0 };
    for (const a of accounts) {
      const mid = futureValue(a.value, a.monthly, a.rate, k) / deflate;
      row[`a_${a.id}`] = mid;
      row.total += mid;
      row.low += futureValue(a.value, a.monthly, a.rate - spread(a.volatility), k) / deflate;
      row.high += futureValue(a.value, a.monthly, a.rate + spread(a.volatility), k) / deflate;
      row.paid += a.value + a.monthly * depositUnits;
    }
    row.band = [row.low, row.high];
    rows.push(row);
  }
  return rows;
}
