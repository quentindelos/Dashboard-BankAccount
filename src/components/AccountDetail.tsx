"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountTypeLabel, isTradeRepublic } from "@/lib/accountTypes";
import TimeSeriesChart, {
  RangeTabs,
  ZoomHint,
  extendToToday,
  periodChange,
  sliceRange,
  sliceWindow,
  type RangeKey,
  type Zoom,
} from "@/components/TimeSeriesChart";
import { Delta, eur0, formatPct, signed } from "@/components/ui";
import AnimatedNumber from "@/components/AnimatedNumber";
import Logo from "@/components/Logo";
import PhysicalAssetCard from "@/components/PhysicalAssetCard";
import type { LogoKey } from "@/lib/logos";
import { photoUrl, type GoldDetails, type VehicleDetails } from "@/lib/physicalAssets";

interface EntryRow {
  id: string;
  date: string;
  value: number;
  invested: number | null;
  note: string | null;
}

interface PositionRow {
  date: string;
  name: string;
  isin: string | null;
  logo: LogoKey | null;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
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
  account: {
    id: string;
    name: string;
    type: string;
    institution: string | null;
    note: string | null;
    logo: LogoKey | null;
    contributions: number | null;
    photo: string | null;
    gold: GoldDetails | null;
    vehicle: VehicleDetails | null;
  };
  entries: EntryRow[];
  positions: PositionRow[];
}) {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("TOUT");
  const [zoom, setZoom] = useState<Zoom | null>(null);
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
  const [contributions, setContributions] = useState<number | null>(account.contributions);
  const [contribInput, setContribInput] = useState(account.contributions !== null ? String(account.contributions).replace(".", ",") : "");
  const [contribMsg, setContribMsg] = useState("");

  async function saveContributions(e: React.FormEvent) {
    e.preventDefault();
    setContribMsg("");
    const raw = contribInput.replace(/\s/g, "").replace(",", ".");
    const next = raw === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setContribMsg("Montant invalide.");
      return;
    }
    const res = await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contributions: next }),
    });
    if (!res.ok) {
      setContribMsg("Impossible d'enregistrer.");
      return;
    }
    setContributions(next);
    setContribMsg("Enregistré ✓");
    router.refresh();
  }

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

  // Amount invested known every day (Trade Republic import): the period
  // change then excludes deposits and shows the gain itself.
  const investedKnown = entries.length > 0 && entries.every((en) => en.invested !== null);
  const allRows = extendToToday(
    entries.map((en) => ({
      t: Date.parse(en.date.slice(0, 10)),
      total: en.value,
      ...(investedKnown ? { invested: en.invested ?? 0 } : {}),
    }))
  );
  const chartRows = zoom ? sliceWindow(allRows, zoom.from, zoom.to) : sliceRange(allRows, range);
  const period = !zoom && range === "TOUT" ? null : periodChange(chartRows, ["total"], investedKnown ? ["invested"] : []);
  const latestValue = entries.at(-1)?.value ?? 0;
  const managed = isTradeRepublic(account.institution);
  const positionsCost = positionsForDate.every((p) => p.costBasis !== null)
    ? positionsForDate.reduce((s, p) => s + p.quantity * (p.costBasis ?? 0), 0)
    : null;

  return (
    <>
      <p style={{ margin: "0 0 14px" }}>
        <Link href="/accounts">&larr; Retour aux comptes</Link>
      </p>
      <div className="card">
        <div className="hero-date">
          {accountTypeLabel(account.type)}
          {account.institution ? ` · ${account.institution}` : ""}
        </div>
        <h1 style={{ margin: "4px 0 2px", display: "flex", alignItems: "center", gap: 10 }}>
          {account.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="asset-avatar" src={photoUrl(account.id, account.photo)} alt="" width={36} height={36} />
          ) : (
            <Logo logo={account.logo} name={account.institution ?? account.name} size={30} />
          )}
          {account.name}
        </h1>
        <div className="hero-value" style={{ fontSize: 34 }}><AnimatedNumber value={latestValue} /></div>
        {period && (
          <Delta value={period.change} pct={period.pct} />
        )}
        {!period && positionsCost !== null && positionsForDate.length > 0 && (
          <Delta value={positionsTotal - positionsCost} pct={positionsCost ? (positionsTotal - positionsCost) / positionsCost : null} suffix="de plus-value latente" />
        )}
        {!period && positions.length === 0 && contributions !== null && (
          <Delta
            value={latestValue - contributions}
            pct={contributions ? (latestValue - contributions) / contributions : null}
            suffix={`${account.type === "LIVRET" ? "d'intérêts" : "de plus-value"} sur ${eur0.format(contributions)} versés`}
          />
        )}
        <div className="chart-toolbar">
          <span className="muted" style={{ fontSize: 13 }}>
            {managed &&
              (entries.length > 0 ? `Valeur quotidienne · à jour au ${dateFmt.format(new Date(entries.at(-1)!.date))}` : "Aucun historique importé")}
          </span>
          <RangeTabs
            value={range}
            onChange={(r) => {
              setRange(r);
              setZoom(null);
            }}
            zoom={zoom}
            onResetZoom={() => setZoom(null)}
          />
        </div>
        <TimeSeriesChart
          rows={chartRows}
          curve={account.type === "LIVRET" || account.type === "VEHICULE" ? "stepAfter" : "linear"}
          height={240}
          seriesLabel={account.name}
          onZoom={setZoom}
        />
        {allRows.length > 2 && <ZoomHint />}
      </div>

      <PhysicalAssetCard account={account} />

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
            Détail des instruments au {dateFmt.format(new Date(selectedPositionDate))} : {currencyFmt.format(positionsTotal)}
          </p>
          <div className="table-wrap">
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>ISIN</th>
                <th className="num">Quantité</th>
                <th className="num">PRU</th>
                <th className="num">Cours</th>
                <th className="num">Valeur</th>
                <th className="num">+/- value</th>
                <th className="num">Poids</th>
              </tr>
            </thead>
            <tbody>
              {positionsForDate
                .slice()
                .sort((a, b) => b.value - a.value)
                .map((p) => {
                  const gain = p.costBasis !== null ? p.value - p.quantity * p.costBasis : null;
                  const gainPct = gain !== null && p.costBasis ? gain / (p.quantity * p.costBasis) : null;
                  return (
                    <tr key={p.name}>
                      <td style={{ fontWeight: 500 }}>
                        <span className="name-with-logo">
                          <Logo logo={p.logo} name={p.name} size={26} />
                          {p.name}
                        </span>
                      </td>
                      <td className="secondary">{p.isin ?? "-"}</td>
                      <td className="num">{quantityFmt.format(p.quantity)}</td>
                      <td className="num">{p.costBasis !== null ? currencyFmt.format(p.costBasis) : "-"}</td>
                      <td className="num">{currencyFmt.format(p.price)}</td>
                      <td className="num">{currencyFmt.format(p.value)}</td>
                      <td className={`num ${gain === null ? "" : gain >= 0 ? "pos" : "neg"}`}>
                        {gain === null ? "-" : `${signed(gain, (n) => currencyFmt.format(n))} (${formatPct(Math.abs(gainPct ?? 0), 1)})`}
                      </td>
                      <td className="num secondary">{formatPct(positionsTotal ? p.value / positionsTotal : 0, 1)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {positions.length === 0 && !managed && account.type !== "VEHICULE" && (
        <div className="card">
          <h2>Total versé</h2>
          <p className="secondary" style={{ marginTop: -4 }}>
            L'argent que tu as mis sur ce compte, retraits déduits. Sert à calculer {account.type === "LIVRET" ? "les intérêts gagnés" : "la plus-value"}{" "}
            et à l'additionner à celle de tes autres comptes. Pense à le mettre à jour après un versement.
          </p>
          <form onSubmit={saveContributions} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0, minWidth: 180 }}>
              <label htmlFor="contrib">Total versé (€)</label>
              <input id="contrib" value={contribInput} onChange={(e) => setContribInput(e.target.value)} inputMode="decimal" placeholder="ex : 4000" />
            </div>
            <button className="btn btn-primary" type="submit">
              Enregistrer
            </button>
            {contribMsg && <span className="muted" style={{ fontSize: 13 }}>{contribMsg}</span>}
          </form>
        </div>
      )}

      {managed ? (
        <div className="card">
          <h2>Mise à jour</h2>
          <p className="secondary" style={{ margin: 0 }}>
            Ce compte Trade Republic se remplit uniquement avec l'export des transactions : dans Trade Republic,{" "}
            <strong>Relevés &gt; Exportation des transactions</strong>, puis envoie le fichier dans{" "}
            <Link href="/settings">Réglages &gt; Historique Trade Republic</Link>, ou glisse-le n&apos;importe où dans l&apos;app.
          </p>
        </div>
      ) : (
        <>
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
                    <td className="secondary">{en.note ?? "-"}</td>
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
      )}
    </>
  );
}
