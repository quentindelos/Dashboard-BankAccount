// Snapshot of the user's finances, written as plain text for the assistant:
// accounts, positions, gains, allocation, budget, history and projection
// assumptions. Rebuilt on every question so the answers use today's data.
import { prisma } from "@/lib/db";
import { loadPortfolio } from "@/lib/portfolio";
import { computeGains } from "@/lib/gains";
import { analyzePortfolio } from "@/lib/analysis";
import { getSettings } from "@/lib/settings";
import { accountTypeLabel } from "@/lib/accountTypes";
import { ASSET_CLASS_LABELS, findInstrument } from "@/lib/instruments";
import { categoryMeta, isIncome, isSavings, monthlyEquivalent } from "@/lib/expenses";
import { loadProjectionSettings } from "@/lib/projectionSettings";
import { netMonthlyFromGross } from "@/lib/career";

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const eur2 = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (n: number, digits = 1) => `${(n * 100).toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
const signed = (n: number) => (n >= 0 ? "+" : "−") + eur(Math.abs(n));

// What the user told us about themselves (not stored elsewhere in the app).
const PROFILE = [
  "Alternant chez Thales, en Master Cloud Computing, Systèmes et Réseaux (Bac+5).",
  "Diplôme prévu en octobre 2027, puis embauche en CDI chez Thales envisagée.",
  "Atteint 25 ans en 2029 : le Livret Jeune doit être clôturé au plus tard le 31 décembre 2029.",
  "Comptes d'investissement chez Trade Republic (PEA, CTO, crypto), livrets au Crédit Mutuel, assurance vie à La Banque Postale.",
];

export async function buildAssistantContext(now = new Date()): Promise<string> {
  const [data, settings, expenses, projection] = await Promise.all([
    loadPortfolio(),
    getSettings(),
    prisma.recurringExpense.findMany({ where: { active: true }, include: { account: { select: { name: true } } } }),
    loadProjectionSettings(),
  ]);
  const gains = computeGains(data);
  const analysis = analyzePortfolio(data.holdings, data.otherAssets, settings);
  const latest = data.series.at(-1);
  const out: string[] = [];
  const line = (s = "") => out.push(s);

  line(`# Situation financière au ${now.toLocaleDateString("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" })}`);
  line();
  line("## Profil");
  PROFILE.forEach((p) => line(`- ${p}`));
  line();

  // ---- Accounts
  line(`## Comptes (patrimoine total ${eur(data.total)})`);
  for (const a of data.accounts) {
    const value = latest?.byAccount[a.id] ?? 0;
    const g = gains.accounts.find((x) => x.id === a.id);
    const opened = data.series.find((p) => (p.byAccount[a.id] ?? 0) > 0)?.date;
    const parts = [
      `${a.name} — ${accountTypeLabel(a.type)}${a.institution ? `, ${a.institution}` : ""}`,
      `valeur ${eur(value)}`,
      opened ? `premier relevé ${opened}` : null,
      g?.invested != null ? `investi ${eur(g.invested)}` : null,
      g?.gain != null ? `plus-value ${signed(g.gain)}${g.pct != null ? ` (${pct(g.pct)})` : ""}` : null,
      data.otherAssets.some((o) => o.accountId === a.id && o.emergencyFund) ? "matelas de sécurité" : null,
    ].filter(Boolean);
    line(`- ${parts.join(" · ")}`);
  }
  line(
    `- Total : investi ${eur(gains.invested)}, plus-value ${signed(gains.gain)}${gains.pct != null ? ` (${pct(gains.pct)})` : ""}` +
      (gains.missing.length ? ` — versements inconnus pour : ${gains.missing.map((m) => m.name).join(", ")}` : "")
  );
  line();

  // ---- Positions
  const byAccount = new Map<string, typeof data.holdings>();
  for (const h of data.holdings) byAccount.set(h.accountName, [...(byAccount.get(h.accountName) ?? []), h]);
  if (byAccount.size > 0) {
    line("## Positions (dernier relevé)");
    for (const [account, holdings] of byAccount) {
      const total = holdings.reduce((s, h) => s + h.value, 0);
      line(`### ${account} (${eur(total)}, relevé du ${holdings[0].date})`);
      for (const h of [...holdings].sort((x, y) => y.value - x.value)) {
        const meta = findInstrument(h.isin, h.name);
        const cost = h.costBasis != null ? h.quantity * h.costBasis : null;
        const parts = [
          `${meta?.label ?? h.name}${h.isin ? ` (${h.isin})` : ""}`,
          meta ? `${meta.kind}, ${ASSET_CLASS_LABELS[meta.assetClass]}` : null,
          `${h.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} × ${eur2(h.price)} = ${eur2(h.value)}`,
          `${pct(total ? h.value / total : 0)} du compte`,
          h.costBasis != null ? `PRU ${eur2(h.costBasis)}` : null,
          cost ? `plus-value ${signed(h.value - cost)} (${pct((h.value - cost) / cost)})` : null,
          meta ? `volatilité ~${pct(meta.volatility, 0)}` : null,
        ].filter(Boolean);
        line(`- ${parts.join(" · ")}`);
      }
    }
    line();
  }

  // ---- Allocation and risk (same figures as the Analyse page)
  const slices = (title: string, list: { label: string; pct: number; benchmark?: number }[]) => {
    if (list.length === 0) return;
    line(
      `- ${title} : ` +
        list
          .filter((s) => s.pct >= 0.005)
          .map((s) => `${s.label} ${pct(s.pct, 0)}${s.benchmark !== undefined ? ` (MSCI ACWI ${pct(s.benchmark, 0)})` : ""}`)
          .join(", ")
    );
  };
  line("## Répartition et risque");
  slices("Classes d'actifs (tout le patrimoine)", analysis.assetClasses);
  slices("Enveloppes", analysis.envelopes);
  slices("Régions (actions)", analysis.regions);
  slices("Secteurs (actions)", analysis.sectors);
  slices("Devises", analysis.currencies);
  if (analysis.companies.length) {
    line(
      `- Principales entreprises (part des actions, en direct + via les ETF) : ` +
        analysis.companies
          .slice(0, 10)
          .map((c) => `${c.name} ${pct(c.pct)}`)
          .join(", ")
    );
  }
  line(
    `- Volatilité estimée : ${pct(analysis.volatility)} pour tout le patrimoine, ${pct(analysis.investedVolatility)} pour les placements ; risque ${analysis.riskLevel}/7`
  );
  for (const s of analysis.stress) line(`- Scénario « ${s.label} » : ${signed(s.impact)} (${pct(s.pct)})`);
  if (analysis.unclassified.length) line(`- Lignes non classées : ${analysis.unclassified.join(", ")}`);
  line();

  // ---- Safety cushion
  const c = analysis.cushion;
  line("## Matelas de sécurité");
  line(
    `- ${eur(c.amount)} sur ${c.accounts.map((a) => a.name).join(", ") || "aucun compte"} · objectif ${c.targetMonths} mois de charges` +
      (c.target != null ? ` = ${eur(c.target)}` : "") +
      (c.monthsCovered != null ? ` · couvre ${c.monthsCovered.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mois` : "") +
      (c.monthlyContribution ? ` · alimenté de ${eur(c.monthlyContribution)}/mois` : "") +
      (c.reachDate ? ` · complet vers ${c.reachDate.slice(0, 7)}` : "")
  );
  line();

  // ---- Budget
  const groups = [
    { title: "Revenus", items: expenses.filter(isIncome) },
    { title: "Charges", items: expenses.filter((e) => !isIncome(e) && !isSavings(e)) },
    { title: "Épargne et investissements programmés", items: expenses.filter(isSavings) },
  ];
  line("## Budget mensuel (opérations récurrentes saisies, montants ramenés au mois)");
  const totals: number[] = [];
  for (const g of groups) {
    const total = g.items.reduce((s, e) => s + monthlyEquivalent(e), 0);
    totals.push(total);
    line(`### ${g.title} : ${eur2(total)}/mois`);
    for (const e of [...g.items].sort((x, y) => monthlyEquivalent(y) - monthlyEquivalent(x))) {
      const freq = e.frequency === "MENSUEL" ? "" : ` (${eur2(e.amount)} ${e.frequency.toLowerCase()})`;
      const day = e.dayOfMonth ? `, le ${e.dayOfMonth}` : "";
      line(`- ${e.name} — ${categoryMeta(e.category).label} : ${eur2(monthlyEquivalent(e))}${freq}${day}${e.account ? ` → ${e.account.name}` : ""}`);
    }
  }
  const [income, charges, saved] = totals;
  line(
    `- Reste après charges et épargne : ${eur2(income - charges - saved)}/mois · taux d'épargne ${income > 0 ? pct(saved / income) : "n/a"}`
  );
  line();

  // ---- History: month-end values, last 24 months
  const monthEnds = new Map<string, (typeof data.series)[number]>();
  for (const p of data.series) monthEnds.set(p.date.slice(0, 7), p);
  const months = [...monthEnds.values()].slice(-24);
  if (months.length > 1) {
    line("## Évolution (valeur en fin de mois)");
    const names = data.accounts.map((a) => a.name);
    line(`Mois | Total | ${names.join(" | ")}`);
    for (const p of months) {
      line(`${p.date.slice(0, 7)} | ${eur(p.total)} | ${data.accounts.map((a) => eur(p.byAccount[a.id] ?? 0)).join(" | ")}`);
    }
    line();
  }

  // ---- Projection assumptions
  line("## Projection (page Projection)");
  line("- Inflation 3 %/an déduite ; rendements par compte modifiables.");
  const saved_ = Object.entries(projection.accounts);
  if (saved_.length) {
    for (const [id, p] of saved_) {
      const name = data.accounts.find((a) => a.id === id)?.name ?? id;
      line(`- ${name} : ${eur(p.monthly)}/mois, rendement ${pct(p.rate)}`);
    }
  } else {
    line("- Hypothèses non enregistrées : versements déduits du budget ci-dessus.");
  }
  const career = projection.career;
  if (career) {
    line(
      `- Après le diplôme (enregistré) : CDI dès ${career.start}, ${eur(career.gross)} brut/an ≈ ${eur(netMonthlyFromGross(career.gross))} net/mois après impôt, +${pct(career.raise)}/an, ${pct(career.share, 0)} de la hausse investie sur ${data.accounts.find((a) => a.id === career.to)?.name ?? "?"}`
    );
  } else {
    line(
      `- Après le diplôme (valeurs par défaut) : CDI chez Thales dès 2027-10, 42 000 € brut/an ≈ ${eur(netMonthlyFromGross(42_000))} net/mois après impôt (fourchette jeunes diplômés Bac+5 : 39–47 k€), APL et prime d'activité supprimées, +3,5 %/an, 50 % de la hausse investie sur le PEA`
    );
  }

  return out.join("\n");
}
