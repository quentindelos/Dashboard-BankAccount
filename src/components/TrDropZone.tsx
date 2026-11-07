"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { eur0 } from "@/components/ui";
import { importTrExport, isTrExportFile, type TrImportResult } from "@/lib/trImportClient";

type Toast = { kind: "loading"; name: string } | { kind: "ok"; result: TrImportResult } | { kind: "error"; message: string };

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** Only files that could be the export (not pictures: those are for the profile photo). */
const mayBeExport = (e: DragEvent) =>
  Array.from(e.dataTransfer?.items ?? []).some((item) => item.kind === "file" && !item.type.startsWith("image/"));

/** Drop the Trade Republic export anywhere in the app: it is imported right
 * away and every page refreshes with the new history. */
export default function TrDropZone() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const depth = useRef(0); // dragenter/dragleave fire for every child element
  const busy = useRef(false);

  useEffect(() => {
    async function upload(file: File) {
      if (!isTrExportFile(file)) {
        setToast({ kind: "error", message: "Ce fichier n'est pas un export Trade Republic (CSV ou Excel attendu)." });
        return;
      }
      busy.current = true;
      setToast({ kind: "loading", name: file.name });
      try {
        const result = await importTrExport(file);
        setToast({ kind: "ok", result });
        router.refresh();
      } catch (err) {
        setToast({ kind: "error", message: err instanceof Error ? err.message : "Erreur lors de l'import." });
      } finally {
        busy.current = false;
      }
    }

    // A drag that starts inside the page (an image, a link) is never an import:
    // browsers can report it as carrying "Files" too.
    let internal = false;
    const onStart = () => {
      internal = true;
    };
    const onEnd = () => {
      internal = false;
    };

    // Ignored: drags from the page, ones a component already handles (e.g. the
    // profile photo zone calls preventDefault first), and pictures.
    const ours = (e: DragEvent) => hasFiles(e) && !internal && !e.defaultPrevented && mayBeExport(e);
    // A file the app doesn't take would otherwise be opened by the browser in place of the app.
    const refuse = (e: DragEvent) => {
      if (!hasFiles(e) || internal || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
    };

    const onEnter = (e: DragEvent) => {
      if (!ours(e)) return refuse(e);
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!ours(e)) return refuse(e);
      e.preventDefault(); // allows the drop
      if (e.dataTransfer) e.dataTransfer.dropEffect = busy.current ? "none" : "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e) || internal) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      depth.current = 0;
      setDragging(false);
      if (!ours(e)) return refuse(e);
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && !busy.current) upload(file);
    };

    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onEnd);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [router]);

  // A success message goes away by itself; an error stays until closed.
  useEffect(() => {
    if (toast?.kind !== "ok") return;
    const timer = setTimeout(() => setToast(null), 10000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-box">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15V3M7 8l5-5 5 5" />
              <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
            <strong>Dépose ton export Trade Republic</strong>
            <span>L&apos;historique du PEA, du CTO et de la crypto sera recalculé avec ce fichier.</span>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>
          {toast.kind === "loading" && (
            <>
              <span className="toast-spinner" aria-hidden="true" />
              <div>
                <strong>Import en cours...</strong>
                <span className="muted">{toast.name} · quelques secondes</span>
              </div>
            </>
          )}
          {toast.kind === "ok" && (
            <div>
              <strong>✓ Import terminé : {toast.result.transactions} opérations lues</strong>
              <span className="muted">
                {toast.result.accounts.map((a) => `${a.account} ${eur0.format(a.value)}`).join(" · ")}
              </span>
              {toast.result.unpriced.length > 0 && (
                <span className="muted">Sans cours, valorisé au dernier prix d&apos;achat : {toast.result.unpriced.join(", ")}</span>
              )}
            </div>
          )}
          {toast.kind === "error" && (
            <div>
              <strong>Import impossible</strong>
              <span>{toast.message}</span>
            </div>
          )}
          {toast.kind !== "loading" && (
            <button type="button" className="toast-close" onClick={() => setToast(null)} aria-label="Fermer">
              ×
            </button>
          )}
        </div>
      )}
    </>
  );
}
