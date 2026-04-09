"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import ImageCropDialog from "../components/ImageCropDialog";
import { ASPECT_AVATAR } from "../lib/imageCropTargets";

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada",
  "New Hampshire","New Jersey","New Mexico","New York","North Carolina",
  "North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island",
  "South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont",
  "Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

const OVERSEAS_LOCATIONS = [
  "Germany","Guam","Japan","Puerto Rico","Sinai","South Korea",
];

const ORG_TYPES = ["Army","Navy","Marines","Air Force","LEO","Federal","Fire","Other"];

const ORG_COLORS: Record<string, { bg: string }> = {
  "Army":       { bg: "#4d7c0f" },
  "Navy":       { bg: "#1e40af" },
  "Marines":    { bg: "#991b1b" },
  "Air Force":  { bg: "#1d4ed8" },
  "LEO":        { bg: "#374151" },
  "Federal":    { bg: "#7c3aed" },
  "Fire":       { bg: "#dc2626" },
  "Other":      { bg: "#92400e" },
};

type DirectoryEntry = {
  id: string;
  org_type: string;
  name: string;
  phone: string | null;
  state: string | null;
  unit_slug: string | null;
  base_city: string | null;
  photo_url: string | null;
};

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidPhone(phone: string): boolean {
  return /^\d{3}-\d{3}-\d{4}$/.test(phone);
}

