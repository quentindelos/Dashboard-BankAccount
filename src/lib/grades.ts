// Words for the grades shown on the Synthèse, the Analyse page and the PDF report.

/** Word for a portfolio grade out of 10 (higher is better). */
export function scoreLabel(score: number): string {
  if (score >= 8.5) return "Excellent";
  if (score >= 7) return "Bon";
  if (score >= 5.5) return "Correct";
  if (score >= 4) return "À améliorer";
  return "Fragile";
}

/** Tone of a grade, for its colour. */
export function scoreTone(score: number): "good" | "mid" | "bad" {
  if (score >= 7) return "good";
  if (score >= 4.5) return "mid";
  return "bad";
}

/** Word for a risk level out of 10 (higher is riskier, not worse). */
export function riskLabel(level: number): string {
  return ["", "Très prudent", "Prudent", "Prudent", "Modéré", "Équilibré", "Équilibré", "Dynamique", "Dynamique", "Offensif", "Très offensif"][level] ?? "";
}

/** "6,4" */
export const formatGrade = (score: number) => score.toFixed(1).replace(".", ",").replace(",0", "");
