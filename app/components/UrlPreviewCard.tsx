"use client";

import { httpsAssetUrl, type UrlPreview } from "../lib/urlPreview";

type Props = {
  preview: UrlPreview;
  borderColor: string;
  bgColor: string;
  titleColor: string;
  mutedTextColor: string;
  compact?: boolean;
};

export default function UrlPreviewCard({
  preview,
  borderColor,
  bgColor,
  titleColor,
  mutedTextColor,
  compact = false,
}: Props) {
  const safeUrl = httpsAssetUrl(preview.url);
  const imageUrl = httpsAssetUrl(preview.image);

  return (
    <a
      href={safeUrl || "#"}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        marginTop: 8,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        overflow: "hidden",
        background: bgColor,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {compact ? (
        <div style={{ display: "grid", gridTemplateColumns: imageUrl ? "72px 1fr" : "1fr", gap: 8, padding: 8, alignItems: "start" }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={preview.title || "Link preview"}
              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, display: "block" }}
            />
          ) : null}
          <div style={{ minWidth: 0 }}>
            {preview.siteName ? (
              <div
                style={{
                  fontSize: 9,
                  color: mutedTextColor,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.45,
                  marginBottom: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {preview.siteName}
              </div>
            ) : null}
            {preview.title ? (
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12,
                  lineHeight: 1.25,
                  color: titleColor,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {preview.title}
              </div>
            ) : null}
            {preview.description ? (
              <div
                style={{
                  fontSize: 10,
                  color: mutedTextColor,
                  marginTop: 2,
                  lineHeight: 1.3,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {preview.description}
              </div>
            ) : null}
            <div
              style={{
                marginTop: 3,
                fontSize: 10,
                color: mutedTextColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {safeUrl}
            </div>
          </div>
        </div>
      ) : (
        <>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={preview.title || "Link preview"}
              style={{
                width: "100%",
                height: 160,
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : null}
          <div style={{ padding: "10px 12px" }}>
            {preview.siteName ? (
              <div
                style={{
                  fontSize: 10,
                  color: mutedTextColor,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 2,
                }}
              >
                {preview.siteName}
              </div>
            ) : null}
            {preview.title ? (
              <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.3, color: titleColor }}>
                {preview.title}
              </div>
            ) : null}
            {preview.description ? (
              <div
                style={{
                  fontSize: 12,
                  color: mutedTextColor,
                  marginTop: 3,
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {preview.description}
              </div>
            ) : null}
            <div style={{ marginTop: 4, fontSize: 11, color: mutedTextColor, wordBreak: "break-all" }}>
              {safeUrl}
            </div>
          </div>
        </>
      )}
    </a>
  );
}
