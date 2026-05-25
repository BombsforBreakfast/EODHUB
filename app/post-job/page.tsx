"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import MemberPaywallModal from "../components/MemberPaywallModal";
import { useMemberSubscriptionGate } from "../hooks/useMemberSubscriptionGate";
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

export default function PostJobPage() {
  const { t } = useTheme();
  const { blockIfNeeded, paywallOpen, setPaywallOpen } = useMemberSubscriptionGate();
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState("EOD");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [description, setDescription] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  function resetScrapeState() {
    setScrapeStatus("idle");
    setLastScrapedUrl(null);
    setOgTitle(null);
    setOgDescription(null);
    setOgImage(null);
    setOgSiteName(null);
    setPayMin(null);
    setPayMax(null);
  }

  useEffect(() => {
    const normalized = applyUrl.trim() ? normalizeUrl(applyUrl.trim()) : "";

    if (!normalized || !isValidHttpUrl(normalized)) {
      if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
      scrapeAbortRef.current?.abort();
      if (!applyUrl.trim()) {
        resetScrapeState();
      } else {
        setScrapeStatus("idle");
      }
      return;
    }

    if (normalized === lastScrapedUrl) {
      return;
    }

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

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
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
  }, [applyUrl, lastScrapedUrl]);

  async function handleSubmit() {
    if (blockIfNeeded()) return;
    try {
      setSubmitting(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        alert("You must be logged in to post a job.");
        return;
      }

      const normalizedApplyUrl = normalizeUrl(applyUrl);

      const { error } = await supabase.from("jobs").insert([
        {
          title,
          company_name: companyName,
          category,
          location,
          apply_url: normalizedApplyUrl,
          description,
          is_approved: false,
          source_type: "community",
          user_id: user.id,
          anonymous,
          og_title: ogTitle,
          og_description: ogDescription,
          og_image: ogImage,
          og_site_name: ogSiteName,
          pay_min: payMin,
          pay_max: payMax,
        },
      ]);

      if (error) {
        alert("Error submitting job: " + error.message);
        return;
      }

      alert("Job submitted! Pending approval.");
      setTitle("");
      setCompanyName("");
      setCategory("EOD");
      setLocation("");
      setApplyUrl("");
      setDescription("");
      setAnonymous(false);
      resetScrapeState();
    } catch (err) {
      alert("Error submitting job: " + (err instanceof Error ? err.message : "Something went wrong."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ background: t.bg, minHeight: "100vh" }}>
      <NavBar />
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 6px", color: t.text }}>Post a Job</h1>
        <p style={{ marginTop: 0, marginBottom: 24, color: t.textMuted, fontSize: 14 }}>
          Submissions go to an approval queue — not public until approved.
        </p>

        <div style={{ display: "grid", gap: 14 }}>
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
              style={{ ...inputStyle, minHeight: 140, resize: "vertical" }}
              placeholder="Describe the job, requirements, schedule, pay, clearance, etc."
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              padding: "10px 14px",
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              background: t.surface,
            }}
          >
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: t.text }}>Post anonymously</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                Your name won&apos;t appear on the listing. Your account is still associated with this submission.
              </div>
            </div>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            style={{
              marginTop: 4,
              padding: 13,
              borderRadius: 12,
              border: "none",
              background: "#7c3aed",
              color: "white",
              fontWeight: 800,
              fontSize: 15,
              cursor: submitting || !title.trim() ? "not-allowed" : "pointer",
              opacity: submitting || !title.trim() ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            {submitting && <span className="btn-spinner" />}
            Submit Job
          </button>
        </div>
      </div>
      <MemberPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
