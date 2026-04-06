"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import { LikerAvatar } from "./PostLikersStack";

const PRESENCE_CHANNEL = "eod_home_online";
const AVATAR = 22;
const AVATAR_OVERLAP = 5;
const AVATAR_STEP = AVATAR - AVATAR_OVERLAP;
const SEE_ALL_MIN_W = 96;

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean | null;
};

function displayName(p: ProfileRow): string {
  return p.display_name?.trim()
    || `${p.first_name || ""} ${p.last_name || ""}`.trim()
    || "Member";
}

function presenceUserIds(state: Record<string, unknown[]>): Set<string> {
  const ids = new Set<string>();
  for (const [presenceKey, arr] of Object.entries(state)) {
    if (presenceKey) ids.add(presenceKey);
    for (const raw of arr) {
      const p = raw as { user_id?: string };
      if (p.user_id) ids.add(p.user_id);
    }
  }
  return ids;
}

function widthForNStacked(n: number): number {
  if (n <= 0) return 0;
  return AVATAR + (n - 1) * AVATAR_STEP;
}

type OnlineNowStripProps = {
  currentUserId: string | null;
};

export default function OnlineNowStrip({ currentUserId }: OnlineNowStripProps) {
  const { t } = useTheme();
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [visibleCount, setVisibleCount] = useState(12);
  const [listOpen, setListOpen] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);

  const previewRows = useMemo(() => {
    if (!currentUserId) return [];
    const others = onlineIds.filter((id) => id !== currentUserId);
    if (others.length === 0) return [];
    const ordered = others
      .map((id) => profiles.get(id))
      .filter((p): p is ProfileRow => !!p)
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    const idsMissingProfile = others.filter((id) => !profiles.has(id));
    const placeholders = idsMissingProfile.map(
      (id) =>
        ({
          user_id: id,
          first_name: null,
          last_name: null,
          display_name: null,
          photo_url: null,
          service: null,
          is_employer: null,
        }) as ProfileRow,
    );
    return [...ordered, ...placeholders];
  }, [currentUserId, onlineIds, profiles]);

  const syncProfiles = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setProfiles(new Map());
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url, service, is_employer")
      .in("user_id", ids);
    if (error) return;
    const map = new Map<string, ProfileRow>();
    ((data ?? []) as ProfileRow[]).forEach((row) => map.set(row.user_id, row));
    setProfiles(map);
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setOnlineIds([]);
      setProfiles(new Map());
      return;
    }

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const ids = [...presenceUserIds(channel.presenceState())];
        ids.sort();
        setOnlineIds(ids);
      })
      .on("presence", { event: "join" }, () => {
        const ids = [...presenceUserIds(channel.presenceState())];
        ids.sort();
        setOnlineIds(ids);
      })
      .on("presence", { event: "leave" }, () => {
        const ids = [...presenceUserIds(channel.presenceState())];
        ids.sort();
        setOnlineIds(ids);
      });

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      await channel.track({ user_id: currentUserId, online_at: new Date().toISOString() });
    });

    return () => {
      void channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    if (onlineIds.length === 0) return;
    void syncProfiles(onlineIds);
  }, [onlineIds, syncProfiles]);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || previewRows.length === 0) return;
    function measure() {
      if (!el) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      const total = previewRows.length;
      let fitWithoutBtn = 1;
      for (let n = total; n >= 1; n--) {
        if (widthForNStacked(n) <= w) {
          fitWithoutBtn = n;
          break;
        }
      }
      if (fitWithoutBtn >= total) {
        setVisibleCount(total);
        return;
      }
      const wBtn = Math.max(0, w - SEE_ALL_MIN_W);
      let withBtn = 1;
      for (let n = total; n >= 1; n--) {
        if (widthForNStacked(n) <= wBtn) {
          withBtn = n;
          break;
        }
      }
      setVisibleCount(Math.max(1, Math.min(withBtn, total - 1)));
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewRows.length]);

  useEffect(() => {
    if (!listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [listOpen]);

  if (!currentUserId) return null;

  const hasOthers = previewRows.length > 0;
  const hasOverflow = previewRows.length > visibleCount;
  const visibleRows = hasOverflow ? previewRows.slice(0, visibleCount) : previewRows;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          minHeight: 32,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: t.textFaint,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            flexShrink: 0,
          }}
        >
          Online now
        </span>
        {!hasOthers ? (
          <span style={{ fontSize: 13, fontWeight: 600, color: t.textMuted, lineHeight: 1.3 }}>
            Nobody else on the feed right now.
          </span>
        ) : (
        <div ref={measureRef} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {visibleRows.map((p, i) => (
              <Link
                key={p.user_id}
                href={`/profile/${p.user_id}`}
                title={displayName(p)}
                style={{
                  marginLeft: i === 0 ? 0 : -AVATAR_OVERLAP,
                  position: "relative",
                  zIndex: visibleRows.length - i,
                  textDecoration: "none",
                  lineHeight: 0,
                }}
              >
                <LikerAvatar
                  photoUrl={p.photo_url}
                  name={displayName(p)}
                  size={AVATAR}
                  service={p.service}
                  isEmployer={p.is_employer}
                />
              </Link>
            ))}
            {hasOverflow && (
              <button
                type="button"
                onClick={() => setListOpen(true)}
                style={{
                  marginLeft: 6,
                  flexShrink: 0,
                  background: t.bg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 999,
                  padding: "4px 12px",
                  cursor: "pointer",
                  color: t.textMuted,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                … see all
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {listOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              role="presentation"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10050,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))",
              }}
              onClick={() => setListOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Online now"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: t.surface,
                  borderRadius: 14,
                  border: `1px solid ${t.border}`,
                  maxWidth: 400,
                  width: "100%",
                  maxHeight: "min(80vh, 560px)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    borderBottom: `1px solid ${t.border}`,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 16, color: t.text }}>Online now</span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setListOpen(false)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.bg,
                      color: t.text,
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  {previewRows.map((p) => (
                    <Link
                      key={p.user_id}
                      href={`/profile/${p.user_id}`}
                      onClick={() => setListOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${t.border}`,
                        textDecoration: "none",
                        color: t.text,
                        background: t.bg,
                      }}
                    >
                      <LikerAvatar
                        photoUrl={p.photo_url}
                        name={displayName(p)}
                        size={40}
                        service={p.service}
                        isEmployer={p.is_employer}
                      />
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{displayName(p)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
