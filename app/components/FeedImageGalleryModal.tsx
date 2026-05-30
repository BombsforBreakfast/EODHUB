"use client";

import { isVideoUrl } from "../lib/uploadLimits";

type Props = {
  open: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function FeedImageGalleryModal({
  open,
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: Props) {
  if (!open || images.length === 0) return null;

  const currentUrl = images[index];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.86)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 980,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: -10,
            right: 0,
            background: "rgba(255,255,255,0.14)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 999,
            width: 42,
            height: 42,
            fontSize: 24,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          x
        </button>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.14)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 999,
                width: 46,
                height: 46,
                fontSize: 28,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {"<"}
            </button>

            <button
              type="button"
              onClick={onNext}
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(255,255,255,0.14)",
                color: "white",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 999,
                width: 46,
                height: 46,
                fontSize: 28,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {">"}
            </button>
          </>
        )}

        <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
          {isVideoUrl(currentUrl) ? (
            <video
              key={currentUrl}
              src={currentUrl}
              controls
              autoPlay
              playsInline
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                borderRadius: 12,
                display: "block",
                background: "#000",
              }}
            />
          ) : (
            <img
              src={currentUrl}
              alt={`Gallery image ${index + 1}`}
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: 12,
                display: "block",
              }}
            />
          )}
        </div>

        <div style={{ color: "white", fontSize: 14, fontWeight: 700 }}>
          {index + 1} / {images.length}
        </div>
      </div>
    </div>
  );
}
