"use client";

import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useTheme } from "../lib/ThemeContext";
import { getNotificationHref, getNotificationIcon, type NotificationNavInput } from "../lib/notificationNavigation";

export type CenterNotification = NotificationNavInput & {
  id: string;
  is_read: boolean;
  read_at?: string | null;
  archived_at?: string | null;
  group_key?: string | null;
  link?: string | null;
  created_at: string;
  actor_name: string;
  actor_id?: string | null;
  unit_id?: string | null;
  unit_post_id?: string | null;
};

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  open: boolean;
  onClose: () => void;
  notifications: CenterNotification[];
  unreadCount: number;
  currentUserId: string | null;
  isAdmin: boolean;
  onDismiss: (id: string) => void;
  onOpenItem: (id: string, href: string) => void;
  onMarkAllRead?: () => void;
};

export default function NotificationCenter({
  open,
  onClose,
  notifications,
  unreadCount,
  currentUserId,
  isAdmin,
  onDismiss,
  onOpenItem,
  onMarkAllRead,
}: Props) {
  const { t, isDark } = useTheme();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined" || !open) return null;

  const panelBg = isDark
    ? "rgba(22, 22, 28, 0.92)"
    : "rgba(255, 255, 255, 0.94)";
  const cardBg = isDark
    ? "rgba(40, 40, 48, 0.75)"
    : "rgba(255, 255, 255, 0.72)";

  const grouped = notifications.reduce((acc, item) => {
    if (item.archived_at) return acc;
    const key = item.group_key || item.id;
    const existing = acc.get(key);
    const isUnread = !item.read_at && !item.is_read;
    if (!existing) {
      acc.set(key, { lead: item, count: 1, unreadCount: isUnread ? 1 : 0 });
      return acc;
    }
    existing.count += 1;
    if (isUnread) existing.unreadCount += 1;
    return acc;
  }, new Map<string, { lead: CenterNotification; count: number; unreadCount: number }>());

  const groupedItems = Array.from(grouped.values());

  return createPortal(
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "max(12px, env(safe-area-inset-top)) 16px 24px",
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "min(85vh, 640px)",
          marginTop: 56,
          borderRadius: 18,
          background: panelBg,
          border: `1px solid ${t.border}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 17, color: t.text, letterSpacing: -0.3 }}>
            Notifications
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {unreadCount > 0 && onMarkAllRead && (
              <button
                type="button"
                onClick={onMarkAllRead}
                style={{
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontSize: 12,
                  lineHeight: 1,
                  cursor: "pointer",
                  borderRadius: 999,
                  padding: "7px 10px",
                  fontWeight: 700,
                }}
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                fontSize: 22,
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            overflowY: "auto",
            padding: 10,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {groupedItems.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center", color: t.textMuted, fontSize: 14 }}>
              You&apos;re all caught up.
            </div>
          ) : (
            groupedItems.map((item) => {
              const n = item.lead;
              const href = n.link || getNotificationHref(n, { currentUserId, isAdmin });
              const icon = getNotificationIcon(n);
              const title = n.actor_name?.trim() ? n.actor_name : "EOD HUB";
              return (
                <div
                  key={n.id}
                  style={{
                    borderRadius: 14,
                    background: cardBg,
                    border: `1px solid ${t.borderLight}`,
                    boxShadow: isDark ? "0 2px 12px rgba(0,0,0,0.25)" : "0 2px 12px rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
                    <button
                      type="button"
                      onClick={() => onOpenItem(n.id, href)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        padding: "12px 12px 12px 14px",
                        color: t.text,
                        display: "flex",
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: t.badgeBg ?? t.surface,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                        aria-hidden
                      >
                        {icon}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontWeight: 800, fontSize: 13, color: t.text }}>
                            {title}
                            {item.unreadCount > 0 ? ` · ${item.unreadCount} new` : ""}
                          </span>
                          <span style={{ fontSize: 11, color: t.textMuted, flexShrink: 0 }}>{formatRelativeTime(n.created_at)}</span>
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, display: "block" }}>
                          {n.message}
                        </span>
                        {item.count > 1 && (
                          <span style={{ fontSize: 12, color: t.textMuted, marginTop: 4, display: "block" }}>
                            +{item.count - 1} more in this stack
                          </span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Dismiss notification"
                      title="Dismiss"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(n.id);
                      }}
                      style={{
                        width: 44,
                        flexShrink: 0,
                        border: "none",
                        borderLeft: `1px solid ${t.border}`,
                        background: "transparent",
                        color: t.textMuted,
                        fontSize: 20,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
