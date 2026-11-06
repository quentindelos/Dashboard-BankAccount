// Recurring expenses ("charges du mois"): categories, frequencies and the
// maths shared by the calendar page and the safety cushion.

// Categories are grouped into families. Each family owns one of the eight
// categorical color slots (never reassigned by rank); categories inside a
// family share it and are told apart by their emoji + label, so color is
// never the only cue.
export const CATEGORY_GROUPS = [
  { id: "revenus", label: "Revenus", color: "var(--chart-line)" },
  { id: "maison", label: "Maison", color: "var(--series-1)" },
  { id: "quotidien", label: "Vie quotidienne", color: "var(--series-2)" },
  { id: "transport", label: "Transport", color: "var(--series-3)" },
  { id: "abonnements", label: "Abonnements", color: "var(--series-4)" },
  { id: "protection", label: "Assurances & santé", color: "var(--series-5)" },
  { id: "epargne", label: "Épargne", color: "var(--series-6)" },
  { id: "loisirs", label: "Loisirs", color: "var(--series-7)" },
  { id: "obligations", label: "Impôts & crédits", color: "var(--series-8)" },
  { id: "autre", label: "Autre", color: "var(--text-muted)" },
] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]["id"];

export const EXPENSE_CATEGORIES = [
  "SALAIRE",
  "PRIMES",
  "AIDES",
  "VIREMENTS_RECUS",
  "REVENUS_LOCATIFS",
  "REVENUS_AUTRES",
  "LOGEMENT",
  "ENERGIE",
  "TELECOM",
  "COURSES",
  "SHOPPING",
  "FAMILLE",
  "ANIMAUX",
  "TRANSPORT",
  "ABONNEMENTS",
  "ASSURANCES",
  "SANTE",
  "EPARGNE",
  "INVESTISSEMENT",
  "LOISIRS",
  "VOYAGES",
  "CADEAUX",
  "IMPOTS",
  "CREDIT",
  "BANQUE",
  "AUTRE",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

interface CategoryInfo {
  label: string;
  emoji: string;
  group: CategoryGroup;
  /** Money set aside, not spent: left out of the safety cushion. */
  savings?: boolean;
  /** Money coming in (salary...): never counted as a charge. */
  income?: boolean;
}

const CATEGORIES: Record<ExpenseCategory, CategoryInfo> = {
  SALAIRE: { label: "Salaire", emoji: "💼", group: "revenus", income: true },
  PRIMES: { label: "Primes & bonus", emoji: "🎉", group: "revenus", income: true },
  AIDES: { label: "Aides & allocations", emoji: "🤝", group: "revenus", income: true },
  VIREMENTS_RECUS: { label: "Virements reçus (proches)", emoji: "👥", group: "revenus", income: true },
  REVENUS_LOCATIFS: { label: "Revenus locatifs", emoji: "🏘️", group: "revenus", income: true },
  REVENUS_AUTRES: { label: "Autres revenus", emoji: "💶", group: "revenus", income: true },
  LOGEMENT: { label: "Loyer & logement", emoji: "🏠", group: "maison" },
  ENERGIE: { label: "Énergie & eau", emoji: "⚡", group: "maison" },
  TELECOM: { label: "Internet & mobile", emoji: "🌐", group: "maison" },
  COURSES: { label: "Courses & repas", emoji: "🛒", group: "quotidien" },
  SHOPPING: { label: "Shopping & vêtements", emoji: "🛍️", group: "quotidien" },
  FAMILLE: { label: "Famille & enfants", emoji: "👶", group: "quotidien" },
  ANIMAUX: { label: "Animaux", emoji: "🐾", group: "quotidien" },
  TRANSPORT: { label: "Transport & carburant", emoji: "🚗", group: "transport" },
  ABONNEMENTS: { label: "Abonnements", emoji: "📺", group: "abonnements" },
  ASSURANCES: { label: "Assurances", emoji: "🛡️", group: "protection" },
  SANTE: { label: "Santé & mutuelle", emoji: "💊", group: "protection" },
  EPARGNE: { label: "Épargne (livrets)", emoji: "🐷", group: "epargne", savings: true },
  INVESTISSEMENT: { label: "Investissement (PEA, CTO...)", emoji: "📈", group: "epargne", savings: true },
  LOISIRS: { label: "Loisirs & sorties", emoji: "🎟️", group: "loisirs" },
  VOYAGES: { label: "Voyages & vacances", emoji: "✈️", group: "loisirs" },
  CADEAUX: { label: "Cadeaux & dons", emoji: "🎁", group: "loisirs" },
  IMPOTS: { label: "Impôts & taxes", emoji: "🧾", group: "obligations" },
  CREDIT: { label: "Crédits & prêts", emoji: "💳", group: "obligations" },
  BANQUE: { label: "Frais bancaires", emoji: "🏦", group: "obligations" },
  AUTRE: { label: "Autre", emoji: "•", group: "autre" },
};

export const CATEGORY_META: Record<ExpenseCategory, CategoryInfo & { color: string }> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c, { ...CATEGORIES[c], color: CATEGORY_GROUPS.find((g) => g.id === CATEGORIES[c].group)!.color }]),
) as Record<ExpenseCategory, CategoryInfo & { color: string }>;

