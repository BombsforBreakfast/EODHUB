"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";
import {
  FEED_POST_IMAGES_MAX_WIDTH,
  FEED_SECTION_GAP,
  feedSingleImageStyle,
  feedSingleMediaFrameStyle,
} from "../lib/feedLayout";
import { queryKeys } from "../lib/queryKeys";
import {
  fetchSavedJobs,
  savedJobIdsFromRows,
  savedJobRowFromJob,
  SAVED_JOBS_STALE_MS,
  toggleSavedJob,
} from "../lib/queries/savedJobs";
import JobDetailsModal, { type JobModalData } from "./jobs/JobDetailsModal";

const DESKTOP_MQ = "(min-width: 900px)";

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_MQ).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export type JobFeedActionsProps = {
  /** Shared post og_url — usually jobs.apply_url, or /job/{id}. */
  applyUrl: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogSiteName?: string | null;
  userId: string | null;
  /** Shared flyer image — required; overlay Details / Save live on this photo. */
  flyerSrc: string;
  onOpenFlyer?: () => void;
};

const JOB_SELECT =
  "id, title, company_name, location, category, description, apply_url, pay_min, pay_max, clearance, source_type, created_at, og_title, og_description, og_image, og_site_name, applications_under_review, poc_name, poc_email, poc_phone";

function jobIdFromHubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/job\/([0-9a-f-]{36})/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Detect shared / employer job posts in the feed without a posts.job_id column. */
export function isJobShareFeedPost(post: {
  content_type?: string | null;
  content?: string | null;
  og_url?: string | null;
}): boolean {
  if (post.content_type === "job_post" || post.content_type === "job") return true;
  if (!post.og_url) return false;
  return /^shared a job:/i.test((post.content ?? "").trim());
}

async function resolveJobFromApplyUrl(applyUrl: string): Promise<JobModalData | null> {
  const hubId = jobIdFromHubUrl(applyUrl);
  if (hubId) {
    const { data } = await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("id", hubId)
      .eq("is_approved", true)
      .neq("is_rejected", true)
      .maybeSingle();
    return (data as JobModalData | null) ?? null;
  }

  const { data } = await supabase
    .from("jobs")
    .select(JOB_SELECT)
    .eq("apply_url", applyUrl)
    .eq("is_approved", true)
    .neq("is_rejected", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as JobModalData | null) ?? null;
}

/**
 * Flyer photo with hover Details / Save — same saved_jobs + JobDetailsModal
 * path as /jobs. Visit site stays on the post OG link card.
 */
export default function JobFeedActions({
  applyUrl,
  ogTitle,
  ogDescription,
  ogImage,
  ogSiteName,
  userId,
  flyerSrc,
  onOpenFlyer,
}: JobFeedActionsProps) {
  const { t, isDark } = useTheme();
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const [job, setJob] = useState<JobModalData | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = applyUrl?.trim() || null;
    if (!url) {
      setJob(null);
      return;
    }
    void (async () => {
      const resolved = await resolveJobFromApplyUrl(url);
      if (cancelled) return;
      if (resolved) {
        setJob(resolved);
        return;
      }
      setJob({
        id: `unresolved:${url}`,
        title: ogTitle ?? null,
        company_name: ogSiteName ?? null,
        location: null,
        category: null,
        description: ogDescription ?? null,
        apply_url: url,
        pay_min: null,
        pay_max: null,
        clearance: null,
        source_type: null,
        og_title: ogTitle ?? null,
        og_description: ogDescription ?? null,
        og_image: ogImage ?? null,
        og_site_name: ogSiteName ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [applyUrl, ogDescription, ogImage, ogSiteName, ogTitle]);

  const savedJobsQuery = useQuery({
    queryKey: userId ? queryKeys.savedJobs(userId) : queryKeys.savedJobs("pending"),
    queryFn: () => fetchSavedJobs(supabase, userId as string),
    enabled: !!userId,
    staleTime: SAVED_JOBS_STALE_MS,
  });
  const savedJobIds = useMemo(
    () => savedJobIdsFromRows(savedJobsQuery.data),
    [savedJobsQuery.data],
  );

  const canPersistSave = Boolean(job && !job.id.startsWith("unresolved:"));
  const saved = job ? savedJobIds.has(job.id) : false;

  const onToggleSave = useCallback(
    async (target: JobModalData) => {
      if (!userId) {
        window.location.href = "/login";
        return;
      }
      if (target.id.startsWith("unresolved:")) return;
      setToggling(true);
      try {
        await toggleSavedJob({
          queryClient,
          supabase,
          userId,
          jobId: target.id,
          saved: savedJobIds.has(target.id),
          optimisticRow: savedJobRowFromJob(target),
        });
      } catch (err) {
        console.error("Feed job save failed:", err);
      } finally {
        setToggling(false);
      }
    },
    [queryClient, savedJobIds, userId],
  );

  const overlayBtn: CSSProperties = isDesktop
    ? {
        border: "none",
        borderRadius: 999,
        padding: "10px 16px",
        fontSize: 12,
        fontWeight: 800,
        minHeight: 36,
        minWidth: 81,
        cursor: "pointer",
        background: isDark ? "rgba(20,24,22,0.92)" : "rgba(255,255,255,0.94)",
        color: t.text,
        boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
      }
    : {
        border: "none",
        borderRadius: 999,
        padding: "14px 22px",
        fontSize: 16,
        fontWeight: 800,
        minHeight: 48,
        minWidth: 108,
        cursor: "pointer",
        background: isDark ? "rgba(20,24,22,0.92)" : "rgba(255,255,255,0.94)",
        color: t.text,
        boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
      };

  return (
    <div
      style={{
        marginTop: FEED_SECTION_GAP,
        width: "100%",
        maxWidth: FEED_POST_IMAGES_MAX_WIDTH,
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <div style={{ ...feedSingleMediaFrameStyle, position: "relative" }}>
        <button
          type="button"
          onClick={() => onOpenFlyer?.()}
          style={{
            display: "block",
            width: "100%",
            padding: 0,
            border: "none",
            background: "transparent",
            cursor: onOpenFlyer ? "pointer" : "default",
            lineHeight: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={flyerSrc}
            alt={job?.title || ogTitle || "Job flyer"}
            style={feedSingleImageStyle}
          />
        </button>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: isDesktop ? 8 : 10,
            padding: isDesktop ? "24px 12px 12px" : "32px 14px 14px",
            background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            style={overlayBtn}
            onClick={(e) => {
              e.stopPropagation();
              if (job) setDetailsOpen(true);
            }}
            disabled={!job}
          >
            Details
          </button>
          {canPersistSave ? (
            <button
              type="button"
              style={{
                ...overlayBtn,
                background: saved ? "#111" : overlayBtn.background,
                color: saved ? "#fff" : t.text,
              }}
              disabled={toggling || !userId}
              onClick={(e) => {
                e.stopPropagation();
                if (job) void onToggleSave(job);
              }}
            >
              {toggling ? "…" : saved ? "Saved ✓" : "Save"}
            </button>
          ) : null}
        </div>
      </div>

      <JobDetailsModal
        job={detailsOpen ? job : null}
        open={detailsOpen && Boolean(job)}
        onClose={() => setDetailsOpen(false)}
        saved={saved}
        canSave={!!userId && canPersistSave}
        isTogglingSave={toggling}
        onToggleSave={onToggleSave}
      />
    </div>
  );
}
