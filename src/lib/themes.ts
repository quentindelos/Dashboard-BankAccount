// Available color themes. The chosen id is stored in the "theme" cookie and
// rendered server-side as <html data-theme="...">; the matching CSS tokens
// live in globals.css. `swatches` only feed the preview in Réglages.

export const THEMES = [
  {
    id: "nuit",
    label: "Bleu nuit",
    description: "Sombre, accent violet, gains en vert menthe",
    swatches: ["#0b0e1c", "#141831", "#7c6cff", "#34d399"],
  },
  {
    id: "clair",
    label: "Clair",
    description: "Lumineux et épuré, accent émeraude",
    swatches: ["#f3f5f8", "#ffffff", "#059669", "#0f172a"],
  },
  {
    id: "degrade",
    label: "Dégradé",
    description: "Noir profond, cartes effet verre, violet → rose",
    swatches: ["#07060c", "#8b5cf6", "#ec4899", "#4ade80"],
  },
  {
    id: "dore",
    label: "Doré",
    description: "Sombre et sobre, accent or",
    swatches: ["#09090d", "#121218", "#f0b97a", "#0ca30c"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "nuit";

export function parseTheme(value: string | undefined): ThemeId {
  if (value === "light") return "clair"; // legacy light/dark toggle values
  if (value === "dark") return "nuit";
  return THEMES.some((t) => t.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}
