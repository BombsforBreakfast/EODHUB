"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import { AlertTriangle, File, FileArchive, FileText, LoaderCircle, Play } from "lucide-react";
import { feedImageDisplayUrl } from "../lib/storageImageUrl";
import { attachmentRenderKindFromUrl, isVideoUrl } from "../lib/uploadLimits";
import type { PostAttachment, PostAttachmentKind } from "../lib/postAttachments";
import { getAccessToken } from "../lib/lib/supabaseClient";
import { muxPosterUrl, type FeedVideoStatus } from "../lib/feedVideoUrl";

type Props = {
  attachment: Pick<
    PostAttachment,
    "url" | "renderUrl" | "fileName" | "kind" | "muxVideoId" | "muxPlaybackId" | "muxStatus" | "posterUrl"
  >;
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
    return <FeedVideoAttachment attachment={attachment} style={style} deferLoad={deferVideoLoad} />;
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
  attachment,
  style,
  deferLoad,
}: {
  attachment: Props["attachment"];
  style?: CSSProperties;
  deferLoad: boolean;
}) {
  const [active, setActive] = useState(!deferLoad);
  const [muxState, setMuxState] = useState({
    status: attachment.muxStatus,
    playbackId: attachment.muxPlaybackId,
    posterUrl: attachment.posterUrl,
  });
  const status = muxState.status;
  const failed = status === "upload_failed" || status === "asset_error" || status === "cancelled" || status === "timed_out";

  useEffect(() => {
    if (!attachment.muxVideoId || !status || status === "ready" || failed) return;
    let cancelled = false;
    const check = async () => {
      const token = await getAccessToken({ source: "FeedVideoAttachment" });
      if (!token || cancelled) return;
      const response = await fetch(`/api/feed/video-uploads/${encodeURIComponent(attachment.muxVideoId!)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok || cancelled) return;
      const body = await response.json() as {
        status: FeedVideoStatus;
        playbackId?: string | null;
      };
      setMuxState({
        status: body.status,
        playbackId: body.playbackId ?? null,
        posterUrl: body.playbackId ? muxPosterUrl(body.playbackId) : undefined,
      });
    };
    void check();
    const timer = window.setInterval(() => void check(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attachment.muxVideoId, failed, status]);

  if (status && status !== "ready") {
    return (
      <div
        style={{
          ...style,
          minHeight: style?.minHeight ?? 160,
          background: "#111",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 16,
          textAlign: "center",
        }}
      >
        {failed ? <AlertTriangle size={26} /> : <LoaderCircle size={26} className="feed-video-processing-spinner" />}
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {failed ? "Video processing failed" : "Video is processing"}
        </span>
        {!failed && <span style={{ fontSize: 11, opacity: 0.75 }}>It will appear here automatically when ready.</span>}
      </div>
    );
  }

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
          backgroundImage: muxState.posterUrl ? `url("${muxState.posterUrl}")` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
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
    muxState.playbackId ? (
      <div onClick={(e) => e.stopPropagation()} style={style}>
        <MuxPlayer
          playbackId={muxState.playbackId}
          streamType="on-demand"
          autoPlay
          playsInline
          poster={muxState.posterUrl}
          metadata={{ video_title: attachment.fileName || "Feed video" }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    ) : (
      <video
        src={attachment.url}
        controls
        autoPlay
        playsInline
        preload="metadata"
        onClick={(e) => e.stopPropagation()}
        style={style}
      />
    )
  );
}
