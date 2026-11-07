"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { confirmDialog } from "@/components/ConfirmDialog";
import PhotoCropper from "@/components/PhotoCropper";
import {
  FAMILY_STATUS,
  HOUSING_STATUS,
  JOB_STATUS,
  TAX_HOUSEHOLD,
  ageFrom,
  profilePhotoUrl,
  type UserProfile,
  type UserProfileInput,
} from "@/lib/profileShared";

/** Tells the sidebar to reload the name and photo shown at its bottom. */
export const PROFILE_UPDATED_EVENT = "profile-updated";
const announce = () => window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));

/** Largest picture accepted before cropping (the cropped result is small). */
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

function Avatar({ photo, label, size }: { photo: string | null; label: string; size: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {photo ? <img src={profilePhotoUrl(photo)} alt="" draggable={false} /> : label.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Select<K extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: K | null;
  options: Record<K, string>;
  onChange: (v: K | null) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as K | null)}>
        <option value="">Non renseigné</option>
        {(Object.entries(options) as [K, string][]).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ProfileForm({ initial, username }: { initial: UserProfile; username: string }) {
  const { photo: initialPhoto, ...fields } = initial;
  const [form, setForm] = useState<UserProfileInput>(fields);
  const [photo, setPhoto] = useState(initialPhoto);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const set = <K extends keyof UserProfileInput>(key: K, value: UserProfileInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };
  const age = ageFrom(form.birthDate);
  const today = new Date().toISOString().slice(0, 10);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSaving(false);
    if (!res?.ok) {
      setError(data.error ?? "Impossible d'enregistrer le profil.");
      return;
    }
    setSaved(true);
    announce();
  }

  /** A picture chosen or dropped: opens the cropper on it. */
  function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Format non pris en charge : JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError("Photo trop lourde (30 Mo maximum).");
      return;
    }
    // A data: URL, since the page's security policy doesn't allow blob: images.
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" && setCropSrc(reader.result);
    reader.onerror = () => setError("Impossible de lire cette photo.");
    reader.readAsDataURL(file);
  }

  async function upload(cropped: Blob) {
    setError("");
    setPhotoBusy(true);
    const body = new FormData();
    body.append("photo", new File([cropped], "avatar.jpg", { type: "image/jpeg" }));
    const res = await fetch("/api/account/photo", { method: "POST", body }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setPhotoBusy(false);
    if (!res?.ok) {
      setError(data.error ?? "Impossible d'envoyer la photo.");
      return;
    }
    setCropSrc(null);
    setPhoto(data.photo);
    announce();
  }

  // Dropping a picture on the photo area: handled here (preventDefault tells
  // the app-wide Trade Republic drop zone to leave it alone).
  const isImageDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"));
  function onDragOver(e: React.DragEvent) {
    if (!isImageDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }
  function onDrop(e: React.DragEvent) {
    setDropping(false);
    if (!isImageDrag(e)) return;
    e.preventDefault();
    pick(e.dataTransfer.files[0]);
  }

  async function removePhoto() {
    if (!(await confirmDialog({ title: "Retirer ta photo de profil ?", confirmLabel: "Retirer", danger: true }))) return;
    setPhotoBusy(true);
    const res = await fetch("/api/account/photo", { method: "DELETE" }).catch(() => null);
    setPhotoBusy(false);
    if (res?.ok) {
      setPhoto(null);
      announce();
    }
  }

  return (
    <div className="card">
      <h2>Profil</h2>
      <p className="secondary">
        Ces informations sont envoyées au <Link href="/assistant">Conseiller</Link> avec chaque question, pour qu&apos;il tienne
        compte de ta situation (âge, foyer fiscal, logement...). Tout est facultatif.
      </p>

      <div
        className={`profile-photo${dropping ? " dropping" : ""}`}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDropping(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="profile-avatar-btn"
          onClick={() => (photo ? setCropSrc(profilePhotoUrl(photo)) : input.current?.click())}
          disabled={photoBusy}
          title={photo ? "Recadrer la photo" : "Ajouter une photo"}
        >
          <Avatar photo={photo} label={form.firstName || username} size={88} />
        </button>
        <div className="profile-photo-actions">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
            hidden
          />
          <button type="button" className="btn" disabled={photoBusy} onClick={() => input.current?.click()}>
            {photo ? "Changer la photo" : "Ajouter une photo"}
          </button>
          {photo && (
            <button type="button" className="btn" disabled={photoBusy} onClick={() => setCropSrc(profilePhotoUrl(photo))}>
              Recadrer
            </button>
          )}
          {photo && (
            <button type="button" className="btn btn-ghost btn-danger" disabled={photoBusy} onClick={removePhoto}>
              Retirer
            </button>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            JPEG, PNG ou WebP. Tu peux aussi glisser une photo ici.
          </span>
        </div>
      </div>

      {cropSrc && <PhotoCropper src={cropSrc} busy={photoBusy} onCancel={() => setCropSrc(null)} onConfirm={upload} />}

      <form onSubmit={save}>
        {error && <p className="error-text">{error}</p>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pf-first">Prénom</label>
            <input id="pf-first" maxLength={50} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="given-name" />
          </div>
          <div className="field">
            <label htmlFor="pf-birth">
              Date de naissance{age !== null && <span className="muted"> · {age} ans</span>}
            </label>
            <input
              id="pf-birth"
              type="date"
              min="1900-01-01"
              max={today}
              value={form.birthDate ?? ""}
              onChange={(e) => set("birthDate", e.target.value || null)}
              autoComplete="bday"
            />
          </div>
          <Select id="pf-family" label="Situation familiale" value={form.family} options={FAMILY_STATUS} onChange={(v) => set("family", v)} />
          <div className="field">
            <label htmlFor="pf-children">Enfants à charge</label>
            <input
              id="pf-children"
              type="number"
              min={0}
              max={20}
              step={1}
              value={form.children ?? ""}
              onChange={(e) => set("children", e.target.value === "" ? null : Math.max(0, Math.min(20, Math.round(Number(e.target.value)))))}
            />
          </div>
          <Select id="pf-job" label="Situation professionnelle" value={form.job} options={JOB_STATUS} onChange={(v) => set("job", v)} />
          <div className="field">
            <label htmlFor="pf-occupation">Métier et employeur</label>
            <input
              id="pf-occupation"
              maxLength={120}
              placeholder="ex. Ingénieur cloud chez Thales"
              value={form.occupation}
              onChange={(e) => set("occupation", e.target.value)}
            />
          </div>
          <Select id="pf-housing" label="Logement" value={form.housing} options={HOUSING_STATUS} onChange={(v) => set("housing", v)} />
          <div className="field">
            <label htmlFor="pf-city">Ville ou département</label>
            <input id="pf-city" maxLength={80} placeholder="ex. Toulouse (31)" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <Select id="pf-tax" label="Foyer fiscal" value={form.taxHousehold} options={TAX_HOUSEHOLD} onChange={(v) => set("taxHousehold", v)} />
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Tolérance au risque, tranche d&apos;imposition, objectifs et autres précisions se règlent dans les paramètres du{" "}
          <Link href="/assistant">Conseiller</Link>.
        </p>
        <div className="profile-save">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer le profil"}
          </button>
          {saved && <span className="success-text">Profil enregistré.</span>}
        </div>
      </form>
    </div>
  );
}
