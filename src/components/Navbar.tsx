"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUsername(d.username));
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = [
    { href: "/dashboard", label: "Vue d'ensemble" },
    { href: "/accounts", label: "Comptes" },
    { href: "/settings", label: "Réglages" },
  ];

  return (
    <header className="navbar">
      <nav>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? "active" : ""}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="navbar-right">
        {username && <span className="muted">{username}</span>}
        <button className="btn" onClick={toggleTheme} type="button" aria-label="Changer de thème">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button className="btn" onClick={handleLogout} type="button">
          Déconnexion
        </button>
      </div>
    </header>
  );
}
