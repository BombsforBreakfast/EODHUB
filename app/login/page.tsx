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
  const [confirmPassword, setConfirmPassword] = useState("");

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
    if (password !== confirmPassword) {
      alert("Passwords do not match.");
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
          <input
            placeholder="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              ...inputStyle,
              borderColor: confirmPassword && confirmPassword !== password ? "#ef4444" : undefined,
            }}
          />
        )}

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
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              <span style={{ fontSize: 13, color: "#999" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            </div>
            <button
              type="button"
              onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } })}
              disabled={submitting}
              style={{ ...buttonSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <GoogleIcon />
              Sign in with Google
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              <span style={{ fontSize: 13, color: "#999" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            </div>
            <button
              type="button"
              onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } })}
              disabled={submitting}
              style={{ ...buttonSecondary, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <GoogleIcon />
              Sign up with Google
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7l-6.5 5C9.8 40 16.4 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C41 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
    </svg>
  );
}

const buttonSecondary: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid black",
  background: "white",
  fontWeight: 700,
  cursor: "pointer",
};
