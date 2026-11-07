"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { eur0 } from "@/components/ui";

export interface AssetCardData {
  id: string;
  name: string;
  type: "VEHICULE" | "OR";
  photoUrl: string | null;
  /** "Renault Clio, 2015, 85 000 km" or "11,6 g d'or fin"; null until described. */
  description: string | null;
  value: number | null;
  /** How the value was obtained, e.g. "Cote estimée le 7 novembre 2026". */
  valuedHow: string | null;
}

const KINDS = {
  VEHICULE: { label: "Véhicule", hint: "Voiture, moto... estimé par l'IA d'après les annonces", placeholder: "ex : Ma voiture" },
  OR: { label: "Or physique", hint: "Pièces ou lingots, au cours de l'or du jour", placeholder: "ex : Pièces d'or" },
} as const;

function KindIcon({ type, size = 28 }: { type: AssetCardData["type"]; size?: number }) {
  return type === "VEHICULE" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 16H3v-4l2-5h11l3 5h2v4h-2" />
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
      <path d="M9.5 16.5h5M5 12h14" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18l2.5-6h5L13 18z" />
      <path d="M11 18l2.5-6h5L21 18z" />
      <path d="M7 12l2.5-6h5L17 12z" />
    </svg>
  );
}

/** The "Biens" page: vehicles and gold, apart from the financial accounts. */
export default function AssetsManager({ assets: initial }: { assets: AssetCardData[] }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initial);
  const [adding, setAdding] = useState<AssetCardData["type"] | null>(null);
  const [showChoice, setShowChoice] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!adding) return;
    setError("");
    setLoading(true);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: adding }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setLoading(false);
    if (!res?.ok) {
      setError(data.error ?? "Impossible de créer ce bien.");
      return;
    }
    // Described on its own page: photo, details, valuation.
    router.push(`/accounts/${data.account.id}`);
  }

  async function archive(asset: AssetCardData) {
    if (!confirm(`Retirer « ${asset.name} » de ton patrimoine ? Son historique est conservé.`)) return;
    const res = await fetch(`/api/accounts/${asset.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setAssets((all) => all.filter((a) => a.id !== asset.id));
      router.refresh();
    }
  }

  function close() {
    setShowChoice(false);
    setAdding(null);
    setName("");
    setError("");
  }

  const total = assets.reduce((s, a) => s + (a.value ?? 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Biens</h1>
          <p className="muted">
            Véhicules et or physique, valorisés automatiquement
            {assets.length > 0 ? ` · ${eur0.format(total)} au total` : ""}
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => (showChoice || adding ? close() : setShowChoice(true))}>
          {showChoice || adding ? "Annuler" : "+ Ajouter un bien"}
        </button>
      </div>

      {(showChoice || adding) && (
        <section className="card section">
          {!adding ? (
            <>
              <h2>Quel bien ajouter ?</h2>
              <div className="asset-kinds">
                {(Object.keys(KINDS) as AssetCardData["type"][]).map((k) => (
                  <button key={k} type="button" className="asset-kind" onClick={() => setAdding(k)}>
                    <KindIcon type={k} />
                    <strong>{KINDS[k].label}</strong>
                    <span className="muted">{KINDS[k].hint}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={create}>
              <h2>{KINDS[adding].label}</h2>
              {error && <p className="error-text">{error}</p>}
              <div className="field" style={{ maxWidth: 420 }}>
                <label htmlFor="asset-name">Nom</label>
                <input
                  id="asset-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={KINDS[adding].placeholder}
                  required
                  maxLength={100}
                  autoFocus
                />
                <span className="field-hint">Tu le décriras juste après{adding === "VEHICULE" ? ", avec sa photo" : ""}.</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "..." : "Continuer"}
                </button>
                <button className="btn" type="button" onClick={() => setAdding(null)}>
                  Retour
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {assets.length === 0 ? (
        !showChoice &&
        !adding && (
          <section className="card section asset-empty">
            <div className="asset-empty-icons">
              <KindIcon type="VEHICULE" size={34} />
              <KindIcon type="OR" size={34} />
            </div>
            <h2>Aucun bien pour l&apos;instant</h2>
            <p className="muted">Ajoute une voiture, une moto ou de l&apos;or physique : leur valeur est suivie automatiquement et compte dans ton patrimoine.</p>
          </section>
        )
      ) : (
        <div className="asset-grid section">
          {assets.map((a) => (
            <article key={a.id} className="card asset-card">
              <Link href={`/accounts/${a.id}`} className="asset-card-link">
                {a.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="asset-card-photo" src={a.photoUrl} alt="" loading="lazy" />
                ) : (
                  <div className={`asset-card-photo asset-card-placeholder ${a.type === "OR" ? "gold" : ""}`}>
                    <KindIcon type={a.type} size={40} />
                  </div>
                )}
                <div className="asset-card-body">
                  <span className="asset-card-kind">{KINDS[a.type].label}</span>
                  <strong className="asset-card-name">{a.name}</strong>
                  <span className="muted asset-card-desc">{a.description ?? "À décrire"}</span>
                  <span className="asset-card-value">{a.value !== null ? eur0.format(a.value) : "-"}</span>
                  {a.valuedHow && <span className="muted asset-card-how">{a.valuedHow}</span>}
                </div>
              </Link>
              <div className="asset-card-actions">
                <Link href={`/accounts/${a.id}`} className="btn">
                  {a.description ? "Voir" : "Décrire"}
                </Link>
                <button type="button" className="btn btn-ghost" onClick={() => archive(a)}>
                  Retirer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
