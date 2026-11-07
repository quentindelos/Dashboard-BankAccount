import { prisma } from "@/lib/db";
import { loadPortfolio } from "@/lib/portfolio";
import { accountColors } from "@/lib/accountTypes";
import { findInstrument } from "@/lib/instruments";
import { isIncome, isSavings, monthlyEquivalent } from "@/lib/expenses";
import type { CareerIncome, CareerSettings } from "@/lib/career";
import {
  CEILINGS,
  DEFAULT_INFLATION,
  DEFAULT_RATE,
  DEFAULT_VOLATILITY,
  LIVRET_JEUNE_CEILING,
  LIVRET_JEUNE_RATE,
  instrumentReturn,
  isYouthLivret,
  type ProjectionAccount,
} from "@/lib/projection";
import { loadProjectionSettings } from "@/lib/projectionSettings";
import { getSettings } from "@/lib/settings";
import { loadProfile } from "@/lib/profile";
import ProjectionView from "@/components/ProjectionView";

// The Livret Jeune must be closed by 31 December of the year of the 25th
// birthday: from the birth date on Mon compte, else this default.
const DEFAULT_YOUTH_CLOSE_YEAR = 2029;

const tokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export default async function ProjectionPage() {
  const [data, expenses, saved, settings, profile] = await Promise.all([
    loadPortfolio(),
    prisma.recurringExpense.findMany({ where: { active: true } }),
    loadProjectionSettings(),
    getSettings(),
    loadProfile(),
  ]);
  const youthCloseYear = profile.birthDate ? Number(profile.birthDate.slice(0, 4)) + 25 : DEFAULT_YOUTH_CLOSE_YEAR;
  // Safety cushion: same target as on the Synthèse (monthly expenses × months).
  const cushionTarget = settings.monthlyExpenses ? settings.monthlyExpenses * settings.cushionMonths : undefined;
  const cushionIds = new Set(data.otherAssets.filter((o) => o.emergencyFund).map((o) => o.accountId));
  // Once the cushion is full its deposit goes to the chosen account, by default the PEA (else CTO, assurance vie).
  const investable = data.accounts.filter((a) => ["PEA", "CTO", "ASSURANCE_VIE", "PER", "EPARGNE_SALARIALE", "CRYPTO"].includes(a.type));
  const defaultOverflow = ["PEA", "CTO", "ASSURANCE_VIE"].map((t) => investable.find((a) => a.type === t)).find(Boolean)?.id;
  const overflowTo =
    saved.overflowTo && investable.some((a) => a.id === saved.overflowTo) ? saved.overflowTo : defaultOverflow ?? null;
  const latest = data.series.at(-1);
  const colors = accountColors(data.accounts);
  const savings = expenses.filter(isSavings);
  const incomes: CareerIncome[] = expenses
    .filter(isIncome)
    .map((e) => ({ id: e.id, name: e.name, category: e.category, monthly: monthlyEquivalent(e) }));

  // After the degree: CDI at Thales from October 2027. The new salary replaces
  // the current one, and means-tested benefits (APL, prime d'activité) stop.
  const careerDefaults: CareerSettings = {
    start: "2027-10",
    gross: 42_000,
    raise: 0.035,
    share: 0.5,
    to: defaultOverflow ?? investable[0]?.id ?? "",
    stops: incomes.filter((i) => i.category === "AIDES").map((i) => i.id),
  };
  const savedCareer = saved.career ?? null;
  const career: CareerSettings = savedCareer
    ? {
        ...savedCareer,
        to: investable.some((a) => a.id === savedCareer.to) ? savedCareer.to : careerDefaults.to,
        stops: savedCareer.stops.filter((id) => incomes.some((i) => i.id === id)),
      }
    : careerDefaults;

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
      const youth = isYouthLivret(a);
      // Average of the expected returns of the lines held, weighted by value;
      // unknown lines count at the account type's default.
      const typeRate = youth ? LIVRET_JEUNE_RATE : DEFAULT_RATE[a.type] ?? 0.02;
      const defaultRate =
        heldValue > 0
          ? held.reduce((s, h) => s + (h.value / heldValue) * (instrumentReturn(findInstrument(h.isin, h.name)) ?? typeRate), 0)
          : typeRate;
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        color: colors.get(a.id) ?? "var(--text-muted)",
        value,
        monthly: own?.monthly ?? Math.round((guessed.get(a.id) ?? 0) * 100) / 100,
        rate: own?.rate ?? Math.round(defaultRate * 1000) / 1000,
        defaultRate: Math.round(defaultRate * 1000) / 1000,
        volatility,
        ceiling: youth ? LIVRET_JEUNE_CEILING : CEILINGS[a.type],
        youth,
        cushionTarget: cushionIds.has(a.id) ? cushionTarget : undefined,
        overflowTo: cushionIds.has(a.id) ? overflowTo ?? undefined : undefined,
        // At 25 the Livret Jeune money goes to another livret of the same bank, else any livret.
        transferTo: youth
          ? (data.accounts.find((o) => o.type === "LIVRET" && !isYouthLivret(o) && o.institution === a.institution) ??
              data.accounts.find((o) => o.type === "LIVRET" && !isYouthLivret(o)))?.id
          : undefined,
      };
    })
    .filter((a) => a.value > 0 || a.monthly > 0);

  return (
    <ProjectionView
      accounts={accounts}
      initialYears={saved.years ?? 10}
      youthCloseYear={youthCloseYear}
      initialOverflowTo={overflowTo}
      investable={investable.map((a) => ({ id: a.id, name: a.name }))}
      inflation={DEFAULT_INFLATION}
      hasSaved={Object.keys(saved.accounts).length > 0}
      unmatched={unmatched}
      incomes={incomes}
      initialCareer={career}
    />
  );
}
