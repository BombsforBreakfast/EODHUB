"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth/AuthProvider";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";
import { jobListingCutoffIso } from "../../lib/jobRetention";
import type { JobListItem } from "../../lib/jobFilters";
import { fetchApprovedJobs, JOBS_LIST_STALE_MS } from "../../lib/queries/jobs";
import { queryKeys } from "../../lib/queryKeys";
import { httpsAssetUrl } from "../master/masterShared";
import type { JobModalData } from "./JobDetailsModal";

const FEED_JOBS_LIMIT = 10;

type Props = {
  onOpenDetails: (job: JobModalData) => void;
};

export default function FeedRecentJobsStrip({ onOpenDetails }: Props) {
  const { t } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const listingCutoff = useMemo(() => jobListingCutoffIso(), []);

  const jobsQuery = useQuery({
    queryKey: queryKeys.jobsList(FEED_JOBS_LIMIT, listingCutoff),
    queryFn: () => fetchApprovedJobs<JobListItem>(supabase, FEED_JOBS_LIMIT, listingCutoff),
    enabled: Boolean(userId),
    staleTime: JOBS_LIST_STALE_MS,
  });

  const jobs = (jobsQuery.data ?? []).slice(0, FEED_JOBS_LIMIT);

  if (!userId) return null;
  if (!jobsQuery.isLoading && jobs.length === 0) return null;

  return (
    <section className="feed-jobs-strip" aria-label="Recent jobs">
      <div className="circuit-strip-header">
        <div className="circuit-strip-heading">
          <div className="circuit-strip-title">Jobs</div>
          <div className="circuit-strip-sub">Most recent</div>
        </div>
        <Link href="/jobs" className="feed-jobs-strip-see-all-link" style={{ color: t.text }}>
          See all
        </Link>
      </div>

      <div className="circuit-strip-scroller">
        {jobsQuery.isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={`job-skel-${i}`}
                className="feed-jobs-tile"
                aria-hidden
                style={{ background: t.surface, border: `1px solid ${t.border}` }}
              />
            ))
          : jobs.map((job) => {
              const title = job.title || job.og_title || "Untitled Job";
              const imageSrc = httpsAssetUrl(job.og_image);
              return (
                <button
                  key={job.id}
                  type="button"
                  className="feed-jobs-tile"
                  aria-label={`Open job details for ${title}${job.location ? ` in ${job.location}` : ""}`}
                  onClick={() => onOpenDetails(job as JobModalData)}
                  style={{
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    boxShadow: t.shadow,
                    color: t.text,
                  }}
                >
                  {imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageSrc} alt="" className="feed-jobs-tile-bg" />
                  ) : null}
                  <span
                    className="feed-jobs-tile-scrim"
                    style={{
                      background: imageSrc
                        ? "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.12) 100%)"
                        : "transparent",
                    }}
                  />
                  <span className="feed-jobs-tile-copy">
                    <span
                      className="feed-jobs-tile-title"
                      style={{ color: imageSrc ? "#fff" : t.text }}
                    >
                      {title}
                    </span>
                    {job.location?.trim() ? (
                      <span
                        className="feed-jobs-tile-location"
                        style={{ color: imageSrc ? "rgba(255,255,255,0.82)" : t.textMuted }}
                      >
                        {job.location.trim()}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}

        <Link
          href="/jobs"
          className="feed-jobs-tile feed-jobs-tile-see-all"
          aria-label="See all jobs"
          style={{
            background: t.surface,
            border: `1px dashed ${t.border}`,
            color: t.text,
            textDecoration: "none",
            boxShadow: t.shadow,
          }}
        >
          <span className="feed-jobs-tile-plus" aria-hidden>
            →
          </span>
          <span className="feed-jobs-tile-see-all-label">See all</span>
        </Link>
      </div>
    </section>
  );
}
