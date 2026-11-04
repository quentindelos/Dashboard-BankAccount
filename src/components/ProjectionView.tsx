"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { project, type ProjectionAccount, type ProjectionRow } from "@/lib/projection";
import { useChartTheme } from "@/lib/useChartTheme";
import { eur0, formatPct } from "@/components/ui";

const HORIZONS = [5, 10, 15, 20, 30];
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

const toInput = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const parse = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function ProjectionView({
  accounts,
  initialYears,
  initialRealTerms,
  youthCloseYear,
  initialOverflowTo,
  investable,
  inflation,
  hasSaved,
  unmatched,
}: {
  accounts: ProjectionAccount[];
  initialYears: number;
  initialRealTerms: boolean;
  youthCloseYear: number;
  initialOverflowTo: string | null;
  investable: { id: string; name: string }[];
  inflation: number;
  hasSaved: boolean;
  unmatched: { name: string; monthly: number }[];
}) {
  const chrome = useChartTheme();
  const [years, setYears] = useState(initialYears);
  const [realTerms, setRealTerms] = useState(initialRealTerms);
  const [overflowTo, setOverflowTo] = useState(initialOverflowTo ?? "");
  const hasYouth = accounts.some((a) => a.youth);
  const cushion = accounts.find((a) => a.cushionTarget !== undefined);
  const [inputs, setInputs] = useState(() =>
    Object.fromEntries(accounts.map((a) => [a.id, { monthly: toInput(a.monthly), rate: toInput(a.rate * 100) }]))
  );
  const [status, setStatus] = useState("");

  const model = useMemo(
    () =>
      accounts.map((a) => ({
        ...a,
        monthly: Math.max(parse(inputs[a.id].monthly) ?? 0, 0),
        rate: (parse(inputs[a.id].rate) ?? 0) / 100,
        overflowTo: a.cushionTarget !== undefined ? overflowTo || undefined : undefined,
      })),
    [accounts, inputs, overflowTo]
  );
  const rows = useMemo(
    () => project(model, years, { inflation: realTerms ? inflation : 0, youthCloseYear: hasYouth ? youthCloseYear : null }),
    [model, years, realTerms, inflation, youthCloseYear, hasYouth]
  );
  const closeYear = youthCloseYear;
  // First month the cushion is full (in the central scenario).
  const cushionFull = cushion?.cushionTarget
    ? rows.find((r) => (r[`a_${cushion.id}`] as number) >= cushion.cushionTarget! - 1)
    : undefined;
  const nameOf = (id?: string) => accounts.find((a) => a.id === id)?.name;

  function resetRates() {
    setInputs((prev) =>
      Object.fromEntries(accounts.map((a) => [a.id, { ...prev[a.id], rate: toInput((a.defaultRate ?? a.rate) * 100) }]))
    );
    setStatus("");
  }
  const end = rows.at(-1)!;
  const today = rows[0];
  const futureDeposits = end.paid - today.paid;
  const gains = end.total - end.paid;
  const monthlyTotal = model.reduce((s, a) => s + a.monthly, 0);
  const unmatchedTotal = unmatched.reduce((s, u) => s + u.monthly, 0);

  function update(id: string, field: "monthly" | "rate", value: string) {
    setInputs((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    setStatus("");
  }

  async function save() {
    setStatus("");
    const res = await fetch("/api/projection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        years,
        realTerms,
        overflowTo: overflowTo || null,
        accounts: Object.fromEntries(model.map((a) => [a.id, { monthly: a.monthly, rate: a.rate }])),
      }),
    });
    setStatus(res.ok ? "Hypothèses enregistrées ✓" : "Impossible d'enregistrer.");
  }

  if (accounts.length === 0) {
    return (
      <div className="card empty-state">
        <h2>Rien à projeter pour l'instant</h2>
        <p className="muted">Ajoute des comptes et des relevés pour voir l'évolution possible de ton patrimoine.</p>
      </div>
    );
  }

  const endLabel = monthYear.format(end.t);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projection</h1>
          <p className="muted">
            Ce que pourrait devenir ton patrimoine avec tes versements actuels et un rendement moyen par compte
          </p>
        </div>
      </div>

      <section className="card hero">
        <div className="hero-date">
          Dans {years} ans · {endLabel}
          {realTerms ? " · en euros d'aujourd'hui" : ""}
        </div>
        <div className="hero-value">{eur0.format(end.total)}</div>
        <span className="muted" style={{ fontSize: 13 }}>
          Fourchette probable : {eur0.format(end.low)} – {eur0.format(end.high)}
        </span>

        <div className="projection-kpis">
          <div>
            <span className="label">Aujourd'hui</span>
            <span className="num">{eur0.format(today.total)}</span>
          </div>
          <div>
            <span className="label">Versements à venir</span>
            <span className="num">+{eur0.format(futureDeposits)}</span>
            <span className="muted">{eur0.format(monthlyTotal)}/mois</span>
          </div>
          <div>
            <span className="label">Gains estimés</span>
            <span className={`num ${gains >= 0 ? "pos" : "neg"}`}>
              {gains >= 0 ? "+" : "−"}
              {eur0.format(Math.abs(gains))}
            </span>
          </div>
        </div>

        <div className="chart-toolbar">
          <label className="muted" style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={realTerms} onChange={(e) => setRealTerms(e.target.checked)} />
            En euros d'aujourd'hui (inflation {formatPct(inflation, 0)}/an)
          </label>
          <div className="segmented" role="group" aria-label="Horizon">
            {HORIZONS.map((h) => (
              <button key={h} type="button" aria-pressed={years === h} onClick={() => setYears(h)}>
                {h} ans
              </button>
            ))}
          </div>
        </div>

        <ProjectionChart rows={rows} chrome={chrome} />
        <div className="legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: chrome.line }} />
            Projection
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: chrome.line, opacity: 0.25 }} />
            Fourchette probable (~2 chances sur 3)
          </span>
          <span className="legend-item">
            <span className="legend-dash" style={{ borderColor: chrome.textMuted }} />
            Total versé
          </span>
        </div>
      </section>

      <section className="card section">
        <div className="card-title">
          <h2>Hypothèses par compte</h2>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          {hasSaved
            ? "Tes hypothèses enregistrées. Modifie-les librement, la projection se met à jour en direct."
            : "Versements pré-remplis d'après tes virements d'épargne (page Dépenses) : vérifie-les."}{" "}
          Rendements proposés : taux actuels des livrets (Livret A / Bleu 1,7 %, Livret Jeune 3,5 %) et moyennes historiques
          long terme des marchés pour ce que contient chaque compte. Les livrets s'arrêtent d'être alimentés à leur plafond.
        </p>
        {cushion?.cushionTarget !== undefined && (
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="projection-overflow">
              Une fois le matelas ({cushion.name}) à {eur0.format(cushion.cushionTarget)}, verser son épargne sur
            </label>
            <select
              id="projection-overflow"
              value={overflowTo}
              onChange={(e) => {
                setOverflowTo(e.target.value);
                setStatus("");
              }}
            >
              <option value="">Nulle part (arrêter ces versements)</option>
              {investable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>
              {cushionFull
                ? `Matelas atteint vers ${monthYear.format(cushionFull.t)} dans cette projection.`
                : `Matelas pas encore atteint dans ${years} ans avec ces versements.`}
            </span>
          </div>
        )}
        {unmatchedTotal > 0 && !hasSaved && (
          <p className="muted" style={{ fontSize: 13 }}>
            Non rattaché à un compte : {unmatched.map((u) => `${u.name} (${eur0.format(u.monthly)})`).join(", ")}, soit{" "}
            {eur0.format(unmatchedTotal)}/mois à ajouter ci-dessous.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Compte</th>
                <th className="num">Aujourd'hui</th>
                <th className="num">Versement / mois</th>
                <th className="num">Rendement / an</th>
                <th className="num">Dans {years} ans</th>
                <th className="num">Fourchette</th>
              </tr>
            </thead>
            <tbody>
              {model.map((a) => {
                const final = end[`a_${a.id}`] as number;
                return (
                  <tr key={a.id}>
                    <td>
                      <span className="legend-item">
                        <span className="legend-dot" style={{ background: a.color }} />
                        {a.name}
                      </span>
                      {a.youth && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Jusqu'à fin {closeYear}
                          {nameOf(a.transferTo) ? `, puis transféré sur ${nameOf(a.transferTo)}` : ", puis au taux du Livret A"}
                        </div>
                      )}
                      {a.cushionTarget !== undefined && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Matelas : alimenté jusqu'à {eur0.format(a.cushionTarget)}
                        </div>
                      )}
                      {a.ceiling !== undefined && a.cushionTarget === undefined && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          Plafond {eur0.format(a.ceiling)}
                        </div>
                      )}
                    </td>
                    <td className="num">{eur0.format(a.value)}</td>
                    <td className="num">
                      <input
                        className="projection-input"
                        inputMode="decimal"
                        aria-label={`Versement mensuel ${a.name}`}
                        value={inputs[a.id].monthly}
                        onChange={(e) => update(a.id, "monthly", e.target.value)}
                      />{" "}
                      €
                    </td>
                    <td className="num">
                      <input
                        className="projection-input"
                        inputMode="decimal"
                        aria-label={`Rendement annuel ${a.name}`}
                        value={inputs[a.id].rate}
                        onChange={(e) => update(a.id, "rate", e.target.value)}
                      />{" "}
                      %
                    </td>
                    <td className="num">{eur0.format(final)}</td>
                    <td className="num muted">
                      {a.volatility > 0.005 ? `± ${formatPct(a.volatility, 0)}/an de volatilité` : "stable"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14 }}>
          <button type="button" className="btn btn-primary" onClick={save}>
            Enregistrer mes hypothèses
          </button>
          <button type="button" className="btn" onClick={resetRates}>
            Remettre les taux proposés
          </button>
          {status && <span className="muted" style={{ fontSize: 13 }}>{status}</span>}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
          Simulation indicative : rendements moyens constants, intérêts composés chaque mois, avant impôts et frais. Les marchés
          ne montent pas en ligne droite ; la fourchette donne une idée de l'incertitude, pas une garantie.
        </p>
      </section>
    </>
  );
}

function ProjectionChart({ rows, chrome }: { rows: ProjectionRow[]; chrome: ReturnType<typeof useChartTheme> }) {
  const first = rows[0].t;
  const last = rows.at(-1)!.t;
  const years = Math.round((last - first) / (365.25 * 86_400_000));
  const step = years <= 10 ? 1 : 5;
  const ticks = Array.from({ length: Math.floor(years / step) + 1 }, (_, i) => {
    const d = new Date(first);
    d.setUTCFullYear(d.getUTCFullYear() + i * step);
    return d.getTime();
  });

  return (
    <div style={{ height: 320, marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fill-projection" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chrome.line} stopOpacity={0.28} />
              <stop offset="100%" stopColor={chrome.line2} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chrome.gridline} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[first, last]}
            ticks={ticks}
            tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
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
          />
          <Tooltip
            cursor={{ stroke: chrome.baseline, strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as ProjectionRow;
              return (
                <div className="chart-tooltip">
                  <div className="tt-date">{monthYear.format(row.t)}</div>
                  <div className="tt-total">{eur0.format(row.total)}</div>
                  <div className="tt-row">
                    <span>Fourchette</span>
                    <span className="num">
                      {eur0.format(row.low)} – {eur0.format(row.high)}
                    </span>
                  </div>
                  <div className="tt-row">
                    <span>Total versé</span>
                    <span className="num">{eur0.format(row.paid)}</span>
                  </div>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="band" stroke="none" fill={chrome.line} fillOpacity={0.12} isAnimationActive={false} activeDot={false} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={chrome.line}
            strokeWidth={2.5}
            fill="url(#fill-projection)"
            isAnimationActive={false}
            activeDot={{ r: 5, fill: chrome.line2, stroke: chrome.surface, strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="paid"
            stroke={chrome.textMuted}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
