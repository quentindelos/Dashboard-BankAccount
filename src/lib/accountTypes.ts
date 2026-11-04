// Fixed categorical mapping: account type -> display label + chart color.
// Order and hue assignment follow the validated categorical palette
// (see the dataviz skill) and must stay FIXED — never reassign colors based
// on which types happen to be present, only on the type itself.
// `cssVar` points at the same color through the CSS tokens in globals.css,
// for plain-HTML marks that should follow the theme automatically.
export const ACCOUNT_TYPE_META: Record<
  string,
  { label: string; short: string; colorLight: string; colorDark: string; cssVar: string }
> = {
  ASSURANCE_VIE: { label: "Assurance vie", short: "AV", colorLight: "#2a78d6", colorDark: "#3987e5", cssVar: "var(--series-1)" },
  LIVRET: { label: "Livret", short: "Livret", colorLight: "#eb6834", colorDark: "#d95926", cssVar: "var(--series-2)" },
  CTO: { label: "Compte-titres (CTO)", short: "CTO", colorLight: "#1baf7a", colorDark: "#199e70", cssVar: "var(--series-3)" },
  PEA: { label: "PEA", short: "PEA", colorLight: "#eda100", colorDark: "#c98500", cssVar: "var(--series-4)" },
  PER: { label: "PER", short: "PER", colorLight: "#e87ba4", colorDark: "#d55181", cssVar: "var(--series-5)" },
  EPARGNE_SALARIALE: { label: "Épargne salariale (PEE / PERCOL)", short: "PEE", colorLight: "#008300", colorDark: "#008300", cssVar: "var(--series-6)" },
  CRYPTO: { label: "Crypto", short: "Crypto", colorLight: "#6250d6", colorDark: "#9085e9", cssVar: "var(--series-7)" },
  AUTRE: { label: "Autre", short: "Autre", colorLight: "#e34948", colorDark: "#e66767", cssVar: "var(--series-8)" },
};

export const ACCOUNT_TYPE_ORDER = ["ASSURANCE_VIE", "LIVRET", "CTO", "PEA", "PER", "EPARGNE_SALARIALE", "CRYPTO", "AUTRE"] as const;

// Slots not used by any account type, handed to the 2nd, 3rd… account of a
// type that already appears (e.g. two livrets) in per-account charts.
const SPARE_SLOTS = ["var(--series-5)", "var(--series-8)", "var(--series-7)", "var(--series-6)"];

/** Fixed color per account: its type's color, or a spare slot for a second account of the same type. */
export function accountColors(accounts: { id: string; type: string }[]): Map<string, string> {
  const usedTypes = new Set<string>();
  const usedColors = new Set<string>();
  const colors = new Map<string, string>();
  const pending: string[] = [];
  for (const a of accounts) {
    if (!usedTypes.has(a.type)) {
      usedTypes.add(a.type);
      const c = accountTypeCssVar(a.type);
      colors.set(a.id, c);
      usedColors.add(c);
    } else pending.push(a.id);
  }
  const spare = SPARE_SLOTS.filter((c) => !usedColors.has(c));
  pending.forEach((id, i) => colors.set(id, spare[i] ?? "var(--text-muted)"));
  return colors;
}

/** Accounts held at Trade Republic are filled only by the transactions export (Réglages). */
export function isTradeRepublic(institution: string | null | undefined): boolean {
  return /trade\s*republic/i.test(institution ?? "");
}

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_META[type]?.label ?? type;
}

export function accountTypeShort(type: string): string {
  return ACCOUNT_TYPE_META[type]?.short ?? type;
}

export function accountTypeCssVar(type: string): string {
  return ACCOUNT_TYPE_META[type]?.cssVar ?? "var(--text-muted)";
}
