"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "../lib/ThemeContext";
import { getAccessToken, supabase } from "../lib/lib/supabaseClient";
import type { ScrapedJobData } from "../lib/metadata/extractJobMetadata";

type ScrapeStatus = "idle" | "loading" | "success" | "error";

const SCRAPE_DEBOUNCE_MS = 800;

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function fillIfBlank(current: string, next: string | undefined | null): string {
  if (current.trim() || !next?.trim()) return current;
  return next.trim();
}

export type EmployerPostJobPayload = {
  title: string;
  company_name: string;
  category: string;
  location: string;
  apply_url: string;
  description: string;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  pay_min: number | null;
  pay_max: number | null;
};

type Props = {
  open: boolean;
  defaultCompanyName?: string | null;
  onClose: () => void;
  onSuccess?: (result: { jobId: string; postId: string }) => void;
};

export default function EmployerPostJobModal({
  open,
  defaultCompanyName,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTheme();
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState("EOD");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ogTitle, setOgTitle] = useState<string | null>(null);
  const [ogDescription, setOgDescription] = useState<string | null>(null);
  const [ogImage, setOgImage] = useState<string | null>(null);
  const [ogSiteName, setOgSiteName] = useState<string | null>(null);
  const [payMin, setPayMin] = useState<number | null>(null);
  const [payMax, setPayMax] = useState<number | null>(null);
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>("idle");
  const [lastScrapedUrl, setLastScrapedUrl] = useState<string | null>(null);
  const scrapeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrapeRequestRef = useRef(0);
  const scrapeAbortRef = useRef<AbortController | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    border: `1px solid ${t.inputBorder}`,
    borderRadius: 10,
    background: t.input,
    color: t.text,
    fontSize: 14,
    boxSizing: "border-box",
  };

  function resetForm() {
    setTitle("");
    setCompanyName(defaultCompanyName?.trim() || "");
    setCategory("EOD");
    setLocation("");
    setApplyUrl("");
    setDescription("");
    setError(null);
    setOgTitle(null);
    setOgDescription(null);
    setOgImage(null);
    setOgSiteName(null);
    setPayMin(null);
    setPayMax(null);
    setScrapeStatus("idle");
    setLastScrapedUrl(null);
  }

  useEffect(() => {
    if (!open) return;
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when modal opens
  }, [open, defaultCompanyName]);

  function applyScrapedFields(data: ScrapedJobData) {
    setTitle((prev) => fillIfBlank(prev, data.title));
    setCompanyName((prev) => fillIfBlank(prev, data.company));
    setLocation((prev) => fillIfBlank(prev, data.location));
    setDescription((prev) => fillIfBlank(prev, data.description));
    setOgTitle((prev) => prev ?? data.og_title ?? data.title ?? null);
    setOgDescription((prev) => prev ?? data.og_description ?? data.description ?? null);
    setOgImage((prev) => prev ?? data.og_image ?? null);
    setOgSiteName((prev) => prev ?? data.og_site_name ?? data.source_site ?? data.company ?? null);
    setPayMin((prev) => prev ?? data.pay_min ?? null);
    setPayMax((prev) => prev ?? data.pay_max ?? null);
  }

  useEffect(() => {
    if (!open) return;

    const normalized = applyUrl.trim() ? normalizeUrl(applyUrl.trim()) : "";

    if (!normalized || !isValidHttpUrl(normalized)) {
      if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
      scrapeAbortRef.current?.abort();
      if (!applyUrl.trim()) {
        setScrapeStatus("idle");
        setLastScrapedUrl(null);
      } else {
        setScrapeStatus("idle");
      }
      return;
    }

    if (normalized === lastScrapedUrl) return;

    if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
    scrapeAbortRef.current?.abort();

    const requestId = scrapeRequestRef.current + 1;
    scrapeRequestRef.current = requestId;

    scrapeDebounceRef.current = setTimeout(async () => {
      scrapeAbortRef.current?.abort();
      const controller = new AbortController();
      scrapeAbortRef.current = controller;

      setOgTitle(null);
      setOgDescription(null);
      setOgImage(null);
      setOgSiteName(null);
      setPayMin(null);
      setPayMax(null);

      try {
        setScrapeStatus("loading");
        const token = await getAccessToken();
        if (!token) {
          if (scrapeRequestRef.current === requestId) setScrapeStatus("error");
          return;
        }

        const res = await fetch("/api/scrape-job-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url: normalized }),
          signal: controller.signal,
        });

        if (scrapeRequestRef.current !== requestId || controller.signal.aborted) return;

        if (res.ok) {
          const payload = (await res.json()) as { ok?: boolean; data?: ScrapedJobData };
          if (payload.ok && payload.data) {
            applyScrapedFields(payload.data);
            setLastScrapedUrl(normalized);
            setScrapeStatus("success");
            return;
          }
        }

        setScrapeStatus("error");
      } catch (err) {
        if (controller.signal.aborted || scrapeRequestRef.current !== requestId) return;
        setScrapeStatus("error");
        console.error("Job URL scrape error:", err);
      }
    }, SCRAPE_DEBOUNCE_MS);

    return () => {
      if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
    };
  }, [applyUrl, lastScrapedUrl, open]);

  async function handleSubmit() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? (await getAccessToken());
      if (!token) {
        setError("You must be logged in to post a job.");
        return;
      }

      const payload: EmployerPostJobPayload = {
        title: title.trim(),
        company_name: companyName.trim(),
        category,
        location: location.trim(),
        apply_url: applyUrl.trim() ? normalizeUrl(applyUrl.trim()) : "",
        description: description.trim(),
        og_title: ogTitle,
        og_description: ogDescription,
        og_image: ogImage,
        og_site_name: ogSiteName,
        pay_min: payMin,
        pay_max: payMax,
      };

      const res = await fetch("/api/employer/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; jobId?: string; postId?: string; error?: string }
        | null;

      if (!res.ok || !data?.ok || !data.jobId || !data.postId) {
        setError(data?.error || "Failed to post job.");
        return;
      }

      onSuccess?.({ jobId: data.jobId, postId: data.postId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Post a job"
        style={{
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Post a job</div>
            <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
              Goes live on the job board and your feed right away.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              fontSize: 24,
              lineHeight: 1,
              cursor: submitting ? "not-allowed" : "pointer",
              color: t.textMuted,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: 20, display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Apply URL</div>
            <input
              value={applyUrl}
              onChange={(e) => setApplyUrl(e.target.value)}
              onBlur={(e) => {
                if (e.target.value.trim()) setApplyUrl(normalizeUrl(e.target.value));
              }}
              style={inputStyle}
              placeholder="https://..."
            />
            {scrapeStatus === "loading" && (
              <div style={{ marginTop: 6, fontSize: 12, color: t.textMuted }}>Pulling job details…</div>
            )}
            {scrapeStatus === "success" && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#15803d" }}>
                Job details added. Review before posting.
              </div>
            )}
            {scrapeStatus === "error" && (
              <div style={{ marginTop: 6, fontSize: 12, color: t.textMuted }}>
                We couldn&apos;t pull details from this site. You can still post manually.
              </div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Job Title</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="UXO Technician (CONUS)"
            />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Company Name</div>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={inputStyle}
              placeholder="Acme Defense Services"
            />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="EOD">EOD</option>
              <option value="UXO">UXO</option>
              <option value="Bomb Squad">Bomb Squad</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Location</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={inputStyle}
              placeholder="Fort Liberty, NC / CONUS / OCONUS"
            />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Description</div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
              placeholder="Describe the job, requirements, schedule, pay, clearance, etc."
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: "#b91c1c", background: "#fef2f2", borderRadius: 10, padding: "10px 12px" }}>
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: `1px solid ${t.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (!submitting) onClose();
            }}
            disabled={submitting}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${t.border}`,
              background: t.surface,
              color: t.text,
              fontWeight: 700,
              fontSize: 14,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "#7c3aed",
              color: "white",
              fontWeight: 800,
              fontSize: 14,
              cursor: submitting || !title.trim() ? "not-allowed" : "pointer",
              opacity: submitting || !title.trim() ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            {submitting && <span className="btn-spinner" />}
            Post job
          </button>
        </div>
      </div>
    </div>
  );
}
