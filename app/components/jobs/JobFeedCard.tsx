"use client";

import { useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { httpsAssetUrl, type JobRow } from "../master/masterShared";
import JobCardActions from "./JobCardActions";
import JobImage, { JobCardClickableText } from "./JobImage";
import type { JobModalData } from "./JobDetailsModal";

type Props = {
  job: JobRow;
  onOpenDetails: (job: JobModalData) => void;
  saved: boolean;
  canSave: boolean;
  isTogglingSave: boolean;
  onToggleSave: (job: JobModalData) => void | Promise<void>;
  posterName?: string | null;
};

export default function JobFeedCard({
  job,
  onOpenDetails,
  saved,
  canSave,
  isTogglingSave,
  onToggleSave,
  posterName,
}: Props) {
  const { t } = useTheme();
  const modalJob = job as JobModalData;
  const [imageAvailable, setImageAvailable] = useState(() => Boolean(job.og_image?.trim()));

  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: t.surface,
      }}
    >
      <JobImage
        src={httpsAssetUrl(job.og_image)}
        alt={job.title || job.og_title || "Job preview"}
        height={120}
        onAvailabilityChange={setImageAvailable}
      />

      <div style={{ padding: 12 }}>
        <JobCardClickableText
          imageAvailable={imageAvailable}
          onOpenDetails={() => onOpenDetails(modalJob)}
        >
          <div style={{ fontWeight: 800, lineHeight: 1.3 }}>{job.title || job.og_title || "Untitled Job"}</div>

          <div style={{ marginTop: 4, fontSize: 14, color: t.textMuted }}>
            {job.company_name || job.og_site_name || "Unknown Company"}
          </div>

          <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted }}>{job.location || "Location not listed"}</div>

          <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span>{job.category || "General"}</span>
            {job.created_at && <span>• {new Date(job.created_at).toLocaleDateString()}</span>}
            {job.source_type === "community" && (
              <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                Community
              </span>
            )}
          </div>
          {job.source_type === "community" && !job.anonymous && posterName && (
            <div style={{ marginTop: 3, fontSize: 11, color: t.textFaint }}>posted by {posterName}</div>
          )}

          {job.og_description && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: t.textMuted,
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {job.og_description}
            </div>
          )}
        </JobCardClickableText>

        <div style={{ marginTop: 10 }}>
          <JobCardActions
            job={modalJob}
            onOpenDetails={onOpenDetails}
            saved={saved}
            canSave={canSave}
            isTogglingSave={isTogglingSave}
            onToggleSave={onToggleSave}
          />
        </div>
      </div>
    </div>
  );
}
