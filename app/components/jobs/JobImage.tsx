"use client";

import { useEffect, useState } from "react";
import { useTheme } from "../../lib/ThemeContext";

/**
 * Job preview image with a graceful "No Photo" fallback.
 *
 * Many scraped job postings have a stale, hotlinked, or 404-ing og_image. Just
 * rendering `<img src={og_image}>` produces a broken image icon (or an alt-text
 * blob over a black box) which looks like a layout bug. This component shows a
 * neutral placeholder instead when the image is missing or fails to load.
 *
 * Shared by the home feed jobs pane, the /jobs grid, the left-rail jobs list,
 * the single-job detail page, and the JobDetailsModal.
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
};

export default function JobImage({
  src,
  alt,
  height,
  aspectRatio,
  maxHeight,
  fit = "cover",
  borderTop,
  borderBottom,
}: JobImageProps) {
  const { t } = useTheme();
  const trimmed = src?.trim() || null;
  const [failed, setFailed] = useState(false);

  // Reset failure state when the URL changes (e.g. card recycled in a list).
  useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  const showPlaceholder = !trimmed || failed;

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

  if (showPlaceholder) {
    return (
      <div style={containerStyle} aria-label="No photo available" role="img">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: t.textFaint,
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
            <line x1="3" y1="3" x2="21" y2="21" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>
            No Photo
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={trimmed}
        alt={alt}
        onError={() => setFailed(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: fit,
          display: "block",
        }}
      />
    </div>
  );
}
