"use client";

import { useState, type CSSProperties, type MouseEvent } from "react";
import { File, FileArchive, FileText, Play } from "lucide-react";
import { feedImageDisplayUrl } from "../lib/storageImageUrl";
import { attachmentRenderKindFromUrl, isVideoUrl } from "../lib/uploadLimits";
import type { PostAttachment, PostAttachmentKind } from "../lib/postAttachments";

type Props = {
  attachment: Pick<PostAttachment, "url" | "renderUrl" | "fileName" | "kind">;
  alt?: string;
  style?: CSSProperties;
  /** When true (default), videos do not hit the CDN until the user taps play. */
  deferVideoLoad?: boolean;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
};

export function FeedMediaAttachment({
  attachment,
  alt = "",
  style,
  deferVideoLoad = true,
  loading = "lazy",
  fetchPriority = "auto",
}: Props) {
  const detectedKind = attachmentRenderKindFromUrl(attachment.url);
  const kind: PostAttachmentKind =
    attachment.kind && attachment.kind !== "other"
      ? attachment.kind
      : detectedKind === "pdf"
        ? "pdf"
        : detectedKind === "video"
          ? "video"
          : detectedKind === "cad3d"
            ? "cad3d"
            : detectedKind === "image"
              ? "image"
              : "other";

  if (kind === "video" || isVideoUrl(attachment.url)) {
    return <FeedVideoAttachment url={attachment.url} style={style} deferLoad={deferVideoLoad} />;
  }

  if (kind === "image" || (kind === "cad3d" && attachment.renderUrl !== attachment.url)) {
    if (kind === "cad3d" && attachment.renderUrl !== attachment.url) {
      return (
        <div style={{ ...style, position: "relative", overflow: "hidden" }}>
          <img
            src={feedImageDisplayUrl(attachment.renderUrl)}
            alt={alt}
            loading={loading}
            fetchPriority={fetchPriority}
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "5px 8px",
              fontSize: 10,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))",
            }}
          >
            CAD / 3D - Open original file
          </div>
        </div>
      );
    }
    return (
      <img
        src={feedImageDisplayUrl(attachment.renderUrl)}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        style={style}
      />
    );
  }

  const label = kind === "pdf" ? "PDF" : kind === "cad3d" ? "CAD / 3D" : "File";
  const icon =
    kind === "pdf"
      ? <FileText size={28} />
      : kind === "cad3d"
        ? <FileArchive size={28} />
        : <File size={28} />;

  return (
    <div
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        color: "rgba(255,255,255,0.9)",
        background: "rgba(0,0,0,0.45)",
        textAlign: "center",
      }}
    >
      {icon}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 10, opacity: 0.8, maxWidth: "100%", wordBreak: "break-all" }}>
        {attachment.fileName || "attachment"}
      </div>
    </div>
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
