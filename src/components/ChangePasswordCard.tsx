"use client";

import { useState } from "react";

export default function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (next.length < 12) {
      setError("Le nouveau mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erreur.");
        return;
      }
      setSuccess("Mot de passe mis à jour.");
      setCurrent("");
      setNext("");
      setToken("");
    } catch {
      setError("Impossible de joindre le serveur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h2>Mot de passe</h2>
      <p className="secondary">Pour le changer, il faut le mot de passe actuel et un code de ton application 2FA.</p>
      <form onSubmit={submit}>
        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">{success}</p>}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pwCurrent">Mot de passe actuel</label>
            <input id="pwCurrent" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="field">
            <label htmlFor="pwNew">Nouveau mot de passe (12 caractères min.)</label>
            <input id="pwNew" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={12} />
          </div>
          <div className="field">
            <label htmlFor="pwToken">Code 2FA actuel</label>
            <input
              id="pwToken"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </div>
        </div>
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "..." : "Changer le mot de passe"}
        </button>
      </form>
    </div>
  );
}
