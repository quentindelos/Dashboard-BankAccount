// Amount invested in an account at each of its entry dates, so that gains
// over a period can leave out the money paid in.
//
// Exact when the entry carries it (Trade Republic history import). Otherwise
// it is rebuilt from the position snapshots (cost = quantity × PRU), linearly
// interpolated between two snapshots; before the first snapshot the gain is
// taken as zero. Returns null when neither source is available.

interface EntryIn {
  date: Date;
  value: number;
  invested: number | null;
}

interface PositionIn {
  date: Date;
  quantity: number;
  costBasis: number | null;
}

export function investedSeries(entries: EntryIn[], positions: PositionIn[]): (number | null)[] | null {
  if (entries.length === 0) return null;
  if (entries.every((e) => e.invested !== null)) return entries.map((e) => e.invested);

  if (positions.length === 0 || positions.some((p) => p.costBasis === null)) return null;
  const byDate = new Map<number, number>();
  for (const p of positions) {
    const t = day(p.date);
    byDate.set(t, (byDate.get(t) ?? 0) + p.quantity * (p.costBasis ?? 0));
  }
  const snaps = Array.from(byDate, ([t, cost]) => ({ t, cost })).sort((a, b) => a.t - b.t);

  // Entries usually come sorted by date: the cursor then only moves forward.
  let i = 0;
  let lastT = -Infinity;
  return entries.map((e) => {
    if (e.invested !== null) return e.invested;
    const t = day(e.date);
    if (t < snaps[0].t) return e.value;
    if (t < lastT) i = 0;
    lastT = t;
    while (i + 1 < snaps.length && snaps[i + 1].t <= t) i += 1;
    const prev = snaps[i];
    const next = snaps[i + 1];
    if (!next || prev.t === t) return prev.cost;
    // Snapshots are taken every month-end the account holds something: a
    // longer gap means it was emptied in between, so nothing was invested.
    if (next.t - prev.t > 40 * DAY) {
      if (e.value < 1) return e.value;
      return t - prev.t <= next.t - t ? prev.cost : next.cost;
    }
    return prev.cost + ((next.cost - prev.cost) * (t - prev.t)) / (next.t - prev.t);
  });
}

const DAY = 86_400_000;

function day(d: Date): number {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.getTime();
}
