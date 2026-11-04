"use client";

import { useEffect, useState } from "react";

/** Resolved values of the given CSS custom properties on <html>, kept in
 * sync when the theme (`data-theme`) changes. Recharts needs real color
 * strings for some SVG props, so charts read the theme through this. */
export function useCssVars<K extends string>(names: readonly K[]): Record<K, string> {
  const read = () => {
    const out = {} as Record<K, string>;
    if (typeof window === "undefined") {
      for (const n of names) out[n] = "";
      return out;
    }
    const style = getComputedStyle(document.documentElement);
    for (const n of names) out[n] = style.getPropertyValue(n).trim();
    return out;
  };

  const [values, setValues] = useState<Record<K, string>>(() => {
    const empty = {} as Record<K, string>;
    for (const n of names) empty[n] = "";
    return empty;
  });

  useEffect(() => {
    setValues(read());
    const observer = new MutationObserver(() => setValues(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names.join("|")]);

  return values;
}

const CHART_VARS = [
  "--surface-1",
  "--text-muted",
  "--gridline",
  "--baseline",
  "--chart-line",
  "--chart-line-2",
  "--series-1",
  "--series-2",
  "--series-3",
  "--series-4",
  "--series-5",
  "--series-7",
] as const;

export function useChartTheme() {
  const v = useCssVars(CHART_VARS);
  return {
    surface: v["--surface-1"] || "#141831",
    textMuted: v["--text-muted"] || "#7f86ab",
    gridline: v["--gridline"] || "#232849",
    baseline: v["--baseline"] || "#363d68",
    line: v["--chart-line"] || "#8b7dff",
    line2: v["--chart-line-2"] || v["--chart-line"] || "#8b7dff",
    series: (cssVar: string) => v[cssVar.replace(/^var\((.*)\)$/, "$1") as (typeof CHART_VARS)[number]] || "#888",
  };
}
