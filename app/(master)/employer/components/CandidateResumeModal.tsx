"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/lib/supabaseClient";
import { useTheme } from "../../../lib/ThemeContext";
import {
  EMPLOYER_CANDIDATE_COLUMNS,
  type EmployerCandidate,
  type PublicCandidate,
} from "../lib/types";
import {
  candidateDisplayName,
  candidateInitial,
  candidateLocation,
  toTagArray,
} from "../lib/candidateUtils";

type Props = {
  candidate: PublicCandidate;
  initialNotes: string;
  onClose: () => void;
  onSaveNotes: (notes: string) => Promise<void> | void;
  onMessage: () => void;
  onToggleSaved: () => void;
  onToggleInterested: () => void;
  isSaved: boolean;
  isInterested: boolean;
};

export default function CandidateResumeModal({
  candidate,
  initialNotes,
  onClose,
  onSaveNotes,
  onMessage,
  onToggleSaved,
  onToggleInterested,
  isSaved,
  isInterested,
}: Props) {
  const { t } = useTheme();
  const [detail, setDetail] = useState<EmployerCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedFlash, setNotesSavedFlash] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("profiles")
        .select(EMPLOYER_CANDIDATE_COLUMNS.join(","))
        .eq("user_id", candidate.user_id)
        .eq("open_to_opportunities", true)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        setDetail((data as unknown as EmployerCandidate) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidate.user_id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await onSaveNotes(notes);
      setNotesSavedFlash(true);
      setTimeout(() => setNotesSavedFlash(false), 1500);
    } finally {
      setSavingNotes(false);
    }
  }

  const name = candidateDisplayName(candidate);
  const initial = candidateInitial(candidate);
  const location = candidateLocation(candidate);

  const pill: React.CSSProperties = {
    background: t.badgeBg,
    color: t.badgeText,
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 11,
    fontWeight: 700,
  };

  const field = (label: string, value: React.ReactNode) => (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 12px", background: t.bg }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, color: t.text, wordBreak: "break-word" }}>{value ?? <span style={{ color: t.textFaint }}>—</span>}</div>
    </div>
  );

  const trainingDocs = detail?.specialized_training_docs ?? null;

  if (!mounted) return null;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} resume`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          maxHeight: "min(92vh, 900px)",
          overflow: "auto",
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          boxShadow: "0 18px 56px rgba(0,0,0,0.35)",
          padding: 20,
          boxSizing: "border-box",
          color: t.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: t.text,
                color: t.surface,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 22,
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {candidate.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- user photo
                <img src={candidate.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                initial
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Employer View · Resume
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                {[candidate.role, candidate.service, location].filter(Boolean).join(" · ") || "EOD Professional"}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.bg,
              color: t.text,
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {loading && <div style={{ color: t.textMuted, padding: "20px 0" }}>Loading resume…</div>}
        {error && <div style={{ color: "#dc2626", padding: "12px 0" }}>Could not load resume: {error}</div>}

        {detail && (
          <div style={{ display: "grid", gap: 12 }}>
            {/* Quick action row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={`/profile/${candidate.user_id}`}
                target="_blank"
                rel="noreferrer"
                style={{ ...pill, textDecoration: "none", background: t.bg, border: `1px solid ${t.border}` }}
              >
                View full profile →
              </a>
              <button
                type="button"
                onClick={onToggleSaved}
                style={{
                  ...pill,
                  cursor: "pointer",
                  border: "none",
                  background: isSaved ? "#fef3c7" : t.badgeBg,
                  color: isSaved ? "#92400e" : t.badgeText,
                }}
              >
                {isSaved ? "★ Saved" : "☆ Save"}
              </button>
              <button
                type="button"
                onClick={onToggleInterested}
                style={{
                  ...pill,
                  cursor: "pointer",
                  border: "none",
                  background: isInterested ? "#dcfce7" : t.badgeBg,
                  color: isInterested ? "#15803d" : t.badgeText,
                }}
              >
                {isInterested ? "✓ Interested" : "+ Interested"}
              </button>
              <button
                type="button"
                onClick={onMessage}
                style={{
                  ...pill,
                  cursor: "pointer",
                  border: "none",
                  background: "#111",
                  color: "white",
                }}
              >
                Message
              </button>
            </div>

            {/* Summary */}
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.bg }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Candidate Summary
              </div>
              <div style={{ marginTop: 6, fontSize: 14, color: t.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                {detail.employer_summary?.trim() || candidate.bio?.trim() || <span style={{ color: t.textFaint }}>No summary added yet.</span>}
              </div>
            </div>

            {/* Resume / education links + text */}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {field(
                "Resume",
                detail.resume_url ? (
                  <a href={detail.resume_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>
                    Open resume →
                  </a>
                ) : (
                  "Not provided"
                ),
              )}
              {field(
                "Education",
                detail.education_url ? (
                  <a href={detail.education_url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>
                    Open →
                  </a>
                ) : (
                  "Not provided"
                ),
              )}
              {field("Availability", [detail.availability_type, detail.availability_date].filter(Boolean).join(" · ") || null)}
              {field("Work preference", detail.work_preference)}
              {field("Relocation", detail.willing_to_relocate ? "Willing to relocate" : "Not specified")}
              {field("Travel", detail.willing_to_travel)}
              {field(
                "Clearance",
                [detail.clearance_level, detail.clearance_status].filter(Boolean).join(" · ") ||
                  (detail.clearance_expiration_date ? `Expires ${detail.clearance_expiration_date}` : null),
              )}
              {field(
                "Experience flags",
                [
                  detail.has_oconus_experience ? "OCONUS" : null,
                  detail.has_contract_experience ? "Contracting" : null,
                  detail.has_federal_le_military_crossover ? "Fed LE / Mil crossover" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || null,
              )}
            </div>

            {detail.resume_text?.trim() && (
              <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.bg }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Resume Text
                </div>
                <pre
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    color: t.text,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                  }}
                >
                  {detail.resume_text}
                </pre>
              </div>
            )}

            {/* Tags + training */}
            <TagBlock label="Professional Tags" tags={toTagArray(candidate.professional_tags)} t={t} />
            <TagBlock label="Unit History" tags={toTagArray(candidate.unit_history_tags)} t={t} />
            <TagBlock label="Tech Types" tags={toTagArray(candidate.tech_types)} t={t} />
            <TagBlock
              label="Specialized Training"
              tags={toTagArray(detail.specialized_training)}
              t={t}
              docs={trainingDocs}
            />

            {/* Employer notes */}
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.bg }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Private Notes
                </div>
                {notesSavedFlash && (
                  <span style={{ fontSize: 11, color: "#15803d", fontWeight: 700 }}>Saved ✓</span>
                )}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes are private to your employer account."
                rows={3}
                style={{
                  width: "100%",
                  borderRadius: 10,
                  border: `1px solid ${t.inputBorder}`,
                  background: t.input,
                  color: t.text,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={savingNotes || notes === initialNotes}
                  style={{
                    background: "#111",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    padding: "7px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: savingNotes || notes === initialNotes ? "not-allowed" : "pointer",
                    opacity: savingNotes || notes === initialNotes ? 0.6 : 1,
                  }}
                >
                  {savingNotes ? "Saving…" : "Save notes"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TagBlock({
  label,
  tags,
  t,
  docs,
}: {
  label: string;
  tags: string[];
  t: ReturnType<typeof useTheme>["t"];
  docs?: Record<string, string> | null;
}) {
  if (tags.length === 0) return null;
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.bg }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((tag) => {
          const docUrl = docs?.[tag] ?? docs?.[tag.toLowerCase()] ?? null;
          const content = (
            <span
              style={{
                background: t.badgeBg,
                color: t.badgeText,
                borderRadius: 999,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {tag}
              {docUrl && " 📎"}
            </span>
          );
          if (docUrl) {
            return (
              <a key={tag} href={docUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                {content}
              </a>
            );
          }
          return <span key={tag}>{content}</span>;
        })}
      </div>
    </div>
  );
}
