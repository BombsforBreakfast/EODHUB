"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import MuxPlayer from "@mux/mux-player-react/lazy";
import { AlertTriangle, File, FileArchive, FileText, LoaderCircle, Play } from "lucide-react";
import { feedImageDisplayUrl } from "../lib/storageImageUrl";
import { attachmentRenderKindFromUrl, isVideoUrl } from "../lib/uploadLimits";
import type { PostAttachment, PostAttachmentKind } from "../lib/postAttachments";
import { getAccessToken } from "../lib/lib/supabaseClient";
import { muxPosterUrl, type FeedVideoStatus } from "../lib/feedVideoUrl";
import { FEED_SINGLE_IMAGE_MAX_HEIGHT, feedVideoShellContainStyle } from "../lib/feedLayout";
import { captureVideoFramePreviewUrl, videoPreviewSourceUrl } from "../lib/videoFramePreview";

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

function PlayOverlay({ size = 38, iconSize = 16 }: { size?: number; iconSize?: number }) {
  return (
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
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Play size={iconSize} color="white" fill="white" />
      </div>
    </div>
  );
}

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

function videoShellStyle(style?: CSSProperties, aspectRatio = "16 / 9"): CSSProperties {
  const maxHeight =
    typeof style?.maxHeight === "string" || typeof style?.maxHeight === "number"
      ? style.maxHeight
      : FEED_SINGLE_IMAGE_MAX_HEIGHT;

  return {
    ...feedVideoShellContainStyle,
    position: "relative",
    // Prefer width-driven sizing; never let aspect-ratio + max-height expand past the card.
    aspectRatio,
    maxHeight,
    height: "auto",
    background: "#111",
    borderRadius: style?.borderRadius,
    lineHeight: 0,
  };
}

const muxPlayerContainStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  maxWidth: "100%",
  minWidth: 0,
  display: "block",
  objectFit: "contain",
  // Mux media chrome can otherwise size to intrinsic video pixels.
  ["--media-object-fit" as string]: "contain",
};

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
  const [aspectRatio, setAspectRatio] = useState("16 / 9");
  const [muxState, setMuxState] = useState({
    status: attachment.muxStatus,
    playbackId: attachment.muxPlaybackId,
    posterUrl: attachment.posterUrl,
  });
  const status = muxState.status;
  const failed = status === "upload_failed" || status === "asset_error" || status === "cancelled" || status === "timed_out";

  useEffect(() => {
    setMuxState({
      status: attachment.muxStatus,
      playbackId: attachment.muxPlaybackId,
      posterUrl: attachment.posterUrl,
    });
    setActive(!deferLoad);
    setAspectRatio("16 / 9");
  }, [attachment.muxPlaybackId, attachment.muxStatus, attachment.muxVideoId, attachment.posterUrl, deferLoad]);

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
          ...videoShellStyle(style),
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 16,
          textAlign: "center",
          lineHeight: 1.3,
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
    // Poster <img> keeps natural aspect ratio. A CSS background on height:auto
    // collapses to a thin strip (the wall/feed bug).
    if (muxState.posterUrl) {
      return (
        <div
          role="presentation"
          onClick={handlePlayClick}
          style={{
            ...feedVideoShellContainStyle,
            position: "relative",
            cursor: "pointer",
            background: "#111",
            lineHeight: 0,
            borderRadius: style?.borderRadius,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Mux CDN poster */}
          <img
            src={muxState.posterUrl}
            alt=""
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setAspectRatio(`${naturalWidth} / ${naturalHeight}`);
              }
            }}
            style={{
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              height: "auto",
              maxHeight:
                typeof style?.maxHeight === "string" || typeof style?.maxHeight === "number"
                  ? style.maxHeight
                  : FEED_SINGLE_IMAGE_MAX_HEIGHT,
              display: "block",
              objectFit: "contain",
              background: "#111",
              boxSizing: "border-box",
            }}
          />
          <PlayOverlay />
        </div>
      );
    }

    return (
      <div role="presentation" onClick={handlePlayClick} style={{ ...videoShellStyle(style, aspectRatio), cursor: "pointer" }}>
        <PlayOverlay />
      </div>
    );
  }

  if (muxState.playbackId) {
    return (
      <div onClick={(e) => e.stopPropagation()} style={videoShellStyle(style, aspectRatio)}>
        <MuxPlayer
          playbackId={muxState.playbackId}
          streamType="on-demand"
          autoPlay
          playsInline
          poster={muxState.posterUrl}
          metadata={{ video_title: attachment.fileName || "Feed video" }}
          style={muxPlayerContainStyle}
          className="feed-mux-player"
        />
      </div>
    );
  }

  return (
    <video
      src={attachment.url}
      controls
      autoPlay
      playsInline
      preload="metadata"
      onClick={(e) => e.stopPropagation()}
      style={{
        ...feedVideoShellContainStyle,
        height: "auto",
        maxHeight:
          typeof style?.maxHeight === "string" || typeof style?.maxHeight === "number"
            ? style.maxHeight
            : FEED_SINGLE_IMAGE_MAX_HEIGHT,
        background: "#111",
        borderRadius: style?.borderRadius,
      }}
    />
  );
}

