"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ShareListingToFeedModal, { type ShareListingPreview } from "../components/ShareListingToFeedModal";
import UpgradePromptModal from "../components/UpgradePromptModal";
import JobCardActions from "../components/jobs/JobCardActions";
import JobDetailsModal, { type JobModalData } from "../components/jobs/JobDetailsModal";
import JobGridCard from "../components/jobs/JobGridCard";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { getFeatureAccess } from "../lib/featureAccess";
import { shouldEnforceMemberPaywall } from "../lib/paywallPaths";
import { useOnboardingGate } from "../hooks/useOnboardingGate";
import {
  resolvePreAccessRedirectPath,
  type OnboardingGateProfile,
} from "../lib/onboardingGate";
import { hasFullPlatformAccess } from "../lib/verificationAccess";
import {
  applyJobFilters,
  uniqueJobRegionOptions,
  type JobFilterState,
  type JobListItem,
  type SalaryMin,
} from "../lib/jobFilters";
import { usePageTracking } from "../hooks/usePageTracking";
import { PAGE_TRACKING } from "../lib/pageTrackingPaths";
import { jobListingCutoffIso } from "../lib/jobRetention";
import { shareJobToFeed } from "../lib/shareJobToFeed";
import type { PostAsMode } from "../lib/postAsIdentity";
import { fetchViewerProfileCached } from "../lib/queries/viewerProfile";
import { fetchApprovedJobs, fetchJobBoardStats, JOBS_LIST_STALE_MS } from "../lib/queries/jobs";
import {
  fetchSavedJobs,
  savedJobRowFromJob,
  savedJobIdsFromRows,
  SAVED_JOBS_STALE_MS,
  toggleSavedJob,
  type SavedJobRow,
} from "../lib/queries/savedJobs";
import { queryKeys } from "../lib/queryKeys";

type ProfileRow = {
  account_type: string | null;
  subscription_status: string | null;
  is_admin: boolean | null;
  verification_status: string | null;
  email_verified: boolean | null;
  admin_verified: boolean | null;
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

const DEFAULT_FILTERS: JobFilterState = {
  keyword: "",
  locationRegion: "",
  salaryMin: "",
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
    case "reliefweb": return "ReliefWeb";
    case "indeed": return "Indeed";
    case "linkedin": return "LinkedIn";
    case "ziprecruiter": return "ZipRecruiter";
    case "community": return "EOD Hub";
    default: return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  }
}

function jobSharePreview(job: JobModalData): ShareListingPreview {
  return {
    id: job.id,
    website_url: job.apply_url,
    business_name: job.title || job.og_title || "Job listing",
    custom_blurb: job.description || job.og_description,
    og_title: job.og_title || job.title,
    og_description: job.og_description || job.description,
    og_image: job.og_image,
    og_site_name: job.og_site_name || job.company_name || "Jobs",
  };
}

