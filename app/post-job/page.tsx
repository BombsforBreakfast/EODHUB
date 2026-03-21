"use client";

import { useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import NavBar from "../components/NavBar";

function normalizeUrl(url: string) {
  const trimmed = url.trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export default function PostJobPage() {
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState("EOD");
  const [location, setLocation] = useState("");
  const [applyUrl, setApplyUrl] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
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

      const { data, error } = await supabase
        .from("jobs")
        .insert([
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
          },
        ])
        .select()
        .single();

      if (error) {
        alert("Error submitting job: " + error.message);
        return;
      }

      if (data?.id && normalizedApplyUrl) {
        fetch("/api/fetch-job", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jobId: data.id,
    websiteUrl: normalizedApplyUrl,
  }),
}).catch((err) => {
  console.error("Job metadata fetch error:", err);
});
      }

      alert("Job submitted! Pending approval.");

      setTitle("");
      setCompanyName("");
      setCategory("EOD");
      setLocation("");
      setApplyUrl("");
      setDescription("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      alert("Error submitting job: " + message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 800, margin: "0 auto" }}>
      <NavBar />

      <h1 style={{ fontSize: 32, fontWeight: 700 }}>Post a Job</h1>

      <p style={{ marginTop: 10, color: "#444" }}>
        Submissions go to an approval queue (not public until approved).
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <label>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Job Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
            placeholder="UXO Technician (CONUS)"
          />
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Company Name</div>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
            placeholder="Acme Defense Services"
          />
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Category</div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
          >
            <option value="EOD">EOD</option>
            <option value="UXO">UXO</option>
            <option value="Bomb Squad">Bomb Squad</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Location</div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
            placeholder="Fort Liberty, NC / CONUS / OCONUS"
          />
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Apply URL</div>
          <input
            value={applyUrl}
            onChange={(e) => setApplyUrl(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
            }}
            placeholder="https://..."
          />
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              border: "1px solid #ccc",
              borderRadius: 10,
              minHeight: 140,
            }}
            placeholder="Describe the job, requirements, schedule, pay, clearance, etc."
          />
        </label>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            border: "none",
            background: "black",
            color: "white",
            fontWeight: 800,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Submitting..." : "Submit Job"}
        </button>
      </div>
    </div>
  );
}