"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);

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
      const upTo = data.latestDate
        ? ` Données à jour au ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(data.latestDate))}.`
        : "";
      setImportMessage(
        `Import réussi : ${data.accountsImported} compte(s), ${data.entriesImported} relevé(s), ${data.expensesImported ?? 0} charge(s).${upTo}`,
      );
      router.refresh();
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
        {importLoading && <p className="muted" style={{ fontSize: 13 }}>Lecture et enregistrement du fichier... quelques secondes.</p>}
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImport} disabled={importLoading} style={{ display: "none" }} />
        <button className="btn btn-primary" type="button" disabled={importLoading} onClick={() => fileInputRef.current?.click()}>
          {importLoading ? "Import en cours..." : "Choisir un fichier JSON"}
        </button>
      </div>
    </>
  );
}
