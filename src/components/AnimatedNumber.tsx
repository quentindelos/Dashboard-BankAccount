"use client";

import { useEffect, useRef, useState } from "react";

const FORMATS = {
  eur0: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
  eur2: new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }),
} as const;

export type NumberFormat = keyof typeof FORMATS | "pct0" | "pct1";

function format(value: number, kind: NumberFormat): string {
  if (kind === "pct0" || kind === "pct1") {
    return `${(value * 100).toFixed(kind === "pct0" ? 0 : 1).replace(".", ",")} %`;
  }
  return FORMATS[kind].format(value);
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A number that rolls to its new value instead of jumping. On first display it
 * counts up from 85 % of the value; afterwards it rolls from the previous value
 * and briefly tints green or red depending on the direction.
 * The format is a name (not a function) so server components can use it too.
 */
export default function AnimatedNumber({
  value,
  format: kind = "eur0",
  duration = 700,
  prefix = "",
}: {
  value: number;
  format?: NumberFormat;
  duration?: number;
  prefix?: string;
}) {
  const [shown, setShown] = useState(value * 0.85);
  const [trend, setTrend] = useState<"up" | "down" | null>(null);
  // What is on screen right now: the next animation starts from there.
  const current = useRef(value * 0.85);
  // Last target value, to know whether it went up or down.
  const previous = useRef<number | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const start = current.current;
    const still = reducedMotion();
    if (!still && previous.current !== null && previous.current !== value) setTrend(value > previous.current ? "up" : "down");
    previous.current = value;
    if (still || start === value) {
      current.current = value;
      setShown(value);
      return;
    }

    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      current.current = start + (value - start) * easeOutCubic(t);
      setShown(current.current);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setTrend(null);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, duration]);

  return (
    <span className={`anim-number${trend ? ` anim-number-${trend}` : ""}`}>
      {prefix}
      {format(shown, kind)}
    </span>
  );
}
