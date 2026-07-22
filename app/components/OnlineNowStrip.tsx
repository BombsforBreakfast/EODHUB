"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import { LikerAvatar } from "./PostLikersStack";
import { useOnlinePresence } from "./OnlinePresenceProvider";
import { hasFullPlatformAccess, type VerificationProfile } from "../lib/verificationAccess";
import { fetchBlockedUserIds } from "../lib/userBlocks";

const AVATAR = 28; // 25% larger than the previous 22px strip avatars
const AVATAR_OVERLAP = 6;
const AVATAR_STEP = AVATAR - AVATAR_OVERLAP;
const SEE_ALL_MIN_W = 96;
const ENTER_CHAT_MIN_W = 100;
const POPOVER_CLOSE_DELAY_MS = 120;

type ProfileRow = VerificationProfile & {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean | null;
  privacy_show_online: boolean | null;
  account_deleted_at: string | null;
};

function displayName(p: ProfileRow): string {
  return p.display_name?.trim()
    || `${p.first_name || ""} ${p.last_name || ""}`.trim()
    || "Member";
}

function widthForNStacked(n: number): number {
  if (n <= 0) return 0;
  return AVATAR + (n - 1) * AVATAR_STEP;
}

type OnlineNowStripProps = {
  currentUserId: string | null;
  onEnterChat?: () => void;
};

