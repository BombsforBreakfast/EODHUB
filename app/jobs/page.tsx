"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
  DEFAULT_JOB_FILTERS,
  restoreJobFilters,
  jobFilterChips,
} from "../lib/jobFilters";
import AdvancedJobFilters from "../components/jobs/AdvancedJobFilters";
import { deriveJobFacets } from "../lib/jobFacets";
import JobViewToggle from "../components/jobs/JobViewToggle";
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

const DEFAULT_FILTERS = DEFAULT_JOB_FILTERS;
const JobMapView = dynamic(() => import("../components/jobs/JobMapView"), { ssr: false, loading: () => <p role="status">Loading map…</p> });

type JobSort = "recent" | "az" | "za";

function sortJobs(jobs: JobListItem[], sort: JobSort): JobListItem[] {
  if (jobs.length === 0) return jobs;
  const copy = [...jobs];
  const displayTitle = (j: JobListItem) => (j.title || j.og_title || "Untitled Job").trim();
  if (sort === "recent") {
    copy.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return copy;
  }
  if (sort === "az") {
    copy.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
    return copy;
  }
  copy.sort((a, b) => displayTitle(b).localeCompare(displayTitle(a)));
  return copy;
}

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
  const [page, setPage] = useState(1);
  const [jobSort, setJobSort] = useState<JobSort>("recent");
  const [jobView, setJobView] = useState<"list" | "map">("list");
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
    queryKey: queryKeys.jobsList(0, listingCutoff),
    queryFn: () => fetchApprovedJobs<JobListItem>(supabase, 0, listingCutoff),
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
  const jobs = useMemo(() => (jobsQuery.data ?? EMPTY_JOBS).map(job => ({ ...job, facets: deriveJobFacets(job) })), [jobsQuery.data, EMPTY_JOBS]);

  useEffect(() => {
    if (!userId) return;
    try { setFilters(restoreJobFilters(JSON.parse(localStorage.getItem(`eod-jobs-filters-v2:${userId}`) || "null"))); } catch { setFilters(DEFAULT_FILTERS); }
  }, [userId]);

  function changeFilters(next: JobFilterState) {
    setFilters(next);
    setPage(1);
    try { if (userId) localStorage.setItem(`eod-jobs-filters-v2:${userId}`, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
  }

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

  const handleShareJob = useCallback(async (
    job: JobModalData,
    content: string,
    postAsMode?: PostAsMode,
    photoFile?: File | null,
  ) => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (sharingJobId === job.id) return;
    setSharingJobId(job.id);
    setJobNotice(null);
    try {
      const result = await shareJobToFeed(supabase, job.id, content, postAsMode, photoFile);
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
        queryKeys.jobsList(0, listingCutoff),
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
        queryKeys.jobsList(0, listingCutoff),
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
  const mapJobs = useMemo(() => jobView === "map" ? !canUseJobFilters ? jobs : applyJobFilters(jobs, { ...filters, regions: [], locationRegion: "" }) : [], [jobs, filters, canUseJobFilters, jobView]);

  const visibleJobs = useMemo(() => {
    const filtered = !canUseJobFilters ? jobs : applyJobFilters(jobs, filters);
    return sortJobs(filtered, jobSort);
  }, [jobs, filters, canUseJobFilters, jobSort]);

  const hasActiveFilters = jobFilterChips(filters).length > 0;
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / 24));
  const currentPage = Math.min(page, pageCount);
  const pageJobs = visibleJobs.slice((currentPage - 1) * 24, currentPage * 24);

  return (
    <div
      className="hub-page-gutter"
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
        allowPhotoAttachment
        submitting={Boolean(shareComposerJob && sharingJobId === shareComposerJob.id)}
        onClose={() => {
          if (!sharingJobId) setShareComposerJob(null);
        }}
        onSubmit={(content, postAsMode, photoFile) => {
          if (shareComposerJob) void handleShareJob(shareComposerJob, content, postAsMode, photoFile);
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
          <JobViewToggle value={jobView} onChange={setJobView} />
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

      {canUseJobFilters && <AdvancedJobFilters value={filters} onChange={changeFilters} regions={regionOptions} count={visibleJobs.length} total={jobs.length} loading={loading} />}
      <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, fontSize: 13 }}>Sort jobs
        <select aria-label="Sort jobs" value={jobSort} onChange={e => { setJobSort(e.target.value as JobSort); setPage(1); }} style={{ padding: 8, background: t.input, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8 }}>
          <option value="recent">Newest added</option><option value="az">Title A–Z</option><option value="za">Title Z–A</option>
        </select>
      </label>

      {jobNotice && (
        <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "10px 12px", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
          {jobNotice}
        </div>
      )}

      {!loading && userId && (
        <div style={{ border: `1px solid ${t.border}`, borderRadius: t.radius, background: t.surface, padding: 16, marginBottom: 14, boxShadow: t.shadow }}>
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
                  filter_overrides: job.filter_overrides,
                  filter_source: job.filter_source,
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
                  poc_name: job.poc_name,
                  poc_email: job.poc_email,
                  poc_phone: job.poc_phone,
                };
                return (
                  <div
                    key={job.id}
                    style={{ border: `1px solid ${t.border}`, borderRadius: t.radiusSm, background: t.bg, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}
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

      {jobView === "map" && !loading && !jobsQuery.isError && <JobMapView jobs={mapJobs} selectedRegions={filters.regions ?? []} onChangeRegions={regions => changeFilters({ ...filters, regions, locationRegion: "" })} matchingCount={visibleJobs.length} />}

      {loading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading jobs...</div>
      ) : jobsQuery.isError ? (
        <div role="alert">Jobs could not be loaded. <button type="button" onClick={() => void jobsQuery.refetch()}>Try again</button></div>
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
            {pageJobs.map((job) => (
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
          <nav aria-label="Job results pages" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16, margin: "20px 0" }}>
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <span>Page {currentPage} of {pageCount}</span>
            <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </nav>
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
