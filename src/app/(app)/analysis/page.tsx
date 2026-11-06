import Link from "next/link";
import { loadPortfolio } from "@/lib/portfolio";
import { analyzePortfolio } from "@/lib/analysis";
import { getSettings } from "@/lib/settings";
import { accountTypeCssVar } from "@/lib/accountTypes";
import { companyLogo } from "@/lib/logos";
import Logo from "@/components/Logo";
import { AdviceList, Allocation, HBars, RiskMeter, assetClassColor, eur0, formatPct, riskLabel, signed } from "@/components/ui";

export default async function AnalysisPage() {
  const [data, settings] = await Promise.all([loadPortfolio(), getSettings()]);
  const a = analyzePortfolio(data.holdings, data.otherAssets, settings);

  if (a.total <= 0) {
    return (
      <div className="card empty-state">
        <h2>Rien à analyser pour l'instant</h2>
        <p className="muted">Ajoute des comptes et des relevés pour voir ton exposition.</p>
      </div>
    );
  }

  const usd = a.currencies.find((c) => c.key === "USD")?.pct ?? 0;
  const equityShare = a.total > 0 ? a.equity / a.total : 0;
  const worst = a.stress[0];
  const maxLoss = Math.max(...a.stress.map((s) => Math.abs(s.impact)), 1);
  const snapshotDate = data.holdings[0]?.date;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Analyse</h1>
          <p className="muted">
            Exposition, risques et pistes d'optimisation
            {snapshotDate ? ` · positions au ${new Date(snapshotDate).toLocaleDateString("fr-FR")}` : ""}
          </p>
        </div>
      </div>

      {/* ---- KPIs ---- */}
      <div className="grid grid-stats">
        <div className="card stat-tile">
          <span className="label">Niveau de risque des placements</span>
          <span className="value">
            {a.riskLevel}/7 <span className="secondary" style={{ fontSize: 15, fontWeight: 500 }}>{riskLabel(a.riskLevel)}</span>
          </span>
          <RiskMeter level={a.riskLevel} />
          <span className="hint">Volatilité estimée ~{formatPct(a.investedVolatility, 0)} / an</span>
        </div>
        <div className="card stat-tile">
          <span className="label">Volatilité du patrimoine total</span>
          <span className="value">~{formatPct(a.volatility, 0)}</span>
          <span className="hint">Livrets et fonds euros amortissent les placements</span>
        </div>
        <div className="card stat-tile">
          <span className="label">Part en actions</span>
          <span className="value">{formatPct(equityShare, 0)}</span>
          <span className="hint">{eur0.format(a.equity)} du patrimoine</span>
        </div>
        <div className="card stat-tile">
          <span className="label">Exposition au dollar</span>
          <span className="value">{formatPct(usd, 0)}</span>
          <span className="hint">Actifs US, or et crypto, sans couverture de change</span>
        </div>
        {worst && (
          <div className="card stat-tile">
            <span className="label">Pire scénario testé</span>
            <span className="value neg">{signed(worst.impact, (n) => eur0.format(n))}</span>
            <span className="hint">
              {worst.label} · {formatPct(Math.abs(worst.pct), 0)} du patrimoine
            </span>
          </div>
        )}
      </div>

      {/* ---- Advice ---- */}
      <section className="section">
        <div className="section-title">
          <h2>Conseils et optimisation</h2>
          <span className="muted">{a.advice.length} points</span>
        </div>
        <AdviceList advice={a.advice} />
      </section>

      {/* ---- Allocation ---- */}
      <section className="section">
        <div className="section-title">
          <h2>Allocation</h2>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <h2>Par classe d'actifs</h2>
            <Allocation slices={a.assetClasses} colorFor={assetClassColor} />
          </div>
          <div className="card">
            <h2>Par enveloppe</h2>
            <Allocation slices={a.envelopes} colorFor={accountTypeCssVar} />
          </div>
        </div>
      </section>

      {/* ---- Look-through exposure ---- */}
      <section className="section">
        <div className="section-title">
          <h2>Exposition de tes actions</h2>
          <span className="muted">Par transparence : le contenu des ETF est compté</span>
        </div>
        <div className="grid grid-2">
          <div className="card">
            <h2>Zones géographiques</h2>
            <HBars slices={a.regions} showBenchmark />
          </div>
          <div className="card">
            <h2>Secteurs</h2>
            <HBars slices={a.sectors} showBenchmark />
          </div>
        </div>
        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2>Principales sociétés détenues</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
              En direct et à travers tes ETF (principales lignes des fonds uniquement)
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Société</th>
                    <th className="num">En direct</th>
                    <th className="num">Via ETF</th>
                    <th className="num">Total</th>
                    <th className="num">% actions</th>
                  </tr>
                </thead>
                <tbody>
                  {a.companies.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <span className="name-with-logo">
                          <Logo logo={companyLogo(c.name)} name={c.name} size={24} />
                          {c.name}
                        </span>
                      </td>
                      <td className="num">{c.direct ? eur0.format(c.direct) : "-"}</td>
                      <td className="num">{c.viaFunds ? `~${eur0.format(c.viaFunds)}` : "-"}</td>
                      <td className="num">{eur0.format(c.total)}</td>
                      <td className="num secondary">{formatPct(c.pct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2>Devises</h2>
            <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
              Exposition économique de tout le patrimoine (un ETF coté en euros sur le S&P 500 reste exposé au dollar)
            </p>
            <HBars slices={a.currencies} />
          </div>
        </div>
      </section>

      {/* ---- Stress tests ---- */}
      <section className="section">
        <div className="section-title">
          <h2>Scénarios de crise</h2>
          <span className="muted">Perte immédiate estimée sur ton patrimoine actuel</span>
        </div>
        <div className="card">
          <div className="hbars">
            {a.stress.map((s) => (
              <div className="hbar-row" key={s.label} style={{ gridTemplateColumns: "minmax(140px, 260px) minmax(0, 1fr) 96px" }}>
                <span>
                  <span style={{ display: "block", fontWeight: 600 }}>{s.label}</span>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: "normal" }}>
                    {s.description}
                  </span>
                </span>
                <span className="hbar-track">
                  <span
                    className="hbar"
                    style={{ width: `${(Math.abs(s.impact) / maxLoss) * 100}%`, background: s.impact < 0 ? "var(--critical)" : "var(--good)" }}
                  />
                </span>
                <span className="hbar-value">
                  <span className={s.impact < 0 ? "neg" : "pos"}>{signed(s.impact, (n) => eur0.format(n))}</span>
                  <span className="muted" style={{ display: "block", fontSize: 12 }}>
                    {formatPct(Math.abs(s.pct), 1)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="disclaimer">
        Cette analyse automatique est indicative et ne remplace pas un conseil en investissement personnalisé. Les compositions d'ETF,
        volatilités et corrélations sont des approximations (référentiel dans <code>src/lib/instruments.ts</code>), et
        l'analyse ne connaît ni tes revenus, ni tes projets, ni ton horizon. Les comptes sans détail des positions sont
        classés selon leur type (livret = liquidités, assurance vie = fonds euros).{" "}
        {a.unclassified.length > 0 && <>Titres non reconnus : {a.unclassified.join(", ")}. </>}
        <Link href="/expenses">Charges et matelas de sécurité</Link>.
      </p>
    </>
  );
}
