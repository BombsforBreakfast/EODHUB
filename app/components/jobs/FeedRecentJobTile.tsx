"use client";

import { useTheme } from "../../lib/ThemeContext";
import { goldCardStyle } from "../../lib/jobHighlights";
import { useGoldJob } from "../../lib/jobHighlights.client";
import type { JobListItem } from "../../lib/jobFilters";
import { httpsAssetUrl } from "../master/masterShared";
import JobGoldLabels from "./JobGoldLabels";
import type { JobModalData } from "./JobDetailsModal";

export default function FeedRecentJobTile({ job: source, onOpenDetails }: {
  job: JobListItem;
  onOpenDetails: (job: JobModalData) => void;
}) {
  const job = useGoldJob(source);
  const { t } = useTheme();
  const title = job.title || job.og_title || "Untitled Job";
  const imageSrc = httpsAssetUrl(job.og_image);
  const goldDescription = job.gold_highlight ? `; Gold highlight: ${(job.gold_tags ?? []).join(", ")}` : "";

  return (
    <button
      type="button"
      className={`feed-jobs-tile${job.gold_highlight ? " feed-jobs-tile-gold" : ""}`}
      aria-label={`Open job details for ${title}${job.location ? ` in ${job.location}` : ""}${goldDescription}`}
      onClick={() => onOpenDetails(job as JobModalData)}
      style={{ background: t.surface, border: `1px solid ${t.border}`, boxShadow: t.shadow, ...goldCardStyle(job), color: t.text }}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="feed-jobs-tile-bg" />
      ) : null}
      <span className="feed-jobs-tile-scrim" style={{ background: imageSrc
        ? "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.12) 100%)" : "transparent" }} />
      <span className="feed-jobs-tile-copy">
        <JobGoldLabels job={job} compact />
        <span className="feed-jobs-tile-title" style={{ color: imageSrc ? "#fff" : t.text }}>{title}</span>
        {job.location?.trim() ? (
          <span className="feed-jobs-tile-location" style={{ color: imageSrc ? "rgba(255,255,255,0.82)" : t.textMuted }}>{job.location.trim()}</span>
        ) : null}
      </span>
    </button>
  );
}
