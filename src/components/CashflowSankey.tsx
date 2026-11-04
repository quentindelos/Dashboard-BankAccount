"use client";

import { useState } from "react";
import { CATEGORY_GROUPS, categoryMeta, isIncome, isSavings, monthlyEquivalent, type ExpenseRow } from "@/lib/expenses";
import { eur0, formatPct } from "@/components/ui";

interface FlowNode {
  key: string;
  label: string;
  value: number; // per month
  color: string;
}

// Geometry, in viewBox units (the SVG scales to the card width).
const W = 1000;
const BAR = 8;
const CENTER_H = 300; // height of the middle bar = the larger of income / outflow
const GAP = 8;
const MIN_SLOT = 20; // room for one label line
const PAD_TOP = 34;
const PAD_BOTTOM = 10;

function aggregate(list: ExpenseRow[], keyOf: (e: ExpenseRow) => { key: string; label: string; color: string }): FlowNode[] {
  const map = new Map<string, FlowNode>();
  for (const e of list) {
    const k = keyOf(e);
    const node = map.get(k.key) ?? { ...k, value: 0 };
    node.value += monthlyEquivalent(e);
    map.set(k.key, node);
  }
  return [...map.values()].filter((n) => n.value > 0).sort((a, b) => b.value - a.value);
}

interface Placed extends FlowNode {
  y: number; // bar top
  h: number; // bar height
}

function placeColumn(nodes: FlowNode[], k: number, height: number): Placed[] {
  const slots = nodes.map((n) => {
    const h = Math.max(n.value * k, 1.5);
    return { n, h, slot: Math.max(h, MIN_SLOT) };
  });
  const total = slots.reduce((s, x) => s + x.slot, 0) + GAP * Math.max(slots.length - 1, 0);
  let y = PAD_TOP + (height - PAD_TOP - PAD_BOTTOM - total) / 2;
  return slots.map(({ n, h, slot }) => {
    const placed = { ...n, y: y + (slot - h) / 2, h };
    y += slot + GAP;
    return placed;
  });
}

function columnHeight(nodes: FlowNode[], k: number): number {
  return nodes.reduce((s, n) => s + Math.max(n.value * k, MIN_SLOT), 0) + GAP * Math.max(nodes.length - 1, 0);
}

