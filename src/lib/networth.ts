// Turns sparse, per-account manual valuation snapshots into a single time
// series for the "net worth over time" chart.
//
// Between two readings of the same account:
//  - cash accounts (livrets) keep their last value (a balance only moves
//    when money moves, so a step is the truth);
//  - market accounts (CTO, PEA, assurance vie, crypto...) are interpolated
//    linearly: carrying the old value forward for months and then dropping
//    on the day of the next reading would invent a crash that never happened.
// After an account's last reading its value is carried forward; before its
// first reading it contributes 0 (the account didn't exist yet).

export interface EntryLike {
  accountId: string;
  date: Date;
  value: number;
}

export interface AccountLike {
  id: string;
  name: string;
  type: string;
}

export interface NetWorthPoint {
  date: string; // ISO yyyy-mm-dd
  total: number;
  byAccount: Record<string, number>;
}

const STEP_TYPES = new Set(["LIVRET"]);

export function buildNetWorthSeries(accounts: AccountLike[], entries: EntryLike[]): NetWorthPoint[] {
  if (accounts.length === 0) return [];

  const readings = new Map<string, { t: number; value: number }[]>();
  for (const account of accounts) readings.set(account.id, []);
  for (const entry of entries) {
    readings.get(entry.accountId)?.push({ t: dayStart(entry.date), value: entry.value });
  }
  for (const list of readings.values()) list.sort((a, b) => a.t - b.t);

  const allDays = Array.from(new Set(entries.map((e) => dayStart(e.date)))).sort((a, b) => a - b);

  return allDays.map((t) => {
    const byAccount: Record<string, number> = {};
    let total = 0;
    for (const account of accounts) {
      const value = valueAt(readings.get(account.id) ?? [], t, STEP_TYPES.has(account.type));
      byAccount[account.id] = value;
      total += value;
    }
    return { date: new Date(t).toISOString().slice(0, 10), total, byAccount };
  });
}

function valueAt(list: { t: number; value: number }[], t: number, step: boolean): number {
  if (list.length === 0 || t < list[0].t) return 0;
  // index of the last reading at or before t
  let i = 0;
  while (i + 1 < list.length && list[i + 1].t <= t) i += 1;
  const prev = list[i];
  const next = list[i + 1];
  if (step || !next || prev.t === t) return prev.value;
  const ratio = (t - prev.t) / (next.t - prev.t);
  return prev.value + (next.value - prev.value) * ratio;
}

function dayStart(date: Date): number {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
