// Rebuilds the daily value of the Trade Republic accounts (PEA, CTO, crypto)
// from the "Exportation des transactions" file: holdings are replayed trade by
// trade, then valued with daily closing prices from Yahoo Finance (converted
// to EUR when quoted in another currency).
import type { SheetRow } from "@/lib/spreadsheet";

export type TrBucket = "PEA" | "CTO" | "CRYPTO";

interface Trade {
  day: string; // YYYY-MM-DD
  time: string;
  bucket: TrBucket;
  symbol: string; // ISIN, or BTC/ETH for crypto
  name: string;
  assetClass: string;
  type: string;
  qty: number; // signed
  price: number | null;
  amount: number; // cash amount (negative for a buy), fees excluded
  fee: number; // negative
}

export interface TrPosition {
  name: string;
  isin: string | null;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
}

export interface TrAccountHistory {
  bucket: TrBucket;
  entries: { date: string; value: number }[];
  /** Month-end snapshots plus the latest day. */
  snapshots: { date: string; positions: TrPosition[] }[];
}

export interface TrHistoryResult {
  accounts: TrAccountHistory[];
  firstDate: string;
  lastDate: string;
  transactions: number;
  /** Instruments valued at their last trade price (no market quote found). */
  unpriced: string[];
}

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return 0;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const bucketOf = (r: SheetRow): TrBucket => (r.account_type === "PEA" ? "PEA" : r.asset_class === "CRYPTO" ? "CRYPTO" : "CTO");

export function parseTrades(rows: SheetRow[]): { trades: Trade[]; peaCash: { day: string; delta: number }[] } {
  if (!rows.length || !("datetime" in rows[0]) || !("symbol" in rows[0]) || !("shares" in rows[0])) {
    throw new Error("Ce fichier ne ressemble pas à un export de transactions Trade Republic.");
  }
  const sorted = rows.filter((r) => r.datetime).sort((a, b) => (a.datetime < b.datetime ? -1 : 1));
  const trades: Trade[] = [];
  const peaCash: { day: string; delta: number }[] = [];
  for (const r of sorted) {
    const day = r.datetime.slice(0, 10);
    if (r.account_type === "PEA" && r.category === "CASH") {
      peaCash.push({ day, delta: num(r.amount) + num(r.fee) + num(r.tax) });
    }
    if ((r.category !== "TRADING" && r.category !== "DELIVERY") || !r.symbol) continue;
    const t: Trade = {
      day,
      time: r.datetime,
      bucket: bucketOf(r),
      symbol: r.symbol.trim(),
      name: r.name.trim(),
      assetClass: r.asset_class,
      type: r.type,
      qty: num(r.shares),
      price: r.price ? num(r.price) : null,
      amount: num(r.amount),
      fee: num(r.fee),
    };
    if (r.account_type === "PEA" && r.category === "TRADING") peaCash.push({ day, delta: t.amount + t.fee + num(r.tax) });
    trades.push(t);
  }
  // Deliveries that cancel out (an internal move: -x then +x of the same line) are noise.
  const net = new Map<string, number>();
  for (const t of trades) if (t.type !== "BUY" && t.type !== "SELL") net.set(`${t.bucket}|${t.symbol}|${t.day}`, (net.get(`${t.bucket}|${t.symbol}|${t.day}`) ?? 0) + t.qty);
  return {
    trades: trades.filter((t) => t.type === "BUY" || t.type === "SELL" || Math.abs(net.get(`${t.bucket}|${t.symbol}|${t.day}`) ?? 0) > 1e-9),
    peaCash,
  };
}

// ---------------------------------------------------------------- prices

const UA = { headers: { "User-Agent": "Mozilla/5.0 (patrimoine-dashboard)" } };

