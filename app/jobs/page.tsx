"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UpgradePromptModal from "../components/UpgradePromptModal";
import JobCardActions from "../components/jobs/JobCardActions";
import JobDetailsModal, { type JobModalData } from "../components/jobs/JobDetailsModal";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { getFeatureAccess } from "../lib/featureAccess";
import {
  applyJobFilters,
  uniqueJobLocations,
  type JobFilterState,
  type JobListItem,
  type LocationRadius,
  type SalaryMin,
} from "../lib/jobFilters";
import { geocodeZip, geocodeLocation, distanceMiles } from "../lib/geocode";

type ProfileRow = {
  access_tier: string | null;
  verification_status: string | null;
};

type SavedJobRow = {
  id: string;
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  description: string | null;
  apply_url: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
  created_at: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
};

const SALARY_OPTIONS: Array<{ label: string; value: SalaryMin | "" }> = [
  { label: "Any salary", value: "" },
  { label: "$25k+", value: 25000 },
  { label: "$50k+", value: 50000 },
  { label: "$75k+", value: 75000 },
  { label: "$100k+", value: 100000 },
  { label: "$125k+", value: 125000 },
  { label: "$150k+", value: 150000 },
];

const RADIUS_OPTIONS: Array<{ label: string; value: LocationRadius | "" }> = [
  { label: "Any distance", value: "" },
  { label: "25 miles", value: 25 },
  { label: "50 miles", value: 50 },
  { label: "100 miles", value: 100 },
];

const DEFAULT_FILTERS: JobFilterState = {
  location: "",
  keyword: "",
  salaryMin: "",
  locationZip: "",
  locationRadius: "",
};