function band(x1: number, y1: number, x2: number, y2: number, t: number): string {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2} L${x2},${y2 + t} C${mx},${y2 + t} ${mx},${y1 + t} ${x1},${y1 + t} Z`;
}

export default function CashflowSankey({ expenses, onAddIncome }: { expenses: ExpenseRow[]; onAddIncome: () => void }) {
  const [hover, setHover] = useState<string | null>(null);

  const active = expenses.filter((e) => e.active);
  const incomeList = active.filter(isIncome);
  const outList = active.filter((e) => !isIncome(e));

  // Income: one node per source (salary, CAF, partner…), same-name lines merged.
  const left = aggregate(incomeList, (e) => {
    const m = categoryMeta(e.category);
    return { key: `${e.name.trim().toLowerCase()}|${e.category}`, label: e.name.trim(), color: m.color };
  });
  const right = aggregate(outList, (e) => {
    const m = categoryMeta(e.category);
    const g = CATEGORY_GROUPS.find((x) => x.id === m.group)!;
    return { key: g.id, label: g.label, color: g.color };
  });

  const income = left.reduce((s, n) => s + n.value, 0);
  const outflow = right.reduce((s, n) => s + n.value, 0);
  const savings = outList.filter(isSavings).reduce((s, e) => s + monthlyEquivalent(e), 0);

  if (income > outflow) right.push({ key: "_rest", label: "Non affecté", value: income - outflow, color: "var(--baseline)" });
  if (outflow > income && income > 0) left.push({ key: "_deficit", label: "Déficit", value: outflow - income, color: "var(--critical)" });

  const header = (
    <div className="card-title">
      <h2>Cashflow</h2>
    </div>
  );

  if (income === 0) {
    return (
      <section className="card section">
        {header}
        <div className="empty-state" style={{ padding: "24px 0" }}>
          <p className="muted">Ajoute tes revenus (salaire, primes…) pour voir comment ils se répartissent entre charges et épargne.</p>
          <button className="btn btn-primary" type="button" onClick={onAddIncome}>
            + Ajouter un revenu
          </button>
        </div>
      </section>
    );
  }

  const total = Math.max(income, outflow);
  const k = CENTER_H / total;
  const height = Math.max(CENTER_H, columnHeight(left, k), columnHeight(right, k)) + PAD_TOP + PAD_BOTTOM;
  const L = placeColumn(left, k, height);
  const R = placeColumn(right, k, height);
  const cx = W / 2 - BAR / 2;
  const cTop = PAD_TOP + (height - PAD_TOP - PAD_BOTTOM - CENTER_H) / 2;

  const pct = (v: number) => formatPct(v / total, 1);
  const fmt = (v: number) => eur0.format(v);
  const linkOpacity = (key: string) => (hover === null ? 0.22 : hover === key ? 0.5 : 0.08);

  let cyLeft = cTop;
  let cyRight = cTop;

  return (
    <section className="card section">
      {header}

      <div className="cashflow-summary">
        <span>
          Revenus <strong>{fmt(income)}</strong>
        </span>
        <span>
          Sorties <strong>{fmt(outflow)}</strong>
        </span>
        <span>
          {income >= outflow ? "Reste" : "Manque"}{" "}
          <strong className={income >= outflow ? "pos" : "neg"}>{fmt(Math.abs(income - outflow))}</strong>
        </span>
        <span>
          Taux d'épargne <strong>{formatPct(savings / income, 0)}</strong>
        </span>
      </div>

      <div className="sankey-wrap">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="sankey"
          role="img"
          aria-label={`Cashflow : ${eur0.format(income)} de revenus, ${eur0.format(outflow)} de sorties`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Links: income -> budget */}
          {L.map((n) => {
            const t = n.value * k;
            const d = band(BAR, n.y, cx, cyLeft, t);
            cyLeft += t;
            return (
              <path key={`l-${n.key}`} d={d} fill={n.color} opacity={linkOpacity(n.key)} onMouseEnter={() => setHover(n.key)}>
                <title>{`${n.label} : ${fmt(n.value)}`}</title>
              </path>
            );
          })}
          {/* Links: budget -> spending */}
          {R.map((n) => {
            const t = n.value * k;
            const d = band(cx + BAR, cyRight, W - BAR, n.y, t);
            cyRight += t;
            return (
              <path key={`r-${n.key}`} d={d} fill={n.color} opacity={linkOpacity(n.key)} onMouseEnter={() => setHover(n.key)}>
                <title>{`${n.label} : ${fmt(n.value)} (${pct(n.value)})`}</title>
              </path>
            );
          })}

          {/* Middle bar */}
          <rect x={cx} y={cTop} width={BAR} height={CENTER_H} rx={3} fill="var(--accent)" />
          <text x={W / 2} y={cTop - 12} textAnchor="middle" className="sankey-label sankey-center">
            Budget · {fmt(total)}
          </text>

          {/* Nodes + labels */}
          {L.map((n) => (
            <g key={`ln-${n.key}`} onMouseEnter={() => setHover(n.key)}>
              <rect x={0} y={n.y} width={BAR} height={n.h} rx={3} fill={n.color} />
              <text x={BAR + 10} y={n.y + n.h / 2} dominantBaseline="middle" className="sankey-label">
                {n.label} <tspan className="sankey-value">{fmt(n.value)} ({pct(n.value)})</tspan>
              </text>
            </g>
          ))}
          {R.map((n) => (
            <g key={`rn-${n.key}`} onMouseEnter={() => setHover(n.key)}>
              <rect x={W - BAR} y={n.y} width={BAR} height={n.h} rx={3} fill={n.color} />
              <text x={W - BAR - 10} y={n.y + n.h / 2} dominantBaseline="middle" textAnchor="end" className="sankey-label">
                {n.label} <tspan className="sankey-value">{fmt(n.value)} ({pct(n.value)})</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