/** Shared composer tile for a selected video that has no blob preview (e.g. native iOS). */
export function SelectedVideoPlaceholder({
  fileName,
  children,
  statusLabel = "Video selected",
}: {
  fileName: string;
  children?: ReactNode;
  statusLabel?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 10,
        color: "rgba(255,255,255,0.9)",
        background: "linear-gradient(160deg, #1e293b 0%, #0f172a 100%)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Play size={18} color="white" fill="white" />
      </div>
      <div style={{ fontSize: 12, fontWeight: 800 }}>{statusLabel}</div>
      <div style={{ fontSize: 10, opacity: 0.8, wordBreak: "break-all", maxWidth: "100%" }}>{fileName}</div>
      {children}
    </div>
  );
}

/**
 * Composer video tile: grabs a still frame so the user sees a photo preview
 * before posting (works for blob URLs and native iOS path proxies).
 */
export function SelectedVideoComposerPreview({
  file,
  previewUrl,
}: {
  file: File;
  previewUrl: string;
}) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const ownedUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setPosterUrl(null);

    const existingPreview = previewUrl || "";
    const sourceUrl = videoPreviewSourceUrl(file, existingPreview || undefined);
    if (!sourceUrl) {
      setStatus("failed");
      return;
    }

    // When we create a temporary blob URL (no existing preview), track it for revoke.
    if (!existingPreview && sourceUrl.startsWith("blob:")) {
      ownedUrlsRef.current.push(sourceUrl);
    }

    void captureVideoFramePreviewUrl(sourceUrl).then((frameUrl) => {
      if (cancelled) {
        if (frameUrl) URL.revokeObjectURL(frameUrl);
        return;
      }
      if (frameUrl) {
        ownedUrlsRef.current.push(frameUrl);
        setPosterUrl(frameUrl);
        setStatus("ready");
        return;
      }
      setStatus("failed");
    });

    return () => {
      cancelled = true;
      for (const url of ownedUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      ownedUrlsRef.current = [];
    };
  }, [file, previewUrl]);

  if (posterUrl && status === "ready") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL poster */}
        <img
          src={posterUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <PlayOverlay size={36} iconSize={14} />
      </div>
    );
  }

  if (previewUrl && status !== "failed") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
        <video
          src={previewUrl}
          muted
          playsInline
          preload="metadata"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <PlayOverlay size={36} iconSize={14} />
      </div>
    );
  }

  return (
    <SelectedVideoPlaceholder
      fileName={file.name || "video"}
      statusLabel={status === "loading" ? "Loading preview…" : "Video selected"}
    />
  );
}
