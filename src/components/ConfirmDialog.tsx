"use client";

import { useEffect, useRef, useState } from "react";

// In-app replacement for the browser's confirm() box, styled like the rest of
// the app. Call `await confirmDialog({...})` anywhere in a client component:
// it resolves to true when the user confirms. <ConfirmHost /> (mounted once in
// the app layout) renders the dialog.

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label of the confirm button (default "Confirmer"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action: red confirm button, and focus starts on "Annuler". */
  danger?: boolean;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let open: ((request: Request) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // No host on this page: fall back to the browser's box rather than act unasked.
  if (!open) return Promise.resolve(window.confirm([options.title, options.message].filter(Boolean).join("\n\n")));
  const show = open;
  return new Promise((resolve) => show({ ...options, resolve }));
}

export default function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const current = useRef<Request | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const show = (next: Request) => {
      current.current?.resolve(false); // a newer question replaces an unanswered one
      current.current = next;
      setRequest(next);
    };
    open = show;
    return () => {
      if (open === show) open = null;
      current.current?.resolve(false);
      current.current = null;
    };
  }, []);

  function answer(ok: boolean) {
    current.current?.resolve(ok);
    current.current = null;
    setRequest(null);
  }

  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement as HTMLElement | null;
    (request.danger ? cancelRef : confirmRef).current?.focus();

    // Capture phase: Escape closes this dialog only, not a modal underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        answer(false);
      } else if (e.key === "Tab") {
        // Keep focus on the two buttons while the dialog is open.
        e.preventDefault();
        e.stopPropagation();
        const next = document.activeElement === confirmRef.current ? cancelRef.current : confirmRef.current;
        next?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [request]);

  if (!request) return null;

  return (
    <div className="modal-backdrop confirm-backdrop" onClick={() => answer(false)}>
      <section
        className="card modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={request.message ? "confirm-message" : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{request.title}</h2>
        {request.message && (
          <p id="confirm-message" className="muted">
            {request.message}
          </p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={() => answer(false)}>
            {request.cancelLabel ?? "Annuler"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${request.danger ? "btn-danger-solid" : "btn-primary"}`}
            onClick={() => answer(true)}
          >
            {request.confirmLabel ?? "Confirmer"}
          </button>
        </div>
      </section>
    </div>
  );
}
