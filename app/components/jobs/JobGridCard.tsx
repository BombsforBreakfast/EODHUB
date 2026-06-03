"use client";

import { useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import type { JobListItem } from "../../lib/jobFilters";
import JobCardActions from "./JobCardActions";
import JobImage, { JobCardClickableText } from "./JobImage";
import JobStaleReportControl from "./JobStaleReportControl";
import type { JobModalData } from "./JobDetailsModal";

type Props = {
  job: JobListItem;
  onOpenDetails: (job: JobModalData) => void;
  saved: boolean;
  canSave: boolean;
  isTogglingSave: boolean;
  onToggleSave: (job: JobModalData) => void | Promise<void>;
  canShare?: boolean;
  isSharing?: boolean;
  onShare?: (job: JobModalData) => void;
  formatPay: (min: number | null, max: number | null) => string;
  formatSource: (sourceType: string | null) => string;
};

export default function JobGridCard({
  job,
  onOpenDetails,
  saved,
  canSave,
  isTogglingSave,
  onToggleSave,
  canShare = false,
  isSharing = false,
  onShare,
  formatPay,
  formatSource,
}: Props) {
  const { t } = useTheme();
  const modalJob = job as JobModalData;
  const [imageAvailable, setImageAvailable] = useState(() => Boolean(job.og_image?.trim()));
  const hasSalary = job.pay_min !== null || job.pay_max !== null;

  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface, display: "flex", flexDirection: "column" }}>
      <JobImage
        src={job.og_image}
        alt={job.title || "Job preview"}
        height={150}
        onAvailabilityChange={setImageAvailable}
      />
      <div style={{ padding: 12, display: "flex", flexDirection: "column", flex: 1 }}>
        <JobCardClickableText
          imageAvailable={imageAvailable}
          onOpenDetails={() => onOpenDetails(modalJob)}
        >
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
        </JobCardClickableText>

        <div style={{ flex: 1 }} />

        <div style={{ marginTop: 12 }}>
          <JobCardActions
            job={modalJob}
            onOpenDetails={onOpenDetails}
            saved={saved}
            canSave={canSave}
            isTogglingSave={isTogglingSave}
            onToggleSave={onToggleSave}
            canShare={canShare}
            isSharing={isSharing}
            onShare={onShare}
          />
        </div>

        <div
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: `1px solid ${t.border}`,
            fontSize: 11,
            color: t.textFaint,
            fontWeight: 600,
            letterSpacing: 0.3,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>Via {formatSource(job.source_type)}</span>
          <JobStaleReportControl jobId={job.id} variant="compact" triggerLabel="Report" />
        </div>
      </div>
    </div>
  );
}
