"use client";

import { useEffect, useMemo, useState } from "react";
import NavBar from "../components/NavBar";
import UpgradePromptModal from "../components/UpgradePromptModal";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { getFeatureAccess } from "../lib/featureAccess";
import { applyJobFilters, uniqueJobLocations, type JobFilterState, type JobListItem } from "../lib/jobFilters";

type ProfileRow = {
  access_tier: string | null;
  verification_status: string | null;
};

const DEFAULT_FILTERS: JobFilterState = {
  location: "",
  keyword: "",
  minSalary: "",
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

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      setCanViewFullJobs(featureAccess.canViewFullJobs);
      setCanUseJobFilters(featureAccess.canUseJobFilters);

      const limit = featureAccess.canViewFullJobs ? 500 : 5;
      const { data: jobsData, error } = await supabase
        .from("jobs")
        .select("id, created_at, title, category, location, pay_min, pay_max, clearance, description, apply_url, company_name, source_type, og_title, og_description, og_image, og_site_name")
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(limit);

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
  }, []);

  const locationOptions = useMemo(() => uniqueJobLocations(jobs), [jobs]);
  const visibleJobs = useMemo(() => {
    if (!canUseJobFilters) return jobs;
    return applyJobFilters(jobs, filters);
  }, [jobs, filters, canUseJobFilters]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1800,
        margin: "0 auto",
        padding: "24px 20px",
        boxSizing: "border-box",
        background: t.bg,
        minHeight: "100vh",
        color: t.text,
      }}
    >
      <NavBar />

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
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 10,
            }}
          >
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

            <input
              type="text"
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              placeholder="Keyword/tag (e.g. UXO, TSS-E, Safety)"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
            />

            <input
              type="number"
              value={filters.minSalary}
              onChange={(e) => setFilters((prev) => ({ ...prev, minSalary: e.target.value }))}
              placeholder="Minimum salary"
              min={0}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
            />
          </div>
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
            <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface }}>
              {job.og_image ? (
                <img src={job.og_image} alt={job.title || "Job preview"} style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
              ) : null}
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.3 }}>{job.title || job.og_title || "Untitled Job"}</div>
                <div style={{ marginTop: 5, color: t.textMuted, fontSize: 14 }}>{job.company_name || job.og_site_name || "Unknown Company"}</div>
                <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                  {(job.location || "Location not listed") + " - " + (job.category || "General")}
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                  <a href={`/job/${job.id}`} style={{ fontSize: 13, fontWeight: 700 }}>
                    Details
                  </a>
                  {job.apply_url && (
                    <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
                      Apply
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <UpgradePromptModal open={showUpgradePrompt} onClose={() => setShowUpgradePrompt(false)} />
    </div>
  );
}