export const FREQUENCIES = ["MENSUEL", "TRIMESTRIEL", "SEMESTRIEL", "ANNUEL"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_META: Record<Frequency, { label: string; short: string; months: number }> = {
  MENSUEL: { label: "Chaque mois", short: "", months: 1 },
  TRIMESTRIEL: { label: "Tous les 3 mois", short: "trim.", months: 3 },
  SEMESTRIEL: { label: "Tous les 6 mois", short: "sem.", months: 6 },
  ANNUEL: { label: "Une fois par an", short: "annuel", months: 12 },
};

export interface ExpenseRow {
  id: string;
  name: string;
  amount: number;
  category: string;
  dayOfMonth: number | null;
  frequency: string;
  startMonth: number; // 1-12
  active: boolean;
  note: string | null;
  /** Destination account of a savings transfer. */
  accountId: string | null;
}

function periodMonths(frequency: string): number {
  return FREQUENCY_META[frequency as Frequency]?.months ?? 1;
}

/** Average cost per month (an annual 600 € insurance counts as 50 €/month). */
export function monthlyEquivalent(e: Pick<ExpenseRow, "amount" | "frequency">): number {
  return e.amount / periodMonths(e.frequency);
}

/** Whether the charge is due in the given month (1-12). */
export function occursInMonth(e: Pick<ExpenseRow, "frequency" | "startMonth">, month: number): boolean {
  const period = periodMonths(e.frequency);
  if (period === 1) return true;
  return (((month - e.startMonth) % period) + period) % period === 0;
}

export function categoryMeta(category: string) {
  return CATEGORY_META[category as ExpenseCategory] ?? CATEGORY_META.AUTRE;
}

export function isSavings(e: Pick<ExpenseRow, "category">): boolean {
  return categoryMeta(e.category).savings === true;
}

export function isIncome(e: Pick<ExpenseRow, "category">): boolean {
  return categoryMeta(e.category).income === true;
}

/** Money going out (charge or savings), as opposed to income. */
export function isOutflow(e: Pick<ExpenseRow, "category">): boolean {
  return !isIncome(e);
}

/** Monthly cost of living: active charges, savings and income excluded. Base of the safety cushion. */
export function totalMonthly(expenses: ExpenseRow[]): number {
  return expenses.filter((e) => e.active && !isSavings(e) && !isIncome(e)).reduce((s, e) => s + monthlyEquivalent(e), 0);
}

/** Monthly income (salary, bonuses smoothed over the year...). */
export function totalIncome(expenses: ExpenseRow[]): number {
  return expenses.filter((e) => e.active && isIncome(e)).reduce((s, e) => s + monthlyEquivalent(e), 0);
}

/** Monthly amount set aside (savings + investments). */
export function totalSavings(expenses: ExpenseRow[]): number {
  return expenses.filter((e) => e.active && isSavings(e)).reduce((s, e) => s + monthlyEquivalent(e), 0);
}

/**
 * When will the cushion reach its target, given the savings transfers going to
 * its accounts? Walks month by month through the upcoming payments (transfers
 * earlier this month are assumed to be in the balance already).
 */
export function cushionProjection(
  amount: number,
  target: number,
  transfers: Pick<ExpenseRow, "amount" | "frequency" | "startMonth" | "dayOfMonth">[],
  from = new Date(),
): { monthly: number; date: Date | null } {
  const monthly = transfers.reduce((s, t) => s + monthlyEquivalent(t), 0);
  if (amount >= target || monthly <= 0) return { monthly, date: null };
  let total = amount;
  for (let i = 0; i < 600; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    const month = d.getMonth() + 1;
    const days = new Date(d.getFullYear(), month, 0).getDate();
    const due = transfers
      .filter((t) => occursInMonth(t, month))
      .map((t) => ({ t, day: Math.min(t.dayOfMonth ?? 28, days) }))
      .filter(({ day }) => i > 0 || day >= from.getDate())
      .sort((a, b) => a.day - b.day);
    for (const { t, day } of due) {
      total += t.amount;
      if (total >= target) return { monthly, date: new Date(d.getFullYear(), month - 1, day) };
    }
  }
  return { monthly, date: null };
}
