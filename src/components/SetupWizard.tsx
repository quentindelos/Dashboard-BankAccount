"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (password.length < 12) {
      setError("Le mot de passe doit contenir au moins 12 caractères.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la configuration.");
        return;
      }
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setSecret(data.secret);
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Code invalide.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (step === 1) {
    return (
      <form onSubmit={handleStep1}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label htmlFor="username">Identifiant</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={50}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe (12 caractères min.)</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={12}
          />
        </div>
        <div className="field">
          <label htmlFor="confirmPassword">Confirmer le mot de passe</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button className="btn btn-primary btn-full" disabled={loading} type="submit">
          {loading ? "..." : "Continuer"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleStep2}>
      {error && <p className="error-text">{error}</p>}
      <p className="secondary">
        Scanne ce QR code avec ton application d'authentification (Google Authenticator, Aegis, Authy...).
      </p>
      {qrCodeDataUrl && (
        <div className="qr-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCodeDataUrl} alt="QR code 2FA" width={180} height={180} />
        </div>
      )}
      <p className="muted" style={{ fontSize: 12 }}>
        Impossible de scanner ? Entre ce code manuellement :
      </p>
      <p className="secret-code">{secret}</p>
      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="token">Code à 6 chiffres</label>
        <input
          id="token"
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
        />
      </div>
      <button className="btn btn-primary btn-full" disabled={loading || token.length !== 6} type="submit">
        {loading ? "..." : "Confirmer et terminer"}
      </button>
    </form>
  );
}
