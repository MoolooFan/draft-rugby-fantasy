"use client";

// Pick the part of a photo to use as a team picture: drag to move, slider to zoom. The circle
// shows what the picture will look like. Produces a 256 x 256 JPEG (about 30 KB).

import React, { useEffect, useRef, useState } from "react";

const VIEW = 220; // size of the preview circle on screen
const OUT = 256; // size of the saved picture

export function PictureCropper({
  file,
  onCancel,
  onDone,
  busy = false,
}: {
  file: File;
  onCancel: () => void;
  onDone: (jpeg: Blob) => void;
  busy?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = the photo just covers the circle
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // photo centre relative to the circle centre, in screen px
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setError("That file couldn't be opened as a picture.");
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // screen size of the photo: its short side fills the circle at zoom 1
  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : VIEW;
  const h = img ? img.naturalHeight * base * zoom : VIEW;

  // keep the circle covered by the photo
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    if (!img) return o;
    const ww = img.naturalWidth * base * z;
    const hh = img.naturalHeight * base * z;
    const mx = Math.max(0, (ww - VIEW) / 2);
    const my = Math.max(0, (hh - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  function save() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return setError("Your browser couldn't make the picture.");
    const scale = OUT / VIEW;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, (VIEW / 2 + offset.x - w / 2) * scale, (VIEW / 2 + offset.y - h / 2) * scale, w * scale, h * scale);
    canvas.toBlob((b) => (b ? onDone(b) : setError("Your browser couldn't make the picture.")), "image/jpeg", 0.86);
  }

  return (
    <div
      onClick={() => !busy && onCancel()}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 18 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 340, borderRadius: 18, background: "#ffffff", color: "#0f172a", overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}
      >
        <div style={{ padding: "10px 12px", background: "#0f172a", color: "white", fontSize: 12, fontWeight: 900 }}>
          Drag to move, slide to zoom
        </div>
        <div style={{ padding: 16, display: "grid", justifyItems: "center", gap: 12 }}>
          {error ? (
            <div style={{ fontSize: 12, fontWeight: 800, color: "#b91c1c" }}>{error}</div>
          ) : (
            <div
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                setOffset(clamp({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              style={{
                width: VIEW,
                height: VIEW,
                borderRadius: 999,
                overflow: "hidden",
                position: "relative",
                background: "rgba(15,23,42,0.08)",
                touchAction: "none",
                cursor: "grab",
                boxShadow: "0 0 0 3px #0f172a",
              }}
            >
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    width: w,
                    height: h,
                    left: VIEW / 2 + offset.x - w / 2,
                    top: VIEW / 2 + offset.y - h / 2,
                    maxWidth: "none",
                    userSelect: "none",
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800, opacity: 0.6 }}>Loading…</div>
              )}
            </div>
          )}
          <input
            id="picture-zoom"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            aria-label="Zoom"
            disabled={!img}
            onChange={(e) => {
              const z = Number(e.target.value);
              setZoom(z);
              setOffset((o) => clamp(o, z));
            }}
            style={{ width: VIEW }}
          />
        </div>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, borderTop: "1px solid rgba(0,0,0,0.10)" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{ height: 38, borderRadius: 12, border: "2px solid rgba(239,68,68,0.9)", background: "transparent", color: "rgba(239,68,68,0.95)", fontWeight: 900, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!img || busy}
            style={{ height: 38, borderRadius: 12, border: "none", background: "#22C55E", color: "white", fontWeight: 900, cursor: "pointer", opacity: !img || busy ? 0.6 : 1 }}
          >
            {busy ? "Saving…" : "Use picture"}
          </button>
        </div>
      </div>
    </div>
  );
}
