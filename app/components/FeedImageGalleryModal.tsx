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
        background: "rgba(0, 0, 0, 0.86)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10050,
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image gallery"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          maxWidth: "calc(100vw - 24px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            maxWidth: "100%",
          }}
        >
          {images.length > 1 && (
            <button
              type="button"
              aria-label="Previous image"
              onPointerDown={stopControlEvent}
              onClick={(e) => {
                stopControlEvent(e);
                onPrev();
              }}
              style={NAV_BTN}
            >
              ‹
            </button>
          )}

          <div style={{ position: "relative", display: "inline-block", maxWidth: "calc(100vw - 148px)" }}>
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
                top: -14,
                right: -14,
                width: 42,
                height: 42,
                minWidth: 42,
                minHeight: 42,
                fontSize: 24,
                zIndex: 3,
              }}
            >
              ×
            </button>

            {isVideoUrl(currentUrl) ? (
              <video
                key={currentUrl}
                src={currentUrl}
                controls
                autoPlay
                playsInline
                style={{
                  maxWidth: "min(980px, calc(100vw - 148px))",
                  maxHeight: "80vh",
                  borderRadius: 12,
                  display: "block",
                  background: "#000",
                }}
              />
            ) : (
              <img
                src={currentUrl}
                alt={`Gallery image ${indexSafe + 1}`}
                style={{
                  maxWidth: "min(980px, calc(100vw - 148px))",
                  maxHeight: "80vh",
                  objectFit: "contain",
                  borderRadius: 12,
                  display: "block",
                }}
              />
            )}
          </div>

          {images.length > 1 && (
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => {
                stopControlEvent(e);
                onNext();
              }}
              onPointerDown={stopControlEvent}
              style={NAV_BTN}
            >
              ›
            </button>
          )}
        </div>

        {images.length > 1 && (
          <div style={{ color: "white", fontSize: 14, fontWeight: 700 }}>
            {indexSafe + 1} / {images.length}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return modal;
  return createPortal(modal, document.body);
}
