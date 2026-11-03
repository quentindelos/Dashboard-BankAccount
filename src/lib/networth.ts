// Turns sparse, per-account manual valuation snapshots into a single
// forward-filled time series suitable for a stacked-area "net worth over
// time" chart: at every date where ANY account got a new entry, every other
// account contributes its last known value (carried forward) so the stack
// total is always a sensible "best known net worth as of that date".

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
  byAccount: Record<string, number>; // accountId -> forward-filled value
}

export function buildNetWorthSeries(accounts: AccountLike[], entries: EntryLike[]): NetWorthPoint[] {
  if (accounts.length === 0) return [];

  const byAccountEntries = new Map<string, EntryLike[]>();
  for (const account of accounts) byAccountEntries.set(account.id, []);
  for (const entry of entries) {
    byAccountEntries.get(entry.accountId)?.push(entry);
  }
  for (const list of byAccountEntries.values()) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  const allDates = Array.from(new Set(entries.map((e) => dayKey(e.date)))).sort();
  if (allDates.length === 0) return [];

  const pointers = new Map<string, number>();
  const lastValue = new Map<string, number>();
  for (const account of accounts) {
    pointers.set(account.id, 0);
  }

  const points: NetWorthPoint[] = [];

  for (const dateKey of allDates) {
    const dateMs = new Date(dateKey).getTime();

    for (const account of accounts) {
      const list = byAccountEntries.get(account.id) ?? [];
      let pointer = pointers.get(account.id) ?? 0;
      while (pointer < list.length && list[pointer].date.getTime() <= dateMs) {
        lastValue.set(account.id, list[pointer].value);
        pointer += 1;
      }
      pointers.set(account.id, pointer);
    }

    const byAccount: Record<string, number> = {};
    let total = 0;
    for (const account of accounts) {
      const value = lastValue.get(account.id) ?? 0;
      byAccount[account.id] = value;
      total += value;
    }

    points.push({ date: dateKey, total, byAccount });
  }

  return points;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