export default function JobsPage() {
  useOnboardingGate("app/jobs/page.tsx");
  usePageTracking(PAGE_TRACKING.jobs);
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<JobFilterState>(DEFAULT_FILTERS);
  const [isMobile, setIsMobile] = useState(false);
  const [canViewFullJobs, setCanViewFullJobs] = useState(true);
  const [canUseJobFilters, setCanUseJobFilters] = useState(true);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [togglingJobId, setTogglingJobId] = useState<string | null>(null);
  const [sharingJobId, setSharingJobId] = useState<string | null>(null);
  const [shareComposerJob, setShareComposerJob] = useState<JobModalData | null>(null);
  const [jobNotice, setJobNotice] = useState<string | null>(null);
  const [savedExpanded, setSavedExpanded] = useState(false);
  const [detailsJob, setDetailsJob] = useState<JobModalData | null>(null);


  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const listingCutoff = useMemo(() => jobListingCutoffIso(), []);

  const jobsQuery = useQuery({
    queryKey: queryKeys.jobsList(500, listingCutoff),
    queryFn: () => fetchApprovedJobs<JobListItem>(supabase, 500, listingCutoff),
    enabled: !!userId,
    staleTime: JOBS_LIST_STALE_MS,
  });

  const jobBoardStatsQuery = useQuery({
    queryKey: queryKeys.jobBoardStats(listingCutoff),
    queryFn: () => fetchJobBoardStats(supabase, listingCutoff),
    enabled: !!userId,
    staleTime: JOBS_LIST_STALE_MS,
  });

  const EMPTY_JOBS = useMemo<JobListItem[]>(() => [], []);
  const jobs = jobsQuery.data ?? EMPTY_JOBS;

  const savedJobsQuery = useQuery({
    queryKey: userId ? queryKeys.savedJobs(userId) : queryKeys.savedJobs("pending"),
    queryFn: () => fetchSavedJobs(supabase, userId as string),
    enabled: !!userId,
    staleTime: SAVED_JOBS_STALE_MS,
  });

  const EMPTY_SAVED_JOBS = useMemo<SavedJobRow[]>(() => [], []);
  const savedJobs = savedJobsQuery.data ?? EMPTY_SAVED_JOBS;
  const savedJobIds = useMemo(() => savedJobIdsFromRows(savedJobs), [savedJobs]);

  const toggleSaveJob = useCallback(
    async (job: JobModalData) => {
      if (!userId) return;
      try {
        setTogglingJobId(job.id);
        await toggleSavedJob({
          queryClient,
          supabase,
          userId,
          jobId: job.id,
          saved: savedJobIds.has(job.id),
          optimisticRow: savedJobRowFromJob(job),
        });
      } catch (err) {
        console.error("Toggle save job error:", err);
      } finally {
        setTogglingJobId(null);
      }
    },
    [queryClient, userId, savedJobIds]
  );

  const openShareComposer = useCallback((job: JobModalData) => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    setShareComposerJob(job);
  }, [userId]);

  const handleShareJob = useCallback(async (job: JobModalData, content: string, postAsMode?: PostAsMode) => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (sharingJobId === job.id) return;
    setSharingJobId(job.id);
    setJobNotice(null);
    try {
      const result = await shareJobToFeed(supabase, job.id, content, postAsMode);
      if (!result.ok) {
        setJobNotice(result.error ?? "Could not share this job to the feed.");
        return;
      }
      setJobNotice("Job shared to the feed.");
      setShareComposerJob(null);
    } catch {
      setJobNotice("Could not share this job to the feed.");
    } finally {
      setSharingJobId(null);
      window.setTimeout(() => setJobNotice(null), 4500);
    }
  }, [sharingJobId, userId]);

  const handleJobDeleted = useCallback(
    (jobId: string) => {
      queryClient.setQueryData<JobListItem[]>(
        queryKeys.jobsList(500, listingCutoff),
        (old) => old?.filter((j) => j.id !== jobId) ?? [],
      );
      if (detailsJob?.id === jobId) setDetailsJob(null);
      setJobNotice("Job deleted.");
      window.setTimeout(() => setJobNotice(null), 4500);
    },
    [queryClient, listingCutoff, detailsJob],
  );

  const handleApplicationsUnderReviewChanged = useCallback(
    (jobId: string, underReview: boolean) => {
      queryClient.setQueryData<JobListItem[]>(
        queryKeys.jobsList(500, listingCutoff),
        (old) =>
          old?.map((j) =>
            j.id === jobId ? { ...j, applications_under_review: underReview } : j,
          ) ?? [],
      );
      setDetailsJob((current) =>
        current?.id === jobId
          ? { ...current, applications_under_review: underReview }
          : current,
      );
      setJobNotice(underReview ? "Marked applications under review." : "Cleared review status.");
      window.setTimeout(() => setJobNotice(null), 4500);
    },
    [queryClient, listingCutoff],
  );

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user ?? null;
      const uid = authUser?.id ?? null;
      if (!uid || !authUser) {
        window.location.href = "/login";
        return;
      }

      const p = (await fetchViewerProfileCached(queryClient, supabase, authUser)) as
        | (OnboardingGateProfile & ProfileRow)
        | null;
      if (!p || !hasFullPlatformAccess(p)) {
        window.location.href = p ? resolvePreAccessRedirectPath(p) : "/onboarding";
        return;
      }

      const featureAccess = getFeatureAccess({
        accountType: p.account_type,
        subscriptionStatus: p.subscription_status,
        authUserCreatedAtIso: authUser.created_at ?? null,
        isAdmin: p.is_admin,
      });
      if (
        shouldEnforceMemberPaywall() &&
        !featureAccess.hasFullAccess &&
        p.account_type !== "employer" &&
        !p.is_admin
      ) {
        window.location.replace("/subscribe");
        return;
      }
      if (!mounted) return;
      setUserId(uid);
      setIsAdmin(Boolean(p.is_admin));
      setCanViewFullJobs(true);
      setCanUseJobFilters(true);
    }

    void init();
    return () => {
      mounted = false;
    };
  }, [queryClient]);

  // Loading clears once the gate resolved a user and the jobs query settled.
  useEffect(() => {
    if (userId && (jobsQuery.isSuccess || jobsQuery.isError)) {
      setLoading(false);
    }
  }, [userId, jobsQuery.isSuccess, jobsQuery.isError]);

  const regionOptions = useMemo(() => uniqueJobRegionOptions(jobs), [jobs]);

  const visibleJobs = useMemo(() => {
    if (!canUseJobFilters) return jobs;
    return applyJobFilters(jobs, filters);
  }, [jobs, filters, canUseJobFilters]);

  const hasActiveFilters =
    filters.keyword !== "" ||
    filters.locationRegion !== "" ||
    filters.salaryMin !== "";

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
      <ShareListingToFeedModal
        key={shareComposerJob?.id ?? "closed"}
        listing={shareComposerJob ? jobSharePreview(shareComposerJob) : null}
        label="Job"
        submitting={Boolean(shareComposerJob && sharingJobId === shareComposerJob.id)}
        onClose={() => {
          if (!sharingJobId) setShareComposerJob(null);
        }}
        onSubmit={(content, postAsMode) => {
          if (shareComposerJob) void handleShareJob(shareComposerJob, content, postAsMode);
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Jobs</h1>
          <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>
            {canViewFullJobs
              ? "Browse the full approved job board."
              : "Previewing the 5 most recent approved jobs."}
          </div>
          {isMobile && jobBoardStatsQuery.isSuccess && (
            <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted, fontWeight: 600, lineHeight: 1.45 }}>
              <div>
                ({jobBoardStatsQuery.data.totalApprovedCount !== null
                  ? jobBoardStatsQuery.data.totalApprovedCount.toLocaleString()
                  : "—"}) jobs as of{" "}
                {new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
              </div>
              <div style={{ marginTop: 4 }}>
                ({jobBoardStatsQuery.data.newTodayCount !== null
                  ? jobBoardStatsQuery.data.newTodayCount.toLocaleString()
                  : "—"}) new jobs today!
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <a
            href="/post-job"
            style={{ background: "#111", color: "white", border: "1px solid rgba(255,255,255,0.65)", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}
          >
            Post Job
          </a>
          {!canViewFullJobs && (
            <button
              type="button"
              onClick={() => setShowUpgradePrompt(true)}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              See All Jobs
            </button>
          )}
        </div>
      </div>

      {canUseJobFilters && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr auto",
              gap: 10,
              alignItems: "center",
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
              value={filters.locationRegion}
              onChange={(e) => setFilters((prev) => ({ ...prev, locationRegion: e.target.value }))}
              style={inputStyle}
            >
              <option value="">All locations</option>
              {regionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
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

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => setFilters(DEFAULT_FILTERS)}
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
          <div style={{ marginTop: 8, fontSize: 11, color: t.textFaint }}>
            US states are listed by full name. Jobs without a listed location appear in every state filter.
          </div>
        </div>
      )}

      {jobNotice && (
        <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
          {jobNotice}
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
                      canShare={!!userId}
                      isSharing={sharingJobId === job.job_id}
                      onShare={openShareComposer}
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
            {visibleJobs.map((job) => (
              <JobGridCard
                key={job.id}
                job={job}
                onOpenDetails={setDetailsJob}
                saved={savedJobIds.has(job.id)}
                canSave={!!userId}
                isTogglingSave={togglingJobId === job.id}
                onToggleSave={toggleSaveJob}
                canShare={!!userId}
                isSharing={sharingJobId === job.id}
                onShare={openShareComposer}
                canAdminDelete={isAdmin}
                onJobDeleted={handleJobDeleted}
                onApplicationsUnderReviewChanged={handleApplicationsUnderReviewChanged}
                formatPay={formatPay}
                formatSource={formatSource}
              />
            ))}
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
        canShare={!!userId}
        isSharing={detailsJob ? sharingJobId === detailsJob.id : false}
        onShare={openShareComposer}
        canAdminDelete={isAdmin}
        onJobDeleted={handleJobDeleted}
        onApplicationsUnderReviewChanged={handleApplicationsUnderReviewChanged}
      />
    </div>
  );
}
