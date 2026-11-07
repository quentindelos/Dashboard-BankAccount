import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { loadPortfolio } from "@/lib/portfolio";
import ExpensesView from "@/components/ExpensesView";
import CushionSettings from "@/components/CushionSettings";
import { isSavings } from "@/lib/expenses";

export default async function ExpensesPage() {
  const [expenses, settings, data, accounts] = await Promise.all([
    prisma.recurringExpense.findMany({ orderBy: [{ dayOfMonth: "asc" }, { name: "asc" }] }),
    getSettings(),
    loadPortfolio(),
    prisma.account.findMany({ where: { archived: false }, orderBy: { createdAt: "asc" } }),
  ]);
  const latest = data.series.at(-1);

  return (
    <ExpensesView
      initialExpenses={expenses.map((e) => ({
        id: e.id,
        name: e.name,
        amount: e.amount,
        category: e.category,
        dayOfMonth: e.dayOfMonth,
        frequency: e.frequency,
        startMonth: e.startMonth,
        active: e.active,
        note: e.note,
        accountId: e.accountId,
        inCushion: e.inCushion,
      }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      cushion={
        <CushionSettings
          // Only savings accounts can hold the cushion; investment accounts
          // (PEA, CTO, AV...) are hidden unless already selected, so they can be unticked.
          accounts={accounts.filter((a) => a.type === "LIVRET" || a.emergencyFund).map((a) => ({
            id: a.id,
            name: a.name,
            type: a.type,
            value: latest?.byAccount[a.id] ?? 0,
            emergencyFund: a.emergencyFund,
          }))}
          cushionMonths={settings.cushionMonths}
          transfers={expenses
            .filter((e) => e.active && isSavings(e) && e.accountId)
            .map((e) => ({ accountId: e.accountId!, amount: e.amount, frequency: e.frequency, startMonth: e.startMonth, dayOfMonth: e.dayOfMonth }))}
          monthlyTotal={settings.monthlyExpenses ?? 0}
        />
      }
    />
  );
}
