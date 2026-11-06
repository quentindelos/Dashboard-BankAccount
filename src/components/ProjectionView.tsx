"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { project, type ProjectionAccount, type ProjectionRow } from "@/lib/projection";
import { useChartTheme } from "@/lib/useChartTheme";
import { eur0, formatPct } from "@/components/ui";
import {
  THALES_GRADUATE_RANGE,
  careerExtra,
  netMonthlyFromGross,
  type CareerIncome,
  type CareerSettings,
} from "@/lib/career";

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
  youthCloseYear,
  initialOverflowTo,
  investable,
  inflation,
  hasSaved,
  unmatched,
  incomes,
  initialCareer,
}: {
  accounts: ProjectionAccount[];
  initialYears: number;
  youthCloseYear: number;
  initialOverflowTo: string | null;
  investable: { id: string; name: string }[];
  inflation: number;
  hasSaved: boolean;
  unmatched: { name: string; monthly: number }[];
  incomes: CareerIncome[];
  initialCareer: CareerSettings;
}) {
  const chrome = useChartTheme();
  const [years, setYears] = useState(initialYears);
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
  // After the degree: the new salary and what it changes.
  const [careerStart, setCareerStart] = useState(initialCareer.start);
  const [careerTo, setCareerTo] = useState(initialCareer.to);
  const [careerStops, setCareerStops] = useState(() => new Set(initialCareer.stops));
  const [careerInputs, setCareerInputs] = useState({
    gross: toInput(initialCareer.gross),
    raise: toInput(initialCareer.raise * 100),
    share: toInput(initialCareer.share * 100),
  });
  const careerTargets = investable.filter((a) => accounts.some((p) => p.id === a.id));
  const salaries = incomes.filter((i) => i.category === "SALAIRE");
  const others = incomes.filter((i) => i.category !== "SALAIRE");
  const careerSettings: CareerSettings = {
    start: careerStart,
    gross: Math.max(parse(careerInputs.gross) ?? 0, 0),
    raise: (parse(careerInputs.raise) ?? 0) / 100,
    share: Math.min(Math.max((parse(careerInputs.share) ?? 0) / 100, 0), 1),
    to: careerTo,
    stops: [...careerStops],
  };
  const currentSalary = salaries.reduce((s, i) => s + i.monthly, 0);
  const lostIncome = others.filter((i) => careerStops.has(i.id)).reduce((s, i) => s + i.monthly, 0);
  const newNet = netMonthlyFromGross(careerSettings.gross);
  const raiseNow = newNet - currentSalary - lostIncome;
  const careerFrom = /^\d{4}-\d{2}$/.test(careerStart)
    ? new Date(Date.UTC(Number(careerStart.slice(0, 4)), Number(careerStart.slice(5, 7)) - 1, 1))
    : null;
  const careerOn = careerFrom !== null && careerSettings.gross > 0 && careerTargets.some((a) => a.id === careerTo);
  const careerKey = JSON.stringify(careerSettings) + currentSalary + lostIncome;
  const career = useMemo(
    () =>
      careerOn && careerFrom
        ? { from: careerFrom, to: careerTo, amount: careerExtra(careerSettings, currentSalary + lostIncome) }
        : undefined,
    // careerKey covers every input of the career step.
    [careerKey, careerOn]
  );

  const rows = useMemo(
    () => project(model, years, { inflation, youthCloseYear: hasYouth ? youthCloseYear : null, career }),
    [model, years, inflation, youthCloseYear, hasYouth, career]
  );
  // Same projection without the new job, to show what it changes.
  const withoutCareer = useMemo(
    () => (career ? project(model, years, { inflation, youthCloseYear: hasYouth ? youthCloseYear : null }).at(-1)!.total : null),
    [model, years, inflation, youthCloseYear, hasYouth, career]
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

  function updateCareer(field: "gross" | "raise" | "share", value: string) {
    setCareerInputs((prev) => ({ ...prev, [field]: value }));
    setStatus("");
  }

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
        overflowTo: overflowTo || null,
        career: careerSettings,
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
            Ce que pourrait devenir ton patrimoine avec tes versements actuels, ton futur salaire et un rendement moyen par
            compte
          </p>
        </div>
      </div>

      <section className="card hero">
        <div className="hero-date">
          Dans {years} ans · {endLabel}
          {` · en euros d'aujourd'hui (inflation ${formatPct(inflation, 0)}/an déduite)`}
        </div>
        <div className="hero-value">{eur0.format(end.total)}</div>
        <span className="muted" style={{ fontSize: 13 }}>
          Fourchette probable : de {eur0.format(end.low)} à {eur0.format(end.high)}
        </span>
        {withoutCareer !== null && careerFrom && (
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            Dont <strong className="pos">+{eur0.format(Math.max(end.total - withoutCareer, 0))}</strong> grâce à ton CDI dès{" "}
            {monthYear.format(careerFrom)} · {eur0.format(withoutCareer)} sans
          </div>
        )}

        <div className="projection-kpis">
          <div>
            <span className="label">Aujourd'hui</span>
            <span className="num">{eur0.format(today.total)}</span>
          </div>
          <div>
            <span className="label">Versements à venir</span>
            <span className="num">+{eur0.format(futureDeposits)}</span>
            <span className="muted">
              {eur0.format(monthlyTotal)}/mois
              {career && raiseNow > 0 ? `, ${eur0.format(monthlyTotal + raiseNow * careerSettings.share)} après le CDI` : ""}
            </span>
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
          <div className="segmented" role="group" aria-label="Horizon">
            {HORIZONS.map((h) => (
              <button key={h} type="button" aria-pressed={years === h} onClick={() => setYears(h)}>
                {h} ans
              </button>
            ))}
          </div>
        </div>

        <ProjectionChart
          rows={rows}
          chrome={chrome}
          marker={career && careerFrom ? { t: careerFrom.getTime(), label: "CDI" } : undefined}
        />
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
          <h2>Après mon diplôme</h2>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Master Cloud Computing, Systèmes et Réseaux (Bac+5) puis CDI chez Thales. Le nouveau salaire remplace ton salaire
          d'alternant ; une partie de la hausse est investie en plus de tes versements actuels.
        </p>
        <div className="career-grid">
          <div className="field">
            <label htmlFor="career-start">Début du CDI</label>
            <input
              id="career-start"
              type="month"
              value={careerStart}
              onChange={(e) => {
                setCareerStart(e.target.value);
                setStatus("");
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="career-gross">Salaire brut annuel (€)</label>
            <input
              id="career-gross"
              inputMode="decimal"
              value={careerInputs.gross}
              onChange={(e) => updateCareer("gross", e.target.value)}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              Environ {eur0.format(newNet)} net/mois après impôt · jeunes diplômés Bac+5 chez Thales : de{" "}
              {eur0.format(THALES_GRADUATE_RANGE[0])} à {eur0.format(THALES_GRADUATE_RANGE[1])}
            </span>
          </div>
          <div className="field">
            <label htmlFor="career-raise">Augmentation par an (%)</label>
            <input
              id="career-raise"
              inputMode="decimal"
              value={careerInputs.raise}
              onChange={(e) => updateCareer("raise", e.target.value)}
            />
            <span className="muted" style={{ fontSize: 12 }}>Hausses générales et promotions, avant inflation</span>
          </div>
          <div className="field">
            <label htmlFor="career-share">Part de la hausse investie (%)</label>
            <input
              id="career-share"
              inputMode="decimal"
              value={careerInputs.share}
              onChange={(e) => updateCareer("share", e.target.value)}
            />
            <span className="muted" style={{ fontSize: 12 }}>Le reste sert à vivre mieux</span>
          </div>
          <div className="field">
            <label htmlFor="career-to">Investie sur</label>
            <select
              id="career-to"
              value={careerTo}
              onChange={(e) => {
                setCareerTo(e.target.value);
                setStatus("");
              }}
            >
              {careerTargets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {others.length > 0 && (
          <div className="career-stops">
            <span className="label">Revenus qui s'arrêtent avec le CDI</span>
            {others.map((i) => (
              <label key={i.id}>
                <input
                  type="checkbox"
                  checked={careerStops.has(i.id)}
                  onChange={(e) => {
                    setCareerStops((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(i.id);
                      else next.delete(i.id);
                      return next;
                    });
                    setStatus("");
                  }}
                />
                {i.name} <span className="muted">{eur0.format(i.monthly)}/mois</span>
              </label>
            ))}
          </div>
        )}
        {careerOn && careerFrom && (
          <p className="career-summary">
            Dès {monthYear.format(careerFrom)} : {eur0.format(newNet)} net au lieu de {eur0.format(currentSalary)}
            {lostIncome > 0 ? ` + ${eur0.format(lostIncome)} d'aides` : ""}, soit{" "}
            <strong>
              {raiseNow >= 0 ? "+" : "−"}
              {eur0.format(Math.abs(raiseNow))}/mois
            </strong>
            .{" "}
            {raiseNow > 0 ? (
              <>
                <strong>{eur0.format(raiseNow * careerSettings.share)}/mois</strong> investis en plus sur{" "}
                {nameOf(careerTo)}, puis davantage à chaque augmentation.
              </>
            ) : (
              "Rien de plus à investir avec ce salaire."
            )}
          </p>
        )}
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
                      {career && careerFrom && a.id === careerTo && raiseNow > 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          + {eur0.format(raiseNow * careerSettings.share)}/mois dès {monthYear.format(careerFrom)} (CDI)
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
          ne montent pas en ligne droite : la fourchette indique l'incertitude et ne garantit rien.
        </p>
      </section>
    </>
  );
}

function ProjectionChart({
  rows,
  chrome,
  marker,
}: {
  rows: ProjectionRow[];
  chrome: ReturnType<typeof useChartTheme>;
  marker?: { t: number; label: string };
}) {
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
                      {eur0.format(row.low)} à {eur0.format(row.high)}
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
          {marker && marker.t > first && marker.t < last && (
            <ReferenceLine
              x={marker.t}
              stroke={chrome.textMuted}
              strokeDasharray="2 4"
              label={{ value: marker.label, position: "insideTopLeft", fill: chrome.textMuted, fontSize: 12 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
