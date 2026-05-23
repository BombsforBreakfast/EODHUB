import type { CSSProperties } from "react";
import { youtubeVideoIdFromUrl } from "./memorial/scrapbook/scrapbookHelpers";
import { FEED_POST_EMBED_MAX_WIDTH } from "../lib/feedLayout";

const URL_PATTERN_G =
  /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/g;

export function cleanYouTubeUrlCandidate(value: string): string {
  return value.trim().replace(/[.,)>]+$/, "");
}

export function getYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  return youtubeVideoIdFromUrl(cleanYouTubeUrlCandidate(url));
}

export function firstYouTubeUrlFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const match of text.matchAll(URL_PATTERN_G)) {
    const raw = cleanYouTubeUrlCandidate(match[0]);
    if (getYouTubeVideoId(raw)) return raw;
  }
  return null;
}

export function sameYouTubeVideo(a: string | null | undefined, b: string | null | undefined): boolean {
  const aId = getYouTubeVideoId(a);
  const bId = getYouTubeVideoId(b);
  return Boolean(aId && bId && aId === bId);
}

type YouTubeEmbedProps = {
  videoId?: string | null;
  url?: string | null;
  title?: string;
  maxWidth?: number | string;
  marginTop?: number | string;
  style?: CSSProperties;
};

export default function YouTubeEmbed({
  videoId,
  url,
  title = "YouTube video",
  maxWidth = FEED_POST_EMBED_MAX_WIDTH,
  marginTop = 12,
  style,
}: YouTubeEmbedProps) {
  const id = videoId ?? getYouTubeVideoId(url);
  if (!id) return null;

  return (
    <div
      style={{
        marginTop,
        borderRadius: 12,
        overflow: "hidden",
        aspectRatio: "16 / 9",
        width: "100%",
        maxWidth,
        background: "#0a0a0a",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&playsinline=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}
