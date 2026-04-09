"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";

export type EventFeedActionsProps = {
  eventId: string;
  signupUrl: string | null;
  initialInterested: number;
  initialGoing: number;
  initialMyAttendance: "interested" | "going" | null;
  initialSaved: boolean;
  userId: string | null;
};

function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

export default function EventFeedActions({
  eventId,
  signupUrl,
  initialInterested,
  initialGoing,
  initialMyAttendance,
  initialSaved,
  userId,
}: EventFeedActionsProps) {
  const { t, isDark } = useTheme();
  const [interested, setInterested] = useState(initialInterested);
  const [going, setGoing] = useState(initialGoing);
  const [myAttendance, setMyAttendance] = useState<"interested" | "going" | null>(initialMyAttendance);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState<"att" | "save" | null>(null);

  useEffect(() => {
    setInterested(initialInterested);
    setGoing(initialGoing);
    setMyAttendance(initialMyAttendance);
    setSaved(initialSaved);
  }, [eventId, initialInterested, initialGoing, initialMyAttendance, initialSaved]);

  const toggleAttendance = useCallback(
    async (status: "interested" | "going") => {
      if (!userId) {
        window.location.href = "/login";
        return;
      }
      setBusy("att");
      const current = myAttendance;
      try {
        if (current === status) {
          const { error } = await supabase.from("event_attendance").delete().eq("event_id", eventId).eq("user_id", userId);
          if (error) throw error;
          setMyAttendance(null);
          if (status === "interested") setInterested((n) => Math.max(0, n - 1));
          else setGoing((n) => Math.max(0, n - 1));
        } else if (current) {
          const { error } = await supabase.from("event_attendance").update({ status }).eq("event_id", eventId).eq("user_id", userId);
          if (error) throw error;
          setMyAttendance(status);
          if (current === "interested") {
            setInterested((n) => Math.max(0, n - 1));
            setGoing((n) => n + 1);
          } else {
            setGoing((n) => Math.max(0, n - 1));
            setInterested((n) => n + 1);
          }
        } else {
          const { error } = await supabase.from("event_attendance").insert([{ event_id: eventId, user_id: userId, status }]);
          if (error) throw error;
          setMyAttendance(status);
          if (status === "interested") setInterested((n) => n + 1);
          else setGoing((n) => n + 1);
        }
      } catch (e) {
        console.error("event_attendance toggle:", e);
      } finally {
        setBusy(null);
      }
    },
    [eventId, userId, myAttendance]
  );

  const toggleSave = useCallback(async () => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    setBusy("save");
    try {
      if (saved) {
        const { error } = await supabase.from("saved_events").delete().eq("user_id", userId).eq("event_id", eventId);
        if (error) throw error;
        setSaved(false);
      } else {
        const { error } = await supabase.from("saved_events").insert([{ user_id: userId, event_id: eventId }]);
        if (error && error.code !== "23505") {
          console.error("saved_events insert:", error);
          return;
        }
        setSaved(true);
      }
    } catch (e) {
      console.error("saved_events toggle:", e);
    } finally {
      setBusy(null);
    }
  }, [eventId, userId, saved]);

  const signupHref = signupUrl ? httpsAssetUrl(signupUrl) : "";

  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: `1px solid ${t.border}`,
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={() => toggleAttendance("interested")}
        disabled={busy === "att"}
        style={{
          background: myAttendance === "interested" ? t.text : t.surface,
          color: myAttendance === "interested" ? t.surface : t.textMuted,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: "5px 12px",
          fontWeight: 700,
          fontSize: 12,
          cursor: busy === "att" ? "wait" : "pointer",
          opacity: busy === "att" ? 0.7 : 1,
        }}
      >
        Interested {interested > 0 ? `· ${interested}` : ""}
      </button>
      <button
        type="button"
        onClick={() => toggleAttendance("going")}
        disabled={busy === "att"}
        style={{
          background: myAttendance === "going" ? t.text : t.surface,
          color: myAttendance === "going" ? t.surface : t.textMuted,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: "5px 12px",
          fontWeight: 700,
          fontSize: 12,
          cursor: busy === "att" ? "wait" : "pointer",
          opacity: busy === "att" ? 0.7 : 1,
        }}
      >
        Going {going > 0 ? `· ${going}` : ""}
      </button>
      {signupHref ? (
        <a href={signupHref} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#60a5fa" : "#1d4ed8", textDecoration: "none" }}>
          Sign Up ↗
        </a>
      ) : null}
      {userId ? (
        <button
          type="button"
          onClick={toggleSave}
          disabled={busy === "save"}
          style={{
            marginLeft: "auto",
            background: saved ? t.text : t.surface,
            color: saved ? t.surface : t.textMuted,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: "5px 12px",
            fontWeight: 700,
            fontSize: 12,
            cursor: busy === "save" ? "wait" : "pointer",
            opacity: busy === "save" ? 0.7 : 1,
          }}
        >
          {busy === "save" ? "..." : saved ? "Saved ✓" : "Save"}
        </button>
      ) : null}
    </div>
  );
}