function formatPayValue(n: number): string {
  if (n >= 10000) return `$${Math.round(n / 1000)}k`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

function formatPay(min: number | null, max: number | null): string {
  const ref = max ?? min!;
  const suffix = ref >= 1000 ? "/yr" : "/hr";
  if (min !== null && max !== null) {
    return `${formatPayValue(min)} – ${formatPayValue(max)}${suffix}`;
  }
  if (min !== null) return `From ${formatPayValue(min)}${suffix}`;
  if (max !== null) return `Up to ${formatPayValue(max)}${suffix}`;
  return "";
}

function formatSource(sourceType: string | null): string {
  if (!sourceType) return "Unknown";
  switch (sourceType.toLowerCase()) {
    case "usajobs": return "USAJOBS";
    case "adzuna": return "Adzuna";
    case "indeed": return "Indeed";
    case "linkedin": return "LinkedIn";
    case "ziprecruiter": return "ZipRecruiter";
    case "community": return "EOD Hub";
    default: return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  }
}

export default function JobsPage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [filters, setFilters] = useState<JobFilterState>(DEFAULT_FILTERS);
  const [isMobile, setIsMobile] = useState(false);
  const [canViewFullJobs, setCanViewFullJobs] = useState(true);
  const [canUseJobFilters, setCanUseJobFilters] = useState(true);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedJobs, setSavedJobs] = useState<SavedJobRow[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [detailsJob, setDetailsJob] = useState<JobModalData | null>(null);

  // Geo-filter state
  const [geoCenter, setGeoCenter] = useState<[number, number] | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoFilteredJobs, setGeoFilteredJobs] = useState<JobListItem[] | null>(null);
  const geoRunRef = useRef(0); // generation counter to cancel stale runs

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loadSavedJobs = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select(
        "id, job_id, jobs(title, company_name, location, category, description, apply_url, pay_min, pay_max, clearance, source_type, created_at, og_title, og_description, og_image, og_site_name)"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Saved jobs load error:", error);
      setSavedJobs([]);
      setSavedJobIds(new Set());
      return;
    }

    type RawJob = {
      title: string | null;
      company_name: string | null;
      location: string | null;
      category: string | null;
      description: string | null;
      apply_url: string | null;
      pay_min: number | null;
      pay_max: number | null;
      clearance: string | null;
      source_type: string | null;
      created_at: string | null;
      og_title: string | null;
      og_description: string | null;
      og_image: string | null;
      og_site_name: string | null;
    };
    type RawRow = {
      id: string;
      job_id: string;
      jobs: RawJob | RawJob[] | null;
    };

    const rows: SavedJobRow[] = ((data ?? []) as unknown as RawRow[]).map((r) => {
      const job = Array.isArray(r.jobs) ? r.jobs[0] ?? null : r.jobs;
      return {
        id: r.id,
        job_id: r.job_id,
        title: job?.title ?? null,
        company_name: job?.company_name ?? null,
        location: job?.location ?? null,
        category: job?.category ?? null,
        description: job?.description ?? null,
        apply_url: job?.apply_url ?? null,
        pay_min: job?.pay_min ?? null,
        pay_max: job?.pay_max ?? null,
        clearance: job?.clearance ?? null,
        source_type: job?.source_type ?? null,
        created_at: job?.created_at ?? null,
        og_title: job?.og_title ?? null,
        og_description: job?.og_description ?? null,
        og_image: job?.og_image ?? null,
        og_site_name: job?.og_site_name ?? null,
      };
    });
    setSavedJobs(rows);
    setSavedJobIds(new Set(rows.map((r) => r.job_id)));
  }, []);

  const toggleSaveJob = useCallback(
    async (job: JobModalData) => {
      if (!userId) return;
      try {
        setTogglingJobId(job.id);
        const isSaved = savedJobIds.has(job.id);
        if (isSaved) {
          await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id);
          setSavedJobIds((prev) => {
            const next = new Set(prev);
            next.delete(job.id);
            return next;
          });
          setSavedJobs((prev) => prev.filter((j) => j.job_id !== job.id));
        } else {
          await supabase.from("saved_jobs").insert([{ user_id: userId, job_id: job.id }]);
          setSavedJobIds((prev) => new Set(prev).add(job.id));
        }
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("eod:saved-jobs-changed", { detail: { jobId: job.id } })
          );
        }
      } catch (err) {
        console.error("Toggle save job error:", err);
      } finally {
        setTogglingJobId(null);
      }
    },
    [userId, savedJobIds]
  );

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? null;
      if (!uid) {
        window.location.href = "/login";
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("access_tier, verification_status")
        .eq("user_id", uid)
        .maybeSingle();

      const p = (profile ?? null) as ProfileRow | null;
      if (!p || p.verification_status !== "verified") {
        window.location.href = "/pending";
        return;
      }

      const featureAccess = getFeatureAccess(p.access_tier);
      if (!mounted) return;
      setUserId(uid);
      setCanViewFullJobs(featureAccess.canViewFullJobs);
      setCanUseJobFilters(featureAccess.canUseJobFilters);

      const limit = featureAccess.canViewFullJobs ? 500 : 5;
      const [{ data: jobsData, error }] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, created_at, title, category, location, pay_min, pay_max, clearance, description, apply_url, company_name, source_type, og_title, og_description, og_image, og_site_name")
          .eq("is_approved", true)
          .order("created_at", { ascending: false })
          .limit(limit),
        loadSavedJobs(uid),
      ]);

      if (error) {
        console.error("Jobs page load error:", error);
        if (mounted) setJobs([]);
      } else if (mounted) {
        setJobs((jobsData ?? []) as JobListItem[]);
      }
      if (mounted) setLoading(false);
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [loadSavedJobs]);

  useEffect(() => {
    if (!userId) return;
    const onChanged = () => {
      void loadSavedJobs(userId);
    };
    window.addEventListener("eod:saved-jobs-changed", onChanged as EventListener);
    return () => {
      window.removeEventListener("eod:saved-jobs-changed", onChanged as EventListener);
    };
  }, [userId, loadSavedJobs]);

  // Geocode user's zip whenever it changes to a valid 5-digit ZIP
  useEffect(() => {
    const zip = filters.locationZip.trim();
    if (!/^\d{5}$/.test(zip)) {
      setGeoCenter(null);
      setGeoFilteredJobs(null);
      return;
    }
    let cancelled = false;
    geocodeZip(zip).then((coords) => {
      if (!cancelled) setGeoCenter(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [filters.locationZip]);

  const locationOptions = useMemo(() => uniqueJobLocations(jobs), [jobs]);

  // Synchronous filters (keyword, location text, salary)
  const syncFilteredJobs = useMemo(() => {
    if (!canUseJobFilters) return jobs;
    return applyJobFilters(jobs, filters);
  }, [jobs, filters, canUseJobFilters]);

  // Async geo filter — runs whenever syncFilteredJobs, geoCenter, or radius changes
  useEffect(() => {
    if (!geoCenter || !filters.locationRadius) {
      setGeoFilteredJobs(null);
      setGeoLoading(false);
      return;
    }

    const gen = ++geoRunRef.current;
    const [cLat, cLng] = geoCenter;
    const radius = filters.locationRadius as number;

    async function run() {
      setGeoLoading(true);
      const result: JobListItem[] = [];
      const BATCH = 6;

      for (let i = 0; i < syncFilteredJobs.length; i += BATCH) {
        if (geoRunRef.current !== gen) return; // superseded
        const batch = syncFilteredJobs.slice(i, i + BATCH);
        const resolved = await Promise.all(
          batch.map(async (job): Promise<JobListItem | null> => {
            const loc = job.location?.trim() ?? "";
            // No location or explicitly remote → always include
            if (!loc || /remote/i.test(loc)) return job;
            const coords = await geocodeLocation(loc);
            // Can't geocode → include (benefit of the doubt)
            if (!coords) return job;
            return distanceMiles(cLat, cLng, coords[0], coords[1]) <= radius ? job : null;
          })
        );
        result.push(...(resolved.filter(Boolean) as JobListItem[]));
      }

      if (geoRunRef.current === gen) {
        setGeoFilteredJobs(result);
        setGeoLoading(false);
      }
    }

    void run();
  }, [geoCenter, filters.locationRadius, syncFilteredJobs]);

  const visibleJobs = geoFilteredJobs ?? syncFilteredJobs;

  const hasActiveFilters =
    filters.keyword !== "" ||
    filters.location !== "" ||
    filters.salaryMin !== "" ||
    filters.locationZip !== "" ||
    filters.locationRadius !== "";

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${t.inputBorder}`,
    background: t.input,
    color: t.text,
    boxSizing: "border-box",
    fontSize: 14,
  };

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        color: t.text,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Jobs</h1>
          <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>
            {canViewFullJobs
              ? "Browse the full approved job board."
              : "Previewing the 5 most recent approved jobs."}
          </div>
        </div>
        {!canViewFullJobs && (
          <button
            type="button"
            onClick={() => setShowUpgradePrompt(true)}
            style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            See All Jobs
          </button>
        )}
      </div>

      {canUseJobFilters && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
          {/* Row 1: keyword, location dropdown, salary */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <input
              type="text"
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              placeholder="Keyword (e.g. UXO, TSS-E, Safety)"
              style={inputStyle}
            />

            <select
              value={filters.location}
              onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
              style={inputStyle}
            >
              <option value="">All locations</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>

            <select
              value={filters.salaryMin}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  salaryMin: e.target.value === "" ? "" : (Number(e.target.value) as SalaryMin),
                }))
              }
              style={inputStyle}
            >
              {SALARY_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: zip + radius */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto",
              gap: 10,
              marginTop: 10,
              alignItems: "center",
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              maxLength={5}
              value={filters.locationZip}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 5);
                setFilters((prev) => ({ ...prev, locationZip: val }));
              }}
              placeholder="ZIP code (for radius search)"
              style={inputStyle}
            />

            <select
              value={filters.locationRadius}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  locationRadius: e.target.value === "" ? "" : (Number(e.target.value) as LocationRadius),
                }))
              }
              style={inputStyle}
            >
              {RADIUS_OPTIONS.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setGeoCenter(null);
                  setGeoFilteredJobs(null);
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  background: "transparent",
                  color: t.textMuted,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* ZIP without radius (or vice versa) hint */}
          {filters.locationZip.length === 5 && !filters.locationRadius && (
            <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>
              Select a distance above to filter by location radius.
            </div>
          )}
          {filters.locationRadius && !filters.locationZip && (
            <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>
              Enter a ZIP code above to filter by distance.
            </div>
          )}
          {filters.locationZip.length === 5 && filters.locationRadius && !geoCenter && !geoLoading && (
            <div style={{ marginTop: 8, fontSize: 12, color: t.textMuted }}>
              ZIP code not found — try a different ZIP.
            </div>
          )}
        </div>
      )}

      {!loading && userId && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: t.text }}>Saved jobs</div>
              <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                {savedJobs.length === 0 ? "None saved" : `${savedJobs.length} saved`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 700 }}>*not visible to other users</span>
              {savedJobs.length > 3 && (
                <button
                  type="button"
                  onClick={() => setSavedExpanded((v) => !v)}
                  style={{ background: "transparent", border: `1px solid ${t.border}`, color: t.text, borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  {savedExpanded ? "Show less" : `Show all (${savedJobs.length})`}
                </button>
              )}
            </div>
          </div>

          {savedJobs.length === 0 ? (
            <div style={{ marginTop: 10, fontSize: 13, color: t.textMuted }}>
              No saved jobs yet. Tap &quot;Save&quot; on any listing below to keep it here.
            </div>
          ) : (
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 10,
              }}
            >
              {(savedExpanded ? savedJobs : savedJobs.slice(0, isMobile ? 3 : 6)).map((job) => {
                const meta = [job.company_name, job.location, job.category].filter(Boolean).join(" · ");
                const modalJob: JobModalData = {
                  id: job.job_id,
                  title: job.title,
                  company_name: job.company_name,
                  location: job.location,
                  category: job.category,
                  description: job.description,
                  apply_url: job.apply_url,
                  pay_min: job.pay_min,
                  pay_max: job.pay_max,
                  clearance: job.clearance,
                  source_type: job.source_type,
                  created_at: job.created_at,
                  og_title: job.og_title,
                  og_description: job.og_description,
                  og_image: job.og_image,
                  og_site_name: job.og_site_name,
                };
                return (
                  <div
                    key={job.id}
                    style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3 }}>
                      {job.title || "Untitled Job"}
                    </div>
                    {meta && (
                      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.35 }}>{meta}</div>
                    )}
                    <JobCardActions
                      job={modalJob}
                      onOpenDetails={setDetailsJob}
                      saved={savedJobIds.has(job.job_id)}
                      canSave={!!userId}
                      isTogglingSave={togglingJobId === job.job_id}
                      onToggleSave={toggleSaveJob}
                      size="compact"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading jobs...</div>
      ) : geoLoading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>
          Locating jobs near {filters.locationZip}…
        </div>
      ) : visibleJobs.length === 0 ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>No approved jobs found{hasActiveFilters ? " matching your filters" : ""}.</div>
      ) : (
        <>
          {canUseJobFilters && hasActiveFilters && (
            <div style={{ marginBottom: 10, fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
              {visibleJobs.length} job{visibleJobs.length !== 1 ? "s" : ""} found
            </div>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
              gap: 12,
            }}
          >
            {visibleJobs.map((job) => {
              const hasSalary = job.pay_min !== null || job.pay_max !== null;
              return (
                <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface, display: "flex", flexDirection: "column" }}>
                  {job.og_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.og_image} alt={job.title || "Job preview"} style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
                  ) : null}
                  <div style={{ padding: 12, display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{job.title || job.og_title || "Untitled Job"}</div>
                    <div style={{ marginTop: 5, color: t.textMuted, fontSize: 14 }}>{job.company_name || job.og_site_name || "Unknown Company"}</div>
                    <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                      {(job.location || "Location not listed") + " · " + (job.category || "General")}
                    </div>

                    {hasSalary ? (
                      <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                        {formatPay(job.pay_min, job.pay_max)}
                      </div>
                    ) : (
                      <div style={{ marginTop: 6, color: t.textFaint, fontSize: 12, fontStyle: "italic" }}>
                        * Salary information not listed
                      </div>
                    )}

                    {job.description && (
                      <div style={{ marginTop: 8, color: t.textMuted, fontSize: 13, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {job.description}
                      </div>
                    )}

                    <div style={{ flex: 1 }} />

                    <div style={{ marginTop: 12 }}>
                      <JobCardActions
                        job={job as JobModalData}
                        onOpenDetails={setDetailsJob}
                        saved={savedJobIds.has(job.id)}
                        canSave={!!userId}
                        isTogglingSave={togglingJobId === job.id}
                        onToggleSave={toggleSaveJob}
                      />
                    </div>

                    {/* Source label */}
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: `1px solid ${t.border}`,
                        fontSize: 11,
                        color: t.textFaint,
                        fontWeight: 600,
                        letterSpacing: 0.3,
                      }}
                    >
                      Via {formatSource(job.source_type)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <UpgradePromptModal open={showUpgradePrompt} onClose={() => setShowUpgradePrompt(false)} />
      <JobDetailsModal
        job={detailsJob}
        open={!!detailsJob}
        onClose={() => setDetailsJob(null)}
        saved={detailsJob ? savedJobIds.has(detailsJob.id) : false}
        canSave={!!userId}
        isTogglingSave={detailsJob ? togglingJobId === detailsJob.id : false}
        onToggleSave={toggleSaveJob}
      />
    </div>
  );
}
