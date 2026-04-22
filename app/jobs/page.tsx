"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import UpgradePromptModal from "../components/UpgradePromptModal";
import JobCardActions from "../components/jobs/JobCardActions";
import JobDetailsModal, { type JobModalData } from "../components/jobs/JobDetailsModal";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { getFeatureAccess } from "../lib/featureAccess";
import { applyJobFilters, uniqueJobLocations, type JobFilterState, type JobListItem } from "../lib/jobFilters";

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

const DEFAULT_FILTERS: JobFilterState = {
  location: "",
  keyword: "",
};

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

  const locationOptions = useMemo(() => uniqueJobLocations(jobs), [jobs]);
  const visibleJobs = useMemo(() => {
    if (!canUseJobFilters) return jobs;
    return applyJobFilters(jobs, filters);
  }, [jobs, filters, canUseJobFilters]);

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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <input
              type="text"
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              placeholder="Keyword/tag (e.g. UXO, TSS-E, Safety)"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
            />

            <select
              value={filters.location}
              onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text }}
            >
              <option value="">All locations</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
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
      ) : visibleJobs.length === 0 ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>No approved jobs found.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {visibleJobs.map((job) => (
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
                {(job.pay_min !== null || job.pay_max !== null) && (
                  <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                    Salary: {job.pay_min ?? "?"} - {job.pay_max ?? "?"}
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
              </div>
            </div>
          ))}
        </div>
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
