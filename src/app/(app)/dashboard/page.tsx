import Link from "next/link";
import { loadPortfolio } from "@/lib/portfolio";
import { analyzePortfolio } from "@/lib/analysis";
import { getSettings } from "@/lib/settings";
import { loadAssistantSettings } from "@/lib/assistantSettings";
import { accountColors } from "@/lib/accountTypes";
import { findInstrument } from "@/lib/instruments";
import { institutionLogo, instrumentLogo } from "@/lib/logos";
import { photoUrl } from "@/lib/physicalAssets";
import { refreshValuations } from "@/lib/valuations";
import SynthesisView from "@/components/SynthesisView";
import { computeGains } from "@/lib/gains";
import { buildChecklist } from "@/lib/checklist";
import ChecklistCard from "@/components/ChecklistCard";

export default async function DashboardPage() {
  await refreshValuations();
  const dataP = loadPortfolio();
  const settingsP = getSettings();
  const [data, settings, checklist, assistant] = await Promise.all([
    dataP,
    settingsP,
    buildChecklist(new Date(), { data: dataP, settings: settingsP }),
    loadAssistantSettings(),
  ]);

  if (data.accounts.length === 0) {
    return (
      <div className="card empty-state">
        <h2>Aucun compte pour l'instant</h2>
        <p className="muted">Ajoute ton assurance vie, tes livrets, ton CTO ou ton PEA pour démarrer le suivi.</p>
        <Link className="btn btn-primary" href="/accounts">
          Ajouter un compte
        </Link>
      </div>
    );
  }

  const analysis = analyzePortfolio(data.holdings, data.otherAssets, settings, assistant.risk);
  // One chart series per account (named, never lumped into "Autre").
  const colors = accountColors(data.accounts);
  const accountSeries = data.accounts
    .filter((a) => data.series.some((p) => (p.byAccount[a.id] ?? 0) !== 0))
    .map((a) => ({ key: `a_${a.id}`, label: a.name, color: colors.get(a.id) ?? "var(--text-muted)" }));

  const rows = data.series.map((p) => {
    const row: { t: number; total: number; [k: string]: number } = { t: Date.parse(p.date), total: p.total };
    for (const a of data.accounts) row[`a_${a.id}`] = p.byAccount[a.id] ?? 0;
    for (const [id, byDate] of Object.entries(data.investedAt)) row[`i_${id}`] = byDate[p.date] ?? 0;
    return row;
  });

  const latest = data.series.at(-1);
  const accounts = data.accounts
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      institution: a.institution,
      logo: institutionLogo(a.institution),
      photoUrl: a.photo ? photoUrl(a.id, a.photo) : null,
      value: latest?.byAccount[a.id] ?? 0,
    }))
    .filter((a) => a.value !== 0)
    .sort((a, b) => b.value - a.value);

  const invested = analysis.invested;
  const positions = data.holdings.map((h) => {
    const meta = findInstrument(h.isin, h.name);
    const cost = h.costBasis !== null ? h.quantity * h.costBasis : null;
    return {
      key: `${h.accountId}-${h.name}`,
      name: meta?.label ?? h.name,
      sub: h.isin ?? (meta?.kind === "crypto" ? "Crypto" : "-"),
      accountType: h.accountType,
      logo: instrumentLogo(h.isin, meta?.label ?? h.name),
      value: h.value,
      gain: cost !== null ? h.value - cost : null,
      gainPct: cost ? (h.value - cost) / cost : null,
      weight: invested > 0 ? h.value / invested : 0,
    };
  });

  return (
    <>
      <ChecklistCard items={checklist} />
      <SynthesisView
      rows={rows}
      accountSeries={accountSeries}
      investedAccounts={data.accounts.filter((a) => a.id in data.investedAt).map((a) => ({ id: a.id, name: a.name }))}
      total={data.total}
      accounts={accounts}
      gains={computeGains(data)}
      invested={invested}
      cushion={analysis.cushion}
      envelopes={analysis.envelopes}
      positions={positions}
      advice={analysis.advice}
      riskLevel={analysis.riskLevel}
      volatility={analysis.investedVolatility}
      />
    </>
  );
}