async function yahooChart(symbol: string, from: string): Promise<{ currency: string; closes: Map<string, number> } | null> {
  const p1 = Math.floor(Date.parse(from) / 1000) - 15 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${p2}`,
    { ...UA, signal: AbortSignal.timeout(15000) },
  ).catch(() => null);
  if (!res?.ok) return null;
  const json = await res.json().catch(() => null);
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp?.length) return null;
  const closes = new Map<string, number>();
  const values: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  r.timestamp.forEach((ts: number, i: number) => {
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) closes.set(new Date(ts * 1000).toISOString().slice(0, 10), v);
  });
  return closes.size ? { currency: r.meta?.currency ?? "EUR", closes } : null;
}

async function yahooSearch(isin: string): Promise<string[]> {
  const res = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=10&newsCount=0`, {
    ...UA,
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const json = await res.json().catch(() => null);
  return (json?.quotes ?? []).map((q: { symbol: string }) => q.symbol).filter(Boolean);
}

/** Last known value on or before `day`. `days` must be sorted ascending. */
function makeLookup(series: Map<string, number>) {
  const days = [...series.keys()].sort();
  return (day: string): number | null => {
    let lo = 0;
    let hi = days.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= day) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found >= 0 ? series.get(days[found])! : null;
  };
}

const FX_PAIRS: Record<string, { pair: string; divisor: number }> = {
  USD: { pair: "EURUSD=X", divisor: 1 },
  GBP: { pair: "EURGBP=X", divisor: 1 },
  GBp: { pair: "EURGBP=X", divisor: 100 },
  CHF: { pair: "EURCHF=X", divisor: 1 },
};

type PriceFn = (day: string) => number | null;

async function priceFunctions(trades: Trade[], from: string): Promise<{ prices: Map<string, PriceFn>; unpriced: string[] }> {
  const fxCache = new Map<string, PriceFn | null>();
  const fx = async (currency: string): Promise<PriceFn | null> => {
    if (currency === "EUR") return () => 1;
    const conf = FX_PAIRS[currency];
    if (!conf) return null;
    if (!fxCache.has(conf.pair)) {
      const c = await yahooChart(conf.pair, from);
      fxCache.set(conf.pair, c ? makeLookup(c.closes) : null);
    }
    const lookup = fxCache.get(conf.pair);
    if (!lookup) return null;
    return (day) => {
      const rate = lookup(day);
      return rate ? 1 / (rate * conf.divisor) : null; // EUR per unit of quote currency
    };
  };

  const symbols = [...new Set(trades.map((t) => t.symbol))];
  const prices = new Map<string, PriceFn>();
  const unpriced: string[] = [];

  for (const symbol of symbols) {
    const own = trades.filter((t) => t.symbol === symbol && t.price);
    const lastTrade = makeLookup(new Map(own.map((t) => [t.day, t.price!])));
    const firstPrice = own[0]?.price ?? 0;
    const isCrypto = own[0]?.assetClass === "CRYPTO" || /^[A-Z]{2,6}$/.test(symbol);
    const candidates = isCrypto ? [`${symbol}-EUR`] : await yahooSearch(symbol);

    let chosen: { lookup: PriceFn; currency: string } | null = null;
    let fallback: { lookup: PriceFn; currency: string } | null = null;
    for (const cand of candidates.slice(0, 6)) {
      const chart = await yahooChart(cand, from);
      if (!chart) continue;
      const toEur = await fx(chart.currency);
      if (!toEur) continue;
      const raw = makeLookup(chart.closes);
      const lookup: PriceFn = (day) => {
        const c = raw(day);
        const f = toEur(day);
        return c !== null && f !== null ? c * f : null;
      };
      if (chart.currency === "EUR") {
        chosen = { lookup, currency: "EUR" };
        break;
      }
      fallback ??= { lookup, currency: chart.currency };
    }
    chosen ??= fallback;

    if (!chosen) {
      unpriced.push(own[0]?.name ?? symbol);
      prices.set(symbol, (day) => lastTrade(day) ?? firstPrice);
      continue;
    }
    // Calibrate on the actual trade prices: catches a different share class /
    // ADR ratio. Small gaps (spread) are left alone.
    const ratios = own
      .map((t) => {
        const p = chosen!.lookup(t.day);
        return p ? t.price! / p : null;
      })
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    const k = ratios.length >= 3 ? ratios[Math.floor(ratios.length / 2)] : 1;
    const factor = Math.abs(k - 1) > 0.05 ? k : 1;
    const lookup = chosen.lookup;
    prices.set(symbol, (day) => {
      const p = lookup(day);
      return p !== null ? p * factor : (lastTrade(day) ?? firstPrice);
    });
  }
  return { prices, unpriced };
}

