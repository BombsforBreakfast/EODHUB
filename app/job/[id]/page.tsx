"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/lib/supabaseClient";
import NavBar from "../../components/NavBar";
import { useTheme } from "../../lib/ThemeContext";

type Job = {
  id: string;
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
  og_image: string | null;
};

function formatExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;
  const { t } = useTheme();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [togglingSave, setTogglingSave] = useState(false);

  useEffect(() => {
    async function loadJobPage() {
      setLoading(true);

      const { data: jobData, error: jobError } = await supabase
        .from("jobs")
        .select(
          "id,title,company_name,location,category,description,apply_url,pay_min,pay_max,clearance,source_type,og_image,is_approved"
        )
        .eq("id", jobId)
        .eq("is_approved", true)
        .single();

      if (jobError) {
        console.error("Job load error:", jobError);
        setJob(null);
        setLoading(false);
        return;
      }

      setJob(jobData as Job);

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        const { data: savedRow } = await supabase
          .from("saved_jobs")
          .select("id")
          .eq("user_id", uid)
          .eq("job_id", jobId)
          .maybeSingle();
        setSaved(!!savedRow);
      }

      setLoading(false);
    }

    if (jobId) {
      void loadJobPage();
    }
  }, [jobId]);

  async function toggleSave() {
    if (!userId || !job) {
      window.location.href = "/login";
      return;
    }
    try {
      setTogglingSave(true);
      if (saved) {
        await supabase.from("saved_jobs").delete().eq("user_id", userId).eq("job_id", job.id);
        setSaved(false);
      } else {
        await supabase.from("saved_jobs").insert([{ user_id: userId, job_id: job.id }]);
        setSaved(true);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("eod:saved-jobs-changed", { detail: { jobId: job.id } }));
      }
    } catch (err) {
      console.error("Toggle save on /job/[id]:", err);
    } finally {
      setTogglingSave(false);
    }
  }

  if (loading) {
    return (
      <div style={{ background: t.bg, color: t.text, minHeight: "100vh" }}>
        <NavBar />
        <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
          <p>Loading job…</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ background: t.bg, color: t.text, minHeight: "100vh" }}>
        <NavBar />
        <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Job not found</h1>
          <p style={{ marginTop: 10, color: t.textMuted }}>
            This job may have been removed or is no longer available.
          </p>
          <a
            href="/jobs"
            style={{ display: "inline-block", marginTop: 16, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}
          >
            ← Back to jobs
          </a>
        </div>
      </div>
    );
  }

  const applyUrl = formatExternalUrl(job.apply_url);
  const metaParts = [job.location, job.category].filter(Boolean);
  const payText =
    job.pay_min != null && job.pay_max != null
      ? `$${job.pay_min}–$${job.pay_max}`
      : job.pay_min != null
        ? `From $${job.pay_min}`
        : job.pay_max != null
          ? `Up to $${job.pay_max}`
          : null;

  return (
    <div style={{ background: t.bg, color: t.text, minHeight: "100vh" }}>
      <NavBar />
      <div style={{ padding: "24px 20px 40px", maxWidth: 900, margin: "0 auto" }}>
        <a
          href="/jobs"
          style={{ display: "inline-block", marginBottom: 14, color: t.textMuted, fontWeight: 700, fontSize: 13, textDecoration: "none" }}
        >
          ← Back to jobs
        </a>

        <div
          style={{
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            background: t.surface,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "22px 24px 10px" }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, lineHeight: 1.2 }}>{job.title || "Untitled Job"}</h1>
            <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700 }}>{job.company_name || "Unknown Company"}</div>
            {metaParts.length > 0 && (
              <div style={{ marginTop: 6, color: t.textMuted, fontSize: 14 }}>{metaParts.join(" · ")}</div>
            )}
            {(payText || job.clearance) && (
              <div style={{ marginTop: 6, color: t.textMuted, fontSize: 14 }}>
                {payText ? `Pay: ${payText}` : ""}
                {payText && job.clearance ? " · " : ""}
                {job.clearance ? `Clearance: ${job.clearance}` : ""}
              </div>
            )}
            {job.source_type && (
              <div style={{ marginTop: 6, color: t.textFaint, fontSize: 13 }}>Source: {job.source_type}</div>
            )}
          </div>

          {job.og_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.og_image}
              alt={job.title || "Job preview"}
              style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block", borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}
            />
          )}

          <div style={{ padding: "18px 24px 4px" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Job Description</h2>
            <div
              style={{
                marginTop: 10,
                fontSize: 15,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                color: t.text,
              }}
            >
              {job.description && job.description.trim().length > 0
                ? job.description
                : "No description available. Use “Visit site” to view the full listing at the source."}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "18px 24px 22px",
              borderTop: `1px solid ${t.border}`,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            {applyUrl ? (
              <a
                href={applyUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  padding: "11px 18px",
                  borderRadius: 12,
                  background: "#111",
                  color: "white",
                  fontWeight: 800,
                  fontSize: 15,
                  textDecoration: "none",
                }}
              >
                Visit site →
              </a>
            ) : (
              <span style={{ fontSize: 14, color: t.textFaint }}>No external link for this listing.</span>
            )}

            <button
              type="button"
              onClick={toggleSave}
              disabled={togglingSave}
              title={userId ? undefined : "Sign in to save jobs"}
              style={{
                background: saved ? "#111" : t.surface,
                color: saved ? "white" : t.text,
                border: `1px solid ${saved ? "#111" : t.border}`,
                borderRadius: 10,
                padding: "10px 16px",
                fontWeight: 700,
                fontSize: 14,
                cursor: togglingSave ? "not-allowed" : "pointer",
                opacity: togglingSave ? 0.6 : 1,
              }}
            >
              {togglingSave ? "…" : saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
