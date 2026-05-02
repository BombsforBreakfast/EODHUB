"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { AddScrapbookItemModal } from "./AddScrapbookItemModal";
import { FlagScrapbookItemModal } from "./FlagScrapbookItemModal";
import { MemorialScrapbookViewer } from "./MemorialScrapbookViewer";
import {
  profileDisplayName,
  scrapbookHttpsUrl,
  scrapbookThumbKindLabel,
  youtubeVideoThumbUrl,
} from "./scrapbookHelpers";
import { ScrapbookItemCard } from "./ScrapbookItemCard";
import type { MemorialScrapbookTheme } from "./types";
import type { ScrapbookItemRow, ScrapbookItemWithAuthor } from "./types";

const SELECT_FIELDS =
  "id, memorial_id, user_id, item_type, file_url, external_url, thumbnail_url, memory_body, caption, location, event_date, status, created_at";

/** Horizontal preview strip: larger tiles → fewer slots (viewer still has full list). */
const SCRAPBOOK_PREVIEW_THUMB_PX = Math.round(88 * 1.5);
const SCRAPBOOK_PREVIEW_STRIP_MAX = 8;

type Props = {
  memorialId: string;
  t: MemorialScrapbookTheme;
  accentColor: string;
  /** Full strip + buttons, or single summary line for compact memorial cards */
  variant?: "full" | "compact";
  isMobile?: boolean;
};

async function loadApprovedWithAuthors(memorialId: string): Promise<{ items: ScrapbookItemWithAuthor[]; count: number }> {
  const countRes = await supabase
    .from("memorial_scrapbook_items")
    .select("id", { count: "exact", head: true })
    .eq("memorial_id", memorialId)
    .eq("status", "approved");

  const count = countRes.count ?? 0;

  const { data: rows, error } = await supabase
    .from("memorial_scrapbook_items")
    .select(SELECT_FIELDS)
    .eq("memorial_id", memorialId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("Scrapbook load error:", error);
    return { items: [], count: 0 };
  }

  const list = (rows ?? []) as ScrapbookItemRow[];
  const authorIds = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
  const profileMap: Record<string, { display_name: string | null; first_name: string | null; last_name: string | null; photo_url: string | null }> = {};

  if (authorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, photo_url")
      .in("user_id", authorIds);
    for (const p of profs ?? []) {
      const row = p as {
        user_id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      };
      profileMap[row.user_id] = row;
    }
  }

  const items: ScrapbookItemWithAuthor[] = list.map((r) => {
    const pr = r.user_id ? profileMap[r.user_id] : null;
    return {
      ...r,
      authorName: pr ? profileDisplayName(pr) : "Member",
      authorPhotoUrl: pr?.photo_url ? scrapbookHttpsUrl(pr.photo_url) : null,
    };
  });

  return { items, count };
}

function applyArticlePreviewThumbnails(
  items: ScrapbookItemWithAuthor[],
  ogImageById: Record<string, string>,
): ScrapbookItemWithAuthor[] {
  return items.map((i) => {
    if (i.item_type !== "article" || !i.external_url?.trim()) return i;
    const stored = i.thumbnail_url?.trim();
    if (stored) return i;
    const yt = youtubeVideoThumbUrl(i.external_url);
    if (yt) return { ...i, thumbnail_url: yt };
    const og = ogImageById[i.id]?.trim();
    if (og) return { ...i, thumbnail_url: og };
    return i;
  });
}

