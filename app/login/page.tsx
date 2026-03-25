"use client";

import { useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";

const SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force", "Civilian Bomb Tech"];
const STATUS_OPTIONS = ["Active", "Former", "Retired", "Civil Service"];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "Civil Service"];
const YEARS_OPTIONS = [...Array.from({ length: 39 }, (_, i) => String(i + 1)), "40+"];

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [skillBadge, setSkillBadge] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    try {
      setSubmitting(true);

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        alert("Login error: " + error.message);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert("Login succeeded, but no session was found yet. Please try again.");
        return;
      }

      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignup() {
    if (!firstName || !lastName || !service || !status) {
      alert("Please complete all required fields (First Name, Last Name, Service, and Status).");
      return;
    }

    try {
      setSubmitting(true);

      const { error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        alert("Signup error: " + signUpError.message);
        return;
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError || !signInData.user) {
        alert("Sign-in after signup failed: " + (signInError?.message ?? "No user"));
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          service: service || null,
          status: status || null,
          years_experience: yearsExperience || null,
          skill_badge: skillBadge || null,
          verification_status: "pending",
        })
        .eq("user_id", signInData.user.id);

      if (profileError) {
        alert("Profile setup error: " + profileError.message);
        return;
      }

      alert("Signup complete. Awaiting verification.");
      window.location.href = "/profile";
    } finally {
      setSubmitting(false);
    }
  }

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 16,
    background: "white",
  };

  const inputStyle: React.CSSProperties = {
    padding: 10,
    borderRadius: 10,
    border: "1px solid #ccc",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ padding: 40, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>EOD HUB</div>
        <div style={{ fontSize: 14, color: "#888", marginTop: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Built for EOD Techs, by an EOD Tech.</div>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        {mode === "login" ? "Login" : "Sign Up"}
      </h1>

      <form
        onSubmit={(e) => { e.preventDefault(); mode === "login" ? handleLogin() : handleSignup(); }}
        style={{ display: "grid", gap: 12, marginTop: 20 }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        {mode === "signup" && (
          <>
            <input
              placeholder="First Name *"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={inputStyle}
            />

            <input
              placeholder="Last Name *"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={inputStyle}
            />

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Service Branch *</div>
              <select value={service} onChange={(e) => setService(e.target.value)} style={selectStyle}>
                <option value="">Select service...</option>
                {SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Status *</div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                <option value="">Select status...</option>
                {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Skill Badge</div>
              <select value={skillBadge} onChange={(e) => setSkillBadge(e.target.value)} style={selectStyle}>
                <option value="">Select badge...</option>
                {SKILL_BADGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Years of Experience</div>
              <select value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} style={selectStyle}>
                <option value="">Select years...</option>
                {YEARS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </>
        )}

        {mode === "login" ? (
          <>
            <button onClick={handleLogin} disabled={submitting} style={{ ...buttonPrimary, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Logging In..." : "Login"}
            </button>
            <button onClick={() => setMode("signup")} disabled={submitting} style={buttonSecondary}>
              Need an account? Sign Up
            </button>
          </>
        ) : (
          <>
            <button onClick={handleSignup} disabled={submitting} style={{ ...buttonPrimary, opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Creating Account..." : "Complete Signup"}
            </button>
            <button onClick={() => setMode("login")} disabled={submitting} style={buttonSecondary}>
              Back to Login
            </button>
          </>
        )}
      </form>
    </div>
  );
}

const buttonPrimary: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "none",
  background: "black",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const buttonSecondary: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid black",
  background: "white",
  fontWeight: 700,
  cursor: "pointer",
};
