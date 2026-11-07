"use client";

import { useEffect, useRef, useState } from "react";

// Square crop of a picture (shown in a circle) before it becomes the profile
// photo: drag to move it, zoom with the slider, the buttons or the mouse wheel.
// The result is a 512 px JPEG made in the browser, so only the cropped part is sent.

const VIEW = 280; // crop area on screen, px
const OUTPUT = 512; // saved picture, px
const MAX_ZOOM = 4;

interface Props {
  /** data: URL or same-origin URL of the picture to crop. */
  src: string;
  onCancel: () => void;
  onConfirm: (photo: Blob) => void;
  busy?: boolean;
}

export default function PhotoCropper({ src, onCancel, onConfirm, busy = false }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.onerror = () => setError("Image illisible : essaie une photo JPEG ou PNG.");
    image.src = src;
  }, [src]);

  // Scale at zoom 1: the picture just covers the crop area.
  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const scale = base * zoom;
  const width = img ? img.naturalWidth * scale : VIEW;
  const height = img ? img.naturalHeight * scale : VIEW;

  /** Keeps the crop area fully covered by the picture. */
  const clamp = (x: number, y: number, w = width, h = height) => ({
    x: Math.max(-(w - VIEW) / 2, Math.min((w - VIEW) / 2, x)),
    y: Math.max(-(h - VIEW) / 2, Math.min((h - VIEW) / 2, y)),
  });

  function zoomTo(next: number) {
    if (!img) return;
    const z = Math.max(1, Math.min(MAX_ZOOM, next));
    const s = base * z;
    // Zoom around the centre of the crop area.
    const ratio = z / zoom;
    setZoom(z);
    setOffset(clamp(offset.x * ratio, offset.y * ratio, img.naturalWidth * s, img.naturalHeight * s));
  }

  useEffect(() => {
    confirmRef.current?.focus();
  }, [img]);

  // The wheel zooms instead of scrolling the page: needs a non-passive listener.
  const viewRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const zoomValue = useRef(zoom);
  zoomValue.current = zoom;
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current(zoomValue.current * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 30 : 10;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setOffset(clamp(offset.x + moves[e.key][0], offset.y + moves[e.key][1]));
    } else if (e.key === "+" || e.key === "=") zoomTo(zoom + 0.2);
    else if (e.key === "-") zoomTo(zoom - 0.2);
  }

  function confirm() {
    if (!img) return;
    // Top-left corner of the crop area, in the picture's own pixels.
    const sx = (width / 2 - VIEW / 2 - offset.x) / scale;
    const sy = (height / 2 - VIEW / 2 - offset.y) / scale;
    const size = VIEW / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError("Ton navigateur ne permet pas de recadrer l'image.");
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#fff"; // transparent PNGs get a white background in the JPEG
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT);
    canvas.toBlob((blob) => (blob ? onConfirm(blob) : setError("Impossible de préparer la photo.")), "image/jpeg", 0.9);
  }

  return (
    <div className="modal-backdrop cropper-backdrop" onClick={busy ? undefined : onCancel}>
      <section className="card modal cropper" role="dialog" aria-modal="true" aria-labelledby="cropper-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="cropper-title">Recadrer la photo</h2>
        <p className="muted">Fais glisser la photo pour la placer, et zoome avec le curseur ou la molette.</p>

        {error ? (
          <p className="error-text">{error}</p>
        ) : (
          <div
            ref={viewRef}
            className="cropper-view"
            style={{ width: VIEW, height: VIEW }}
            tabIndex={0}
            role="application"
            aria-label="Zone de recadrage : flèches pour déplacer, + et - pour zoomer"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                style={{
                  width,
                  height,
                  transform: `translate(${(VIEW - width) / 2 + offset.x}px, ${(VIEW - height) / 2 + offset.y}px)`,
                }}
              />
            )}
            <span className="cropper-mask" aria-hidden="true" />
          </div>
        )}

        <div className="cropper-zoom">
          <button type="button" className="btn btn-ghost icon-btn" onClick={() => zoomTo(zoom - 0.2)} disabled={!img || zoom <= 1} aria-label="Dézoomer">
            −
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            disabled={!img}
            aria-label="Zoom"
          />
          <button type="button" className="btn btn-ghost icon-btn" onClick={() => zoomTo(zoom + 0.2)} disabled={!img || zoom >= MAX_ZOOM} aria-label="Zoomer">
            +
          </button>
        </div>

        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button ref={confirmRef} type="button" className="btn btn-primary" onClick={confirm} disabled={!img || busy}>
            {busy ? "Envoi..." : "Utiliser cette photo"}
          </button>
        </div>
      </section>
    </div>
  );
}
