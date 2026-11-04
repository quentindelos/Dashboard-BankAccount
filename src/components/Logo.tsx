"use client";

import { useState } from "react";
import type { LogoKey } from "@/lib/logos";

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}& ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Round logo; falls back to colored initials when there is none. */
export default function Logo({
  logo,
  name,
  color = "var(--text-muted)",
  size = 36,
}: {
  logo: LogoKey | null | undefined;
  name: string;
  color?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = logo ? `/api/logo/${logo}` : null;
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size / 3)) };

  if (!src || failed) {
    return (
      <span className="logo logo-fallback" style={{ ...style, background: color }} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  return (
    <span className="logo" style={style} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}
