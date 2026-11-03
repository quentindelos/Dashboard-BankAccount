"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ initialStep }: { initialStep: "password" | "totp" }) {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "totp">(initialStep);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur de connexion.");
        return;
      }
      setStep("totp");
    } finally {
      setLoading(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-2fa", {
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

  if (step === "password") {
    return (
      <form onSubmit={handlePassword}>
        {error && <p className="error-text">{error}</p>}
        <div className="field">
          <label htmlFor="username">Identifiant</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
    <form onSubmit={handleTotp}>
      {error && <p className="error-text">{error}</p>}
      <div className="field">
        <label htmlFor="token">Code à 6 chiffres de ton application 2FA</label>
        <input
          id="token"
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          autoFocus
        />
      </div>
      <button className="btn btn-primary btn-full" disabled={loading || token.length !== 6} type="submit">
        {loading ? "..." : "Se connecter"}
      </button>
    </form>
  );
}
