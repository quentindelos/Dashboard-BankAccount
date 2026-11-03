"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { accountTypeLabel } from "@/lib/accountTypes";
import { chartChrome } from "@/lib/chartTheme";
import { useIsDark } from "@/lib/useIsDark";

interface EntryRow {
  id: string;
  date: string;
  value: number;
  note: string | null;
}

interface PositionRow {
  date: string;
  name: string;
  isin: string | null;
  quantity: number;
  price: number;
  value: number;
}

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const quantityFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AccountDetail({
  account,
  entries: initialEntries,
  positions,
}: {
  account: { id: string; name: string; type: string; institution: string | null; note: string | null };
  entries: EntryRow[];
  positions: PositionRow[];
}) {
  const router = useRouter();
  const isDark = useIsDark();
  const chrome = chartChrome(isDark);
  const [entries, setEntries] = useState(initialEntries);
  const [date, setDate] = useState(todayIso());
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Positions are grouped by snapshot date (newest first); the UI shows one
  // date's holdings at a time via the selector below.
  const positionDates = Array.from(new Set(positions.map((p) => p.date.slice(0, 10)))).sort((a, b) =>
    b.localeCompare(a)
  );
  const [selectedPositionDate, setSelectedPositionDate] = useState(positionDates[0] ?? "");
  const positionsForDate = positions.filter((p) => p.date.slice(0, 10) === selectedPositionDate);
  const positionsTotal = positionsForDate.reduce((sum, p) => sum + p.value, 0);

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const numericValue = Number(value.replace(",", "."));
    if (!Number.isFinite(numericValue)) {
      setError("Valeur invalide.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id, date, value: numericValue, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement.");
        return;
      }
      setEntries((prev) => {
        const withoutSameDate = prev.filter((en) => en.date.slice(0, 10) !== date);
        return [...withoutSameDate, data.entry].sort((a, b) => a.date.localeCompare(b.date));
      });
      setValue("");
      setNote("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    if (!confirm("Supprimer ce relevé ?")) return;
    const res = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((en) => en.id !== id));
      router.refresh();
    }
  }

  const chartData = entries.map((en) => ({ date: en.date.slice(0, 10), value: en.value }));

  return (
    <>
      <p>
        <Link href="/accounts">&larr; Retour aux comptes</Link>
      </p>
      <div className="card">
        <h1>{account.name}</h1>
        <p className="secondary">
          {accountTypeLabel(account.type)}
          {account.institution ? ` · ${account.institution}` : ""}
        </p>
      </div>

      <div className="card">
        <h2>Historique</h2>
        {chartData.length < 2 ? (
          <p className="muted">Ajoute au moins deux relevés pour voir l'évolution.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fill-account" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={chrome.gridline} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => dateFmt.format(new Date(d))} stroke={chrome.baseline} tick={{ fill: chrome.textMuted, fontSize: 12 }} minTickGap={32} />
              <YAxis stroke={chrome.baseline} tick={{ fill: chrome.textMuted, fontSize: 12 }} tickFormatter={(v) => currencyFmt.format(v).replace(",00", "")} width={80} />
              <Tooltip
                contentStyle={{ background: chrome.surface, border: `1px solid ${chrome.border}`, borderRadius: 8, fontSize: 13 }}
                labelFormatter={(d) => dateFmt.format(new Date(d))}
                formatter={(v: number) => [currencyFmt.format(v), account.name]}
                itemStyle={{ color: chrome.textSecondary }}
                labelStyle={{ color: chrome.textSecondary, marginBottom: 4 }}
              />
              <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#fill-account)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {positionDates.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ marginBottom: 0 }}>Positions</h2>
            {positionDates.length > 1 && (
              <select value={selectedPositionDate} onChange={(e) => setSelectedPositionDate(e.target.value)}>
                {positionDates.map((d) => (
                  <option key={d} value={d}>
                    {dateFmt.format(new Date(d))}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="secondary" style={{ marginTop: 4 }}>
            Détail des instruments au {dateFmt.format(new Date(selectedPositionDate))} — {currencyFmt.format(positionsTotal)}
          </p>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>ISIN</th>
                <th className="num">Quantité</th>
                <th className="num">Prix</th>
                <th className="num">Valeur</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {positionsForDate
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className="secondary">{p.isin ?? "—"}</td>
                    <td className="num">{quantityFmt.format(p.quantity)}</td>
                    <td className="num">{currencyFmt.format(p.price)}</td>
                    <td className="num">{currencyFmt.format(p.value)}</td>
                    <td className="num secondary">{positionsTotal ? ((p.value / positionsTotal) * 100).toFixed(1) : 0}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Ajouter / corriger un relevé</h2>
        <form onSubmit={handleAddEntry}>
          {error && <p className="error-text">{error}</p>}
          <div className="field">
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayIso()} required />
          </div>
          <div className="field">
            <label htmlFor="value">Valeur (€)</label>
            <input id="value" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ex: 15230.50" inputMode="decimal" required />
          </div>
          <div className="field">
            <label htmlFor="note">Note (optionnel)</label>
            <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "..." : "Enregistrer"}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Un relevé existe déjà à cette date ? Il sera corrigé avec la nouvelle valeur.
          </p>
        </form>
      </div>

      <div className="card">
        <h2>Tous les relevés</h2>
        {entries.length === 0 ? (
          <p className="muted">Aucun relevé encore.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Valeur</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries
                .slice()
                .reverse()
                .map((en) => (
                  <tr key={en.id}>
                    <td>{dateFmt.format(new Date(en.date))}</td>
                    <td className="num">{currencyFmt.format(en.value)}</td>
                    <td className="secondary">{en.note ?? "—"}</td>
                    <td className="row-actions">
                      <button className="btn btn-danger" onClick={() => handleDeleteEntry(en.id)} type="button">
                        Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
