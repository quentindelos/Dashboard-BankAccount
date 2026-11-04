import { prisma } from "@/lib/db";
import { isSavings, totalMonthly, type ExpenseRow } from "@/lib/expenses";

export interface AppSettings {
  /** Monthly total of the recurring expenses (null when none are entered). */
  monthlyExpenses: number | null;
  /** Target size of the safety cushion, in months of expenses. */
  cushionMonths: number;
  /** Active savings transfers going to a safety-cushion account. */
  cushionTransfers: Pick<ExpenseRow, "amount" | "frequency" | "startMonth" | "dayOfMonth">[];
}

export const DEFAULT_CUSHION_MONTHS = 6;

export async function getSettings(): Promise<AppSettings> {
  const [row, expenses] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "cushionMonths" } }),
    prisma.recurringExpense.findMany({ where: { active: true }, include: { account: { select: { emergencyFund: true, archived: true } } } }),
  ]);
  const months = Number(row?.value);
  const monthly = totalMonthly(expenses);
  return {
    monthlyExpenses: monthly > 0 ? monthly : null,
    cushionMonths: Number.isInteger(months) && months > 0 ? months : DEFAULT_CUSHION_MONTHS,
    cushionTransfers: expenses
      .filter((e) => isSavings(e) && e.account?.emergencyFund && !e.account.archived)
      .map((e) => ({ amount: e.amount, frequency: e.frequency, startMonth: e.startMonth, dayOfMonth: e.dayOfMonth })),
  };
}

export async function saveCushionMonths(months: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: "cushionMonths" },
    create: { key: "cushionMonths", value: String(months) },
    update: { value: String(months) },
  });
}
