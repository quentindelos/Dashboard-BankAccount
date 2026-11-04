// Future value of each account under simple, editable assumptions: a fixed
// yearly return and a fixed monthly deposit, simulated month by month so that
// regulatory rules can apply (deposit ceilings, the Livret Jeune closing at
// 25 and moving to another livret). The "fourchette" shifts the return by ±
// one standard deviation of the account's volatility over the elapsed time
// (σ/√years), i.e. roughly the 16th-84th percentile.

import type { InstrumentMeta } from "@/lib/instruments";

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
  /** Rate suggested by the app (current livret rates, long-run market averages). */
  defaultRate?: number;
  /** Deposit ceiling: no more deposits once reached (interest can exceed it). */
  ceiling?: number;
  /** Livret Jeune: closes at the end of the year of the 25th birthday. */
  youth?: boolean;
  /** Where the balance goes when the account closes. */
  transferTo?: string;
  /** Safety cushion: once its value reaches this amount, its monthly deposit
   * goes to `overflowTo` instead. */
  cushionTarget?: number;
  overflowTo?: string;
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

// Rates as of November 2026 (Livret A / Bleu 1,7 % since 1 Aug 2026; Livret
// Jeune Crédit Mutuel mostly 3,5 %; long-run average returns for markets).
export const LIVRET_A_RATE = 0.017;
export const LIVRET_JEUNE_RATE = 0.035;
export const DEFAULT_INFLATION = 0.03;

export const DEFAULT_RATE: Record<string, number> = {
  LIVRET: LIVRET_A_RATE,
  // Multisupport mix: ~50 % equity funds, ~35 % fonds euros (2,3 % in 2025), the rest money market / bonds.
  ASSURANCE_VIE: 0.038,
  PER: 0.05,
  // Company savings plans are mostly diversified or equity funds.
  EPARGNE_SALARIALE: 0.05,
  PEA: 0.07,
  CTO: 0.07,
  CRYPTO: 0.05,
  AUTRE: 0.02,
};

export const DEFAULT_VOLATILITY: Record<string, number> = {
  LIVRET: 0,
  ASSURANCE_VIE: 0.08,
  PER: 0.12,
  EPARGNE_SALARIALE: 0.12,
  PEA: 0.18,
  CTO: 0.18,
  CRYPTO: 0.6,
  AUTRE: 0.1,
};

export const CEILINGS: Record<string, number> = {
  LIVRET: 22_950, // Livret A / Livret Bleu
  PEA: 150_000,
};
export const LIVRET_JEUNE_CEILING = 1_600;

// Long-run average yearly returns (nominal, dividends reinvested, before tax).
const REGION_RETURN: Record<string, number> = {
  amerique_nord: 0.08,
  europe: 0.065,
  japon: 0.055,
  pacifique: 0.06,
  emergents: 0.06,
};
const CLASS_RETURN: Record<string, number> = { actions: 0.07, or: 0.04, crypto: 0.05, liquidites: 0.03, fonds_euros: 0.023 };

/** Expected yearly return of one instrument, or null when it isn't known. */
export function instrumentReturn(meta: InstrumentMeta | null): number | null {
  if (!meta) return null;
  if (meta.assetClass === "actions" && meta.regions) {
    const entries = Object.entries(meta.regions);
    const weight = entries.reduce((s, [, w]) => s + (w ?? 0), 0);
    if (weight > 0) return entries.reduce((s, [r, w]) => s + (w ?? 0) * (REGION_RETURN[r] ?? 0.07), 0) / weight;
  }
  return CLASS_RETURN[meta.assetClass] ?? null;
}

export const isYouthLivret = (a: { type: string; name: string }) => a.type === "LIVRET" && /jeune/i.test(a.name);

/** Months from `start` until the Livret Jeune closes on 31 December of `closeYear`. */
export function youthCloseMonths(closeYear: number, start: Date): number {
  return Math.max((closeYear - start.getUTCFullYear()) * 12 + 12 - start.getUTCMonth(), 0);
}

interface SimState {
  values: number[];
  paid: number;
}

/** Extra monthly deposit from a new job: `amount(m)` euros on account `to`,
 * `m` months after it starts on month `start` of the simulation. */
export interface ProjectionCareer {
  from: Date;
  to: string;
  amount: (m: number) => number;
}

interface SimOptions {
  inflation: number;
  closeAfter: number | null;
  career?: { start: number; to: string; amount: (m: number) => number };
  onMonth?: (k: number, s: SimState) => void;
}

