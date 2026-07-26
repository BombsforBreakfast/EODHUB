"use client";

import { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "../../lib/lib/supabaseClient";
import { isCollapsingCircuitEnabled } from "../../lib/circuit";

type PromptRow = {
  id: string;
  slug: string;
  label: string;
  sort_hint: number;
  is_active: boolean;
  post_count: number;
};

type Theme = {
  border: string;
  surface: string;
  text: string;
  textMuted: string;
  textFaint: string;
  input: string;
  inputBorder: string;
};

type Props = {
  theme: Theme;
  /** Optional: push these live event ids from Manage Events list */
  eventIds?: Array<{ id: string; title: string }>;
};

export default function AdminCircuitPanel({ theme: t, eventIds = [] }: Props) {
  const enabled = isCollapsingCircuitEnabled();
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const token = await getAccessToken({ source: "AdminCircuit.load" });
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/circuit/prompts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as {
        prompts?: PromptRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "Could not load prompts.");
        return;
      }
      setPrompts(body.prompts ?? []);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!enabled) {
    return (
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Collapsing Circuit</div>
        <div style={{ fontSize: 14, color: t.textMuted }}>
          Local/dev only right now. Set <code>NEXT_PUBLIC_COLLAPSING_CIRCUIT_ENABLED=true</code> to manage prompts
          and push events.
        </div>
      </div>
    );
  }

  const patchPrompt = async (id: string, patch: Partial<Pick<PromptRow, "sort_hint" | "is_active" | "label">>) => {
    const token = await getAccessToken({ source: "AdminCircuit.patch" });
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/circuit/prompts", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, ...patch }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Update failed.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const pushEvent = async (eventId: string, title: string) => {
    const token = await getAccessToken({ source: "AdminCircuit.push" });
    if (!token) return;
    setBusyId(eventId);
    setPushMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/circuit/events/publish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_id: eventId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        inserted?: number;
        refreshed?: number;
      };
      if (!res.ok) {
        setError(body.error || "Push failed.");
        return;
      }
      setPushMsg(
        body.refreshed
          ? `Refreshed Circuit tile for “${title}” (24h).`
          : `Pushed “${title}” into Circuit (24h).`,
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface, display: "grid", gap: 20 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Collapsing Circuit</div>
        <div style={{ fontSize: 14, color: t.textMuted }}>
          Local testing only — prompts never get used up. Push refreshes a 24h event tile.
        </div>
      </div>

      {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      {pushMsg ? <div style={{ color: "#15803d", fontSize: 13 }}>{pushMsg}</div> : null}

      <div>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Prompts</div>
        {loading && prompts.length === 0 ? (
          <div style={{ color: t.textFaint, fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {prompts.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <input
                  type="number"
                  value={p.sort_hint}
                  disabled={busyId === p.id}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPrompts((prev) =>
                      prev.map((row) => (row.id === p.id ? { ...row, sort_hint: v } : row)),
                    );
                  }}
                  onBlur={() => void patchPrompt(p.id, { sort_hint: p.sort_hint })}
                  style={{
                    width: 64,
                    border: `1px solid ${t.inputBorder}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                    background: t.input,
                    color: t.text,
                  }}
                />
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    {p.slug} · {p.post_count} posts
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => void patchPrompt(p.id, { is_active: !p.is_active })}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: p.is_active ? "#15803d" : "#6b7280",
                    color: "white",
                  }}
                >
                  {p.is_active ? "Active" : "Off"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {eventIds.length > 0 ? (
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Push event to Circuit</div>
          <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
            {eventIds.slice(0, 40).map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: "8px 12px",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</span>
                <button
                  type="button"
                  disabled={busyId === ev.id}
                  onClick={() => void pushEvent(ev.id, ev.title)}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    background: "#1d4ed8",
                    color: "white",
                    opacity: busyId === ev.id ? 0.7 : 1,
                  }}
                >
                  {busyId === ev.id ? "…" : "Push 24h"}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
