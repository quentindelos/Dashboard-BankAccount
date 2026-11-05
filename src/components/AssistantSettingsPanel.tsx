"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  DETAIL_LABEL,
  MODELS,
  PROVIDER_LABEL,
  RISK_LABEL,
  THINKING_LABEL,
  TMI_OPTIONS,
  type AssistantProvider,
  type AssistantSettings,
} from "@/lib/assistantShared";

export interface AssistantInfo {
  settings: AssistantSettings;
  providers: AssistantProvider[];
  provider: AssistantProvider | null;
  model: string | null;
  vertex: boolean;
}

interface Preview {
  instructions: string;
  context: string;
}

const CUSTOM = "__custom";
const THINKING_HINT = {
  low: "réponse en quelques secondes",
  medium: "bon compromis (par défaut)",
  high: "raisonne plus longtemps sur les calculs et montages, plus lent",
};
const RISK_HINT = {
  prudent: "préserver le capital avant tout",
  balanced: "un peu de risque pour un meilleur rendement",
  dynamic: "accepte de fortes baisses temporaires",
  aggressive: "maximum d'actions, accepte -50 % en crise",
};

const tokens = (text: string) => `≈ ${Math.round(text.length / 3.5).toLocaleString("fr-FR")} tokens`;

interface Memory {
  id: number;
  content: string;
  updatedAt: string;
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

// What the assistant remembers about the user: saved by itself during
// conversations, editable here.
function MemoryList({ version }: { version: number }) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/memories", { cache: "no-store" });
      if (res.ok) setMemories((await res.json()).memories);
    } catch {
      setError("Impossible de charger la mémoire.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  async function send(url: string, method: string, content?: string) {
    setError("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: content === undefined ? undefined : JSON.stringify({ content }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error ?? "Erreur.");
      return false;
    }
    await load();
    return true;
  }

  return (
    <>
      <h3>Mémoire du conseiller</h3>
      <p className="field-hint memory-intro">
        Ce qu'il a retenu de vos conversations (il l'ajoute lui-même quand tu lui apprends quelque chose de durable) et qu'il
        utilise dans chaque réponse.
      </p>
      {memories === null ? (
        <p className="muted">Chargement…</p>
      ) : memories.length === 0 ? (
        <p className="muted">Rien pour l'instant : parle-lui de ta situation, il retiendra l'essentiel.</p>
      ) : (
        <ul className="memory-list">
          {memories.map((m) => (
            <li key={m.id}>
              {editing?.id === m.id ? (
                // Not a <form>: this list sits inside the settings form.
                <div className="memory-edit">
                  <input
                    aria-label="Texte du souvenir"
                    value={editing.text}
                    maxLength={500}
                    autoFocus
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (await send(`/api/assistant/memories/${m.id}`, "PUT", editing.text)) setEditing(null);
                      } else if (e.key === "Escape") {
                        setEditing(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={async () => {
                      if (await send(`/api/assistant/memories/${m.id}`, "PUT", editing.text)) setEditing(null);
                    }}
                  >
                    OK
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                    Annuler
                  </button>
                </div>
              ) : (
                <>
                  <span className="memory-text">
                    {m.content} <span className="muted">· {dateFormat.format(new Date(m.updatedAt))}</span>
                  </span>
                  <span className="memory-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing({ id: m.id, text: m.content })}>
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      aria-label={`Oublier : ${m.content}`}
                      onClick={() => send(`/api/assistant/memories/${m.id}`, "DELETE")}
                    >
                      Oublier
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="memory-edit">
        <input
          aria-label="Ajouter un élément à la mémoire"
          placeholder="Ajouter une info, ex. : abondement Thales de 100 % jusqu'à 1 000 €/an sur le PEE"
          value={draft}
          maxLength={500}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (draft.trim() && (await send("/api/assistant/memories", "POST", draft))) setDraft("");
            }
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!draft.trim()}
          onClick={async () => {
            if (await send("/api/assistant/memories", "POST", draft)) setDraft("");
          }}
        >
          Ajouter
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}

export default function AssistantSettingsPanel({
  info,
  memoryVersion,
  onSaved,
  onClose,
}: {
  info: AssistantInfo;
  memoryVersion: number;
  onSaved: (info: AssistantInfo) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<AssistantSettings>(info.settings);
  const [customModel, setCustomModel] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");

  const provider: AssistantProvider =
    form.provider !== "auto" && info.providers.includes(form.provider) ? form.provider : (info.providers[0] ?? "gemini");
  const models = MODELS[provider];
  const listed = form.model === "" || models.some((m) => m.id === form.model);
  const modelValue = customModel || !listed ? CUSTOM : form.model;
  const defaultModel = provider === info.provider && info.settings.model === "" && info.model ? info.model : models[0].id;

  function set<K extends keyof AssistantSettings>(key: K, value: AssistantSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStatus(null);
  }

  async function loadPreview() {
    setPreviewError("");
    try {
      const res = await fetch("/api/assistant", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPreview({ instructions: data.instructions, context: data.context });
    } catch {
      setPreviewError("Impossible de charger l'aperçu.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, model: form.model.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Enregistrement impossible.");
      onSaved({ settings: data.settings, providers: data.providers, provider: data.provider, model: data.model, vertex: data.vertex });
      setForm(data.settings);
      setCustomModel(false);
      if (preview) setPreview({ instructions: data.instructions, context: data.context });
      setStatus({ kind: "ok", text: "Paramètres enregistrés : ils s'appliquent dès la prochaine question." });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Erreur." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card assistant-settings" onSubmit={save}>
      <div className="assistant-settings-head">
        <h2>Paramètres du conseiller</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Fermer
        </button>
      </div>

      <h3>Intelligence artificielle</h3>
      <div className="form-grid">
        {info.providers.length > 1 && (
          <div className="field">
            <label htmlFor="as-provider">Fournisseur</label>
            <select
              id="as-provider"
              value={form.provider}
              onChange={(e) => {
                set("provider", e.target.value as AssistantSettings["provider"]);
                set("model", "");
                setCustomModel(false);
              }}
            >
              <option value="auto">Automatique</option>
              {info.providers.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="as-model">Modèle</label>
          <select
            id="as-model"
            value={modelValue}
            onChange={(e) => {
              if (e.target.value === CUSTOM) {
                setCustomModel(true);
              } else {
                setCustomModel(false);
                set("model", e.target.value);
              }
            }}
          >
            <option value="">Par défaut ({defaultModel})</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} : {m.hint}
              </option>
            ))}
            <option value={CUSTOM}>Autre modèle…</option>
          </select>
          {modelValue === CUSTOM && (
            <input
              aria-label="Identifiant du modèle"
              placeholder={provider === "gemini" ? "ex. gemini-3.8-pro" : "ex. claude-opus-5-5"}
              value={form.model}
              onChange={(e) => set("model", e.target.value.toLowerCase())}
            />
          )}
        </div>
        <div className="field">
          <label htmlFor="as-thinking">Réflexion</label>
          <select id="as-thinking" value={form.thinking} onChange={(e) => set("thinking", e.target.value as AssistantSettings["thinking"])}>
            {Object.entries(THINKING_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <span className="field-hint">{THINKING_HINT[form.thinking]}</span>
        </div>
        <div className="field">
          <label htmlFor="as-detail">Réponses</label>
          <select id="as-detail" value={form.detail} onChange={(e) => set("detail", e.target.value as AssistantSettings["detail"])}>
            {Object.entries(DETAIL_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={form.webSearch} onChange={(e) => set("webSearch", e.target.checked)} />
        <span>
          <strong>Recherche web</strong>
          <span className="field-hint">
            Vérifie les taux, plafonds et règles fiscales du moment et cite ses sources. Un peu plus lent, environ 1 centime par
            recherche.
          </span>
        </span>
      </label>

      <MemoryList version={memoryVersion} />

      <h3>Mon profil d'investisseur</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="as-risk">Tolérance au risque</label>
          <select id="as-risk" value={form.risk} onChange={(e) => set("risk", e.target.value as AssistantSettings["risk"])}>
            {Object.entries(RISK_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <span className="field-hint">{RISK_HINT[form.risk]}</span>
        </div>
        <div className="field">
          <label htmlFor="as-tmi">Tranche marginale d'imposition</label>
          <select
            id="as-tmi"
            value={form.tmi ?? ""}
            onChange={(e) => set("tmi", e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Je ne sais pas (il l'estime)</option>
            {TMI_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t} %
              </option>
            ))}
          </select>
          <span className="field-hint">Sur ton avis d'impôt : « taux marginal » ou dernière tranche atteinte</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="as-horizon">Horizon de placement</label>
        <input id="as-horizon" maxLength={500} value={form.horizon} onChange={(e) => set("horizon", e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="as-goals">Objectifs</label>
        <textarea
          id="as-goals"
          rows={3}
          maxLength={2000}
          placeholder="Ex. : apport de 30 000 € pour un achat en 2030, indépendance financière à 50 ans…"
          value={form.goals}
          onChange={(e) => set("goals", e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="as-profile">À propos de moi (une info par ligne)</label>
        <textarea
          id="as-profile"
          rows={5}
          maxLength={4000}
          placeholder="Situation familiale, rattachement fiscal, épargne salariale Thales, projets…"
          value={form.profile}
          onChange={(e) => set("profile", e.target.value)}
        />
        <span className="field-hint">
          Plus il en sait (situation familiale, rattachement au foyer des parents, PEE Thales et abondement…), plus ses montages
          sont précis.
        </span>
      </div>
      <div className="field">
        <label htmlFor="as-instructions">Consignes supplémentaires</label>
        <textarea
          id="as-instructions"
          rows={3}
          maxLength={4000}
          placeholder="Ex. : pas de nouvelle crypto, je veux garder TotalEnergies, toujours chiffrer l'impôt économisé…"
          value={form.instructions}
          onChange={(e) => set("instructions", e.target.value)}
        />
      </div>

      {status && <p className={status.kind === "ok" ? "success-text" : "error-text"}>{status.text}</p>}
      <div className="assistant-settings-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setForm(DEFAULT_SETTINGS);
            setCustomModel(false);
            setStatus(null);
          }}
        >
          Valeurs par défaut
        </button>
      </div>

      <details
        className="prompt-preview"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open && !preview) loadPreview();
        }}
      >
        <summary>Ce que reçoit le conseiller à chaque question</summary>
        <p className="muted field-hint">
          Ses instructions puis l'instantané de ta situation, recalculé à chaque question, envoyés avec la conversation. Rien d'autre
          ne quitte ton serveur.
        </p>
        {previewError && <p className="error-text">{previewError}</p>}
        {!preview && !previewError && <p className="muted">Chargement…</p>}
        {preview && (
          <>
            <h3>
              Instructions (rôle, méthode, leviers fiscaux) <span className="muted">· {tokens(preview.instructions)}</span>
            </h3>
            <pre>{preview.instructions}</pre>
            <h3>
              Ta situation du jour <span className="muted">· {tokens(preview.context)}</span>
            </h3>
            <pre>{preview.context}</pre>
          </>
        )}
      </details>
    </form>
  );
}