export default function OnlineNowStrip({
  currentUserId,
  onEnterChat,
}: OnlineNowStripProps) {
  const { t } = useTheme();
  const { onlineUserIds } = useOnlinePresence();
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(12);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [prefersHover, setPrefersHover] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previewRows = useMemo(() => {
    if (!currentUserId) return [];
    const others = onlineUserIds.filter((id) => id !== currentUserId && !blockedUserIds.has(id));
    if (others.length === 0) return [];
    const ordered = others
      .map((id) => profiles.get(id))
      .filter(
        (p): p is ProfileRow =>
          !!p &&
          !p.account_deleted_at &&
          p.privacy_show_online !== false &&
          hasFullPlatformAccess(p),
      )
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
    return ordered;
  }, [blockedUserIds, currentUserId, onlineUserIds, profiles]);

  const syncProfiles = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setProfiles(new Map());
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "user_id, first_name, last_name, display_name, photo_url, service, is_employer, privacy_show_online, verification_status, email_verified, admin_verified, is_pure_admin, account_deleted_at",
      )
      .in("user_id", ids);
    if (error) return;
    const map = new Map<string, ProfileRow>();
    ((data ?? []) as ProfileRow[]).forEach((row) => map.set(row.user_id, row));
    setProfiles(map);
  }, []);

  useEffect(() => {
    if (onlineUserIds.length === 0) return;
    void syncProfiles(onlineUserIds);
  }, [onlineUserIds, syncProfiles]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = await fetchBlockedUserIds(supabase, currentUserId);
      if (!cancelled) setBlockedUserIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setPrefersHover(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || previewRows.length === 0) return;
    function measure() {
      if (!el) return;
      const w = el.clientWidth;
      if (w <= 0) return;
      const total = previewRows.length;
      const reservedForChat = onEnterChat ? ENTER_CHAT_MIN_W + 8 : 0;
      const stackBudget = Math.max(0, w - reservedForChat);
      let fitWithoutOverflow = 1;
      for (let n = total; n >= 1; n--) {
        if (widthForNStacked(n) <= stackBudget) {
          fitWithoutOverflow = n;
          break;
        }
      }
      if (fitWithoutOverflow >= total) {
        setVisibleCount(total);
        return;
      }
      const wWithOverflowChip = Math.max(0, stackBudget - SEE_ALL_MIN_W);
      let withOverflow = 1;
      for (let n = total; n >= 1; n--) {
        if (widthForNStacked(n) <= wWithOverflowChip) {
          withOverflow = n;
          break;
        }
      }
      setVisibleCount(Math.max(1, Math.min(withOverflow, total - 1)));
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onEnterChat, previewRows.length]);

  const cancelCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setPopoverOpen(false);
      closeTimerRef.current = null;
    }, POPOVER_CLOSE_DELAY_MS);
  }, [cancelCloseTimer]);

  const openPopover = useCallback(() => {
    cancelCloseTimer();
    setPopoverOpen(true);
  }, [cancelCloseTimer]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      setPopoverOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [popoverOpen]);

  useEffect(() => {
    return () => cancelCloseTimer();
  }, [cancelCloseTimer]);

  if (!currentUserId) return null;
  if (previewRows.length === 0 && !onEnterChat) return null;

  const visibleRows = previewRows.slice(0, visibleCount);
  const hiddenCount = Math.max(0, previewRows.length - visibleRows.length);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
        minHeight: AVATAR + 8,
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
      <div ref={measureRef} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {previewRows.length > 0 ? (
          <div
            ref={popoverRef}
            style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
            onMouseEnter={prefersHover ? openPopover : undefined}
            onMouseLeave={prefersHover ? scheduleClose : undefined}
          >
            <button
              type="button"
              aria-expanded={popoverOpen}
              aria-haspopup="true"
              aria-label={`${previewRows.length} member${previewRows.length === 1 ? "" : "s"} online. Show list.`}
              onClick={() => setPopoverOpen((open) => !open)}
              style={{
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                borderRadius: 999,
              }}
            >
              {visibleRows.map((p, i) => (
                <span
                  key={p.user_id}
                  title={displayName(p)}
                  style={{
                    marginLeft: i === 0 ? 0 : -AVATAR_OVERLAP,
                    position: "relative",
                    zIndex: visibleRows.length - i,
                    lineHeight: 0,
                    pointerEvents: "none",
                  }}
                >
                  <LikerAvatar
                    photoUrl={p.photo_url}
                    name={displayName(p)}
                    size={AVATAR}
                    service={p.service}
                    isEmployer={p.is_employer}
                  />
                </span>
              ))}
              {hiddenCount > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    flexShrink: 0,
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    borderRadius: 999,
                    padding: "4px 10px",
                    color: t.textMuted,
                    fontSize: 12,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  +{hiddenCount}
                </span>
              )}
            </button>

            {popoverOpen && (
              <div
                role="menu"
                aria-label="Online members"
                onMouseEnter={prefersHover ? cancelCloseTimer : undefined}
                onMouseLeave={prefersHover ? scheduleClose : undefined}
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  zIndex: 10050,
                  minWidth: 220,
                  maxWidth: 320,
                  maxHeight: "min(320px, 50vh)",
                  overflowY: "auto",
                  background: t.surface,
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                  padding: 3,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {previewRows.map((p) => (
                  <Link
                    key={p.user_id}
                    href={`/profile/${p.user_id}`}
                    role="menuitem"
                    onClick={() => setPopoverOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 5px",
                      borderRadius: 6,
                      border: "none",
                      textDecoration: "none",
                      color: t.text,
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = t.badgeBg;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <LikerAvatar
                      photoUrl={p.photo_url}
                      name={displayName(p)}
                      size={32}
                      service={p.service}
                      isEmployer={p.is_employer}
                    />
                    <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{displayName(p)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          ) : (
            <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Just you for now</span>
          )}
          {onEnterChat && (
            <button
              type="button"
              onClick={onEnterChat}
              style={{
                flexShrink: 0,
                border: "1px solid #33ff66",
                background: "#000",
                color: "#33ff66",
                borderRadius: 0,
                padding: "6px 12px",
                fontWeight: 700,
                fontSize: 11,
                fontFamily: 'var(--font-geist-mono), "Courier New", monospace',
                letterSpacing: 0.8,
                textTransform: "uppercase",
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: "0 0 8px rgba(51,255,102,0.25)",
              }}
            >
              Enter chat
            </button>
          )}
        </div>
    </div>
  );
}
