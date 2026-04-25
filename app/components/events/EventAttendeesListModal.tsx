"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";

type Attendee = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
};

type Props = {
  open: boolean;
  eventId: string | null;
  status: "going" | "interested" | null;
  onClose: () => void;
};

/**
 * Full list of users who selected Going or Interested for an event.
 * Shared by /events, master feed event modal, and MasterLeftColumn.
 */
export function EventAttendeesListModal({ open, eventId, status, onClose }: Props) {
  const { t } = useTheme();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !eventId || !status) {
      setAttendees([]);
      return;
    }
    setLoading(true);
    setAttendees([]);

    (async () => {
      const { data: attData } = await supabase
        .from("event_attendance")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("status", status);

      const userIds = ((attData ?? []) as { user_id: string }[]).map((r) => r.user_id);
      if (userIds.length === 0) {
        setAttendees([]);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, photo_url")
        .in("user_id", userIds);

      setAttendees((profileData ?? []) as Attendee[]);
      setLoading(false);
    })();
  }, [open, eventId, status]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          color: t.text,
          borderRadius: 16,
          padding: 24,
          maxWidth: 400,
          width: "100%",
          maxHeight: "min(70vh, 520px)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {status === "going" ? "Going" : "Interested"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: t.textMuted, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading && <div style={{ color: t.textMuted, fontSize: 14 }}>Loading...</div>}
          {!loading && attendees.length === 0 && <div style={{ color: t.textMuted, fontSize: 14 }}>No one yet.</div>}
          {attendees.map((a) => {
            const name =
              a.display_name?.trim() || `${a.first_name || ""} ${a.last_name || ""}`.trim() || "User";
            return (
              <a key={a.user_id} href={`/profile/${a.user_id}`} style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: t.text }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    overflow: "hidden",
                    background: t.badgeBg,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 15,
                    color: t.textMuted,
                  }}
                >
                  {a.photo_url ? (
                    <img src={a.photo_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    (name[0] ?? "U").toUpperCase()
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
