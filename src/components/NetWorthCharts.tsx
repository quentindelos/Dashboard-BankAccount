"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ACCOUNT_TYPE_META, accountTypeLabel } from "@/lib/accountTypes";
import { chartChrome } from "@/lib/chartTheme";
import { useIsDark } from "@/lib/useIsDark";

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

interface SeriesRow {
  date: string;
  total: number;
  [type: string]: string | number;
}

export default function NetWorthCharts({
  total,
  previousTotal,
  accountCount,
  presentTypes,
  seriesByType,
  breakdown,
}: {
  total: number;
  previousTotal: number | null;
  accountCount: number;
  presentTypes: string[];
  seriesByType: SeriesRow[];
  breakdown: { type: string; value: number }[];
}) {
  const isDark = useIsDark();
  const chrome = chartChrome(isDark);
  const colorFor = (type: string) => (isDark ? ACCOUNT_TYPE_META[type]?.colorDark : ACCOUNT_TYPE_META[type]?.colorLight) ?? chrome.textMuted;

  const delta = previousTotal !== null ? total - previousTotal : null;
  const deltaPct = previousTotal ? (delta! / previousTotal) * 100 : null;

  return (
    <>
      <div className="grid grid-stats">
        <div className="card stat-tile">
          <span className="label">Patrimoine total</span>
          <span className="value">{currencyFmt.format(total)}</span>
        </div>
        <div className="card stat-tile">
          <span className="label">Variation (dernier relevé)</span>
          <span className="value" style={{ color: delta === null ? undefined : delta >= 0 ? "var(--success)" : "var(--critical)" }}>
            {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${currencyFmt.format(delta)}`}
            {deltaPct !== null && <span className="secondary" style={{ fontSize: 13, fontWeight: 400 }}> ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="label">Comptes suivis</span>
          <span className="value">{accountCount}</span>
        </div>
      </div>

      <div className="card">
        <h2>Évolution du patrimoine</h2>
        {seriesByType.length < 2 ? (
          <p className="muted">Ajoute au moins deux relevés (à des dates différentes) pour voir l'évolution.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={seriesByType} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  {presentTypes.map((type) => (
                    <linearGradient key={type} id={`fill-${type}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colorFor(type)} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colorFor(type)} stopOpacity={0.05} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke={chrome.gridline} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => dateFmt.format(new Date(d))}
                  stroke={chrome.baseline}
                  tick={{ fill: chrome.textMuted, fontSize: 12 }}
                  minTickGap={32}
                />
                <YAxis
                  stroke={chrome.baseline}
                  tick={{ fill: chrome.textMuted, fontSize: 12 }}
                  tickFormatter={(v) => currencyFmt.format(v).replace(",00", "")}
                  width={80}
                />
                <Tooltip
                  contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.border}`, borderRadius: 8, fontSize: 13 }}
                  labelFormatter={(d) => dateFmt.format(new Date(d))}
                  formatter={(value: number, name: string) => [currencyFmt.format(value), accountTypeLabel(name)]}
                  itemStyle={{ color: chrome.textSecondary }}
                  labelStyle={{ color: chrome.textSecondary, marginBottom: 4 }}
                />
                {presentTypes.map((type) => (
                  <Area
                    key={type}
                    type="monotone"
                    dataKey={type}
                    stackId="total"
                    stroke={colorFor(type)}
                    strokeWidth={2}
                    fill={`url(#fill-${type})`}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="legend">
              {presentTypes.map((type) => (
                <span key={type} className="legend-item">
                  <span className="legend-dot" style={{ background: colorFor(type) }} />
                  {accountTypeLabel(type)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Répartition actuelle</h2>
        {breakdown.length === 0 ? (
          <p className="muted">Aucune valeur enregistrée pour l'instant.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="value"
                  nameKey="type"
                  innerRadius={60}
                  outerRadius={100}
                  strokeWidth={2}
                  stroke={chrome.surface}
                >
                  {breakdown.map((d) => (
                    <Cell key={d.type} fill={colorFor(d.type)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.border}`, borderRadius: 8, fontSize: 13 }}
                  formatter={(value: number, name: string) => [currencyFmt.format(value), accountTypeLabel(name)]}
                  itemStyle={{ color: chrome.textSecondary }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, minWidth: 200 }}>
              {breakdown
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((d) => (
                  <div key={d.type} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--gridline)" }}>
                    <span className="legend-item" style={{ fontSize: 13 }}>
                      <span className="legend-dot" style={{ background: colorFor(d.type) }} />
                      {accountTypeLabel(d.type)}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {currencyFmt.format(d.value)} <span className="muted">({total ? ((d.value / total) * 100).toFixed(0) : 0}%)</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
