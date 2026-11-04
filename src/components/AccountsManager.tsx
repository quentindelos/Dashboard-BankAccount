"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { accountTypeLabel, ACCOUNT_TYPE_ORDER } from "@/lib/accountTypes";
import Logo from "@/components/Logo";
import type { LogoKey } from "@/lib/logos";

interface AccountRow {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  logo?: LogoKey | null;
  latestValue: number | null;
  latestDate: string | null;
}

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

export default function AccountsManager({ initialAccounts }: { initialAccounts: AccountRow[] }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(ACCOUNT_TYPE_ORDER[0]);
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, institution }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la création.");
        return;
      }
      setAccounts((prev) => [...prev, { ...data.account, latestValue: null, latestDate: null }]);
      setName("");
      setInstitution("");
      setShowForm(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive(id: string) {
    if (!confirm("Archiver ce compte ? Son historique sera conservé mais il n'apparaîtra plus dans le tableau de bord.")) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ marginBottom: 0 }}>Mes comptes</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)} type="button">
          {showForm ? "Annuler" : "+ Ajouter un compte"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ marginTop: 16, borderTop: "1px solid var(--gridline)", paddingTop: 16 }}>
          {error && <p className="error-text">{error}</p>}
          <div className="field">
            <label htmlFor="name">Nom du compte</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Livret A" required maxLength={100} />
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
              {ACCOUNT_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>
                  {accountTypeLabel(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="institution">Établissement (optionnel)</label>
            <input id="institution" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="ex: Boursorama" maxLength={100} />
          </div>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "..." : "Créer"}
          </button>
        </form>
      )}

      {accounts.length === 0 ? (
        <p className="muted" style={{ marginTop: 16 }}>
          Aucun compte encore.
        </p>
      ) : (
        <table style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Type</th>
              <th>Établissement</th>
              <th className="num">Dernière valeur</th>
              <th>Au</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <span className="name-with-logo">
                    <Logo logo={a.logo} name={a.institution ?? a.name} size={26} />
                    <Link href={`/accounts/${a.id}`}>{a.name}</Link>
                  </span>
                </td>
                <td className="secondary">{accountTypeLabel(a.type)}</td>
                <td className="secondary">{a.institution ?? "—"}</td>
                <td className="num">{a.latestValue !== null ? currencyFmt.format(a.latestValue) : "—"}</td>
                <td className="secondary">{a.latestDate ? dateFmt.format(new Date(a.latestDate)) : "—"}</td>
                <td className="row-actions">
                  <button className="btn btn-danger" onClick={() => handleArchive(a.id)} type="button">
                    Archiver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
