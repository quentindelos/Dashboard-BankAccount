// Chart chrome tokens (axis/grid/text), mirroring the CSS variables in
// globals.css. Recharts needs real color strings (not CSS vars) for its SVG
// props, so these are the JS-side source of truth for the two modes.
export function chartChrome(isDark: boolean) {
  return {
    surface: isDark ? "#1a1a19" : "#fcfcfb",
    textSecondary: isDark ? "#c3c2b7" : "#52514e",
    textMuted: "#898781",
    gridline: isDark ? "#2c2c2a" : "#e1e0d9",
    baseline: isDark ? "#383835" : "#c3c2b7",
    border: isDark ? "rgba(255,255,255,0.1)" : "rgba(11,11,11,0.1)",
  };
}
