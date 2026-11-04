"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "@/lib/useChartTheme";

export interface TimeRow {
  t: number; // timestamp (ms)
  total: number;
  [key: string]: number;
}

export interface StackSeries {
  key: string;
  label: string;
  color: string; // CSS color or var(--token)
}

export type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1A" | "TOUT";
export const RANGES: RangeKey[] = ["1M", "3M", "6M", "YTD", "1A", "TOUT"];

const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const longDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" });

const DAY = 86_400_000;

/** Keeps the rows inside the range, prefixed by a synthetic row at the
 * range start carrying the last known values, so the line starts at the
 * left edge instead of at the first reading inside the range. */
export function sliceRange(rows: TimeRow[], range: RangeKey, now = Date.now()): TimeRow[] {
  if (rows.length === 0 || range === "TOUT") return rows;
  const end = Math.max(now, rows[rows.length - 1].t);
  let start: number;
  if (range === "YTD") start = Date.UTC(new Date(end).getUTCFullYear(), 0, 1);
  else {
    const days = { "1M": 30, "3M": 91, "6M": 182, "1A": 365 }[range];
    start = end - days * DAY;
  }
  const inside = rows.filter((r) => r.t >= start);
  const before = rows.filter((r) => r.t < start).at(-1);
  if (!before) return inside;
  return [{ ...before, t: start }, ...inside];
}

/** Extends the series to "today" so a flat end isn't mistaken for missing data. */
export function extendToToday(rows: TimeRow[], now = Date.now()): TimeRow[] {
  const last = rows.at(-1);
  if (!last) return rows;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return today.getTime() > last.t ? [...rows, { ...last, t: today.getTime() }] : rows;
}

function evenTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + i * step));
}

export default function TimeSeriesChart({
  rows,
  stack,
  curve = "linear",
  height = 300,
  seriesLabel = "Total",
}: {
  rows: TimeRow[];
  /** When provided, draws one stacked area per series instead of the total. */
  stack?: StackSeries[];
  curve?: "linear" | "stepAfter";
  height?: number | `${number}%`;
  seriesLabel?: string;
}) {
  const chrome = useChartTheme();
  const colorOf = (c: string) => (c.startsWith("var(") ? chrome.series(c) : c);

  if (rows.length < 2) {
    return <p className="muted">Ajoute au moins deux relevés (à des dates différentes) pour voir l'évolution.</p>;
  }

  const min = rows[0].t;
  const max = rows[rows.length - 1].t;
  const spanDays = (max - min) / DAY;
  const tickFmt = (t: number) => (spanDays <= 120 ? shortDay.format(t) : monthYear.format(t));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fill-total" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chrome.line} stopOpacity={0.32} />
            <stop offset="100%" stopColor={chrome.line2} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="stroke-total" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={chrome.line} />
            <stop offset="100%" stopColor={chrome.line2} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={chrome.gridline} vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[min, max]}
          ticks={evenTicks(min, max)}
          tickFormatter={tickFmt}
          stroke={chrome.baseline}
          tickLine={false}
          tick={{ fill: chrome.textMuted, fontSize: 12 }}
          tickMargin={8}
        />
        <YAxis
          stroke="transparent"
          tickLine={false}
          tick={{ fill: chrome.textMuted, fontSize: 12 }}
          tickFormatter={(v: number) => `${compact.format(v)} €`}
          width={58}
          domain={[0, "auto"]}
        />
        <Tooltip
          cursor={{ stroke: chrome.baseline, strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as TimeRow;
            return (
              <div className="chart-tooltip">
                <div className="tt-date">{longDate.format(row.t)}</div>
                <div className="tt-total">{eur2.format(row.total)}</div>
                {stack &&
                  stack
                    .filter((s) => (row[s.key] ?? 0) !== 0)
                    .sort((a, b) => (row[b.key] ?? 0) - (row[a.key] ?? 0))
                    .map((s) => (
                      <div className="tt-row" key={s.key}>
                        <span className="legend-item">
                          <span className="legend-dot" style={{ background: colorOf(s.color) }} />
                          {s.label}
                        </span>
                        <span className="num">{eur0.format(row[s.key])}</span>
                      </div>
                    ))}
                {!stack && seriesLabel !== "Total" && <div className="tt-row">{seriesLabel}</div>}
              </div>
            );
          }}
        />
        {stack ? (
          // One independent line per series, each starting from 0 (not stacked:
          // stacking made the top series look like the biggest one).
          stack.map((s) => (
            <Area
              key={s.key}
              type={curve}
              dataKey={s.key}
              stroke={colorOf(s.color)}
              strokeWidth={2}
              fill="none"
              isAnimationActive={false}
              activeDot={{ r: 4, fill: colorOf(s.color), stroke: chrome.surface, strokeWidth: 2 }}
            />
          ))
        ) : (
          <Area
            type={curve}
            dataKey="total"
            stroke="url(#stroke-total)"
            strokeWidth={2.5}
            fill="url(#fill-total)"
            isAnimationActive={false}
            activeDot={{ r: 5, fill: chrome.line2, stroke: chrome.surface, strokeWidth: 2 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Période">
      {RANGES.map((r) => (
        <button key={r} type="button" aria-pressed={value === r} onClick={() => onChange(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}
