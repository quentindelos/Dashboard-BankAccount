"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { eur0 } from "@/components/ui";
import { confirmDialog } from "@/components/ConfirmDialog";
import {
  GOLD_ITEMS,
  VEHICLE_CONDITIONS,
  VEHICLE_KINDS,
  fineGrams,
  photoUrl,
  type GoldDetails,
  type GoldItemKind,
  type VehicleDetails,
  type VehicleEstimate,
} from "@/lib/physicalAssets";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const gramsFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// ---------------------------------------------------------------- photo

function VehiclePhoto({ accountId, photo: initial, name }: { accountId: string; photo: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("photo", file);
    const res = await fetch(`/api/accounts/${accountId}/photo`, { method: "POST", body }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) {
      setError(data.error ?? "Impossible d'envoyer la photo.");
      return;
    }
    setPhoto(data.photo);
    router.refresh();
  }

  async function remove() {
    if (!(await confirmDialog({ title: "Retirer la photo ?", confirmLabel: "Retirer", danger: true }))) return;
    const res = await fetch(`/api/accounts/${accountId}/photo`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setPhoto(null);
      router.refresh();
    }
  }

  return (
    <div className="asset-photo-block">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} hidden />
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="asset-photo" src={photoUrl(accountId, photo)} alt={`Photo : ${name}`} />
          <div className="asset-photo-actions">
            <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy}>
              {busy ? "Envoi..." : "Changer la photo"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={remove} disabled={busy}>
              Retirer
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="asset-photo-empty" onClick={() => input.current?.click()} disabled={busy}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {busy ? "Envoi..." : "Ajouter une photo"}
        </button>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- vehicle

type VehicleForm = Omit<VehicleDetails, "year" | "mileage" | "estimate"> & { year: string; mileage: string };

const emptyVehicle: VehicleForm = { kind: "VOITURE", make: "", model: "", version: "", year: "", mileage: "", condition: "BON", notes: "" };

function VehicleCard({ accountId, name, details, photo }: { accountId: string; name: string; details: VehicleDetails | null; photo: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState<VehicleForm>(
    details ? { ...details, year: String(details.year), mileage: String(details.mileage) } : emptyVehicle,
  );
  const [estimate, setEstimate] = useState<VehicleEstimate | undefined>(details?.estimate);
  const [saved, setSaved] = useState(Boolean(details));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState(false);
  const set = <K extends keyof VehicleForm>(k: K, v: VehicleForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function runEstimate() {
    setEstimating(true);
    setError("");
    const res = await fetch(`/api/accounts/${accountId}/details`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setEstimating(false);
    if (!res?.ok) {
      setError(data.error ?? "L'estimation a échoué.");
      return;
    }
    setEstimate(data.estimate);
    router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    const body = {
      ...form,
      year: Number(form.year),
      mileage: Number(form.mileage.replace(/\s/g, "")),
      version: form.version || undefined,
      notes: form.notes || undefined,
    };
    const res = await fetch(`/api/accounts/${accountId}/details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(data.error ?? "Impossible d'enregistrer.");
      return;
    }
    setSaved(true);
    setStatus("Fiche enregistrée ✓");
    runEstimate();
  }

  return (
    <div className="card">
      <h2>Le véhicule</h2>
      <div className="asset-layout">
        <VehiclePhoto accountId={accountId} photo={photo} name={name} />
        <form onSubmit={save} className="asset-form">
          <div className="asset-form-grid">
            <div className="field">
              <label htmlFor="v-kind">Type</label>
              <select id="v-kind" value={form.kind} onChange={(e) => set("kind", e.target.value as VehicleForm["kind"])}>
                {Object.entries(VEHICLE_KINDS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="v-make">Marque</label>
              <input id="v-make" value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="ex : Renault" required maxLength={60} />
            </div>
            <div className="field">
              <label htmlFor="v-model">Modèle</label>
              <input id="v-model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="ex : Clio" required maxLength={80} />
            </div>
            <div className="field">
              <label htmlFor="v-version">Version, finition</label>
              <input id="v-version" value={form.version ?? ""} onChange={(e) => set("version", e.target.value)} placeholder="ex : 1.2 TCe 100 Intens" maxLength={120} />
            </div>
            <div className="field">
              <label htmlFor="v-year">Année</label>
              <input id="v-year" value={form.year} onChange={(e) => set("year", e.target.value)} inputMode="numeric" placeholder="ex : 2015" required />
            </div>
            <div className="field">
              <label htmlFor="v-km">Kilométrage</label>
              <input id="v-km" value={form.mileage} onChange={(e) => set("mileage", e.target.value)} inputMode="numeric" placeholder="ex : 85000" required />
            </div>
            <div className="field">
              <label htmlFor="v-cond">État</label>
              <select id="v-cond" value={form.condition} onChange={(e) => set("condition", e.target.value as VehicleForm["condition"])}>
                {Object.entries(VEHICLE_CONDITIONS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="v-notes">Précisions (optionnel)</label>
            <input
              id="v-notes"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="ex : origine, carnet d'entretien complet, distribution faite, première main"
              maxLength={1000}
            />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="submit" disabled={estimating}>
              Enregistrer la fiche
            </button>
            {status && <span className="muted" style={{ fontSize: 13 }}>{status}</span>}
          </div>
        </form>
      </div>

      <div className="asset-estimate">
        <div className="asset-estimate-head">
          <h3>Cote estimée</h3>
          {saved && (
            <button type="button" className="btn" onClick={runEstimate} disabled={estimating}>
              {estimating ? "Recherche des annonces... (1 minute environ)" : estimate ? "Réestimer" : "Estimer la cote"}
            </button>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
        {estimate ? (
          <>
            <p className="asset-estimate-value">
              {eur0.format(estimate.value)}
              <span className="muted"> · entre {eur0.format(estimate.low)} et {eur0.format(estimate.high)}</span>
            </p>
            {estimate.high > estimate.low && (
              <div className="estimate-range" role="img" aria-label={`Fourchette de ${eur0.format(estimate.low)} à ${eur0.format(estimate.high)}, estimation ${eur0.format(estimate.value)}`}>
                <div className="estimate-range-track">
                  <span className="estimate-range-mark" style={{ left: `${((estimate.value - estimate.low) / (estimate.high - estimate.low)) * 100}%` }} />
                </div>
                <div className="estimate-range-labels">
                  <span>{eur0.format(estimate.low)}</span>
                  <span>{eur0.format(estimate.high)}</span>
                </div>
              </div>
            )}
            {estimate.summary && <p className="secondary" style={{ margin: "0 0 8px" }}>{estimate.summary}</p>}
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Estimée le {dateFmt.format(new Date(estimate.date))} par {estimate.model}, à partir d&apos;annonces et de cotes trouvées sur le web.
              Mise à jour automatique tous les 30 jours.
            </p>
            {estimate.sources.length > 0 && (
              <ul className="asset-sources">
                {estimate.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {saved
              ? "Pas encore d'estimation."
              : "Remplis la fiche : l'IA cherchera des annonces et des cotes comparables pour estimer sa valeur."}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- gold

type GoldRow = { kind: GoldItemKind; count: string; grams: string };

function GoldCard({ accountId, details }: { accountId: string; details: GoldDetails | null }) {
  const router = useRouter();
  const [rows, setRows] = useState<GoldRow[]>(
    details?.items.length
      ? details.items.map((i) => ({ kind: i.kind, count: String(i.count), grams: i.grams ? String(i.grams).replace(".", ",") : "" }))
      : [{ kind: "NAPOLEON_20F", count: "1", grams: "" }],
  );
  const [since, setSince] = useState(details?.since ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const items = rows.map((r) => ({
    kind: r.kind,
    count: Number(r.count),
    ...(GOLD_ITEMS[r.kind].fineGrams === null && { grams: Number(r.grams.replace(",", ".")) }),
  }));
  const total = fineGrams({ items: items.filter((i) => i.count > 0) });
  const setRow = (i: number, patch: Partial<GoldRow>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    setSaving(true);
    const res = await fetch(`/api/accounts/${accountId}/details`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, ...(since && { since }) }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok) {
      setError(data.error ?? "Impossible d'enregistrer.");
      return;
    }
    setStatus(
      data.warning
        ? `Enregistré, mais ${data.warning.charAt(0).toLowerCase()}${data.warning.slice(1)}`
        : `Enregistré ✓ · ${gramsFmt.format(data.valuation?.grams ?? total)} g d'or fin, ${eur0.format(data.valuation?.value ?? 0)} au cours du jour`,
    );
    router.refresh();
  }

  return (
    <div className="card">
      <h2>Ton or</h2>
      <p className="secondary" style={{ marginTop: -4 }}>
        Valeur = poids d&apos;or fin × cours de l&apos;or du jour, mise à jour à chaque ouverture de l&apos;app. Les pièces se revendent souvent un peu
        au-dessus de ce cours (prime) : c&apos;est une valeur prudente.
      </p>
      <form onSubmit={save}>
        <div className="gold-rows">
          {rows.map((r, i) => (
            <div className="gold-row" key={i}>
              <select aria-label="Pièce ou lingot" value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value as GoldItemKind })}>
                {Object.entries(GOLD_ITEMS).map(([k, item]) => (
                  <option key={k} value={k}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input aria-label="Nombre" value={r.count} onChange={(e) => setRow(i, { count: e.target.value })} inputMode="numeric" placeholder="Nombre" />
              {GOLD_ITEMS[r.kind].fineGrams === null ? (
                <input aria-label="Poids en grammes" value={r.grams} onChange={(e) => setRow(i, { grams: e.target.value })} inputMode="decimal" placeholder="Grammes" />
              ) : (
                <span className="muted" style={{ fontSize: 12 }}>
                  {gramsFmt.format(GOLD_ITEMS[r.kind].fineGrams ?? 0)} g chacune
                </span>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setRows((all) => all.filter((_, j) => j !== i))} aria-label="Retirer cette ligne">
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => setRows((all) => [...all, { kind: "NAPOLEON_20F", count: "1", grams: "" }])}>
          + Ajouter une ligne
        </button>
        <div className="field" style={{ marginTop: 14, maxWidth: 220 }}>
          <label htmlFor="g-since">Acheté le (optionnel)</label>
          <input id="g-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
          <span className="field-hint">L&apos;historique est valorisé depuis cette date.</span>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Total : {gramsFmt.format(total)} g d&apos;or fin</p>
        {error && <p className="error-text">{error}</p>}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Calcul..." : "Enregistrer"}
          </button>
          {status && <span className="muted" style={{ fontSize: 13 }}>{status}</span>}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- entry point

export default function PhysicalAssetCard({
  account,
}: {
  account: { id: string; name: string; type: string; photo: string | null; gold: GoldDetails | null; vehicle: VehicleDetails | null };
}) {
  if (account.type === "VEHICULE") return <VehicleCard accountId={account.id} name={account.name} details={account.vehicle} photo={account.photo} />;
  if (account.type === "OR") return <GoldCard accountId={account.id} details={account.gold} />;
  return null;
}
