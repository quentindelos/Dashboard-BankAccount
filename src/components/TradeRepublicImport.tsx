"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { eur0 } from "@/components/ui";
import { importTrExport, type TrImportResult } from "@/lib/trImportClient";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default function TradeRepublicImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TrImportResult | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";
    if (!confirm("L'historique du PEA, du CTO et du compte Crypto va être remplacé par celui de Trade Republic. Continuer ?")) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      setResult(await importTrExport(file));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Historique Trade Republic</h2>
      <p className="secondary" style={{ marginTop: -4 }}>
        Dans Trade Republic : <strong>Relevés &gt; Exportation des transactions</strong>, sur toute la période. Envoie ici le fichier (CSV ou
        Excel) : la valeur de ton PEA, de ton CTO et de ta crypto est recalculée jour par jour avec les cours de bourse, et remplace
        l'historique existant de ces comptes. Tu peux aussi glisser le fichier n'importe où dans l'app.
      </p>
      <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={handleFile} style={{ display: "none" }} />
      <button className="btn btn-primary" type="button" disabled={loading} onClick={() => inputRef.current?.click()}>
        {loading ? "Calcul en cours... (quelques secondes)" : "Importer l'export Trade Republic"}
      </button>
      {error && (
        <p className="error-text" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      {result && (
        <div style={{ marginTop: 14 }}>
          <p className="success-text" style={{ margin: "0 0 8px" }}>
            ✓ {result.transactions} opérations lues
          </p>
          <div className="alloc-list">
            {result.accounts.map((a) => (
              <div className="alloc-row" key={a.account}>
                <span>
                  {a.account} <span className="muted">· depuis le {dateFmt.format(new Date(a.from))} · {a.positions} lignes</span>
                </span>
                <span className="alloc-value">{eur0.format(a.value)}</span>
              </div>
            ))}
          </div>
          {result.unpriced.length > 0 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Sans cours de bourse, valorisé à son dernier prix d'achat : {result.unpriced.join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
