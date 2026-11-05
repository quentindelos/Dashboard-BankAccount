"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 2 });
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

/** Rows of a zoomed period [from, to], with the value known at `from` so the
 * line starts at the left edge. */
export function sliceWindow(rows: TimeRow[], from: number, to: number): TimeRow[] {
  const inside = rows.filter((r) => r.t >= from && r.t <= to);
  const before = rows.filter((r) => r.t < from).at(-1);
  return before ? [{ ...before, t: from }, ...inside] : inside;
}

export interface Zoom {
  from: number;
  to: number;
}

const zoomDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** "3 août 2025 → 2 oct. 2025" */
export function zoomLabel(zoom: Zoom): string {
  return `${zoomDate.format(zoom.from)} → ${zoomDate.format(zoom.to)}`;
}

/** Change between the first and last visible rows. When the amount invested
 * is known at both ends (investedKey), money paid in or taken out over the
 * period is removed, leaving only the gain or loss. */
export function periodChange(
  rows: TimeRow[],
  valueKeys: string[] = ["total"],
  investedKeys: string[] = []
): { change: number; pct: number | null } | null {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last || first === last) return null;
  const sum = (row: TimeRow, keys: string[]) => keys.reduce((s, k) => s + (row[k] ?? 0), 0);
  const start = sum(first, valueKeys);
  const flows = sum(last, investedKeys) - sum(first, investedKeys);
  const change = sum(last, valueKeys) - start - flows;
  const base = start + Math.max(flows, 0);
  return { change, pct: base > 0 ? change / base : null };
}

/** Extends the series to "today" so a flat end isn't mistaken for missing data. */
export function extendToToday(rows: TimeRow[], now = Date.now()): TimeRow[] {
  const last = rows.at(-1);
  if (!last) return rows;
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return today.getTime() > last.t ? [...rows, { ...last, t: today.getTime() }] : rows;
}

/** Rounds a raw step to 1, 2, 2.5 or 5 × 10^n so ticks land on round values. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Y axis fitted to the visible values (not anchored at 0), so variations
 * over the selected period stay readable. */
function valueAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = hi > lo ? (hi - lo) * 0.1 : Math.max(Math.abs(hi) * 0.05, 1);
  lo -= pad;
  hi += pad;
  if (Math.min(...values) >= 0) lo = Math.max(0, lo);
  const step = niceStep((hi - lo) / 4);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { domain: [start, end], ticks };
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
  onZoom,
}: {
  rows: TimeRow[];
  /** When provided, draws one stacked area per series instead of the total. */
  stack?: StackSeries[];
  curve?: "linear" | "stepAfter";
  height?: number | `${number}%`;
  seriesLabel?: string;
  /** Enables zooming: drag across the chart to select a period. */
  onZoom?: (zoom: Zoom) => void;
}) {
  const chrome = useChartTheme();
  const colorOf = (c: string) => (c.startsWith("var(") ? chrome.series(c) : c);
  // Period being selected with the mouse: where the drag started and where it is now.
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);

  if (rows.length < 2) {
    return <p className="muted">Ajoute au moins deux relevés (à des dates différentes) pour voir l'évolution.</p>;
  }

  const min = rows[0].t;
  const max = rows[rows.length - 1].t;
  const spanDays = (max - min) / DAY;
  const tickFmt = (t: number) => (spanDays <= 120 ? shortDay.format(t) : monthYear.format(t));
  const keys = stack ? stack.map((s) => s.key) : ["total"];
  const yAxis = valueAxis(rows.flatMap((r) => keys.map((k) => r[k] ?? 0)));

  // Recharts gives the x value (timestamp) under the pointer as activeLabel.
  const at = (state: { activeLabel?: string | number } | null) => {
    const t = Number(state?.activeLabel);
    return Number.isFinite(t) ? t : null;
  };
  const endDrag = () => {
    if (drag && onZoom) {
      const from = Math.min(drag.a, drag.b);
      const to = Math.max(drag.a, drag.b);
      // Ignore a plain click, and keep at least two points in view.
      if (to - from >= DAY && rows.filter((r) => r.t >= from && r.t <= to).length >= 2) onZoom({ from, to });
    }
    setDrag(null);
  };

  return (
    <ResponsiveContainer width="100%" height={height} className={onZoom ? "chart-zoomable" : undefined}>
      <AreaChart
        data={rows}
        margin={{ top: 10, right: 6, left: 0, bottom: 0 }}
        onMouseDown={(state) => {
          const t = onZoom ? at(state) : null;
          if (t !== null) setDrag({ a: t, b: t });
        }}
        onMouseMove={(state) => {
          const t = drag ? at(state) : null;
          if (t !== null && drag && t !== drag.b) setDrag({ ...drag, b: t });
        }}
        onMouseUp={endDrag}
        onMouseLeave={() => setDrag(null)}
      >
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
          width={64}
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          allowDataOverflow
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
          // One independent line per series (not stacked: stacking made the
          // top series look like the biggest one).
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
        {drag && drag.a !== drag.b && (
          <ReferenceArea
            x1={Math.min(drag.a, drag.b)}
            x2={Math.max(drag.a, drag.b)}
            fill={chrome.line}
            fillOpacity={0.12}
            stroke={chrome.line}
            strokeOpacity={0.5}
            ifOverflow="hidden"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RangeTabs({
  value,
  onChange,
  zoom,
  onResetZoom,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
  /** A period selected on the chart: no preset is active while it is shown. */
  zoom?: Zoom | null;
  onResetZoom?: () => void;
}) {
  return (
    <div className="range-controls">
      {zoom && onResetZoom && (
        <span className="zoom-chip">
          <span className="zoom-label">{zoomLabel(zoom)}</span>
          <button type="button" className="zoom-reset" onClick={onResetZoom} aria-label="Annuler le zoom" title="Annuler le zoom">
            ×
          </button>
        </span>
      )}
      <div className="segmented" role="group" aria-label="Période">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={!zoom && value === r} onClick={() => onChange(r)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Hint under a zoomable chart. */
export function ZoomHint() {
  return <p className="muted chart-hint">Clique-glisse sur la courbe pour zoomer sur une période.</p>;
}
