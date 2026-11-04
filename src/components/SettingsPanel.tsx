"use client";

import { useRef, useState } from "react";

export default function SettingsPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwToken, setPwToken] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");
    if (pwNew.length < 12) {
      setPwError("Le nouveau mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew, token: pwToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error ?? "Erreur.");
        return;
      }
      setPwSuccess("Mot de passe mis à jour.");
      setPwCurrent("");
      setPwNew("");
      setPwToken("");
    } finally {
      setPwLoading(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    setImportMessage("");
    setImportLoading(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Erreur lors de l'import.");
        return;
      }
      setImportMessage(`Import réussi : ${data.accountsImported} compte(s), ${data.entriesImported} relevé(s), ${data.expensesImported ?? 0} charge(s).`);
    } catch {
      setImportError("Fichier JSON invalide.");
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <div className="card">
        <h2>Export de l'historique</h2>
        <p className="secondary">
          Télécharge la totalité de ton historique (comptes + relevés) au format JSON. Utile pour migrer vers une
          nouvelle instance (ex. après avoir cloné le dépôt sur GCP) : exporte ici, puis importe ce fichier
          là-bas une fois connecté.
        </p>
        <a className="btn btn-primary" href="/api/export">
          Télécharger l'export (JSON)
        </a>
      </div>

      <div className="card">
        <h2>Import d'un export</h2>
        <p className="secondary">
          Importer fusionne les données du fichier avec celles déjà présentes (rien n'est supprimé) : les comptes et
          relevés déjà existants sont mis à jour, les nouveaux sont ajoutés.
        </p>
        {importError && <p className="error-text">{importError}</p>}
        {importMessage && <p className="success-text">{importMessage}</p>}
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} disabled={importLoading} style={{ display: "none" }} />
        <button className="btn btn-primary" type="button" disabled={importLoading} onClick={() => fileInputRef.current?.click()}>
          {importLoading ? "Import en cours…" : "Choisir un fichier JSON"}
        </button>
      </div>

      <div className="card">
        <h2>Changer le mot de passe</h2>
        <p className="secondary">Nécessite le mot de passe actuel et un code 2FA valide.</p>
        <form onSubmit={handleChangePassword}>
          {pwError && <p className="error-text">{pwError}</p>}
          {pwSuccess && <p className="success-text">{pwSuccess}</p>}
          <div className="field">
            <label htmlFor="pwCurrent">Mot de passe actuel</label>
            <input id="pwCurrent" type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="field">
            <label htmlFor="pwNew">Nouveau mot de passe (12 caractères min.)</label>
            <input id="pwNew" type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" required minLength={12} />
          </div>
          <div className="field">
            <label htmlFor="pwToken">Code 2FA actuel</label>
            <input
              id="pwToken"
              value={pwToken}
              onChange={(e) => setPwToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              maxLength={6}
              required
            />
          </div>
          <button className="btn btn-primary" disabled={pwLoading} type="submit">
            {pwLoading ? "..." : "Mettre à jour"}
          </button>
        </form>
      </div>
    </>
  );
}
