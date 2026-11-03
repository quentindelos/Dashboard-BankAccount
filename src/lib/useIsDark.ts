"use client";

import { useEffect, useState } from "react";

/** Tracks whether the chart surface is currently dark: explicit data-theme
 * attribute wins, falls back to the OS preference, and stays reactive to
 * both the OS setting changing and the in-page theme toggle (Navbar sets
 * `data-theme` directly without a reload). */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    function compute() {
      const explicit = document.documentElement.getAttribute("data-theme");
      if (explicit === "dark") return true;
      if (explicit === "light") return false;
      return mql.matches;
    }

    setIsDark(compute());

    const onMediaChange = () => setIsDark(compute());
    mql.addEventListener("change", onMediaChange);

    const observer = new MutationObserver(() => setIsDark(compute()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      mql.removeEventListener("change", onMediaChange);
      observer.disconnect();
    };
  }, []);

  return isDark;
}
