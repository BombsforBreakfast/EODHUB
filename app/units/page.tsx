"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import NavBar from "../components/NavBar";

type Unit = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_url: string | null;
  type: string;
  member_count: number;
  created_at: string;
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

export default function UnitsPage() {
  const { t, isDark } = useTheme();
  const router = useRouter();

  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [showMyUnits, setShowMyUnits] = useState(false);
  const [myUnits, setMyUnits] = useState<Unit[]>([]);
  const [myUnitsLoaded, setMyUnitsLoaded] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) loadMyUnits(uid);
    });
    loadUnits("");
  }, []);

  async function loadMyUnits(uid: string) {
    const { data } = await supabase
      .from("unit_members")
      .select("units(id, name, slug, description, cover_photo_url, type, created_at)")
      .eq("user_id", uid)
      .eq("status", "approved");
    if (data) {
      setMyUnits(
        (data as { units: Unit | null }[])
          .map((r) => r.units)
          .filter((u): u is Unit => u !== null)
          .map((u) => ({ ...u, member_count: 0 }))
      );
    }
    setMyUnitsLoaded(true);
  }

  async function loadUnits(q: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/units?${params}`);
      const json = await res.json();
      setUnits(json.units ?? []);
      setSearched(json.searched ?? "");
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => loadUnits(value), 350);
  }

  async function handleCoverPhotoSelect(file: File) {
    setUploadingCover(true);
    setCreateError(null);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `unit-covers/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.${ext}`;
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

  const noResults = !loading && units.length === 0;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
        <NavBar />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>Units</div>
            <div style={{ fontSize: 14, color: t.textMuted, marginTop: 2 }}>
              Private Communities and Groups
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {currentUserId && myUnitsLoaded && myUnits.length > 0 && (
              <button
                onClick={() => setShowMyUnits((v) => !v)}
                style={{ background: showMyUnits ? "#111" : t.badgeBg, color: showMyUnits ? "#fff" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                My Units {showMyUnits ? "✕" : `(${myUnits.length})`}
              </button>
            )}
            {currentUserId && (
              <button
                onClick={() => setShowCreate(true)}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                + Create Unit
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBorder}`, borderRadius: 10, background: t.input, padding: "8px 14px", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="22" y2="22" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search units..."
              style={{ border: "none", outline: "none", fontSize: 15, width: "100%", background: "transparent", color: t.text }}
            />
          </div>
        </div>

        {/* My Units panel */}
        {showMyUnits && (
          <div style={{ marginBottom: 24, border: `1px solid ${t.border}`, borderRadius: 14, padding: 20, background: t.surface }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 14 }}>My Units</div>
            <div style={{ display: "grid", gap: 10 }}>
              {myUnits.map((u) => (
                <a key={u.id} href={`/units/${u.slug}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: `1px solid ${t.border}`, borderRadius: 12, textDecoration: "none", color: t.text, background: t.bg }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: u.cover_photo_url ? `url(${u.cover_photo_url}) center/cover` : "#1e3a5f", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, textTransform: "capitalize" }}>{u.type.replace(/_/g, " ")}</div>
                  </div>
                  <span style={{ fontSize: 18, color: t.textFaint }}>›</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ color: t.textMuted, textAlign: "center", padding: 40, fontSize: 15 }}>Loading...</div>
        )}

        {/* No results — "create it?" card */}
        {noResults && searched.length >= 2 && (
          <div style={{ border: `2px dashed ${t.border}`, borderRadius: 16, padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
              No unit found for &ldquo;{searched}&rdquo;
            </div>
            <div style={{ color: t.textMuted, fontSize: 14, marginBottom: 20 }}>
              Looks like this unit doesn&apos;t exist yet. Be the first to build it.
            </div>
            {currentUserId ? (
              <button
                onClick={() => { setCreateName(searched); setShowCreate(true); }}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
              >
                Create &ldquo;{searched}&rdquo;
              </button>
            ) : (
              <a href="/login" style={{ display: "inline-block", background: "#111", color: "#fff", textDecoration: "none", borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14 }}>
                Log in to create this unit
              </a>
            )}
          </div>
        )}

        {noResults && searched.length < 2 && (
          <div style={{ color: t.textMuted, textAlign: "center", padding: 40, fontSize: 15 }}>
            No units yet. Be the first to create one.
          </div>
        )}

        {/* Units grid */}
        {!loading && units.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {units.map((unit) => (
              <div
                key={unit.id}
                onClick={() => router.push(`/units/${unit.slug}`)}
                style={{ border: `1px solid ${t.border}`, borderRadius: 16, overflow: "hidden", background: t.surface, cursor: "pointer", transition: "box-shadow 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.12)")}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                {/* Cover */}
                <div style={{ height: 80, background: unit.cover_photo_url ? `url(${unit.cover_photo_url}) center/cover` : (isDark ? "#1a1a2e" : "#1e3a5f"), display: "flex", alignItems: "flex-end", padding: "0 16px 10px" }}>
                  <span style={{ background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {typeLabel(unit.type)}
                  </span>
                </div>

                <div style={{ padding: 16 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>{unit.name}</div>
                  {unit.description && (
                    <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {unit.description}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: t.textFaint, fontWeight: 700 }}>
                    {unit.member_count} {unit.member_count === 1 ? "member" : "members"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverPhotoSelect(f); }}
                />
                {createCoverPreview ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img src={createCoverPreview} alt="Cover" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 10 }} />
                    <button
                      onClick={() => { setCreateCover(""); setCreateCoverPreview(null); if (coverInputRef.current) coverInputRef.current.value = ""; }}
                      style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    style={{ background: t.badgeBg, color: t.text, border: `1px dashed ${t.border}`, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%" }}
                  >
                    {uploadingCover ? "Uploading..." : "📷  Add Cover Photo"}
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
                <button onClick={createUnit} disabled={creating} style={{ background: creating ? t.badgeBg : "#111", color: creating ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: creating ? "not-allowed" : "pointer" }}>
                  {creating ? "Creating..." : "Create Unit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
