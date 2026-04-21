"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { useMasterShell } from "../../components/master/masterShellContext";
import CandidateResumeModal from "./components/CandidateResumeModal";
import {
  PUBLIC_CANDIDATE_COLUMNS,
  type EmployerAction,
  type EmployerTab,
  type PublicCandidate,
} from "./lib/types";
import {
  candidateAllTags,
  candidateDisplayName,
  candidateInitial,
  candidateLocation,
  candidateMatchesFilters,
  collectFilterOptions,
  EMPTY_FILTERS,
  type CandidateFilters,
} from "./lib/candidateUtils";

type AccessState = "loading" | "not_logged_in" | "not_permitted" | "ok";

type ActionPatch = Partial<Pick<EmployerAction, "is_saved" | "is_interested" | "is_hidden" | "notes">>;

export default function EmployerDashboardClient() {
  const { t } = useTheme();
  const { openSidebarPeer, isDesktopShell } = useMasterShell();

  const [access, setAccess] = useState<AccessState>("loading");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PublicCandidate[]>([]);
  const [actions, setActions] = useState<Record<string, EmployerAction>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionsWarning, setActionsWarning] = useState<string | null>(null);

  const [tab, setTab] = useState<EmployerTab>("all");
  const [filters, setFilters] = useState<CandidateFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<PublicCandidate | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  /* ────────────────────────────────────────────────────────────────────────
   * Access check: employer accounts + admins (QA override) may see this page.
   * Members and non-authed users get a friendly redirect/message.
   * ──────────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setAccess("not_logged_in");
        return;
      }
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.account_type === "employer" || profile?.is_admin) {
        setAccess("ok");
      } else {
        setAccess("not_permitted");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ────────────────────────────────────────────────────────────────────────
   * Data load: candidates + this employer's private annotations. Merged
   * client-side per the spec (simpler, easier to reason about, and lets
   * tabs stay instant after the first load).
   * ──────────────────────────────────────────────────────────────────────── */
  const loadData = useCallback(async (employerId: string) => {
    setLoadingData(true);
    setLoadError(null);
    setActionsWarning(null);
    const [{ data: candRows, error: candErr }, { data: actRows, error: actErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select(PUBLIC_CANDIDATE_COLUMNS.join(","))
        .eq("open_to_opportunities", true)
        .neq("user_id", employerId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("employer_user_actions")
        .select("*")
        .eq("employer_id", employerId),
    ]);

    if (candErr) {
      setLoadError(candErr.message);
      setLoadingData(false);
      return;
    }
    if (actErr) {
      // non-fatal — we can still show candidates without annotation state
      const isMissingTable =
        actErr.code === "42P01" ||
        (actErr.message ?? "").toLowerCase().includes("employer_user_actions");
      if (isMissingTable) {
        setActionsWarning("Employer actions table is not available yet. Run latest Supabase migrations to enable save/interested/hide/notes.");
      } else {
        setActionsWarning("Candidate list loaded, but private employer actions failed to load.");
      }
      // Keep this as a warning so local dev does not throw the red error overlay.
      console.warn("employer_user_actions load warning:", actErr);
    }

    setCandidates((candRows ?? []) as unknown as PublicCandidate[]);
    const byTarget: Record<string, EmployerAction> = {};
    for (const row of (actRows ?? []) as EmployerAction[]) {
      byTarget[row.target_user_id] = row;
    }
    setActions(byTarget);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (access !== "ok" || !currentUserId) return;
    void loadData(currentUserId);
  }, [access, currentUserId, loadData]);

  /* ────────────────────────────────────────────────────────────────────────
   * Upsert an employer_user_actions row. Optimistic UI: patch local state
   * immediately, then reconcile with the server response.
   * ──────────────────────────────────────────────────────────────────────── */
  const applyAction = useCallback(
    async (targetUserId: string, patch: ActionPatch) => {
      if (!currentUserId) return;
      setBusyAction(targetUserId);

      const existing = actions[targetUserId];
      const optimistic: EmployerAction = {
        id: existing?.id ?? `tmp-${targetUserId}`,
        employer_id: currentUserId,
        target_user_id: targetUserId,
        is_saved: existing?.is_saved ?? false,
        is_interested: existing?.is_interested ?? false,
        is_hidden: existing?.is_hidden ?? false,
        notes: existing?.notes ?? null,
        last_interaction_at: new Date().toISOString(),
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...patch,
      };
      setActions((prev) => ({ ...prev, [targetUserId]: optimistic }));

      const upsertPayload = {
        employer_id: currentUserId,
        target_user_id: targetUserId,
        is_saved: optimistic.is_saved,
        is_interested: optimistic.is_interested,
        is_hidden: optimistic.is_hidden,
        notes: optimistic.notes,
        last_interaction_at: optimistic.last_interaction_at,
      };

      const { data, error } = await supabase
        .from("employer_user_actions")
        .upsert(upsertPayload, { onConflict: "employer_id,target_user_id" })
        .select("*")
        .single();

      if (error) {
        const isMissingTable =
          error.code === "42P01" ||
          (error.message ?? "").toLowerCase().includes("employer_user_actions");
        setActionsWarning(
          isMissingTable
            ? "Employer actions table is missing. Run latest Supabase migrations, then refresh."
            : "Could not save employer action. Please retry.",
        );
        console.warn("employer_user_actions upsert warning:", error);
        // Roll back to previous state on failure
        setActions((prev) => {
          const next = { ...prev };
          if (existing) next[targetUserId] = existing;
          else delete next[targetUserId];
          return next;
        });
      } else if (data) {
        setActions((prev) => ({ ...prev, [targetUserId]: data as EmployerAction }));
      }
      setBusyAction(null);
    },
    [actions, currentUserId],
  );

  const toggleSaved = useCallback(
    (targetUserId: string) => {
      const cur = actions[targetUserId];
      return applyAction(targetUserId, { is_saved: !(cur?.is_saved ?? false) });
    },
    [actions, applyAction],
  );

  const toggleInterested = useCallback(
    (targetUserId: string) => {
      const cur = actions[targetUserId];
      return applyAction(targetUserId, { is_interested: !(cur?.is_interested ?? false) });
    },
    [actions, applyAction],
  );

  const toggleHidden = useCallback(
    (targetUserId: string) => {
      const cur = actions[targetUserId];
      return applyAction(targetUserId, { is_hidden: !(cur?.is_hidden ?? false) });
    },
    [actions, applyAction],
  );

  const saveNotes = useCallback(
    (targetUserId: string, notes: string) => {
      return applyAction(targetUserId, { notes: notes.trim() ? notes : null });
    },
    [applyAction],
  );

  /* ────────────────────────────────────────────────────────────────────────
   * Message button — reuses the global sidebar drawer on desktop, falls
   * back to the existing /sidebar page on mobile.
   * ──────────────────────────────────────────────────────────────────────── */
  const messageCandidate = useCallback(
    async (targetUserId: string) => {
      // Mark a light "last_interaction_at" bump so the dashboard can surface
      // recently-contacted candidates later if desired.
      await applyAction(targetUserId, {});
      if (isDesktopShell) {
        openSidebarPeer(targetUserId);
      } else {
        window.location.href = `/sidebar?peer=${targetUserId}`;
      }
    },
    [applyAction, isDesktopShell, openSidebarPeer],
  );

  /* ────────────────────────────────────────────────────────────────────────
   * Derived lists: apply tab + filter combo.
   * ──────────────────────────────────────────────────────────────────────── */
  const { filtered, counts } = useMemo(() => {
    const withAction = candidates.map((c) => ({ c, a: actions[c.user_id] }));

    const byTab: Record<EmployerTab, typeof withAction> = {
      all: withAction.filter(({ a }) => !a?.is_hidden),
      saved: withAction.filter(({ a }) => !!a?.is_saved && !a?.is_hidden),
      interested: withAction.filter(({ a }) => !!a?.is_interested && !a?.is_hidden),
      hidden: withAction.filter(({ a }) => !!a?.is_hidden),
    };

    const matches = byTab[tab].filter(({ c }) => candidateMatchesFilters(c, filters));

    return {
      filtered: matches,
      counts: {
        all: byTab.all.length,
        saved: byTab.saved.length,
        interested: byTab.interested.length,
        hidden: byTab.hidden.length,
      },
    };
  }, [candidates, actions, tab, filters]);

  const filterOptions = useMemo(() => collectFilterOptions(candidates), [candidates]);
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== "search" && v).length;

  /* ────────────────────────────────────────────────────────────────────────
   * Access gate
   * ──────────────────────────────────────────────────────────────────────── */
  if (access === "loading") {
    return (
      <div style={{ padding: 40, color: t.textMuted }}>Loading employer dashboard…</div>
    );
  }
  if (access === "not_logged_in") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  if (access === "not_permitted") {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", padding: "24px", textAlign: "center", color: t.text }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Employer or admin access required</h1>
        <p style={{ color: t.textMuted, fontSize: 14, lineHeight: 1.5 }}>
          The Employer Dashboard is available to verified employer accounts and designated admins for QA.
          If you think this is a mistake, contact support from your account page.
        </p>
        <a
          href="/profile"
          style={{ display: "inline-block", marginTop: 16, background: t.text, color: t.surface, padding: "8px 16px", borderRadius: 10, textDecoration: "none", fontWeight: 700, fontSize: 14 }}
        >
          Back to my account
        </a>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────────────
   * Main dashboard UI
   * ──────────────────────────────────────────────────────────────────────── */
  const tabs: { id: EmployerTab; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "saved", label: "Saved", count: counts.saved },
    { id: "interested", label: "Interested", count: counts.interested },
    { id: "hidden", label: "Hidden", count: counts.hidden },
  ];

  return (
    <div style={{ width: "100%", maxWidth: "100%", margin: 0, padding: "12px 4px 40px", color: t.text }}>
      <header style={{ padding: "4px 4px 14px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Employer Dashboard</h1>
        <p style={{ color: t.textMuted, fontSize: 13, marginTop: 6, lineHeight: 1.5, maxWidth: 640 }}>
          Browse EOD professionals who are open to opportunities. Save, annotate,
          and message candidates — your actions are private to your employer account.
        </p>
      </header>

      {/* Search + filter toggle */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ flex: "1 1 280px", display: "flex", alignItems: "center", border: `1px solid ${t.inputBorder}`, borderRadius: 10, background: t.input, padding: "0 12px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="22" y2="22" />
          </svg>
          <input
            type="text"
            placeholder="Search name, bio, role, service, tags, resume…"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: t.text,
              fontSize: 14,
              height: 38,
              padding: "0 8px",
            }}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
              style={{ background: "transparent", border: "none", color: t.textFaint, cursor: "pointer", fontSize: 16 }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          style={{
            height: 40,
            padding: "0 14px",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: showFilters ? t.surfaceHover : t.surface,
            color: t.text,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
        </button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div
          style={{
            border: `1px solid ${t.border}`,
            background: t.surface,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          }}
        >
          <SelectFilter
            label="Service / Branch"
            value={filters.service}
            onChange={(v) => setFilters((prev) => ({ ...prev, service: v }))}
            options={filterOptions.services}
            t={t}
          />
          <SelectFilter
            label="Years experience"
            value={filters.yearsExperience}
            onChange={(v) => setFilters((prev) => ({ ...prev, yearsExperience: v }))}
            options={filterOptions.years}
            t={t}
          />
          <SelectFilter
            label="Tag / Tech / Qualification"
            value={filters.tag}
            onChange={(v) => setFilters((prev) => ({ ...prev, tag: v }))}
            options={filterOptions.tags}
            t={t}
          />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Location (city or state)
            </div>
            <input
              type="text"
              value={filters.location}
              onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
              placeholder="e.g. Virginia"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 34,
                padding: "0 10px",
                border: `1px solid ${t.inputBorder}`,
                background: t.input,
                color: t.text,
                borderRadius: 8,
                fontSize: 13,
              }}
            />
          </div>
          <SelectFilter
            label="Clearance"
            value={filters.clearance}
            onChange={(v) => setFilters((prev) => ({ ...prev, clearance: v }))}
            options={["Secret", "Top Secret", "TS/SCI", "None"]}
            t={t}
          />
          {activeFilterCount > 0 && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...EMPTY_FILTERS, search: prev.search }))}
                style={{
                  height: 34,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: t.bg,
                  color: t.text,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Employer dashboard tabs"
        style={{ display: "flex", gap: 4, borderBottom: `1px solid ${t.border}`, marginBottom: 14, flexWrap: "wrap" }}
      >
        {tabs.map(({ id, label, count }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              style={{
                appearance: "none",
                background: active ? t.surface : "transparent",
                border: "none",
                borderBottom: active ? `2px solid ${t.text}` : "2px solid transparent",
                color: active ? t.text : t.textMuted,
                fontWeight: 800,
                fontSize: 14,
                padding: "10px 14px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {label}
              <span
                style={{
                  background: t.badgeBg,
                  color: t.badgeText,
                  borderRadius: 999,
                  padding: "1px 7px",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results */}
      {loadingData && (
        <div style={{ color: t.textMuted, padding: "20px 4px" }}>Loading candidates…</div>
      )}
      {loadError && (
        <div style={{ color: "#dc2626", padding: "10px 4px" }}>Failed to load: {loadError}</div>
      )}
      {actionsWarning && (
        <div style={{ color: "#92400e", background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 13 }}>
          {actionsWarning}
        </div>
      )}
      {!loadingData && !loadError && filtered.length === 0 && (
        <div
          style={{
            border: `1px dashed ${t.border}`,
            borderRadius: 12,
            padding: "28px 18px",
            textAlign: "center",
            color: t.textMuted,
            fontSize: 14,
          }}
        >
          {tab === "all" && "No open candidates match your search."}
          {tab === "saved" && "You haven't saved any candidates yet."}
          {tab === "interested" && "You haven't marked any candidates as interested yet."}
          {tab === "hidden" && "No hidden candidates."}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        }}
      >
        {filtered.map(({ c, a }) => (
          <CandidateCard
            key={c.user_id}
            candidate={c}
            action={a}
            busy={busyAction === c.user_id}
            onViewResume={() => setResumeTarget(c)}
            onToggleSaved={() => toggleSaved(c.user_id)}
            onToggleInterested={() => toggleInterested(c.user_id)}
            onToggleHidden={() => toggleHidden(c.user_id)}
            onMessage={() => messageCandidate(c.user_id)}
          />
        ))}
      </div>

      {resumeTarget && currentUserId && (
        <CandidateResumeModal
          candidate={resumeTarget}
          initialNotes={actions[resumeTarget.user_id]?.notes ?? ""}
          onClose={() => setResumeTarget(null)}
          onSaveNotes={(notes) => saveNotes(resumeTarget.user_id, notes)}
          onMessage={() => messageCandidate(resumeTarget.user_id)}
          onToggleSaved={() => toggleSaved(resumeTarget.user_id)}
          onToggleInterested={() => toggleInterested(resumeTarget.user_id)}
          isSaved={!!actions[resumeTarget.user_id]?.is_saved}
          isInterested={!!actions[resumeTarget.user_id]?.is_interested}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Card — public front-of-card view only. Styling mirrors the app's existing
 * surface/border/badge language (see groups list, profile snapshot cards).
 * ────────────────────────────────────────────────────────────────────────── */
function CandidateCard({
  candidate,
  action,
  busy,
  onViewResume,
  onToggleSaved,
  onToggleInterested,
  onToggleHidden,
  onMessage,
}: {
  candidate: PublicCandidate;
  action: EmployerAction | undefined;
  busy: boolean;
  onViewResume: () => void;
  onToggleSaved: () => void;
  onToggleInterested: () => void;
  onToggleHidden: () => void;
  onMessage: () => void;
}) {
  const { t } = useTheme();
  const name = candidateDisplayName(candidate);
  const initial = candidateInitial(candidate);
  const location = candidateLocation(candidate);
  const tags = candidateAllTags(candidate).slice(0, 6);

  const isSaved = !!action?.is_saved;
  const isInterested = !!action?.is_interested;
  const isHidden = !!action?.is_hidden;

  const chipBase: React.CSSProperties = {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 700,
    border: "none",
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.7 : 1,
  };

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        background: t.surface,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Top row: avatar + name + open badge */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: t.text,
            color: t.surface,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 20,
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <a
              href={`/profile/${candidate.user_id}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: t.text,
                textDecoration: "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {name}
            </a>
            <span
              style={{
                background: "#dcfce7",
                color: "#15803d",
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                flexShrink: 0,
              }}
            >
              Open
            </span>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
            {[candidate.role, candidate.service].filter(Boolean).join(" · ") || "EOD Professional"}
          </div>
          <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
            {[candidate.years_experience, candidate.status, location].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      {/* Bio snippet */}
      {candidate.bio?.trim() && (
        <div
          style={{
            fontSize: 12,
            color: t.textMuted,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {candidate.bio}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                background: t.badgeBg,
                color: t.badgeText,
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Annotation state row (saved/interested visible on saved tab too) */}
      {(isSaved || isInterested) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {isSaved && (
            <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
              ★ Saved
            </span>
          )}
          {isInterested && (
            <span style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}>
              ✓ Interested
            </span>
          )}
          {action?.notes?.trim() && (
            <span
              title={action.notes}
              style={{ background: t.badgeBg, color: t.badgeText, borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}
            >
              📝 Note
            </span>
          )}
        </div>
      )}

      {/* Actions row */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
        <button
          type="button"
          onClick={onViewResume}
          style={{ ...chipBase, background: "#111", color: "white" }}
        >
          View Resume
        </button>
        <button
          type="button"
          onClick={onMessage}
          style={{ ...chipBase, background: t.bg, color: t.text, border: `1px solid ${t.border}` }}
        >
          Message
        </button>
        <button
          type="button"
          onClick={onToggleSaved}
          style={{
            ...chipBase,
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
            ...chipBase,
            background: isInterested ? "#dcfce7" : t.badgeBg,
            color: isInterested ? "#15803d" : t.badgeText,
          }}
        >
          {isInterested ? "✓ Interested" : "+ Interested"}
        </button>
        <button
          type="button"
          onClick={onToggleHidden}
          title={isHidden ? "Unhide" : "Hide from All"}
          style={{
            ...chipBase,
            marginLeft: "auto",
            background: t.bg,
            color: t.textMuted,
            border: `1px solid ${t.border}`,
          }}
        >
          {isHidden ? "Unhide" : "Hide"}
        </button>
      </div>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options,
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 34,
          padding: "0 10px",
          border: `1px solid ${t.inputBorder}`,
          background: t.input,
          color: t.text,
          borderRadius: 8,
          fontSize: 13,
          appearance: "auto",
        }}
      >
        <option value="">Any</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
