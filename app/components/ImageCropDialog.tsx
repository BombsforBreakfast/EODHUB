"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageBlob } from "../lib/cropImage";
import { useTheme } from "../lib/ThemeContext";

type Props = {
  open: boolean;
  imageSrc: string | null;
  aspect: number;
  cropShape?: "rect" | "round";
  title?: string;
  onCancel: () => void;
  onComplete: (blob: Blob) => void | Promise<void>;
};

export default function ImageCropDialog({
  open,
  imageSrc,
  aspect,
  cropShape = "rect",
  title = "Crop image",
  onCancel,
  onComplete,
}: Props) {
  const { t } = useTheme();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && imageSrc) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function apply() {
    if (!imageSrc || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      await onComplete(blob);
    } finally {
      setBusy(false);
    }
  }

  if (!open || !imageSrc) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        style={{
          background: t.surface,
          borderRadius: 16,
          width: "100%",
          maxWidth: 520,
          border: `1px solid ${t.border}`,
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${t.border}`,
            fontWeight: 800,
            fontSize: 16,
            color: t.text,
          }}
        >
          {title}
        </div>
        <div style={{ position: "relative", width: "100%", height: 320, background: "#111" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: t.textMuted, flex: "1 1 120px" }}>
            Drag to position · adjust zoom
          </span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: 120, flexShrink: 0 }}
            aria-label="Zoom"
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            padding: 16,
            borderTop: `1px solid ${t.border}`,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || !croppedAreaPixels}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "none",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: busy || !croppedAreaPixels ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {busy && <span className="btn-spinner" />}
            Use photo
          </button>
        </div>
      </div>
    </div>
  );
}
