"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import { Play } from "lucide-react";
import { feedImageDisplayUrl } from "../lib/storageImageUrl";
import { isVideoUrl } from "../lib/uploadLimits";

type Props = {
  url: string;
  alt?: string;
  style?: CSSProperties;
  /** When true (default), videos do not hit the CDN until the user taps play. */
  deferVideoLoad?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
};

export function FeedMediaAttachment({
  url,
  alt = "",
  style,
  deferVideoLoad = true,
  loading = "lazy",
  fetchPriority = "auto",
}: Props) {
  if (isVideoUrl(url)) {
    return <FeedVideoAttachment url={url} style={style} deferLoad={deferVideoLoad} />;
  }

  return (
    <img
      src={feedImageDisplayUrl(url)}
      alt={alt}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      style={style}
    />
  );
}

function FeedVideoAttachment({
  url,
  style,
  deferLoad,
}: {
  url: string;
  style?: CSSProperties;
  deferLoad: boolean;
}) {
  const [active, setActive] = useState(!deferLoad);

  function handlePlayClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActive(true);
  }

  if (!active) {
    return (
      <div
        role="presentation"
        onClick={handlePlayClick}
        style={{
          ...style,
          position: "relative",
          background: "#111",
          cursor: "pointer",
          display: "block",
          width: style?.width ?? "100%",
          minHeight: style?.minHeight ?? 120,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: "rgba(0,0,0,0.55)",
              borderRadius: "50%",
              width: 38,
              height: 38,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Play size={16} color="white" fill="white" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      autoPlay
      playsInline
      preload="metadata"
      onClick={(e) => e.stopPropagation()}
      style={style}
    />
  );
}
