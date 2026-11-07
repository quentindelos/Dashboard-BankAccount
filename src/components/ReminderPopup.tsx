"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChecklistItem } from "@/lib/checklist";

// When some data is out of date (a Trade Republic export older than 14 days,
// a balance older than a month), a popup lists what to update as soon as the
// app opens. "Me le rappeler demain" hides it for 24 hours on this device;
// closing it hides it until the browser is reopened.
const SNOOZE_KEY = "reminderSnoozedUntil";
const SEEN_KEY = "reminderSeen";
const DAY_MS = 24 * 3600 * 1000;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {
    // Storage blocked (private window): the popup simply shows again next time.
  }
}

export default function ReminderPopup() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [open, setOpen] = useState(false);
  const firstAction = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const snoozedUntil = Number(read(() => localStorage, SNOOZE_KEY) ?? 0);
    if (Date.now() < snoozedUntil || read(() => sessionStorage, SEEN_KEY)) return;
    fetch("/api/checklist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items: ChecklistItem[] } | null) => {
        const due = (d?.items ?? []).filter((i) => i.level !== "tip");
        // Only out-of-date data opens the popup; missing data then comes along.
        if (!due.some((i) => i.level === "late")) return;
        setItems(due);
        setOpen(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    firstAction.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    write(() => sessionStorage, SEEN_KEY, "1");
    setOpen(false);
  }

  function snooze() {
    write(() => localStorage, SNOOZE_KEY, String(Date.now() + DAY_MS));
    close();
  }

  if (!open) return null;

  const late = items.filter((i) => i.level === "late").length;
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="card modal reminder-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-title">
          <h2 id="reminder-title">Tes données ne sont plus à jour</h2>
          <button type="button" className="btn btn-ghost icon-btn" onClick={close} aria-label="Fermer">
            ×
          </button>
        </div>
        <p className="muted" style={{ marginTop: -8 }}>
          {late > 1 ? `${late} comptes n'ont pas été mis à jour depuis longtemps` : "Un compte n'a pas été mis à jour depuis longtemps"} : ton
          patrimoine et les conseils de l&apos;app sont faussés tant qu&apos;ils ne le sont pas.
        </p>
        <ul className="checklist-list">
          {items.map((item, i) => (
            <li key={item.id} className={`checklist-item ${item.level}`}>
              <span className="checklist-dot" aria-hidden="true" />
              <div className="checklist-text">
                <strong>{item.title}</strong>
                <span className="muted">{item.detail}</span>
              </div>
              <Link href={item.href} className="btn" onClick={close} ref={i === 0 ? firstAction : undefined}>
                {item.action}
              </Link>
            </li>
          ))}
        </ul>
        <div className="reminder-actions">
          <button type="button" className="btn" onClick={snooze}>
            Me le rappeler demain
          </button>
          <button type="button" className="btn btn-primary" onClick={close}>
            OK
          </button>
        </div>
      </section>
    </div>
  );
}
