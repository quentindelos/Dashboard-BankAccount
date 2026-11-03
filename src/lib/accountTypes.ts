// Fixed categorical mapping: account type -> display label + chart color.
// Order and hue assignment follow the validated categorical palette
// (see the dataviz skill) and must stay FIXED — never reassign colors based
// on which types happen to be present, only on the type itself.
export const ACCOUNT_TYPE_META: Record<
  string,
  { label: string; colorLight: string; colorDark: string }
> = {
  ASSURANCE_VIE: { label: "Assurance vie", colorLight: "#2a78d6", colorDark: "#3987e5" },
  LIVRET: { label: "Livret", colorLight: "#eb6834", colorDark: "#d95926" },
  CTO: { label: "Compte-titres (CTO)", colorLight: "#1baf7a", colorDark: "#199e70" },
  PEA: { label: "PEA", colorLight: "#eda100", colorDark: "#c98500" },
  PER: { label: "PER", colorLight: "#e87ba4", colorDark: "#d55181" },
  AUTRE: { label: "Autre", colorLight: "#4a3aa7", colorDark: "#9085e9" },
};

export const ACCOUNT_TYPE_ORDER = ["ASSURANCE_VIE", "LIVRET", "CTO", "PEA", "PER", "AUTRE"] as const;

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_META[type]?.label ?? type;
}