// ---------------------------------------------------------------- replay

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

interface Holding {
  qty: number;
  cost: number; // total cost of the shares held (EUR)
  name: string;
}

export async function buildTrHistory(rows: SheetRow[], today = new Date()): Promise<TrHistoryResult> {
  const { trades, peaCash } = parseTrades(rows);
  if (!trades.length) throw new Error("Aucun achat ni vente trouvé dans ce fichier.");
  const lastDate = today.toISOString().slice(0, 10);
  const firstDate = trades[0].day;
  const { prices, unpriced } = await priceFunctions(trades, firstDate);

  const accounts: TrAccountHistory[] = [];
  for (const bucket of ["PEA", "CTO", "CRYPTO"] as TrBucket[]) {
    const own = trades.filter((t) => t.bucket === bucket);
    if (!own.length) continue;
    const cashFlows = bucket === "PEA" ? peaCash : [];
    const start = [own[0].day, ...cashFlows.map((c) => c.day)].sort()[0];
    const holdings = new Map<string, Holding>();
    let cash = 0;
    let ti = 0;
    let ci = 0;
    const entries: TrAccountHistory["entries"] = [];
    const snapshots: TrAccountHistory["snapshots"] = [];
    const days = eachDay(start, lastDate);

    for (const day of days) {
      while (ci < cashFlows.length && cashFlows[ci].day <= day) cash += cashFlows[ci++].delta;
      while (ti < own.length && own[ti].day <= day) {
        const t = own[ti++];
        const h = holdings.get(t.symbol) ?? { qty: 0, cost: 0, name: t.name };
        h.name = t.name || h.name;
        if (t.type === "BUY") {
          // PRU as shown by Trade Republic: fees included in the PEA, not in the CTO.
          h.cost += -t.amount + (bucket === "PEA" ? -t.fee : 0);
          h.qty += t.qty;
        } else if (t.qty < 0) {
          const sold = Math.min(-t.qty, h.qty);
          if (h.qty > 0) h.cost -= (h.cost * sold) / h.qty;
          h.qty -= sold;
        } else {
          h.qty += t.qty; // shares received for free
        }
        if (h.qty < 1e-9) {
          h.qty = 0;
          h.cost = 0;
        }
        holdings.set(t.symbol, h);
      }

      let value = bucket === "PEA" ? cash : 0;
      const positions: TrPosition[] = [];
      for (const [symbol, h] of holdings) {
        if (h.qty <= 0) continue;
        const price = prices.get(symbol)?.(day) ?? 0;
        value += h.qty * price;
        positions.push({
          name: bucket === "CRYPTO" ? h.name || symbol : h.name,
          isin: bucket === "CRYPTO" ? null : symbol,
          quantity: Number(h.qty.toFixed(8)),
          price: Number(price.toFixed(4)),
          value: Number((h.qty * price).toFixed(2)),
          costBasis: h.qty > 0 && h.cost > 0 ? Number((h.cost / h.qty).toFixed(4)) : null,
        });
      }
      entries.push({ date: day, value: Number(value.toFixed(2)) });

      const next = new Date(`${day}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const monthEnd = next.getUTCDate() === 1;
      if ((monthEnd || day === lastDate) && positions.length) {
        snapshots.push({ date: day, positions: positions.sort((a, b) => b.value - a.value) });
      }
    }
    accounts.push({ bucket, entries, snapshots });
  }

  return { accounts, firstDate, lastDate, transactions: rows.length, unpriced };
}
