"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseTheme } from "@/lib/themes";

const icons = {
  synthese: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  ),
  comptes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10 12 4l9 6" />
      <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
      <path d="M3 20h18" />
    </svg>
  ),
  analyse: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </svg>
  ),
  reglages: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  ),
};

const depensesIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <path d="M8 14h2M14 14h2M8 17h2" />
  </svg>
);

const links = [
  { href: "/dashboard", label: "Synthèse", icon: icons.synthese },
  { href: "/accounts", label: "Comptes", icon: icons.comptes },
  { href: "/expenses", label: "Dépenses", icon: depensesIcon },
  { href: "/analysis", label: "Analyse", icon: icons.analyse },
  { href: "/settings", label: "Réglages", icon: icons.reglages },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsername(d.username));
    // One-time migration: the theme used to be kept in localStorage only.
    if (!document.cookie.split("; ").some((c) => c.startsWith("theme="))) {
      try {
        const legacy = localStorage.getItem("theme");
        if (legacy === "light" || legacy === "dark") {
          const id = parseTheme(legacy);
          document.documentElement.setAttribute("data-theme", id);
          document.cookie = `theme=${id}; path=/; max-age=31536000; samesite=strict`;
          localStorage.removeItem("theme");
        }
      } catch {}
    }
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">
        <span className="brand-mark">P</span>
        <span className="brand-name">Patrimoine</span>
      </Link>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`nav-link${pathname.startsWith(l.href) ? " active" : ""}`} title={l.label}>
          {l.icon}
          <span className="nav-label">{l.label}</span>
        </Link>
      ))}
      <div className="sidebar-footer">
        {username && (
          <div className="user-chip">
            <span className="avatar">{username.slice(0, 2).toUpperCase()}</span>
            {username}
          </div>
        )}
        <div className="sidebar-actions">
          <button className="btn" onClick={handleLogout} type="button" title="Déconnexion" aria-label="Déconnexion">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
              <path d="M10 17l-5-5 5-5M5 12h11" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
