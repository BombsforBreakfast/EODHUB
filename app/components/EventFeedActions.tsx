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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const message = obj.message ?? obj.error ?? obj.details;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Action failed.";
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
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/events/feed-actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ action: "toggle_attendance", eventId, status }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          interested?: number;
          going?: number;
          myAttendance?: "interested" | "going" | null;
          saved?: boolean;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Could not update attendance.");
        }
        setInterested(json.interested ?? 0);
        setGoing(json.going ?? 0);
        setMyAttendance(json.myAttendance ?? null);
        setSaved(Boolean(json.saved));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("eod:saved-events-changed", { detail: { eventId } }));
        }
      } catch (e) {
        console.error("event_attendance toggle:", e);
        alert(getErrorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [eventId, userId]
  );

  const toggleSave = useCallback(async () => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    setBusy("save");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/events/feed-actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ action: "toggle_save", eventId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        interested?: number;
        going?: number;
        myAttendance?: "interested" | "going" | null;
        saved?: boolean;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not update save state.");
      }
      setInterested(json.interested ?? 0);
      setGoing(json.going ?? 0);
      setMyAttendance(json.myAttendance ?? null);
      setSaved(Boolean(json.saved));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("eod:saved-events-changed", { detail: { eventId } }));
      }
    } catch (e) {
      console.error("saved_events toggle:", e);
      alert(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [eventId, userId]);

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
        justifyContent: "center",
        width: "100%",
        boxSizing: "border-box",
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
      {userId ? (
        <button
          type="button"
          onClick={toggleSave}
          disabled={busy === "save"}
          style={{
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
      {signupHref ? (
        <a href={signupHref} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: isDark ? "#60a5fa" : "#1d4ed8", textDecoration: "none" }}>
          Sign Up ↗
        </a>
      ) : null}
    </div>
  );
}
