"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseTheme } from "@/lib/themes";
import { PROFILE_UPDATED_EVENT } from "@/components/ProfileForm";

interface Me {
  username: string;
  firstName: string | null;
  photoUrl: string | null;
}

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

const projectionIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 20h18" />
    <path d="M4 16l5-5 4 3 7-8" />
    <path d="M15 6h5v5" />
  </svg>
);

const assistantIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z" />
    <path d="M9 11h.01M12 11h.01M15 11h.01" />
  </svg>
);

const assetsIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 16H3v-4l2-5h11l3 5h2v4h-2" />
    <circle cx="7.5" cy="16.5" r="2" />
    <circle cx="16.5" cy="16.5" r="2" />
    <path d="M9.5 16.5h5" />
  </svg>
);

const links: { href: string; label: string; icon: React.ReactNode; tag?: string; title?: string }[] = [
  { href: "/dashboard", label: "Synthèse", icon: icons.synthese },
  { href: "/accounts", label: "Comptes", icon: icons.comptes },
  { href: "/assets", label: "Biens", icon: assetsIcon, title: "Biens : véhicules et or physique" },
  { href: "/expenses", label: "Dépenses", icon: depensesIcon },
  { href: "/analysis", label: "Analyse", icon: icons.analyse },
  { href: "/projection", label: "Projection", icon: projectionIcon },
  { href: "/assistant", label: "Conseiller", icon: assistantIcon, tag: "Agent IA", title: "Conseiller : ton agent IA" },
];

// App settings sit apart, at the bottom of the sidebar.
const settingsLink = { href: "/settings", label: "Réglages", icon: icons.reglages };

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [due, setDue] = useState(0);

  // Number of things to update (see the reminder card on the Synthèse page),
  // refreshed on each page change so it drops as soon as data is filled in.
  useEffect(() => {
    fetch("/api/checklist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDue(d.due))
      .catch(() => undefined);
  }, [pathname]);

  useEffect(() => {
    // Name and photo at the bottom, reloaded when they change on Mon compte.
    const loadMe = () =>
      fetch("/api/me", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Me | null) => d && setMe(d))
        .catch(() => undefined);
    loadMe();
    window.addEventListener(PROFILE_UPDATED_EVENT, loadMe);
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
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, loadMe);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="currentColor">
            <path d="M6 25 V21 C10 21 11.5 16 15.5 16 C19.5 16 20.5 9.5 25 8.5 V25 Z" opacity="0.3" />
            <path d="M6 21 C10 21 11.5 16 15.5 16 C19.5 16 20.5 9.5 25 8.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="25" cy="8.5" r="2.8" />
          </svg>
        </span>
        <span className="brand-name">Patrimoine</span>
      </Link>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={`nav-link${pathname.startsWith(l.href) ? " active" : ""}`} title={l.title ?? l.label}>
          {l.icon}
          <span className="nav-label">{l.label}</span>
          {l.tag && <span className="nav-tag">{l.tag}</span>}
          {l.href === "/dashboard" && due > 0 && (
            <span className="nav-badge" title={`${due} élément${due > 1 ? "s" : ""} à mettre à jour`}>
              {due}
            </span>
          )}
        </Link>
      ))}
      <div className="sidebar-footer">
        <Link
          href={settingsLink.href}
          className={`nav-link${pathname.startsWith(settingsLink.href) ? " active" : ""}`}
          title={settingsLink.label}
        >
          {settingsLink.icon}
          <span className="nav-label">{settingsLink.label}</span>
        </Link>
        {me && (
          <Link
            href="/profile"
            className={`user-chip${pathname.startsWith("/profile") ? " active" : ""}`}
            title="Mon compte : profil et mot de passe"
          >
            <span className="avatar">
              {me.photoUrl ? <img src={me.photoUrl} alt="" draggable={false} /> :(me.firstName || me.username).slice(0, 2).toUpperCase()}
            </span>
            <span className="user-name">{me.firstName || me.username}</span>
          </Link>
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
