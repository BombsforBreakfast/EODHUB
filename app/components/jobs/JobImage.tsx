"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Job preview image. A present URL reserves its configured media box while it
 * loads so cards don't shift when the preview becomes available. Missing or
 * broken images render nothing.
 */

type JobImageProps = {
  src: string | null | undefined;
  alt: string;
  /** Fixed pixel height (used by card thumbnails). Mutually exclusive with aspectRatio. */
  height?: number;
  /** CSS aspect-ratio, e.g. "2 / 1". Useful for responsive previews. */
  aspectRatio?: string;
  /** Max-height when using aspectRatio="auto" / unconstrained renders (modals, detail page). */
  maxHeight?: number;
  /** "cover" (default) crops; "contain" letterboxes. */
  fit?: "cover" | "contain";
  /** Optional borders for stacked modal layouts. */
  borderTop?: string;
  borderBottom?: string;
  /** Called when the image becomes available or unavailable (missing / failed load). */
  onAvailabilityChange?: (available: boolean) => void;
};

const clickableTextStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: 0,
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
};

/** Wraps job card text; opens details on click when no preview image is shown. */
export function JobCardClickableText({
  imageAvailable,
  onOpenDetails,
  children,
}: {
  imageAvailable: boolean;
  onOpenDetails: () => void;
  children: React.ReactNode;
}) {
  if (!imageAvailable) {
    return (
      <button type="button" onClick={onOpenDetails} style={clickableTextStyle}>
        {children}
      </button>
    );
  }
  return <>{children}</>;
}

export default function JobImage({
  src,
  alt,
  height,
  aspectRatio,
  maxHeight,
  fit = "cover",
  borderTop,
  borderBottom,
  onAvailabilityChange,
}: JobImageProps) {
  const trimmed = src?.trim() || null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const onAvailabilityChangeRef = useRef(onAvailabilityChange);
  onAvailabilityChangeRef.current = onAvailabilityChange;

  useEffect(() => {
    if (!trimmed) {
      setLoaded(false);
      setFailed(false);
      onAvailabilityChangeRef.current?.(false);
      return;
    }

    setLoaded(false);
    setFailed(false);
    onAvailabilityChangeRef.current?.(false);

    const img = new Image();
    let cancelled = false;

    img.onload = () => {
      if (cancelled) return;
      setLoaded(true);
      onAvailabilityChangeRef.current?.(true);
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoaded(false);
      setFailed(true);
      onAvailabilityChangeRef.current?.(false);
    };
    img.src = trimmed;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [trimmed]);

  if (!trimmed || failed) return null;

  const containerStyle: React.CSSProperties = {
    width: "100%",
    background: "#0f172a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...(height !== undefined ? { height } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(maxHeight !== undefined ? { maxHeight } : {}),
    ...(borderTop ? { borderTop } : {}),
    ...(borderBottom ? { borderBottom } : {}),
  };

  return (
    <div style={containerStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={trimmed}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          display: loaded ? "block" : "none",
        }}
      />
    </div>
  );
}
