"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
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
  stripVerdictBodyLeadingDuplicate,
  type KcDurationHours,
} from "../lib/kangarooCourt";

type Props = {
  postId: string;
  userId: string | null;
  bundle: FeedKangarooBundle | null;
  onAfterChange: () => void;
  suppressVerdictFooter?: boolean;
  /**
   * Profile wall: with `trigger-inline`, only show the read-only judge chip when a court
   * exists — never open the “start court” flow from the wall.
   */
  wallStaticToolbar?: boolean;
  /**
   * "full"           – original behavior: trigger button + court card in one block (default)
   * "trigger-inline" – renders only the judge avatar button (for the toolbar row);
   *                    confirm/builder panels float below via absolute positioning.
   *                    Returns null when a court already exists.
   * "card-only"      – renders only the active/closed court card; no trigger button.
   *                    Returns null when no court exists.
   */
  mode?: "full" | "trigger-inline" | "card-only";
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

export default function KangarooCourtFeedSection({
  postId,
  userId,
  bundle,
  onAfterChange,
  suppressVerdictFooter,
  wallStaticToolbar,
  mode = "full",
}: Props) {
  const { t, isDark } = useTheme();
  /** OAuth can lag React `userId`; session is enough to vote / open KC CTA. */
  const [viewerIdFromSession, setViewerIdFromSession] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setViewerIdFromSession(session?.user?.id ?? null);
    });
  }, []);
  const effectiveViewerId = userId ?? viewerIdFromSession;

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
    if (!effectiveViewerId || !court || voteBusy) return;
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

  // ── trigger-inline ──────────────────────────────────────────────────────────
  // Always show the 48px judge chip when logged in (left of Like/Comment). If a court
  // already exists on this post, show the same asset non-interactively — do not hide it
  // (hiding made it look like the layout “reverted” on every post with KC).
  /** 32px → +50% = 48px; distinct from user avatars */
  const triggerSize = 48;

  if (mode === "trigger-inline") {
    if (!effectiveViewerId) return null;

    // Profile wall: display-only chip when a court exists; no “start court” UI.
    if (wallStaticToolbar) {
      if (!court) return null;
      const wallTitle = closed
        ? "Kangaroo Court — verdict below"
        : active
          ? "Kangaroo Court — in session (see poll below)"
          : "Kangaroo Court";
      return (
        <div style={{ position: "relative", flexShrink: 0, marginRight: 6 }} title={wallTitle}>
          <div
            aria-hidden
            style={{
              width: triggerSize,
              height: triggerSize,
              borderRadius: "50%",
              overflow: "hidden",
              border: `2px solid ${closed ? "#7c3aed" : border}`,
              opacity: closed ? 0.95 : 0.88,
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          >
            <Image
              src={judgeAvatarSrc()}
              alt=""
              width={triggerSize}
              height={triggerSize}
              style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
              unoptimized
            />
          </div>
        </div>
      );
    }

    const courtChipTitle = court
      ? closed
        ? "Kangaroo Court — verdict below"
        : active
          ? "Kangaroo Court — in session (see poll below)"
          : "Kangaroo Court"
      : "Take this post to Kangaroo Court";

    const chipShell = (child: ReactNode) => (
      <div style={{ position: "relative", flexShrink: 0, marginRight: 6 }} title={courtChipTitle}>
        {child}
      </div>
    );

    if (court) {
      return chipShell(
        <div
          aria-hidden
          style={{
            width: triggerSize,
            height: triggerSize,
            borderRadius: "50%",
            overflow: "hidden",
            border: `2px solid ${closed ? "#7c3aed" : border}`,
            opacity: closed ? 0.95 : 0.88,
            flexShrink: 0,
            boxSizing: "border-box",
          }}
        >
          <Image
            src={judgeAvatarSrc()}
            alt=""
            width={triggerSize}
            height={triggerSize}
            style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
            unoptimized
          />
        </div>,
      );
    }

    return (
      <div style={{ position: "relative", flexShrink: 0, marginRight: 6 }}>
        {/* Judge avatar button — start new court */}
        {!confirmOpen && !builderOpen && (
          <button
            type="button"
            title="Take to Kangaroo Court"
            onClick={() => setConfirmOpen(true)}
            style={{
              width: triggerSize,
              height: triggerSize,
              borderRadius: "50%",
              overflow: "hidden",
              padding: 0,
              border: `2px solid ${border}`,
              cursor: "pointer",
              background: "transparent",
              display: "block",
              flexShrink: 0,
            }}
          >
            <Image
              src={judgeAvatarSrc()}
              alt="Kangaroo Court"
              width={triggerSize}
              height={triggerSize}
              style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
              unoptimized
            />
          </button>
        )}

        {/* Active state: show a muted avatar so the icon stays in the toolbar row */}
        {(confirmOpen || builderOpen) && (
          <div
            style={{
              width: triggerSize,
              height: triggerSize,
              borderRadius: "50%",
              overflow: "hidden",
              border: `2px solid ${t.textMuted}`,
              opacity: 0.5,
              flexShrink: 0,
            }}
          >
            <Image
              src={judgeAvatarSrc()}
              alt=""
              width={triggerSize}
              height={triggerSize}
              style={{ objectFit: "cover", width: "100%", height: "100%", display: "block" }}
              unoptimized
            />
          </div>
        )}

        {/* Confirm panel — floats below avatar */}
        {confirmOpen && !builderOpen && (
          <div
            style={{
              position: "absolute",
              top: triggerSize + 8,
              left: 0,
              zIndex: 50,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: 14,
              background: isDark ? t.surface : "#fff",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              minWidth: 280,
              maxWidth: 340,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{KC_CONFIRM_TITLE}</div>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>{KC_CONFIRM_SUBTITLE}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => { setBuilderOpen(true); setConfirmOpen(false); }}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}
              >
                Start Court
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, background: t.surface, color: t.text, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Builder panel — floats below avatar */}
        {builderOpen && (
          <div
            style={{
              position: "absolute",
              top: triggerSize + 8,
              left: 0,
              zIndex: 50,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: 14,
              background: isDark ? t.surface : "#fff",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              minWidth: 300,
              maxWidth: 360,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Kangaroo Court</div>
            <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 1</label>
            <input value={opt1} onChange={(e) => setOpt1(e.target.value)} placeholder="Option A"
              style={{ width: "100%", marginTop: 4, marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 2</label>
            <input value={opt2} onChange={(e) => setOpt2(e.target.value)} placeholder="Option B"
              style={{ width: "100%", marginTop: 4, marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 3 (optional)</label>
            <input value={opt3} onChange={(e) => setOpt3(e.target.value)}
              style={{ width: "100%", marginTop: 4, marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
            <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 4 (optional)</label>
            <input value={opt4} onChange={(e) => setOpt4(e.target.value)}
              style={{ width: "100%", marginTop: 4, marginBottom: 10, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: t.textMuted }}>Duration</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {KC_DURATION_HOURS.map((h) => (
                <button key={h} type="button" onClick={() => setDuration(h)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: duration === h ? `2px solid ${t.text}` : `1px solid ${border}`, background: duration === h ? surface : t.surface, fontWeight: 700, fontSize: 12, cursor: "pointer", color: t.text }}>
                  {h}h
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={submitting} onClick={() => void submitConvert()}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                {submitting ? "…" : "Open court"}
              </button>
              <button type="button"
                onClick={() => { setBuilderOpen(false); setOpt1(""); setOpt2(""); setOpt3(""); setOpt4(""); }}
                style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, background: t.surface, color: t.text, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── card-only ───────────────────────────────────────────────────────────────
  // Renders only the court card (active/closed). No trigger button.
  if (mode === "card-only") {
    if (!court) return null;
    return <CourtCard court={court} active={active} closed={closed} verdict={verdict ?? null} bundle={bundle} effectiveViewerId={effectiveViewerId} voteBusy={voteBusy} vote={vote} suppressVerdictFooter={suppressVerdictFooter} surface={surface} border={border} t={t} isDark={isDark} />;
  }

  // ── full (default) ──────────────────────────────────────────────────────────
  return (
    <div style={{ marginTop: 14 }}>
      {!court && effectiveViewerId && (
        <div>
          {!confirmOpen && !builderOpen && (
            <button type="button" onClick={() => setConfirmOpen(true)}
              style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, background: t.surface, color: t.text, cursor: "pointer" }}>
              Kangaroo Court
            </button>
          )}
          {confirmOpen && !builderOpen && (
            <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 14, background: surface, maxWidth: 360 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{KC_CONFIRM_TITLE}</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>{KC_CONFIRM_SUBTITLE}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setBuilderOpen(true); setConfirmOpen(false); }}
                  style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
                  Start Court
                </button>
                <button type="button" onClick={() => setConfirmOpen(false)}
                  style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, background: t.surface, color: t.text, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {builderOpen && (
            <div style={{ marginTop: 8, border: `1px solid ${border}`, borderRadius: 12, padding: 14, background: t.surface }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Kangaroo Court</div>
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 1</label>
              <input value={opt1} onChange={(e) => setOpt1(e.target.value)} placeholder="Option A"
                style={{ width: "100%", marginTop: 4, marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 2</label>
              <input value={opt2} onChange={(e) => setOpt2(e.target.value)} placeholder="Option B"
                style={{ width: "100%", marginTop: 4, marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 3 (optional)</label>
              <input value={opt3} onChange={(e) => setOpt3(e.target.value)}
                style={{ width: "100%", marginTop: 4, marginBottom: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
              <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 4 (optional)</label>
              <input value={opt4} onChange={(e) => setOpt4(e.target.value)}
                style={{ width: "100%", marginTop: 4, marginBottom: 10, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }} />
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: t.textMuted }}>Duration</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {KC_DURATION_HOURS.map((h) => (
                  <button key={h} type="button" onClick={() => setDuration(h)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: duration === h ? `2px solid ${t.text}` : `1px solid ${border}`, background: duration === h ? surface : t.surface, fontWeight: 700, fontSize: 12, cursor: "pointer", color: t.text }}>
                    {h}h
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={submitting} onClick={() => void submitConvert()}
                  style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "…" : "Open court"}
                </button>
                <button type="button" onClick={() => { setBuilderOpen(false); setOpt1(""); setOpt2(""); setOpt3(""); setOpt4(""); }}
                  style={{ border: `1px solid ${border}`, borderRadius: 10, padding: "8px 16px", fontWeight: 700, background: t.surface, color: t.text, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {court && (
        <CourtCard court={court} active={active} closed={closed} verdict={verdict ?? null} bundle={bundle} effectiveViewerId={effectiveViewerId} voteBusy={voteBusy} vote={vote} suppressVerdictFooter={suppressVerdictFooter} surface={surface} border={border} t={t} isDark={isDark} />
      )}
    </div>
  );
}

// ── Shared court card ─────────────────────────────────────────────────────────

type CourtCardProps = {
  court: NonNullable<FeedKangarooBundle["court"]>;
  active: boolean;
  closed: boolean;
  verdict: FeedKangarooBundle["verdict"];
  bundle: FeedKangarooBundle | null;
  effectiveViewerId: string | null | undefined;
  voteBusy: boolean;
  vote: (optionId: string) => Promise<void>;
  suppressVerdictFooter?: boolean;
  surface: string;
  border: string;
  t: ReturnType<typeof useTheme>["t"];
  isDark: boolean;
};

function CourtCard({ court, active, closed, verdict, bundle, effectiveViewerId, voteBusy, vote, suppressVerdictFooter, surface, border, t, isDark }: CourtCardProps) {
  return (
    <div
      style={{
        marginTop: 14,
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
              disabled={!active || !effectiveViewerId || voteBusy || Boolean(bundle?.myVoteOptionId)}
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
                cursor: active && effectiveViewerId && !bundle?.myVoteOptionId ? "pointer" : "default",
                color: t.text,
                fontSize: 13,
              }}
            >
              <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${selected || winner ? "#7c3aed" : border}`, flexShrink: 0, background: selected || winner ? "#7c3aed" : "transparent" }} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{opt.label}</span>
              <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0 }}>{pct}% · {cnt}</span>
            </button>
          );
        })}
      </div>

      {closed && verdict && !suppressVerdictFooter && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${border}` }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `1px solid ${border}` }}>
              <Image src={judgeAvatarSrc()} alt="" width={40} height={40} style={{ objectFit: "cover", width: "100%", height: "100%" }} unoptimized />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{JUDGE_DISPLAY_NAME}</div>
              <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{JUDGE_SUBTITLE}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {stripVerdictBodyLeadingDuplicate(verdict.body)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
