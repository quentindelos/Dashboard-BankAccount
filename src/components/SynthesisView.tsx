"use client";

import Link from "next/link";
import { useState } from "react";
import TimeSeriesChart, { RangeTabs, extendToToday, periodChange, sliceRange, type RangeKey, type TimeRow } from "@/components/TimeSeriesChart";
import { accountTypeCssVar, accountTypeLabel, accountTypeShort } from "@/lib/accountTypes";
import type { Advice, Cushion, Slice } from "@/lib/analysis";
import type { LogoKey } from "@/lib/logos";
import type { GainSummary } from "@/lib/gains";
import Logo from "@/components/Logo";
import { AdviceList, Allocation, Delta, RiskMeter, eur0, formatPct, riskLabel, signed } from "@/components/ui";

interface PositionCard {
  key: string;
  name: string;
  sub: string;
  accountType: string;
  logo: LogoKey | null;
  value: number;
  gain: number | null;
  gainPct: number | null;
  weight: number;
}


export default function SynthesisView({
  rows,
  accountSeries,
  investedAccounts,
  total,
  accounts,
  gains,
  invested,
  cushion,
  envelopes,
  positions,
  advice,
  riskLevel,
  volatility,
}: {
  rows: TimeRow[];
  accountSeries: { key: string; label: string; color: string }[];
  /** Accounts whose invested amount is known day by day. */
  investedAccounts: { id: string; name: string }[];
  total: number;
  accounts: { id: string; name: string; type: string; institution: string | null; logo: LogoKey | null; value: number }[];
  gains: GainSummary;
  invested: number;
  cushion: Cushion;
  envelopes: Slice[];
  positions: PositionCard[];
  advice: Advice[];
  riskLevel: number;
  volatility: number;
}) {
  const [range, setRange] = useState<RangeKey>("1A");
  const [mode, setMode] = useState<"total" | "stack">("total");

  const visible = sliceRange(extendToToday(rows), range);

  const stack = accountSeries;

  // Over a chosen period: gain of the accounts whose deposits are known
  // (deposits excluded), and the raw change of the whole net worth.
  const netChange = range === "TOUT" ? null : periodChange(visible);
  const investedGain =
    range === "TOUT" || investedAccounts.length === 0
      ? null
      : periodChange(
          visible,
          investedAccounts.map((a) => `a_${a.id}`),
          investedAccounts.map((a) => `i_${a.id}`)
        );

  const cushionPct = cushion.target ? Math.min(cushion.amount / cushion.target, 1) : null;

  return (
    <>
      <div className="grid grid-main">
        {/* ---- Net worth hero ---- */}
        <section className="card hero">
          <div className="hero-value">{eur0.format(total)}</div>
          {netChange ? (
            investedGain ? (
              <Delta value={investedGain.change} pct={investedGain.pct} />
            ) : (
              <Delta value={netChange.change} pct={netChange.pct} />
            )
          ) : gains.invested > 0 ? (
            <Delta value={gains.gain} pct={gains.pct} suffix={`de ${gains.gain >= 0 ? "plus" : "moins"}-value sur ${eur0.format(gains.invested)} investis`} />
          ) : (
            <span className="muted" style={{ fontSize: 13 }}>Indique tes versements pour voir ta plus-value</span>
          )}
          {!netChange && gains.missing.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Sans {gains.missing.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && (i === gains.missing.length - 1 ? " et " : ", ")}
                  <Link href={`/accounts/${m.id}`}>{m.name}</Link>
                </span>
              ))}{" "}
              {gains.missing.length > 1 ? ": indique le total versé sur leur page pour les inclure." : ": indique le total versé sur sa page pour l'inclure."}
            </div>
          )}

          <div className="chart-toolbar">
            <div className="segmented" role="group" aria-label="Affichage">
              <button type="button" aria-pressed={mode === "total"} onClick={() => setMode("total")}>
                Total
              </button>
              <button type="button" aria-pressed={mode === "stack"} onClick={() => setMode("stack")}>
                Par placement
              </button>
            </div>
            <RangeTabs value={range} onChange={setRange} />
          </div>
          <div className="hero-chart">
            <div className="hero-chart-inner">
              <TimeSeriesChart rows={visible} stack={mode === "stack" ? stack : undefined} height="100%" />
            </div>
          </div>
          {mode === "stack" && (
            <div className="legend">
              {stack.map((s) => (
                <span key={s.key} className="legend-item">
                  <span className="legend-dot" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ---- Key indicators ---- */}
        <div className="stack">
          <section className="card stat-tile">
            <span className="kpi-icon" aria-hidden="true">📈</span>
            <span className="label">Plus-value par compte</span>
            <div className="gain-list">
              {gains.accounts.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className="gain-row">
                  <span>{a.name}</span>
                  {a.gain !== null ? (
                    <span className={a.gain >= 0 ? "pos" : "neg"}>
                      {signed(a.gain, (n) => eur0.format(n))}
                      {a.pct !== null && <span className="muted"> {formatPct(Math.abs(a.pct), 1)}</span>}
                    </span>
                  ) : (
                    <span className="muted">versé ?</span>
                  )}
                </Link>
              ))}
            </div>
          </section>

          <section className="card stat-tile">
            <span className="kpi-icon" aria-hidden="true">🛟</span>
            <span className="label">Matelas de sécurité</span>
            <span className="value">{eur0.format(cushion.amount)}</span>
            {cushion.accounts.length === 0 ? (
              <span className="hint">
                <Link href="/expenses">Choisis le livret qui sert de matelas →</Link>
              </span>
            ) : cushion.target && cushionPct !== null ? (
              <>
                <div className="weight-track" style={{ height: 6, marginTop: 6 }}>
                  <span style={{ width: `${cushionPct * 100}%`, background: cushionPct >= 1 ? "var(--good)" : "var(--chart-line)" }} />
                </div>
                <span className="hint">
                  {(cushion.monthsCovered ?? 0).toFixed(1).replace(".", ",")} mois de dépenses sur {cushion.targetMonths} visés
                  {cushionPct < 1 ? ` · il manque ${eur0.format(cushion.target - cushion.amount)}` : " · objectif atteint"}
                </span>
                {cushion.reachDate && cushionPct < 1 && (
                  <span className="hint">
                    Complet vers {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(cushion.reachDate))} (
                    {eur0.format(cushion.monthlyContribution)}/mois)
                  </span>
                )}
              </>
            ) : (
              <span className="hint">
                {cushion.accounts.map((a) => a.name).join(", ")} ·{" "}
                <Link href="/expenses">ajoute tes charges du mois →</Link>
              </span>
            )}
          </section>

          <section className="card stat-tile">
            <span className="kpi-icon" aria-hidden="true">🎯</span>
            <span className="label">Niveau de risque des placements</span>
            <span className="value">
              {riskLevel}/7 <span className="secondary" style={{ fontSize: 15, fontWeight: 500 }}>{riskLabel(riskLevel)}</span>
            </span>
            <RiskMeter level={riskLevel} />
            <span className="hint">
              Volatilité estimée ~{formatPct(volatility, 0)} par an · <Link href="/analysis">détails →</Link>
            </span>
          </section>
        </div>
      </div>

      {/* ---- Allocation ---- */}
      <div className="grid grid-2 section">
        <section className="card">
          <div className="card-title">
            <h2>Répartition par enveloppe</h2>
          </div>
          <Allocation slices={envelopes} colorFor={accountTypeCssVar} />
        </section>
        <section className="card">
          <div className="card-title">
            <h2>Mes comptes</h2>
            <Link href="/accounts" className="muted" style={{ fontSize: 13 }}>
              Gérer →
            </Link>
          </div>
          <div className="alloc-list">
            {accounts.map((a) => (
              <Link key={a.id} href={`/accounts/${a.id}`} className="alloc-row" style={{ color: "inherit" }}>
                <span className="legend-item" style={{ fontSize: 13, color: "var(--text-primary)", gap: 10 }}>
                  <Logo logo={a.logo} name={a.institution ?? a.name} color={accountTypeCssVar(a.type)} size={26} />
                  {a.name}
                  <span className="muted">{a.institution ? `· ${a.institution}` : ""}</span>
                  {cushion.accounts.some((c) => c.name === a.name) && <span className="pill">Matelas</span>}
                </span>
                <span className="alloc-value">
                  {eur0.format(a.value)} <span className="muted">{formatPct(total ? a.value / total : 0, 0)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ---- Positions ---- */}
      {positions.length > 0 && (
        <section className="section">
          <div className="section-title">
            <h2>Mes positions</h2>
            <span className="muted">
              {positions.length} lignes · {eur0.format(invested)}
            </span>
          </div>
          <div className="position-scroller">
            {positions.map((p) => (
              <div className="card position-card" key={p.key}>
                <div className="position-head">
                  <Logo logo={p.logo} name={p.name} color={accountTypeCssVar(p.accountType)} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div className="position-name" title={p.name}>
                      {p.name}
                    </div>
                    <div className="position-sub">
                      {accountTypeShort(p.accountType)} · {p.sub}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="position-value">{eur0.format(p.value)}</div>
                  {p.gain !== null ? (
                    <Delta value={p.gain} pct={p.gainPct} />
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>
                      Prix d'achat inconnu
                    </span>
                  )}
                </div>
                <div>
                  <div className="weight-track">
                    <span style={{ width: `${Math.min(p.weight * 100, 100)}%` }} />
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {formatPct(p.weight, 1)} des placements
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Advice ---- */}
      <section className="section">
        <div className="section-title">
          <h2>À retenir</h2>
          <Link href="/analysis" className="muted" style={{ fontSize: 13 }}>
            Analyse complète →
          </Link>
        </div>
        <AdviceList advice={advice} limit={3} moreHref="/analysis" />
      </section>
    </>
  );
}
