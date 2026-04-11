"use client";

import Image from "next/image";
import { useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import type { FeedKangarooBundle } from "../lib/kangarooCourt";
import {
  JUDGE_DISPLAY_NAME,
  JUDGE_SUBTITLE,
  KC_CONFIRM_SUBTITLE,
  KC_CONFIRM_TITLE,
  KC_DURATION_HOURS,
  judgeAvatarSrc,
  type KcDurationHours,
} from "../lib/kangarooCourt";

type Props = {
  postId: string;
  userId: string | null;
  bundle: FeedKangarooBundle | null;
  onAfterChange: () => void;
};

/** Supabase RPC errors are plain objects with `message`, not always `instanceof Error`. */
function rpcErrMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return fallback;
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "0m";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function KangarooCourtFeedSection({ postId, userId, bundle, onAfterChange }: Props) {
  const { t, isDark } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [opt1, setOpt1] = useState("");
  const [opt2, setOpt2] = useState("");
  const [opt3, setOpt3] = useState("");
  const [opt4, setOpt4] = useState("");
  const [duration, setDuration] = useState<KcDurationHours>(24);
  const [submitting, setSubmitting] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);

  const court = bundle?.court;
  const active = court?.status === "active" && new Date(court.expires_at).getTime() > Date.now();
  const closed = court?.status === "closed";
  const verdict = bundle?.verdict;

  async function submitConvert() {
    const labels = [opt1, opt2, opt3, opt4].map((s) => s.trim()).filter(Boolean);
    if (labels.length < 2) {
      alert("Enter at least two options.");
      return;
    }
    if (labels.length > 4) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("open_kangaroo_court_on_feed_post", {
        p_feed_post_id: postId,
        p_option_labels: labels,
        p_duration_hours: duration,
      });
      if (error) {
        console.error("open_kangaroo_court_on_feed_post", error);
        alert(rpcErrMsg(error, "Could not start court."));
        return;
      }
      if (!data) {
        alert("No court id returned");
        return;
      }
      setBuilderOpen(false);
      setConfirmOpen(false);
      onAfterChange();
    } catch (e) {
      alert(rpcErrMsg(e, "Could not start court."));
    } finally {
      setSubmitting(false);
    }
  }

  async function vote(optionId: string) {
    if (!userId || !court || voteBusy) return;
    setVoteBusy(true);
    try {
      const { error } = await supabase.rpc("vote_kangaroo_court", {
        p_court_id: court.id,
        p_option_id: optionId,
      });
      if (error) {
        console.error("vote_kangaroo_court", error);
        alert(rpcErrMsg(error, "Vote failed."));
        return;
      }
      onAfterChange();
    } catch (e) {
      console.error("vote_kangaroo_court", e);
      alert(rpcErrMsg(e, "Vote failed."));
    } finally {
      setVoteBusy(false);
    }
  }

  const surface = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
  const border = t.border;

  return (
    <div style={{ marginTop: 14 }}>
      {!court && userId && (
        <div>
          {!confirmOpen && !builderOpen && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              style={{
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: "8px 14px",
                fontWeight: 700,
                fontSize: 13,
                background: t.surface,
                color: t.text,
                cursor: "pointer",
              }}
            >
              Kangaroo Court
            </button>
          )}

          {confirmOpen && !builderOpen && (
            <div
              style={{
                border: `1px solid ${border}`,
                borderRadius: 12,
                padding: 14,
                background: surface,
                maxWidth: 360,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{KC_CONFIRM_TITLE}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>{KC_CONFIRM_SUBTITLE}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    setBuilderOpen(true);
                    setConfirmOpen(false);
                  }}
                  style={{
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Start Court
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  style={{
                    border: `1px solid ${border}`,
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontWeight: 700,
                    background: t.surface,
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {builderOpen && (
            <div
              style={{
                marginTop: 8,
                border: `1px solid ${border}`,
                borderRadius: 12,
                padding: 14,
                background: t.surface,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Kangaroo Court</div>
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 1</label>
              <input
                value={opt1}
                onChange={(e) => setOpt1(e.target.value)}
                placeholder="Option A"
                style={{
                  width: "100%",
                  marginTop: 4,
                  marginBottom: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${t.inputBorder}`,
                  background: t.input,
                  color: t.text,
                  boxSizing: "border-box",
                }}
              />
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 2</label>
              <input
                value={opt2}
                onChange={(e) => setOpt2(e.target.value)}
                placeholder="Option B"
                style={{
                  width: "100%",
                  marginTop: 4,
                  marginBottom: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${t.inputBorder}`,
                  background: t.input,
                  color: t.text,
                  boxSizing: "border-box",
                }}
              />
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 3 (optional)</label>
              <input
                value={opt3}
                onChange={(e) => setOpt3(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  marginBottom: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${t.inputBorder}`,
                  background: t.input,
                  color: t.text,
                  boxSizing: "border-box",
                }}
              />
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 4 (optional)</label>
              <input
                value={opt4}
                onChange={(e) => setOpt4(e.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  marginBottom: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${t.inputBorder}`,
                  background: t.input,
                  color: t.text,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: t.textMuted }}>Duration</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {KC_DURATION_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setDuration(h)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: duration === h ? `2px solid ${t.text}` : `1px solid ${border}`,
                      background: duration === h ? surface : t.surface,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                      color: t.text,
                    }}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitConvert()}
                  style={{
                    background: "#111",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontWeight: 700,
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "…" : "Open court"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBuilderOpen(false);
                    setOpt1("");
                    setOpt2("");
                    setOpt3("");
                    setOpt4("");
                  }}
                  style={{
                    border: `1px solid ${border}`,
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontWeight: 700,
                    background: t.surface,
                    color: t.text,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {court && (
        <div
          style={{
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: 12,
            background: surface,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Kangaroo Court</div>
            <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>
              {active ? "Court in Session" : closed ? "Verdict Is In" : court.status}
            </div>
          </div>
          {active && (
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>
              {formatRemaining(court.expires_at)} left · {court.total_votes} votes
            </div>
          )}
          {closed && !verdict && (
            <div style={{ fontSize: 12, color: t.textMuted }}>Final tally pending…</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(bundle?.options ?? []).map((opt) => {
              const cnt = bundle?.voteCounts[opt.id] ?? 0;
              const pct = court.total_votes > 0 ? Math.round((100 * cnt) / court.total_votes) : 0;
              const selected = bundle?.myVoteOptionId === opt.id;
              const winner = closed && verdict?.winning_option_id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!active || !userId || voteBusy || Boolean(bundle?.myVoteOptionId)}
                  onClick={() => void vote(opt.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: `1px solid ${winner ? "#c4b5fd" : border}`,
                    background: selected || winner ? (isDark ? "rgba(124,58,237,0.15)" : "#f5f3ff") : t.surface,
                    cursor: active && userId && !bundle?.myVoteOptionId ? "pointer" : "default",
                    color: t.text,
                    fontSize: 13,
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `2px solid ${selected || winner ? "#7c3aed" : border}`,
                      flexShrink: 0,
                      background: selected || winner ? "#7c3aed" : "transparent",
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{opt.label}</span>
                  <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0 }}>
                    {pct}% · {cnt}
                  </span>
                </button>
              );
            })}
          </div>

          {closed && verdict && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${border}` }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1px solid ${border}` }}>
                  <Image src={judgeAvatarSrc()} alt="" width={40} height={40} style={{ objectFit: "cover", width: "100%", height: "100%" }} unoptimized />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{JUDGE_DISPLAY_NAME}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{JUDGE_SUBTITLE}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{verdict.body}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