export default function DirectoryPage() {
  const { t } = useTheme();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [stateFilter, setStateFilter] = useState("all");
  const [orgFilter, setOrgFilter] = useState("all");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Submit unit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);
  const [formOrgType, setFormOrgType] = useState(ORG_TYPES[0]);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formLocation, setFormLocation] = useState(US_STATES[0]);
  const [formBaseCity, setFormBaseCity] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [directoryPhotoUrl, setDirectoryPhotoUrl] = useState("");
  const [directoryPhotoPreview, setDirectoryPhotoPreview] = useState<string | null>(null);
  const [dirCropOpen, setDirCropOpen] = useState(false);
  const [dirCropSrc, setDirCropSrc] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [callSheet, setCallSheet] = useState<{ display: string; digits: string } | null>(null);

  // Request new location modal
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [locRequest, setLocRequest] = useState("");
  const [locSubmitting, setLocSubmitting] = useState(false);
  const [locDone, setLocDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    loadEntries();
  }, []);

  useEffect(() => {
    const mq = () => setIsMobile(typeof window !== "undefined" && window.innerWidth <= 768);
    mq();
    window.addEventListener("resize", mq);
    return () => window.removeEventListener("resize", mq);
  }, []);

  useEffect(() => {
    if (!callSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCallSheet(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [callSheet]);

  async function loadEntries() {
    setLoadingEntries(true);
    const { data } = await supabase
      .from("unit_directory")
      .select("id, org_type, name, phone, state, unit_slug, base_city, photo_url")
      .eq("is_approved", true)
      .order("state")
      .order("name");
    setEntries((data ?? []) as DirectoryEntry[]);
    setLoadingEntries(false);
  }

  const filtered = entries.filter((e) => {
    if (stateFilter !== "all" && e.state !== stateFilter) return false;
    if (orgFilter !== "all" && e.org_type !== orgFilter) return false;
    return true;
  });

  function openSubmitModal() {
    if (!currentUserId) { window.location.href = "/login"; return; }
    setSubmitDone(false);
    setFormName("");
    setFormPhone("");
    setFormBaseCity("");
    setFormSlug("");
    setDirectoryPhotoUrl("");
    setDirectoryPhotoPreview(null);
    setDirCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDirCropOpen(false);
    setModalOpen(true);
  }

  function closeDirCrop() {
    if (dirCropSrc) URL.revokeObjectURL(dirCropSrc);
    setDirCropSrc(null);
    setDirCropOpen(false);
  }

  async function uploadDirectoryPhotoBlob(blob: Blob) {
    setPhotoUploading(true);
    try {
      const file = new File([blob], "directory-unit.jpg", { type: "image/jpeg" });
      const path = `unit-directory/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
      setDirectoryPhotoUrl(data.publicUrl);
      setDirectoryPhotoPreview(data.publicUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPhotoUploading(false);
    }
  }

  function onPickDirectoryPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (dirCropSrc) URL.revokeObjectURL(dirCropSrc);
    setDirCropSrc(URL.createObjectURL(f));
    setDirCropOpen(true);
  }

  async function handleSubmit() {
    if (!formName.trim()) return;
    if (formPhone && !isValidPhone(formPhone)) return;
    if (photoUploading) return;
    setSubmitting(true);
    const { error } = await supabase.from("unit_directory").insert({
      org_type: formOrgType,
      name: formName.trim(),
      phone: formPhone || null,
      state: formLocation,
      base_city: formBaseCity.trim() || null,
      photo_url: directoryPhotoUrl.trim() || null,
      unit_slug: formSlug.trim() || null,
      submitted_by: currentUserId,
      is_approved: false,
    });
    setSubmitting(false);
    if (error) { alert(error.message); return; }
    setSubmitDone(true);
  }

  function openLocModal() {
    setLocDone(false);
    setLocRequest("");
    setLocModalOpen(true);
  }

  async function handleLocRequest() {
    if (!locRequest.trim()) return;
    setLocSubmitting(true);
    await supabase.from("location_requests").insert({
      location_name: locRequest.trim(),
      submitted_by: currentUserId ?? null,
    });
    setLocSubmitting(false);
    setLocDone(true);
  }

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 14,
    background: t.input,
    color: t.text,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: t.bg, minHeight: "100vh" }}>
      <ImageCropDialog
        open={dirCropOpen}
        imageSrc={dirCropSrc}
        aspect={ASPECT_AVATAR}
        cropShape="rect"
        title="Crop unit photo"
        onCancel={closeDirCrop}
        onComplete={async (blob) => {
          await uploadDirectoryPhotoBlob(blob);
          closeDirCrop();
        }}
      />
      {callSheet && (
        <>
          <div
            role="presentation"
            aria-hidden
            style={{ position: "fixed", inset: 0, zIndex: 2400, background: "rgba(0,0,0,0.45)" }}
            onClick={() => setCallSheet(null)}
          />
          <div
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              bottom: 24,
              zIndex: 2401,
              paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <a
              href={`tel:${callSheet.digits}`}
              style={{
                display: "block",
                textAlign: "center",
                padding: "14px 20px",
                borderRadius: 14,
                background: "#16a34a",
                color: "white",
                fontWeight: 800,
                fontSize: 17,
                textDecoration: "none",
                boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
              }}
            >
              Call {callSheet.display}
            </a>
          </div>
        </>
      )}
      <NavBar />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: t.text }}>Unit Directory</h1>
            <p style={{ margin: "4px 0 0", color: t.textMuted, fontSize: 14 }}>
              EOD teams, bomb squads, and related units — stateside and overseas.
            </p>
          </div>
          <button
            onClick={openSubmitModal}
            style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 800, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            + Submit a Unit
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: 180 }}
          >
            <option value="all">All Locations</option>
            <optgroup label="United States">
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </optgroup>
            <optgroup label="Overseas &amp; Territories">
              {OVERSEAS_LOCATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          </select>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            style={{ ...inputStyle, width: "auto", minWidth: 150 }}
          >
            <option value="all">All Types</option>
            {ORG_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Don't see your location */}
        <div style={{ marginBottom: 18 }}>
          <button
            onClick={openLocModal}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: t.textMuted, padding: 0, textDecoration: "underline", textDecorationStyle: "dotted" }}
          >
            Don&apos;t see your location? Request it →
          </button>
        </div>

        {/* Entry list */}
        {loadingEntries ? (
          <div style={{ textAlign: "center", padding: 48, color: t.textFaint }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48, color: t.textFaint, border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface }}>
            {entries.length === 0
              ? "No units listed yet. Be the first to submit one!"
              : "No units match these filters."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((entry) => {
              const color = ORG_COLORS[entry.org_type] ?? { bg: "#374151" };
              return (
                <div
                  key={entry.id}
                  style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
                >
                  {entry.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- directory listing thumb
                    <img
                      src={entry.photo_url}
                      alt=""
                      style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: `1px solid ${t.border}` }}
                    />
                  ) : null}
                  <span style={{ background: color.bg, color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {entry.org_type}
                  </span>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{entry.name}</div>
                    {entry.state && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{entry.state}</div>
                    )}
                    {entry.base_city && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{entry.base_city}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {entry.phone && (
                      isMobile ? (
                        <button
                          type="button"
                          onClick={() =>
                            setCallSheet({ display: entry.phone!, digits: entry.phone!.replace(/\D/g, "") })
                          }
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: t.text,
                            fontWeight: 700,
                            fontSize: 14,
                            padding: 0,
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📞 {entry.phone}
                        </button>
                      ) : (
                        <a
                          href={`tel:${entry.phone.replace(/-/g, "")}`}
                          style={{ color: t.text, fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
                        >
                          📞 {entry.phone}
                        </a>
                      )
                    )}
                    {entry.unit_slug && (
                      <a
                        href={`/units/${entry.unit_slug}`}
                        style={{ background: "#7c3aed", color: "white", borderRadius: 8, padding: "5px 12px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                      >
                        View Unit Page
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit unit modal */}
      {modalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div style={{ background: t.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, border: `1px solid ${t.border}`, maxHeight: "90vh", overflowY: "auto" }}>
            {submitDone ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: t.text, marginBottom: 8 }}>Submitted!</div>
                <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 20 }}>Your entry is pending admin review and will appear once approved.</div>
                <button onClick={() => setModalOpen(false)} style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 10, padding: "9px 24px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Submit a Unit</div>
                  <button onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: t.textFaint, lineHeight: 1, padding: 0 }}>×</button>
                </div>
                <div style={{ display: "grid", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Organization Type</label>
                    <select value={formOrgType} onChange={(e) => setFormOrgType(e.target.value)} style={inputStyle}>
                      {ORG_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Unit / Squad Name *</label>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. 5th EOD Company"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Location</label>
                    <select value={formLocation} onChange={(e) => setFormLocation(e.target.value)} style={inputStyle}>
                      <optgroup label="United States">
                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </optgroup>
                      <optgroup label="Overseas &amp; Territories">
                        {OVERSEAS_LOCATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>
                      Base / installation / city
                    </label>
                    <input
                      value={formBaseCity}
                      onChange={(e) => setFormBaseCity(e.target.value)}
                      placeholder="e.g. Fort Liberty, Colorado Springs"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>
                      Photo <span style={{ fontWeight: 400, fontSize: 12 }}>(optional)</span>
                    </label>
                    <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickDirectoryPhoto} />
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                        style={{
                          padding: "9px 16px",
                          borderRadius: 10,
                          border: `1px dashed ${t.border}`,
                          background: t.bg,
                          color: t.text,
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: photoUploading ? "not-allowed" : "pointer",
                          opacity: photoUploading ? 0.6 : 1,
                        }}
                      >
                        {photoUploading ? "Uploading…" : directoryPhotoPreview ? "Change photo" : "Add photo"}
                      </button>
                      {directoryPhotoPreview && (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element -- form preview */}
                          <img src={directoryPhotoPreview} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", border: `1px solid ${t.border}` }} />
                          <button
                            type="button"
                            onClick={() => {
                              setDirectoryPhotoUrl("");
                              setDirectoryPhotoPreview(null);
                            }}
                            style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>Contact Phone</label>
                    <input
                      value={formPhone}
                      onChange={(e) => setFormPhone(formatPhone(e.target.value))}
                      placeholder="555-867-5309"
                      style={{ ...inputStyle, borderColor: formPhone && !isValidPhone(formPhone) ? "#ef4444" : t.inputBorder }}
                    />
                    {formPhone && !isValidPhone(formPhone) && (
                      <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4 }}>Enter a complete 10-digit number (e.g. 555-867-5309)</div>
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: t.textMuted, display: "block", marginBottom: 5 }}>
                      Unit Page Slug <span style={{ fontWeight: 400, fontSize: 12 }}>(optional — links to existing unit page)</span>
                    </label>
                    <input
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      placeholder="e.g. 5th-eod-company"
                      style={inputStyle}
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || photoUploading || !formName.trim() || (!!formPhone && !isValidPhone(formPhone))}
                    style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 15, cursor: submitting || photoUploading || !formName.trim() ? "not-allowed" : "pointer", opacity: submitting || photoUploading || !formName.trim() ? 0.5 : 1, marginTop: 4 }}
                  >
                    {submitting ? "Submitting..." : "Submit for Review"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Request new location modal */}
      {locModalOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setLocModalOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div style={{ background: t.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 400, border: `1px solid ${t.border}` }}>
            {locDone ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📍</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: t.text, marginBottom: 8 }}>Request received!</div>
                <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 20 }}>We&apos;ll review it and add it to the list.</div>
                <button onClick={() => setLocModalOpen(false)} style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 10, padding: "9px 24px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  Close
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ fontSize: 17, fontWeight: 900, color: t.text }}>Request a Location</div>
                  <button onClick={() => setLocModalOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: t.textFaint, lineHeight: 1, padding: 0 }}>×</button>
                </div>
                <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16, lineHeight: 1.6 }}>
                  Don&apos;t see your state, territory, or overseas location? Let us know and we&apos;ll add it.
                </div>
                <input
                  value={locRequest}
                  onChange={(e) => setLocRequest(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLocRequest()}
                  placeholder="e.g. Italy, Bahrain, Kuwait..."
                  style={inputStyle}
                />
                <button
                  onClick={handleLocRequest}
                  disabled={locSubmitting || !locRequest.trim()}
                  style={{ background: "#7c3aed", color: "white", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 800, fontSize: 14, cursor: locSubmitting || !locRequest.trim() ? "not-allowed" : "pointer", opacity: locSubmitting || !locRequest.trim() ? 0.5 : 1, width: "100%", marginTop: 12 }}
                >
                  {locSubmitting ? "Sending..." : "Send Request"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
