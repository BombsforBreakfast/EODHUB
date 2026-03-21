"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/lib/supabaseClient";
import NavBar from "../../components/NavBar";

type Job = {
  id: string;
  title: string;
  company_name: string;
  location: string;
  category: string;
  description: string;
  apply_url: string;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  source_type: string | null;
};

function formatExternalUrl(url: string) {
  if (!url) return "#";

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `https://${url}`;
}

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

  useEffect(() => {
    async function loadJobPage() {
      setLoading(true);

      const { data: jobData, error: jobError } = await supabase
  .from("jobs")
  .select(
    "id,title,company_name,location,category,description,apply_url,pay_min,pay_max,clearance,source_type,is_approved"
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

      setJob(jobData);

      const { data: userData } = await supabase.auth.getUser();

      if (userData.user) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("verification_status")
          .eq("user_id", userData.user.id)
          .single();

        if (profileError) {
          console.error("Profile status error:", profileError);
        }

        setVerificationStatus(profileData?.verification_status ?? null);
      } else {
        setVerificationStatus(null);
      }

      setLoading(false);
    }

    if (jobId) {
      loadJobPage();
    }
  }, [jobId]);

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <NavBar />
        <p>Loading job...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <NavBar />
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Job not found</h1>
        <p style={{ marginTop: 10 }}>
          This job may have been removed or is no longer available.
        </p>
      </div>
    );
  }

  const isApproved = verificationStatus === "approved";

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <NavBar />

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 16,
          padding: 24,
          marginTop: 10,
        }}
      >
        <h1 style={{ fontSize: 34, fontWeight: 900 }}>{job.title}</h1>

        <div style={{ marginTop: 12, fontSize: 18 }}>
          <strong>{job.company_name}</strong>
        </div>

        <div style={{ marginTop: 8, color: "#444" }}>
          {job.location} • {job.category}
        </div>

        <div style={{ marginTop: 12, color: "#444" }}>
          {job.pay_min != null && job.pay_max != null
            ? `Pay: $${job.pay_min}–$${job.pay_max}`
            : "Pay: Not listed"}
          {job.clearance ? ` • Clearance: ${job.clearance}` : ""}
        </div>

        {job.source_type && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
            Source: {job.source_type}
          </div>
        )}

        <div
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid #eee",
          }}
        >
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Job Description</h2>

          <p
            style={{
              marginTop: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              color: "#333",
            }}
          >
            {job.description}
          </p>
        </div>

        <div style={{ marginTop: 28 }}>
          {isApproved ? (
            <a
              href={formatExternalUrl(job.apply_url)}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                padding: "12px 18px",
                borderRadius: 12,
                background: "black",
                color: "white",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Apply for Job →
            </a>
          ) : (
            <a
              href="/login"
              style={{
                display: "inline-block",
                padding: "12px 18px",
                borderRadius: 12,
                background: "black",
                color: "white",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Login / Verify to Apply →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}