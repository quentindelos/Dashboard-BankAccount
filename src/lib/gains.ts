// Plus/moins-value per account and in total: what the account is worth minus
// what was put in. Accounts with positions use their purchase prices (PRU);
// the others (livrets, assurance vie) use the "total versé" entered by hand.
import type { PortfolioData } from "@/lib/portfolio";

export interface AccountGain {
  id: string;
  name: string;
  type: string;
  value: number;
  invested: number | null;
  gain: number | null;
  pct: number | null;
}

export interface GainSummary {
  accounts: AccountGain[];
  invested: number;
  gain: number;
  pct: number | null;
  /** Accounts holding money whose amount paid in is unknown. */
  missing: { id: string; name: string }[];
}

export function computeGains(data: PortfolioData): GainSummary {
  const latest = data.series.at(-1);
  // Livrets only earn their fixed interest: no plus/moins-value to track.
  const accounts: AccountGain[] = data.accounts.filter((a) => a.type !== "LIVRET").map((a) => {
    const value = latest?.byAccount[a.id] ?? 0;
    const holdings = data.holdings.filter((h) => h.accountId === a.id);
    let invested: number | null = null;
    let gain: number | null = null;
    if (holdings.length > 0 && holdings.every((h) => h.costBasis !== null)) {
      invested = holdings.reduce((s, h) => s + h.quantity * (h.costBasis ?? 0), 0);
      gain = holdings.reduce((s, h) => s + h.value, 0) - invested;
    } else if (a.contributions !== null) {
      invested = a.contributions;
      gain = value - a.contributions;
    }
    return { id: a.id, name: a.name, type: a.type, value, invested, gain, pct: invested ? (gain ?? 0) / invested : null };
  });

  const known = accounts.filter((a) => a.gain !== null);
  const invested = known.reduce((s, a) => s + (a.invested ?? 0), 0);
  const gain = known.reduce((s, a) => s + (a.gain ?? 0), 0);
  return {
    accounts: accounts.filter((a) => a.value !== 0 || a.gain !== null),
    invested,
    gain,
    pct: invested > 0 ? gain / invested : null,
    missing: accounts.filter((a) => a.gain === null && a.value > 0).map((a) => ({ id: a.id, name: a.name })),
  };
}
