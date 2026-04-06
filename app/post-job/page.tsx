"use client";

import { useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import MemberPaywallModal from "../components/MemberPaywallModal";
import { useMemberSubscriptionGate } from "../hooks/useMemberSubscriptionGate";

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
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

  async function handleSubmit() {
    if (blockIfNeeded()) return;
    try {
      setSubmitting(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        alert("You must be logged in to post a job.");
        return;
      }

      const normalizedApplyUrl = normalizeUrl(applyUrl);

      const { data, error } = await supabase
        .from("jobs")
        .insert([{
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
        }])
        .select()
        .single();

      if (error) { alert("Error submitting job: " + error.message); return; }

      if (data?.id && normalizedApplyUrl) {
        supabase.auth.getSession().then(({ data: { session } }) => {
          fetch("/api/fetch-job", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
            body: JSON.stringify({ jobId: data.id, websiteUrl: normalizedApplyUrl }),
          }).catch((err) => console.error("Job metadata fetch error:", err));
        });
      }

      alert("Job submitted! Pending approval.");
      setTitle(""); setCompanyName(""); setCategory("EOD"); setLocation(""); setApplyUrl(""); setDescription(""); setAnonymous(false);
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
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Job Title</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="UXO Technician (CONUS)" />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Company Name</div>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} placeholder="Acme Defense Services" />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Category</div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="EOD">EOD</option>
              <option value="UXO">UXO</option>
              <option value="Bomb Squad">Bomb Squad</option>
            </select>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Location</div>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="Fort Liberty, NC / CONUS / OCONUS" />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 14, color: t.text }}>Apply URL</div>
            <input
              value={applyUrl}
              onChange={(e) => setApplyUrl(e.target.value)}
              onBlur={(e) => { if (e.target.value.trim()) setApplyUrl(normalizeUrl(e.target.value)); }}
              style={inputStyle}
              placeholder="https://..."
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

          {/* Anonymous toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 14px", border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface }}>
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
            style={{ marginTop: 4, padding: 13, borderRadius: 12, border: "none", background: "#7c3aed", color: "white", fontWeight: 800, fontSize: 15, cursor: submitting || !title.trim() ? "not-allowed" : "pointer", opacity: submitting || !title.trim() ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
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
