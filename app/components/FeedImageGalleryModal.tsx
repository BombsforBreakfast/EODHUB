"use client";

import { useEffect, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { isVideoUrl } from "../lib/uploadLimits";

type Props = {
  open: boolean;
  images: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
};

const NAV_BTN: CSSProperties = {
  background: "rgba(0,0,0,0.78)",
  color: "white",
  border: "1px solid rgba(255,255,255,0.65)",
  borderRadius: 999,
  width: 52,
  height: 52,
  minWidth: 52,
  minHeight: 52,
  fontSize: 32,
  fontWeight: 900,
  cursor: "pointer",
  zIndex: 2,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  lineHeight: 1,
  boxShadow: "0 8px 26px rgba(0,0,0,0.45)",
};

function stopControlEvent(e: MouseEvent | PointerEvent) {
  e.stopPropagation();
}

export default function FeedImageGalleryModal({
  open,
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || images.length === 0) return null;

  const indexSafe = Math.min(Math.max(index, 0), images.length - 1);
  const currentUrl = images[indexSafe];

  const modal = (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.94)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10050,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image gallery"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: "100vw",
          height: "100vh",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {isVideoUrl(currentUrl) ? (
          <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <video
              key={currentUrl}
              src={currentUrl}
              controls
              autoPlay
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                background: "#000",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              maxWidth: "100vw",
              maxHeight: "100vh",
              display: "inline-block",
              lineHeight: 0,
            }}
          >
            <img
              src={currentUrl}
              alt={`Gallery image ${indexSafe + 1}`}
              style={{
                maxWidth: "100vw",
                maxHeight: "100vh",
                width: "auto",
                height: "auto",
                objectFit: "contain",
                display: "block",
              }}
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onPointerDown={stopControlEvent}
                  onClick={(e) => {
                    stopControlEvent(e);
                    onPrev();
                  }}
                  style={{
                    ...NAV_BTN,
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 4,
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={(e) => {
                    stopControlEvent(e);
                    onNext();
                  }}
                  onPointerDown={stopControlEvent}
                  style={{
                    ...NAV_BTN,
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 4,
                  }}
                >
                  ›
                </button>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          aria-label="Close gallery"
          onPointerDown={stopControlEvent}
          onClick={(e) => {
            stopControlEvent(e);
            onClose();
          }}
          style={{
            ...NAV_BTN,
            position: "absolute",
            top: "calc(max(10px, env(safe-area-inset-top)) + 56px)",
            right: "max(10px, env(safe-area-inset-right))",
            width: 42,
            height: 42,
            minWidth: 42,
            minHeight: 42,
            fontSize: 24,
            zIndex: 5,
          }}
        >
          ×
        </button>

        {images.length > 1 && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "max(10px, env(safe-area-inset-bottom))",
              transform: "translateX(-50%)",
              color: "white",
              fontSize: 22,
              fontWeight: 800,
              lineHeight: 1,
              zIndex: 5,
              textShadow: "0 2px 10px rgba(0,0,0,0.8)",
            }}
          >
            {indexSafe + 1} / {images.length}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