/** Runs the accounts for `months` months, the yearly return of each shifted by shift(account). */
function simulate(
  accounts: ProjectionAccount[],
  months: number,
  shift: (a: ProjectionAccount) => number,
  { inflation, closeAfter, career, onMonth }: SimOptions
): SimState {
  const index = new Map(accounts.map((a, i) => [a.id, i]));
  const growth = accounts.map((a) => Math.pow(1 + Math.max(a.rate + shift(a), -0.99), 1 / 12));
  const values = accounts.map((a) => a.value);
  const principal = accounts.map((a) => a.value);
  const open = accounts.map(() => true);
  const monthlyInflation = Math.pow(1 + inflation, 1 / 12);
  let paid = accounts.reduce((s, a) => s + a.value, 0);
  let deflator = 1;
  const state = (): SimState => ({ values: values.map((v) => v / deflator), paid });
  onMonth?.(0, state());

  for (let k = 1; k <= months; k += 1) {
    deflator *= monthlyInflation;
    const extra = accounts.map(() => 0);
    accounts.forEach((a, i) => {
      if (!open[i]) return;
      values[i] *= growth[i];
      if (a.youth && closeAfter !== null && k >= closeAfter) {
        const j = a.transferTo ? index.get(a.transferTo) : undefined;
        if (j !== undefined) {
          values[j] += values[i];
          principal[j] += values[i];
        }
        // Without a destination the money stays put, earning the Livret A rate.
        else {
          growth[i] = Math.pow(1 + LIVRET_A_RATE + shift(a), 1 / 12);
          return;
        }
        values[i] = 0;
        open[i] = false;
        return;
      }
      let room = a.ceiling !== undefined ? Math.max(a.ceiling - principal[i], 0) : Infinity;
      // The target is in today's euros: it follows inflation, like the expenses it covers.
      if (a.cushionTarget !== undefined) room = Math.min(room, Math.max(a.cushionTarget * deflator - values[i], 0));
      const deposit = Math.min(a.monthly, room);
      values[i] += deposit;
      principal[i] += deposit;
      paid += deposit / deflator;
      const j = a.cushionTarget !== undefined && a.overflowTo ? index.get(a.overflowTo) : undefined;
      if (j !== undefined) extra[j] += a.monthly - deposit;
    });
    // New job: part of the raise invested on top of the current deposits.
    if (career && k > career.start) {
      const j = index.get(career.to);
      if (j !== undefined) extra[j] += career.amount(k - career.start - 1);
    }
    // Money no longer needed by a full cushion, invested elsewhere.
    accounts.forEach((a, i) => {
      if (!extra[i] || !open[i]) return;
      const room = a.ceiling !== undefined ? Math.max(a.ceiling - principal[i], 0) : Infinity;
      const deposit = Math.min(extra[i], room);
      values[i] += deposit;
      principal[i] += deposit;
      paid += deposit / deflator;
    });
    onMonth?.(k, state());
  }
  return state();
}

export function project(
  accounts: ProjectionAccount[],
  years: number,
  {
    inflation = 0,
    youthCloseYear = null,
    start = new Date(),
    career,
  }: { inflation?: number; youthCloseYear?: number | null; start?: Date; career?: ProjectionCareer } = {}
): ProjectionRow[] {
  const totalMonths = years * 12;
  const step = years <= 10 ? 1 : 3;
  const closeAfter = youthCloseYear !== null ? youthCloseMonths(youthCloseYear, start) : null;
  // Month k of the simulation is the month after start + k - 1; the first
  // payslip of the new job lands in its first month.
  const careerStart = career
    ? (career.from.getUTCFullYear() - start.getUTCFullYear()) * 12 + career.from.getUTCMonth() - start.getUTCMonth()
    : 0;
  const opts: SimOptions = {
    inflation,
    closeAfter,
    career: career ? { start: Math.max(careerStart, 0), to: career.to, amount: career.amount } : undefined,
  };
  const rows: ProjectionRow[] = [];

  simulate(accounts, totalMonths, () => 0, {
    ...opts,
    onMonth: (k, s) => {
      if (k % step !== 0) return;
      const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k, 1));
      const row: ProjectionRow = { t: date.getTime(), total: 0, low: 0, high: 0, band: [0, 0], paid: s.paid };
      accounts.forEach((a, i) => {
        row[`a_${a.id}`] = s.values[i];
        row.total += s.values[i];
      });
      // The range at month k comes from its own run with the return shifted by ±σ/√years.
      const spread = (a: ProjectionAccount) => a.volatility / Math.sqrt(Math.max(k / 12, 1));
      const sum = (st: SimState) => st.values.reduce((x, v) => x + v, 0);
      row.low = k === 0 ? row.total : sum(simulate(accounts, k, (a) => -spread(a), opts));
      row.high = k === 0 ? row.total : sum(simulate(accounts, k, (a) => spread(a), opts));
      row.band = [row.low, row.high];
      rows.push(row);
    },
  });
  return rows;
}
