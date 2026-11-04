"use client";

import { useState } from "react";
import { THEMES, type ThemeId } from "@/lib/themes";

export default function ThemePicker({ current }: { current: ThemeId }) {
  const [theme, setTheme] = useState<ThemeId>(current);

  function choose(id: ThemeId) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    document.cookie = `theme=${id}; path=/; max-age=31536000; samesite=strict`;
  }

  return (
    <div className="card">
      <h2>Thème</h2>
      <p className="secondary" style={{ marginTop: -4 }}>
        Change les couleurs de toute l'application. Le choix est appliqué tout de suite et mémorisé sur cet appareil.
      </p>
      <div className="theme-grid">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className="theme-option" aria-pressed={theme === t.id} onClick={() => choose(t.id)}>
            <span className="theme-swatches" aria-hidden="true">
              {t.swatches.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
            <span>
              <strong>{t.label}</strong>
              {theme === t.id && <span className="muted"> · actif</span>}
              <span className="muted" style={{ display: "block", fontSize: 12 }}>
                {t.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
