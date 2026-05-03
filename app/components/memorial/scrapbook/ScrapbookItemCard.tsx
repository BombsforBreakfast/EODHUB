"use client";

import type { CSSProperties } from "react";
import {
  articleLinkThumbParts,
  googleFaviconUrl,
  scrapbookHttpsUrl,
  youtubeVideoIdFromUrl,
} from "./scrapbookHelpers";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemWithAuthor } from "./types";

/** Same as dashboard full-view nav (`MasterRightColumn` Jobs / Businesses “See all →”). */
const DASHBOARD_NAV_LINK_BLUE = "#2563eb";

type Props = {
  item: ScrapbookItemWithAuthor;
  t: MemorialScrapbookTheme;
  accentColor: string;
  /** Larger main stage in viewer */
  variant?: "thumb" | "stage";
};

export function ScrapbookItemCard({ item, t, accentColor, variant = "stage" }: Props) {
  const isThumb = variant === "thumb";
  const file = scrapbookHttpsUrl(item.file_url);
  const thumb = scrapbookHttpsUrl(item.thumbnail_url);
  const ext = scrapbookHttpsUrl(item.external_url);

  const photoMetaParts =
    item.item_type === "photo"
      ? [
          item.location?.trim() || "",
          item.event_date?.trim()
            ? (() => {
                const d = new Date(`${item.event_date}T12:00:00`);
                return Number.isNaN(d.getTime())
                  ? item.event_date
                  : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              })()
            : "",
        ].filter(Boolean)
      : [];
  const metaLine = photoMetaParts.join(" · ");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: isThumb ? 0 : 10,
        minHeight: isThumb ? 0 : undefined,
        flex: isThumb ? "1 1 0" : undefined,
        width: isThumb ? "100%" : undefined,
        height: isThumb ? "100%" : undefined,
        minWidth: 0,
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          borderRadius: isThumb ? 8 : 12,
          overflow: "hidden",
          border: `1px solid ${t.border}`,
          background: t.badgeBg,
          minWidth: 0,
          display: "flex",
          ...(isThumb
            ? {
                flex: "1 1 0",
                minHeight: 0,
                flexDirection: "column" as const,
                alignItems: "stretch",
                justifyContent: "stretch",
              }
            : {
                minHeight: item.item_type === "article" ? "100%" : undefined,
                maxHeight: item.item_type === "article" ? "none" : undefined,
                flex: item.item_type === "article" ? 1 : undefined,
                alignItems: "center",
                justifyContent: "center",
              }),
        }}
      >
        {item.item_type === "photo" && file && (
          isThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={file}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                flex: 1,
                minHeight: 0,
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                maxWidth: 520,
                margin: "0 auto",
                aspectRatio: "1 / 1",
                background: "#080808",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={file}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          )
        )}
        {item.item_type === "document" && file && (
          <div
            style={{
              padding: isThumb ? 6 : 20,
              textAlign: "center",
              width: "100%",
              ...(isThumb
                ? { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }
                : {}),
            }}
          >
            <div style={{ fontSize: isThumb ? 20 : 36, marginBottom: isThumb ? 0 : 8 }}>📄</div>
            {!isThumb && (
              <a
                href={file}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: accentColor, fontWeight: 700, fontSize: 14, wordBreak: "break-all" }}
              >
                Open document
              </a>
            )}
          </div>
        )}
        {item.item_type === "article" &&
          (isThumb ? (
            ext ? (
              (() => {
                const { site, pathSnippet } = articleLinkThumbParts(ext);
                const cap = item.caption?.trim();
                const capShort = cap && cap.length > 36 ? `${cap.slice(0, 34)}…` : cap;
                const fav = googleFaviconUrl(ext);

                /** Same shell as YouTube tiles: full-bleed visual + gradient + text overlay (no side column). */
                const thumbShell = (
                  <>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          objectPosition: "center",
                        }}
                      />
                    ) : (
                      <>
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: `linear-gradient(165deg, ${t.badgeBg} 0%, #0a0a12 48%, #060608 100%)`,
                          }}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={fav}
                          alt=""
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 56,
                            height: 56,
                            borderRadius: 12,
                            opacity: 0.22,
                            objectFit: "contain",
                            pointerEvents: "none",
                          }}
                        />
                      </>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.38) 48%, transparent 72%)",
                        pointerEvents: "none",
                      }}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fav}
                      alt=""
                      width={18}
                      height={18}
                      style={{
                        position: "absolute",
                        top: 5,
                        left: 5,
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.92)",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
                        padding: 1,
                        objectFit: "contain",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: 6,
                        right: 6,
                        bottom: 5,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: "#fff",
                          lineHeight: 1.15,
                          textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {site}
                      </div>
                      {capShort ? (
                        <div
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            color: "rgba(255,255,255,0.88)",
                            lineHeight: 1.2,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            wordBreak: "break-word",
                          }}
                        >
                          {capShort}
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            color: "rgba(255,255,255,0.75)",
                            lineHeight: 1.2,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {pathSnippet}
                        </div>
                      )}
                    </div>
                  </>
                );

                return (
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      minHeight: 0,
                      flex: 1,
                      borderRadius: 6,
                      overflow: "hidden",
                      background: "#0a0a0a",
                    }}
                  >
                    {thumbShell}
                  </div>
                );
              })()
            ) : (
              <div style={{ fontSize: 11, color: t.textMuted, padding: 8 }}>Article</div>
            )
          ) : (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, alignItems: "stretch" }}>
              {ext ? (
                (() => {
                  const ytId = youtubeVideoIdFromUrl(ext);
                  const squareFrame: CSSProperties = {
                    width: "100%",
                    maxWidth: 520,
                    margin: "0 auto",
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#080808",
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  };

                  if (ytId) {
                    return (
                      <div style={squareFrame}>
                        <iframe
                          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?rel=0&playsinline=1`}
                          title="YouTube video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                          style={{ border: "none", width: "100%", height: "100%", display: "block" }}
                        />
                      </div>
                    );
                  }

                  /** Fills the scrapbook modal width; page scrolls inside the iframe (strip thumbnails use OG image). */
                  const embedFrame: CSSProperties = {
                    width: "100%",
                    maxWidth: "100%",
                    margin: 0,
                    height: "min(78dvh, 900px)",
                    minHeight: "min(420px, 55dvh)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "#0a0a0a",
                    border: `1px solid ${t.border}`,
                    boxSizing: "border-box",
                  };

                  const { site } = articleLinkThumbParts(ext);
                  return (
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch" }}>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                          gap: 10,
                          justifyContent: "space-between",
                          columnGap: 16,
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 12, color: t.textFaint, lineHeight: 1.45, flex: "1 1 200px" }}>
                          Scroll inside the page below. Some sites block embedding—if it stays blank, use Open in new tab.
                        </p>
                        <a
                          href={ext}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            color: DASHBOARD_NAV_LINK_BLUE,
                            fontWeight: 700,
                            textDecoration: "none",
                            flexShrink: 0,
                            paddingTop: 1,
                          }}
                        >
                          Open in new tab
                        </a>
                      </div>
                      <div style={embedFrame}>
                        <iframe
                          src={ext}
                          title={site || "Linked article"}
                          referrerPolicy="no-referrer-when-downgrade"
                          loading="eager"
                          style={{
                            border: "none",
                            width: "100%",
                            height: "100%",
                            display: "block",
                          }}
                        />
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div style={{ fontSize: 14, color: t.textMuted, padding: 16 }}>Article</div>
              )}
              {ext ? (
                <a
                  href={ext}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 13,
                    color: DASHBOARD_NAV_LINK_BLUE,
                    wordBreak: "break-all",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {ext}
                </a>
              ) : null}
            </div>
          ))}
        {item.item_type === "memory" && (
          <div
            style={{
              padding: isThumb ? 5 : 16,
              fontSize: isThumb ? 11 : 15,
              lineHeight: isThumb ? 1.35 : 1.55,
              color: t.text,
              whiteSpace: isThumb ? "nowrap" : "pre-wrap",
              overflow: isThumb ? "hidden" : undefined,
              textOverflow: isThumb ? "ellipsis" : undefined,
              width: "100%",
              textAlign: "left",
              ...(isThumb ? { flex: 1, display: "flex", alignItems: "center", minHeight: 0 } : {}),
            }}
          >
            {(item.memory_body || item.caption || "").trim() || "—"}
          </div>
        )}
      </div>
      {!isThumb && metaLine && (
        <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>{metaLine}</div>
      )}
      {!isThumb && item.caption && item.item_type !== "memory" && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: t.text }}>{item.caption}</p>
      )}
      {!isThumb && item.item_type === "memory" && item.caption && item.memory_body && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: t.textMuted }}>{item.caption}</p>
      )}
    </div>
  );
}
