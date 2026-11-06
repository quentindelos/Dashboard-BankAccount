"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountTypeLabel } from "@/lib/accountTypes";
import { eur0 } from "@/components/ui";
import { cushionProjection, type ExpenseRow } from "@/lib/expenses";

type Transfer = Pick<ExpenseRow, "amount" | "frequency" | "startMonth" | "dayOfMonth"> & { accountId: string };
const monthYear = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

interface AccountOption {
  id: string;
  name: string;
  type: string;
  value: number;
  emergencyFund: boolean;
}

/** Safety cushion: which accounts compose it and the target in months of
 * expenses (the monthly total comes from the expenses calendar). */
export default function CushionSettings({
  accounts: initialAccounts,
  cushionMonths,
  monthlyTotal,
  transfers = [],
}: {
  accounts: AccountOption[];
  cushionMonths: number;
  monthlyTotal: number;
  transfers?: Transfer[];
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [months, setMonths] = useState(cushionMonths);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  const sources = accounts.filter((a) => a.emergencyFund);
  const amount = sources.reduce((s, a) => s + a.value, 0);
  const target = monthlyTotal * months;
  const progress = target > 0 ? Math.min(amount / target, 1) : 0;
  const covered = monthlyTotal > 0 ? amount / monthlyTotal : null;
  const sourceIds = new Set(sources.map((a) => a.id));
  const projection = cushionProjection(amount, target, transfers.filter((t) => sourceIds.has(t.accountId)));
  const monthsLeft = projection.date
    ? (projection.date.getFullYear() - new Date().getFullYear()) * 12 + projection.date.getMonth() - new Date().getMonth()
    : null;

  async function toggleAccount(id: string, checked: boolean) {
    setError("");
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, emergencyFund: checked } : a)));
    const res = await fetch(`/api/accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emergencyFund: checked }),
    });
    if (!res.ok) {
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, emergencyFund: !checked } : a)));
      setError("Impossible de mettre à jour ce compte.");
      return;
    }
    router.refresh();
  }

  async function changeMonths(next: number) {
    setError("");
    const previous = months;
    setMonths(next);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cushionMonths: next }),
    });
    if (!res.ok) {
      setMonths(previous);
      setError("Impossible d'enregistrer l'objectif.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="card">
      <div className="card-title">
        <h2>🛟 Matelas de sécurité</h2>
        <button
          type="button"
          className="btn btn-ghost icon-btn"
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          aria-label="Choisir les comptes du matelas"
          title="Choisir les comptes du matelas"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {target > 0 && covered !== null ? (
        <div className="cushion-summary">
          <CushionRing covered={covered} months={months} />
          <div className="stat-tile">
            <span className="value">
              {eur0.format(amount)}
              <span className="secondary" style={{ fontSize: 15, fontWeight: 500 }}> / {eur0.format(target)}</span>
            </span>
            <span className="hint">Sur {sources.length > 0 ? sources.map((a) => a.name).join(", ") : "aucun compte (⚙)"}</span>
            <span className="hint">1 mois de charges = {eur0.format(monthlyTotal)}</span>
            <span className="hint" style={{ color: progress >= 1 ? "var(--good)" : undefined }}>
              {progress < 1 ? `Il manque ${eur0.format(target - amount)}` : "✓ Objectif atteint"}
            </span>
            {progress < 1 && (
              <span className="cushion-eta">
                {projection.date ? (
                  <>
                    📅 Complet vers <strong>{monthYear.format(projection.date)}</strong>
                    <span className="muted">
                      {" "}
                      · {eur0.format(projection.monthly)}/mois{monthsLeft !== null && monthsLeft > 0 ? ` · dans ${monthsLeft} mois` : ""}
                    </span>
                  </>
                ) : (
                  <span className="muted">Ajoute un virement d'épargne vers ce livret pour voir quand il sera complet.</span>
                )}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="stat-tile" style={{ marginBottom: 14 }}>
          <span className="value">{eur0.format(amount)}</span>
          <span className="hint">Ajoute tes charges dans le calendrier pour calculer l'objectif.</span>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      <div className="field">
        <label htmlFor="cushion-months">Objectif</label>
        <select id="cushion-months" value={months} onChange={(e) => changeMonths(Number(e.target.value))}>
          {[3, 4, 5, 6, 9, 12].map((m) => (
            <option key={m} value={m}>
              {m} mois de charges{monthlyTotal > 0 ? ` (${eur0.format(m * monthlyTotal)})` : ""}
            </option>
          ))}
        </select>
      </div>

      {editing && (
        <>
          <h3 style={{ margin: "4px 0 6px" }}>Comptes qui le composent</h3>
          <div className="alloc-list">
            {accounts.map((a) => (
              <label key={a.id} className="alloc-row" style={{ cursor: "pointer" }}>
                <span>
                  {a.name} <span className="muted">· {accountTypeLabel(a.type)}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="alloc-value muted">{eur0.format(a.value)}</span>
                  <input type="checkbox" checked={a.emergencyFund} onChange={(e) => toggleAccount(a.id, e.target.checked)} />
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Ring cut into one segment per target month; each segment fills as that
 * month of expenses is covered, so you can count the months reached. */
function CushionRing({ covered, months }: { covered: number; months: number }) {
  const size = 150;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const gap = months > 1 ? 4 : 0; // degrees of empty space between months
  const seg = 360 / months;
  const done = covered >= months;

  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  };
  const arc = (from: number, to: number) =>
    to - from >= 359.99
      ? `M ${point(0)} A ${r} ${r} 0 1 1 ${point(180)} A ${r} ${r} 0 1 1 ${point(360)}`
      : `M ${point(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;

  const label = `${covered.toFixed(1).replace(".", ",")} mois couverts sur ${months}`;
  return (
    <div className="cushion-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        {Array.from({ length: months }, (_, i) => {
          const start = i * seg + gap / 2;
          const end = (i + 1) * seg - gap / 2;
          const fill = Math.max(0, Math.min(1, covered - i));
          return (
            <g key={i}>
              <title>{`Mois ${i + 1} : ${fill >= 1 ? "atteint" : fill > 0 ? `${Math.round(fill * 100)} %` : "à constituer"}`}</title>
              <path d={arc(start, end)} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
              {fill > 0 && (
                <path d={arc(start, start + (end - start) * fill)} fill="none" stroke={done ? "var(--good)" : "var(--accent)"} strokeWidth={stroke} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="cushion-ring-center">
        <strong>{covered >= 10 ? Math.floor(covered) : covered.toFixed(1).replace(".", ",")}</strong>
        <span>sur {months} mois</span>
      </div>
    </div>
  );
}
