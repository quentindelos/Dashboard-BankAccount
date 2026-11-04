// Small presentational building blocks shared by the Synthèse and Analyse
// pages. No hooks: usable from server and client components alike.

import Link from "next/link";
import type { Advice, AdviceLevel, Slice } from "@/lib/analysis";

export const eur0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const eur2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits).replace(".", ",")} %`;
}

export function signed(x: number, fmt: (n: number) => string): string {
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${fmt(Math.abs(x))}`;
}

export function Delta({ value, pct, suffix }: { value: number; pct?: number | null; suffix?: string }) {
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "";
  return (
    <span className="delta">
      <span className={cls}>{signed(value, (n) => eur0.format(n))}</span>
      {pct !== undefined && pct !== null && Number.isFinite(pct) && (
        <span className={`pill ${cls}`}>
          {value >= 0 ? "▲" : "▼"} {formatPct(Math.abs(pct), 2)}
        </span>
      )}
      {suffix && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{suffix}</span>}
    </span>
  );
}

/** Part-to-whole: thin segmented bar + ranked list with values. */
export function Allocation({ slices, colorFor }: { slices: Slice[]; colorFor: (key: string) => string }) {
  const visible = slices.filter((s) => s.value > 0);
  return (
    <>
      <div className="seg-bar" role="img" aria-label={visible.map((s) => `${s.label} ${formatPct(s.pct, 0)}`).join(", ")}>
        {visible.map((s) => (
          <span key={s.key} style={{ flex: s.value, background: colorFor(s.key) }} title={`${s.label} : ${eur0.format(s.value)}`} />
        ))}
      </div>
      <div className="alloc-list">
        {visible.map((s) => (
          <div className="alloc-row" key={s.key}>
            <span className="legend-item" style={{ fontSize: 13 }}>
              <span className="legend-dot" style={{ background: colorFor(s.key) }} />
              {s.label}
            </span>
            <span className="alloc-value">
              {eur0.format(s.value)} <span className="muted">{formatPct(s.pct, 0)}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Ranked horizontal bars, optionally paired with a benchmark bar. */
export function HBars({ slices, showBenchmark = false, max }: { slices: Slice[]; showBenchmark?: boolean; max?: number }) {
  const scale = max ?? Math.max(...slices.map((s) => Math.max(s.pct, showBenchmark ? s.benchmark ?? 0 : 0)), 0.0001);
  return (
    <div className="hbars">
      {slices.map((s) => (
        <div className="hbar-row" key={s.key} title={`${s.label} : ${eur0.format(s.value)}${showBenchmark ? ` · Monde ${formatPct(s.benchmark ?? 0)}` : ""}`}>
          <span className="hbar-label">{s.label}</span>
          <span className="hbar-track">
            <span className="hbar" style={{ width: `${(s.pct / scale) * 100}%`, opacity: s.pct > 0 ? 1 : 0 }} />
            {showBenchmark && <span className="hbar bench" style={{ width: `${((s.benchmark ?? 0) / scale) * 100}%` }} />}
          </span>
          <span className="hbar-value">{formatPct(s.pct, 0)}</span>
        </div>
      ))}
      {showBenchmark && (
        <div className="legend" style={{ marginTop: 2 }}>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "var(--series-1)" }} />
            Toi
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "var(--baseline)", height: 4 }} />
            Marché mondial (MSCI ACWI)
          </span>
        </div>
      )}
    </div>
  );
}

const ADVICE_META: Record<AdviceLevel, { tag: string; icon: React.ReactNode }> = {
  important: {
    tag: "Important",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 7v6M12 17h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  attention: {
    tag: "À surveiller",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
    ),
  },
  info: {
    tag: "Idée",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
      </svg>
    ),
  },
  ok: {
    tag: "Bien",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12 5 5 9-10" />
      </svg>
    ),
  },
};

export function AdviceList({ advice, limit, moreHref }: { advice: Advice[]; limit?: number; moreHref?: string }) {
  const shown = limit ? advice.slice(0, limit) : advice;
  if (advice.length === 0) return <p className="muted">Rien à signaler pour l'instant.</p>;
  return (
    <div className="advice-list">
      {shown.map((a, i) => (
        <div className={`advice ${a.level}`} key={i}>
          <span className="advice-icon">{ADVICE_META[a.level].icon}</span>
          <div>
            <span className="advice-tag">{ADVICE_META[a.level].tag}</span>
            <p className="advice-title">{a.title}</p>
            <p className="advice-body">{a.body}</p>
          </div>
        </div>
      ))}
      {moreHref && limit && advice.length > limit && (
        <Link href={moreHref} className="btn" style={{ alignSelf: "flex-start" }}>
          Voir les {advice.length} recommandations →
        </Link>
      )}
    </div>
  );
}

export function RiskMeter({ level }: { level: number }) {
  return (
    <div className="risk-meter" role="img" aria-label={`Niveau de risque ${level} sur 7`}>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className={i + 1 === level ? "current" : i + 1 < level ? "on" : ""} />
      ))}
    </div>
  );
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  actions: "var(--series-1)",
  fonds_euros: "var(--series-2)",
  matelas: "var(--series-3)",
  or: "var(--series-4)",
  crypto: "var(--series-5)",
  liquidites: "var(--baseline)",
  autre: "var(--text-muted)",
};

export function assetClassColor(key: string): string {
  return ASSET_CLASS_COLORS[key] ?? "var(--text-muted)";
}

export function riskLabel(level: number): string {
  return ["", "Très prudent", "Prudent", "Modéré", "Équilibré", "Dynamique", "Offensif", "Très offensif"][level] ?? "";
}