export function MemorialScrapbookPreview({ memorialId, t, accentColor, variant = "full", isMobile }: Props) {
  const [items, setItems] = useState<ScrapbookItemWithAuthor[]>([]);
  const [articleOgImages, setArticleOgImages] = useState<Record<string, string>>({});
  /** One OG fetch attempt per item id (success or fail) so we never spin when HTML has no og:image. */
  const articleOgFetchedRef = useRef<Set<string>>(new Set());
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [flagItemId, setFlagItemId] = useState<string | null>(null);

  const displayItems = useMemo(
    () => applyArticlePreviewThumbnails(items, articleOgImages),
    [items, articleOgImages],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await loadApprovedWithAuthors(memorialId);
    setItems(res.items);
    setCount(res.count);
    setLoading(false);
  }, [memorialId]);

  useEffect(() => {
    setArticleOgImages({});
    articleOgFetchedRef.current = new Set();
  }, [memorialId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const pending = items.filter((i) => {
      if (i.item_type !== "article" || !i.external_url?.trim()) return false;
      if (i.thumbnail_url?.trim()) return false;
      if (youtubeVideoThumbUrl(i.external_url)) return false;
      if (articleOgFetchedRef.current.has(i.id)) return false;
      return true;
    });
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token || cancelled) return;

      const updates: Record<string, string> = {};
      for (const it of pending) {
        if (cancelled) break;
        articleOgFetchedRef.current.add(it.id);
        try {
          const res = await fetch("/api/memorial-scrapbook/link-preview", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ url: it.external_url }),
          });
          const json: { image?: string } = await res.json();
          if (typeof json.image === "string" && json.image.trim()) {
            updates[it.id] = json.image.trim();
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setArticleOgImages((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (viewerOpen && displayItems.length === 0) setViewerOpen(false);
  }, [viewerOpen, displayItems.length]);

  async function requireUserOrLogin(): Promise<boolean> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = "/login";
      return false;
    }
    return true;
  }

  const stripItems = displayItems.slice(0, SCRAPBOOK_PREVIEW_STRIP_MAX);

  if (variant === "compact") {
    return (
      <>
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${t.borderLight}`,
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textMuted }}>
            Scrapbook · {loading ? "…" : `${count} contribution${count === 1 ? "" : "s"}`}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (!(await requireUserOrLogin())) return;
              setAddOpen(true);
            }}
            style={{
              borderRadius: 10,
              border: `1px solid ${accentColor}`,
              background: "transparent",
              color: accentColor,
              fontWeight: 700,
              fontSize: 12,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Add to scrapbook
          </button>
        </div>
        <AddScrapbookItemModal
          open={addOpen}
          memorialId={memorialId}
          onClose={() => setAddOpen(false)}
          onSubmitted={() => void refresh()}
          t={t}
          accentColor={accentColor}
        />
      </>
    );
  }

  return (
    <>
      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: `1px solid ${t.border}`,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>
            Scrapbook · {loading ? "…" : `${count} contribution${count === 1 ? "" : "s"}`}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={count === 0 || loading}
              onClick={() => {
                setViewerIndex(0);
                setViewerOpen(true);
              }}
              style={{
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.surfaceHover,
                color: t.text,
                fontWeight: 700,
                fontSize: 13,
                padding: "8px 14px",
                cursor: count === 0 || loading ? "not-allowed" : "pointer",
                opacity: count === 0 || loading ? 0.5 : 1,
              }}
            >
              Open scrapbook
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!(await requireUserOrLogin())) return;
                setAddOpen(true);
              }}
              style={{
                borderRadius: 10,
                border: "none",
                background: accentColor,
                color: "white",
                fontWeight: 700,
                fontSize: 13,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Add to scrapbook
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ marginTop: 12, fontSize: 13, color: t.textFaint }}>Loading scrapbook…</div>
        ) : count === 0 ? (
          <div
            style={{
              marginTop: 14,
              padding: "16px 14px",
              borderRadius: 12,
              border: `1px dashed ${t.border}`,
              background: t.badgeBg,
              fontSize: 14,
              color: t.textMuted,
              lineHeight: 1.55,
            }}
          >
            No scrapbook contributions yet. Share a photo, story, article, or document to celebrate this life—submissions
            are reviewed before they appear here.
          </div>
        ) : (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              gap: 10,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorX: "contain",
              touchAction: "pan-x",
              paddingBottom: 2,
              scrollbarWidth: "thin",
            }}
          >
            {stripItems.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  setViewerIndex(i);
                  setViewerOpen(true);
                }}
                style={{
                  width: SCRAPBOOK_PREVIEW_THUMB_PX,
                  flexShrink: 0,
                  padding: "3px 5px 4px",
                  borderRadius: 12,
                  border: `1px solid ${t.border}`,
                  background: t.surfaceHover,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 2,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    minHeight: 0,
                    overflow: "hidden",
                    borderRadius: 10,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <ScrapbookItemCard item={it} t={t} accentColor={accentColor} variant="thumb" />
                </div>
                <span
                  style={{
                    margin: 0,
                    padding: 0,
                    fontSize: 10,
                    fontWeight: 800,
                    color: t.textMuted,
                    textAlign: "center",
                    lineHeight: 1,
                    letterSpacing: "0.02em",
                  }}
                >
                  {scrapbookThumbKindLabel(it)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <MemorialScrapbookViewer
        open={viewerOpen}
        items={displayItems}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
        onFlag={async (itemId) => {
          if (!(await requireUserOrLogin())) return;
          setFlagItemId(itemId);
        }}
        t={t}
        accentColor={accentColor}
        isMobile={isMobile}
      />

      <AddScrapbookItemModal
        open={addOpen}
        memorialId={memorialId}
        onClose={() => setAddOpen(false)}
        onSubmitted={() => void refresh()}
        t={t}
        accentColor={accentColor}
      />

      <FlagScrapbookItemModal
        open={flagItemId !== null}
        itemId={flagItemId}
        onClose={() => setFlagItemId(null)}
        onSubmitted={() => void refresh()}
        t={t}
        accentColor={accentColor}
      />
    </>
  );
}
