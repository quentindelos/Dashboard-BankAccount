import { prisma } from "@/lib/db";
import { loadPortfolio } from "@/lib/portfolio";
import { accountColors } from "@/lib/accountTypes";
import { findInstrument } from "@/lib/instruments";
import { isSavings, monthlyEquivalent } from "@/lib/expenses";
import { DEFAULT_INFLATION, DEFAULT_RATE, DEFAULT_VOLATILITY, type ProjectionAccount } from "@/lib/projection";
import { loadProjectionSettings } from "@/lib/projectionSettings";
import ProjectionView from "@/components/ProjectionView";

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export default async function ProjectionPage() {
  const [data, expenses, saved] = await Promise.all([
    loadPortfolio(),
    prisma.recurringExpense.findMany({ where: { active: true } }),
    loadProjectionSettings(),
  ]);
  const latest = data.series.at(-1);
  const colors = accountColors(data.accounts);
  const savings = expenses.filter(isSavings);

  // Guess where each savings transfer goes: its linked account, else an
  // account whose name or one of whose holdings matches the transfer's name.
  const guessed = new Map<string, number>();
  const unmatched: { name: string; monthly: number }[] = [];
  for (const e of savings) {
    const monthly = monthlyEquivalent(e);
    let target = e.accountId && data.accounts.some((a) => a.id === e.accountId) ? e.accountId : null;
    if (!target) {
      const words = tokens(e.name);
      target =
        data.accounts.find((a) => {
          const name = tokens(a.name);
          return name.length > 0 && name.every((w) => words.includes(w));
        })?.id ??
        data.holdings.find((h) => {
          const held = tokens(h.name);
          return words.length > 0 && words.every((w) => held.includes(w));
        })?.accountId ??
        null;
    }
    if (target) guessed.set(target, (guessed.get(target) ?? 0) + monthly);
    else unmatched.push({ name: e.name, monthly });
  }

  const accounts: ProjectionAccount[] = data.accounts
    .map((a) => {
      const value = latest?.byAccount[a.id] ?? 0;
      const held = data.holdings.filter((h) => h.accountId === a.id);
      const heldValue = held.reduce((s, h) => s + h.value, 0);
      const volatility =
        heldValue > 0
          ? held.reduce((s, h) => s + (h.value / heldValue) * (findInstrument(h.isin, h.name)?.volatility ?? DEFAULT_VOLATILITY[a.type] ?? 0.1), 0)
          : DEFAULT_VOLATILITY[a.type] ?? 0.1;
      const own = saved.accounts[a.id];
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        color: colors.get(a.id) ?? "var(--text-muted)",
        value,
        monthly: own?.monthly ?? Math.round((guessed.get(a.id) ?? 0) * 100) / 100,
        rate: own?.rate ?? DEFAULT_RATE[a.type] ?? 0.02,
        volatility,
      };
    })
    .filter((a) => a.value > 0 || a.monthly > 0);

  return (
    <ProjectionView
      accounts={accounts}
      initialYears={saved.years ?? 10}
      initialRealTerms={saved.realTerms ?? false}
      inflation={DEFAULT_INFLATION}
      hasSaved={Object.keys(saved.accounts).length > 0}
      unmatched={unmatched}
    />
  );
}
