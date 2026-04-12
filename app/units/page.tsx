"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import NavBar from "../components/NavBar";
import ImageCropDialog from "../components/ImageCropDialog";
import { ASPECT_UNIT_COVER } from "../lib/imageCropTargets";

type UnitMemberPreview = {
  user_id: string;
  photo_url: string | null;
  label: string;
};

type Unit = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_url: string | null;
  type: string;
  member_count: number;
  created_at: string;
  my_role?: string;
  member_preview?: UnitMemberPreview[];
};

const UNIT_TYPES = [
  { value: "general", label: "General" },
  { value: "military_unit", label: "Military Unit" },
  { value: "alumni", label: "Alumni Group" },
  { value: "retirement", label: "Retirement" },
  { value: "interest", label: "Interest Group" },
  { value: "other", label: "Other" },
];

function typeLabel(type: string) {
  return UNIT_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** Case-insensitive substring match across name, type, type label, and description. */
function unitMatchesLocalFilter(unit: Unit, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    unit.name,
    unit.type,
    typeLabel(unit.type),
    unit.description ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export default function UnitsPage() {
  const { t, isDark } = useTheme();
  const router = useRouter();

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  /** Local-only filter for groups on this page (does not call the API). */
  const [groupFilter, setGroupFilter] = useState("");
  const [myUnits, setMyUnits] = useState<Unit[]>([]);
  const [myUnitsLoaded, setMyUnitsLoaded] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState("general");
  const [createDesc, setCreateDesc] = useState("");
  const [createCover, setCreateCover] = useState("");
  const [createCoverPreview, setCreateCoverPreview] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverCropOpen, setCoverCropOpen] = useState(false);
  const [coverCropSrc, setCoverCropSrc] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ── Admin inbox (pending join requests across all groups I own/admin) ──────
  type PendingGroup = { id: string; name: string; slug: string; cover_photo_url: string | null; pending_count: number };
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  // Which group's requests are open in the inline modal (slug)
  const [adminModalSlug, setAdminModalSlug] = useState<string | null>(null);
  type PendingMember = { user_id: string; display_name: string; photo_url: string | null; service: string | null; job_title: string | null; requested_at: string };
  const [adminModalPending, setAdminModalPending] = useState<PendingMember[]>([]);
  const [adminModalLoading, setAdminModalLoading] = useState(false);
  const [adminModalWorking, setAdminModalWorking] = useState<string | null>(null);

  async function loadPendingSummary(token: string) {
    try {
      const res = await fetch("/api/units/pending-summary", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setPendingGroups(json.groups ?? []);
      }
    } catch { /* non-fatal */ }
  }

  async function openAdminModal(slug: string) {
    setAdminModalSlug(slug);
    setAdminModalPending([]);
    setAdminModalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/units/${slug}/admin`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (res.ok) {
        const json = await res.json();
        setAdminModalPending(json.pending ?? []);
      }
    } finally {
      setAdminModalLoading(false);
    }
  }

  async function adminModalAction(slug: string, action: "approve_member" | "deny_member", userId: string) {
    setAdminModalWorking(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/units/${slug}/admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ action, user_id: userId }),
      });
      if (!res.ok) return;
      // Remove from local pending list
      setAdminModalPending((prev) => prev.filter((m) => m.user_id !== userId));
      // Decrement badge on the group card
      setPendingGroups((prev) =>
        prev.map((g) => g.slug === slug ? { ...g, pending_count: g.pending_count - 1 } : g)
            .filter((g) => g.pending_count > 0)
      );
    } finally {
      setAdminModalWorking(null);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) {
        loadMyUnits(uid);
        if (session?.access_token) loadPendingSummary(session.access_token);
      }
    });
    loadUnits();
  }, []);

  async function loadMyUnits(uid: string) {
    const { data: memberRows, error: membersError } = await supabase
      .from("unit_members")
      .select("unit_id, role, status")
      .eq("user_id", uid)
      .in("status", ["approved", "active"]);

    if (membersError) {
      console.error("My groups membership load error:", membersError);
      setMyUnits([]);
      setMyUnitsLoaded(true);
      return;
    }

    const members = (memberRows ?? []) as { unit_id: string; role: string; status: string }[];
    if (members.length === 0) {
      setMyUnits([]);
      setMyUnitsLoaded(true);
      return;
    }

    const roleByUnit = new Map<string, string>();
    members.forEach((m) => {
      // Prefer stronger role if duplicates exist.
      const prev = roleByUnit.get(m.unit_id);
      if (!prev) roleByUnit.set(m.unit_id, m.role);
      if (prev === "member" && (m.role === "admin" || m.role === "owner")) roleByUnit.set(m.unit_id, m.role);
      if (prev === "admin" && m.role === "owner") roleByUnit.set(m.unit_id, m.role);
    });

    const unitIds = Array.from(new Set(members.map((m) => m.unit_id)));
    const { data: unitsRows, error: unitsError } = await supabase
      .from("units")
      .select("id, name, slug, description, cover_photo_url, type, created_at")
      .in("id", unitIds);

    if (unitsError) {
      console.error("My groups units load error:", unitsError);
      setMyUnits([]);
      setMyUnitsLoaded(true);
      return;
    }

    const rows = (unitsRows ?? []) as Unit[];
    setMyUnits(
      rows
        .map((u) => ({ ...u, member_count: 0, my_role: roleByUnit.get(u.id) ?? "member" }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    );
    setMyUnitsLoaded(true);
  }

  async function loadUnits() {
    setLoading(true);
    try {
      const res = await fetch("/api/units");
      const json = await res.json();
      setUnits(json.units ?? []);
    } finally {
      setLoading(false);
    }
  }

  function closeCoverCrop() {
    if (coverCropSrc) URL.revokeObjectURL(coverCropSrc);
    setCoverCropSrc(null);
    setCoverCropOpen(false);
  }

  async function uploadCoverBlob(blob: Blob) {
    setUploadingCover(true);
    setCreateError(null);
    try {
      const file = new File([blob], "cover.jpg", { type: "image/jpeg" });
      const path = `unit-covers/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
      setCreateCover(data.publicUrl);
      setCreateCoverPreview(data.publicUrl);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  async function createUnit() {
    if (!createName.trim()) { setCreateError("Name is required"); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || null,
          type: createType,
          cover_photo_url: createCover.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create unit");
      setShowCreate(false);
      setCreateName("");
      setCreateType("general");
      setCreateDesc("");
      setCreateCover("");
      setCreateCoverPreview(null);
      router.push(`/units/${json.unit.slug}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create unit");
    } finally {
      setCreating(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    background: t.input,
    color: t.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const filteredUnits = useMemo(
    () => units.filter((u) => unitMatchesLocalFilter(u, groupFilter)),
    [units, groupFilter],
  );

  const filteredMyUnits = useMemo(
    () => myUnits.filter((u) => unitMatchesLocalFilter(u, groupFilter)),
    [myUnits, groupFilter],
  );

  const filterActive = groupFilter.trim().length > 0;
  const emptyDirectory = !loading && units.length === 0;
  const noFilterMatches =
    !loading && units.length > 0 && filterActive && filteredUnits.length === 0;

  const padX = { paddingLeft: "max(20px, env(safe-area-inset-left))", paddingRight: "max(20px, env(safe-area-inset-right))" } as const;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <ImageCropDialog
        open={coverCropOpen}
        imageSrc={coverCropSrc}
        aspect={ASPECT_UNIT_COVER}
        cropShape="rect"
        title="Crop group cover"
        onCancel={closeCoverCrop}
        onComplete={async (blob) => {
          await uploadCoverBlob(blob);
          closeCoverCrop();
        }}
      />
      {/* Full-width nav (not constrained by content max-width) */}
      <div
        style={{
          width: "100%",
          boxSizing: "border-box",
          paddingTop: 24,
          background: t.bg,
          ...padX,
        }}
      >
        <NavBar />
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 1800,
          margin: "0 auto",
          boxSizing: "border-box",
          paddingTop: 10,
          paddingBottom: 24,
          ...padX,
        }}
      >

        <div className="groups-page-shell">
        {/* Hero: first two grid tracks = intro + filter; last two = My Groups (900px+), aligned with directory below */}
        <div className="groups-page-grid groups-page-hero">
          <div className={`groups-top-left ${currentUserId ? "groups-page-span-2" : "groups-page-span-4"}`}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 28, fontWeight: 900 }}>Groups</div>
              <div style={{ fontSize: 14, color: t.textMuted, marginTop: 4, lineHeight: 1.5, maxWidth: 560 }}>
                <div style={{ fontWeight: 700, color: t.text, marginBottom: 3 }}>Your network, organized.</div>
                <div>
                  Create private units for current teams, alumni groups, organizations, or shared interests. Share updates, coordinate, and stay connected in a more focused space.
                </div>
                <div style={{ marginTop: 3 }}>
                  Relevant activity from your units will also surface in your feed.
                </div>
              </div>
            </div>

            {/* Local filter + create — unchanged behavior, full width of left column */}
            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, letterSpacing: 0.4, marginBottom: 6, textTransform: "uppercase" }}>
                On this page
              </div>
              <div
                className="units-filter-combo-bar"
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "nowrap",
                  gap: 8,
                  boxSizing: "border-box",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
                  borderRadius: 10,
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                  padding: "6px 8px 6px 11px",
                  minWidth: 0,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.textFaint} strokeWidth="2.2" strokeLinecap="round" aria-hidden style={{ flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
                </svg>
                <input
                  type="text"
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  placeholder="Find a unit…"
                  aria-label="Filter groups on this page"
                  style={{ border: "none", outline: "none", fontSize: 14, flex: "1 1 120px", minWidth: 0, background: "transparent", color: t.text }}
                />
                {filterActive && (
                  <button
                    type="button"
                    aria-label="Clear filter"
                    onClick={() => setGroupFilter("")}
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      border: "none",
                      borderRadius: 8,
                      background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                      color: t.textMuted,
                      fontSize: 16,
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
                )}
                {currentUserId && (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    style={{
                      flexShrink: 0,
                      marginLeft: "auto",
                      background: "#111",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    + Create Group
                  </button>
                )}
              </div>
            </div>
          </div>

          {currentUserId && (
            <aside className="groups-top-right groups-page-span-2" aria-label="Your groups">
              <div
                className="groups-my-panel"
                style={{
                  minHeight: 0,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  height: "100%",
                  boxSizing: "border-box",
                  padding: 0,
                  background: "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: t.text, letterSpacing: -0.2 }}>My Groups</div>
                  {myUnitsLoaded && myUnits.length > 0 && (
                    <a
                      href="#groups-directory"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: t.textFaint,
                        textDecoration: "none",
                        flexShrink: 0,
                      }}
                    >
                      View all
                    </a>
                  )}
                </div>

                {!myUnitsLoaded && (
                  <div style={{ fontSize: 12, color: t.textMuted, padding: "4px 0 8px" }}>Loading…</div>
                )}

                {myUnitsLoaded && myUnits.length === 0 && (
                  <div style={{ padding: "2px 0 4px" }}>
                    <div style={{ fontSize: 13, color: t.text, fontWeight: 600, lineHeight: 1.4 }}>
                      You haven&apos;t joined any groups yet.
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                      Explore groups below.
                    </div>
                  </div>
                )}

                {myUnitsLoaded && myUnits.length > 0 && filteredMyUnits.length === 0 && filterActive && (
                  <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.45, paddingBottom: 4 }}>No groups match that filter.</div>
                )}

                {myUnitsLoaded && myUnits.length > 0 && filteredMyUnits.length > 0 && (
                  <div className="groups-my-panel-scroller">
                    {filteredMyUnits.map((u) => {
                      const initial = u.name.trim().charAt(0).toUpperCase() || "?";
                      return (
                        <a key={u.id} href={`/units/${u.slug}`} className="groups-mini-tile" title={u.name}>
                          <div
                            style={{
                              width: 95,
                              height: 95,
                              margin: "0 auto",
                              borderRadius: 18,
                              overflow: "hidden",
                              background: t.bg,
                              border: `1px solid ${t.border}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {u.cover_photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element -- tiny thumbnail
                              <img src={u.cover_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            ) : (
                              <span style={{ fontSize: 28, fontWeight: 800, color: t.textFaint }}>{initial}</span>
                            )}
                          </div>
                          <div
                            style={{
                              marginTop: 10,
                              fontSize: 14,
                              fontWeight: 700,
                              lineHeight: 1.25,
                              color: t.text,
                              textAlign: "center",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              wordBreak: "break-word",
                            }}
                          >
                            {u.name}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* ── Admin Inbox: pending join requests across all groups I own/admin ── */}
        {pendingGroups.length > 0 && (
          <div style={{ margin: "16px 0 8px", border: `1px solid ${isDark ? "rgba(251,191,36,0.25)" : "rgba(180,130,0,0.2)"}`, borderRadius: 14, background: isDark ? "rgba(251,191,36,0.05)" : "rgba(251,191,36,0.06)", padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>🪖</span>
              <span style={{ fontWeight: 900, fontSize: 14, color: t.text }}>Group Requests</span>
              <span style={{ background: "#f97316", color: "#fff", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>
                {pendingGroups.reduce((s, g) => s + g.pending_count, 0)} pending
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendingGroups.map((g) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: isDark ? "#1a1a2e" : "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {g.cover_photo_url
                      ? <img src={g.cover_photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <span style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{g.name.charAt(0).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: t.textMuted }}>{g.pending_count} {g.pending_count === 1 ? "request" : "requests"} waiting</div>
                  </div>
                  <button
                    onClick={() => openAdminModal(g.slug)}
                    style={{ flexShrink: 0, background: "#111", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ color: t.textMuted, textAlign: "center", padding: 40, fontSize: 15 }}>Loading...</div>
        )}

        {/* Filter matched nothing (directory has units) */}
        {noFilterMatches && (
          <div style={{ textAlign: "center", padding: "28px 16px", marginBottom: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 6 }}>No groups match that filter.</div>
            <div style={{ color: t.textMuted, fontSize: 14, marginBottom: 20 }}>
              Try a different word, clear the filter, or create a new unit.
            </div>
            {filterActive && groupFilter.trim().length >= 2 && currentUserId && (
              <button
                type="button"
                onClick={() => { setCreateName(groupFilter.trim()); setShowCreate(true); }}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                Create &ldquo;{groupFilter.trim()}&rdquo;
              </button>
            )}
          </div>
        )}

        {/* Empty directory (no units in system) */}
        {emptyDirectory && (
          <div style={{ color: t.textMuted, textAlign: "center", padding: 36, fontSize: 15 }}>
            No units yet. Be the first to create one.
          </div>
        )}

        {/* Main groups directory — same 4-column template as hero (900px+) */}
        {!loading && filteredUnits.length > 0 && (
          <div id="groups-directory" className="groups-page-grid" style={{ scrollMarginTop: 72 }}>
            {filterActive && (
              <div className="groups-page-grid-full-row" style={{ fontSize: 13, color: t.textFaint, fontWeight: 600, marginBottom: 0 }}>
                Showing {filteredUnits.length} {filteredUnits.length === 1 ? "group" : "groups"}
              </div>
            )}
            {filteredUnits.map((unit) => (
              <div
                key={unit.id}
                onClick={() => router.push(`/units/${unit.slug}`)}
                className="unit-card-split"
                style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, cursor: "pointer", transition: "box-shadow 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.12)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <div
                  className="unit-card-cover-col"
                  style={{ background: unit.cover_photo_url ? undefined : (isDark ? "#1a1a2e" : "#1e3a5f") }}
                >
                  {unit.cover_photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- listing card thumbnail
                    <img src={unit.cover_photo_url} alt="" />
                  ) : null}
                </div>
                <div className="unit-card-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        alignSelf: "flex-start",
                        background: isDark ? "#1a1a2e" : "#dbeafe",
                        color: isDark ? "#93c5fd" : "#1d4ed8",
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "3px 8px",
                        borderRadius: 20,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      {typeLabel(unit.type)}
                    </span>
                    <div className="unit-card-title" style={{ fontWeight: 900, fontSize: 16, color: t.text, lineHeight: 1.25 }}>{unit.name}</div>
                    {unit.description && (
                      <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {unit.description}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: 12,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <div style={{ fontSize: 12, color: t.textFaint, fontWeight: 700 }}>
                      {unit.member_count} {unit.member_count === 1 ? "member" : "members"}
                    </div>
                    {unit.member_preview && unit.member_preview.length > 0 && (
                      <div
                        style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, flexWrap: "wrap" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {unit.member_preview.map((m, idx) => {
                            const initial = (m.label.trim().charAt(0) || "U").toUpperCase();
                            return (
                              <a
                                key={m.user_id}
                                href={`/profile/${m.user_id}`}
                                title={m.label}
                                style={{
                                  width: 26,
                                  height: 26,
                                  marginLeft: idx === 0 ? 0 : -8,
                                  borderRadius: "50%",
                                  border: `2px solid ${t.surface}`,
                                  overflow: "hidden",
                                  background: t.badgeBg,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: t.textMuted,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                {m.photo_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element -- small avatar thumb
                                  <img src={m.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  initial
                                )}
                              </a>
                            );
                          })}
                        </div>
                        {unit.member_count > unit.member_preview.length && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>
                            +{unit.member_count - unit.member_preview.length}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>

      </div>

      {/* Create Unit Modal */}
      {showCreate && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}
        >
          <div style={{ background: t.surface, borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, border: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 20 }}>Create a Unit</div>

            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Unit Name *</label>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createUnit()}
                  placeholder="e.g. 795th OD Company Alumni"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Type</label>
                <select value={createType} onChange={(e) => setCreateType(e.target.value)} style={{ ...inputStyle }}>
                  {UNIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Description</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="What's this unit about?"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 8 }}>Cover Photo <span style={{ fontWeight: 400 }}>(optional)</span></label>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (!f.type.startsWith("image/")) {
                      setCreateError("Please choose an image file.");
                      return;
                    }
                    if (f.size > 8 * 1024 * 1024) {
                      setCreateError("Cover image must be under 8 MB.");
                      return;
                    }
                    if (coverCropSrc) URL.revokeObjectURL(coverCropSrc);
                    setCoverCropSrc(URL.createObjectURL(f));
                    setCoverCropOpen(true);
                  }}
                />
                {createCoverPreview ? (
                  <div style={{ position: "relative", display: "inline-block", width: "100%", maxWidth: 200 }}>
                    <img src={createCoverPreview} alt="Cover" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 10, display: "block" }} />
                    <button
                      onClick={() => { setCreateCover(""); setCreateCoverPreview(null); if (coverInputRef.current) coverInputRef.current.value = ""; }}
                      style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    style={{ background: t.badgeBg, color: t.text, border: `1px dashed ${t.border}`, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    {uploadingCover && <span className="btn-spinner btn-spinner-dark" />}
                    📷  Add Cover Photo
                  </button>
                )}
              </div>

              {createError && (
                <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>{createError}</div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button onClick={() => setShowCreate(false)} style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={createUnit} disabled={creating} style={{ background: creating ? t.badgeBg : "#111", color: creating ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: creating ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  {creating && <span className="btn-spinner btn-spinner-dark" />}
                  Create Unit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Inbox Modal: pending requests for a specific group ── */}
      {adminModalSlug && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setAdminModalSlug(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}
        >
          <div style={{ background: t.surface, borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, border: `1px solid ${t.border}`, maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>
                  {pendingGroups.find((g) => g.slug === adminModalSlug)?.name ?? "Group"}
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Join Requests</div>
              </div>
              <button onClick={() => setAdminModalSlug(null)} style={{ background: "transparent", border: "none", color: t.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 4 }}>×</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {adminModalLoading && (
                <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "32px 0" }}>Loading…</div>
              )}
              {!adminModalLoading && adminModalPending.length === 0 && (
                <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "32px 0" }}>No pending requests.</div>
              )}
              {!adminModalLoading && adminModalPending.map((p) => (
                <div key={p.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${t.borderLight}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: t.badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: t.textMuted }}>
                    {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : p.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{p.display_name}</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>{[p.service, p.job_title].filter(Boolean).join(" · ") || "EOD Professional"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      disabled={adminModalWorking === p.user_id}
                      onClick={() => adminModalAction(adminModalSlug, "approve_member", p.user_id)}
                      style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                    >
                      {adminModalWorking === p.user_id && <span className="btn-spinner" />}
                      Approve
                    </button>
                    <button
                      disabled={adminModalWorking === p.user_id}
                      onClick={() => adminModalAction(adminModalSlug, "deny_member", p.user_id)}
                      style={{ background: "transparent", color: "#dc2626", border: "1px solid #dc2626", borderRadius: 8, padding: "6px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.borderLight}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <a href={`/units/${adminModalSlug}/admin`} style={{ fontSize: 12, color: t.textMuted, textDecoration: "none", fontWeight: 700 }}>
                Full admin page →
              </a>
              <button onClick={() => setAdminModalSlug(null)} style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 10, padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
