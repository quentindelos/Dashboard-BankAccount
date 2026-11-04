// Career step in the projection: from a given month, a new salary replaces
// the current one (and the benefits it makes you lose), and part of the
// difference is invested on top of the current deposits.

/** Income tax scale (barème 2025 on 2024 income), one part (single person). */
const TAX_BRACKETS: [number, number][] = [
  [11_497, 0],
  [29_315, 0.11],
  [83_823, 0.3],
  [180_294, 0.41],
  [Infinity, 0.45],
];

function incomeTax(taxable: number): number {
  let tax = 0;
  let floor = 0;
  for (const [ceiling, rate] of TAX_BRACKETS) {
    if (taxable > floor) tax += (Math.min(taxable, ceiling) - floor) * rate;
    floor = ceiling;
  }
  return tax;
}

/**
 * Monthly take-home pay (after social contributions and income tax withheld
 * at source) for a yearly gross salary, as a "cadre" in the private sector:
 * about 22 % of employee contributions, taxable income = net + non-deductible
 * CSG/CRDS (~3 %) minus the 10 % professional expenses allowance.
 */
export function netMonthlyFromGross(grossYearly: number): number {
  const net = grossYearly * 0.78;
  const taxable = net * 1.03 * 0.9;
  return (net - incomeTax(taxable)) / 12;
}

/** Young Bac+5 graduates at Thales (France, 2026 market estimates). */
export const THALES_GRADUATE_RANGE: [number, number] = [39_000, 47_000];

export interface CareerSettings {
  /** First month of the new job, "YYYY-MM". */
  start: string;
  /** Yearly gross salary (EUR). */
  gross: number;
  /** Yearly nominal raise (fraction). */
  raise: number;
  /** Share of the extra income that is invested (fraction). */
  share: number;
  /** Account that receives the extra investment. */
  to: string;
  /** Income lines (recurring expense ids) that stop with the new job. */
  stops: string[];
}

export interface CareerIncome {
  id: string;
  name: string;
  category: string;
  monthly: number;
}

/** Extra money invested each month, `m` months after the new job starts. */
export function careerExtra(settings: CareerSettings, replaced: number): (m: number) => number {
  const net = netMonthlyFromGross(settings.gross);
  return (m) => settings.share * Math.max(net * Math.pow(1 + settings.raise, Math.floor(m / 12)) - replaced, 0);
}
