"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import MemberPaywallModal from "../components/MemberPaywallModal";

const SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal", "Civilian Bomb Tech"];
const STATUS_OPTIONS = ["Active Duty", "Former", "Retired", "Civil Service"];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "Civil Service"];
const YEARS_OPTIONS = [...Array.from({ length: 39 }, (_, i) => String(i + 1)), "40+"];

export default function OnboardingPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<"member" | "employer" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [duplicateProviders, setDuplicateProviders] = useState<string[] | null>(null);

  // Member fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [skillBadge, setSkillBadge] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");

  // Employer fields
  const [empFirstName, setEmpFirstName] = useState("");
  const [empLastName, setEmpLastName] = useState("");
  const [companyName, setCompanyName] = useState("");

  // Referral
  const [referralInput, setReferralInput] = useState("");
  const [memberPaywallOpen, setMemberPaywallOpen] = useState(false);
  const [resumeSubscriptionAckOnly, setResumeSubscriptionAckOnly] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      setUserId(user.id);

      // Pre-fill name from Google OAuth metadata
      const googleName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (googleName) {
        const parts = (googleName as string).trim().split(/\s+/);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
        setEmpFirstName(parts[0] || "");
        setEmpLastName(parts.slice(1).join(" ") || "");
      }

      // Check for duplicate accounts sharing this email (e.g. Google + email/password)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const dupRes = await fetch("/api/check-duplicate-email", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (dupRes.ok) {
          const dupJson = await dupRes.json() as { hasDuplicate: boolean; duplicateProviders?: string[] };
          if (dupJson.hasDuplicate) {
            setDuplicateProviders(dupJson.duplicateProviders ?? ["email"]);
            setChecking(false);
            return;
          }
        }
      }

      // If already onboarded, redirect appropriately
      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "service, company_name, account_type, verification_status, first_name, subscription_terms_acknowledged_at",
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.verification_status === "verified" && (profile?.service || profile?.company_name)) {
        window.location.href = "/";
        return;
      }

      const memberNeedsSubscriptionAck =
        profile?.account_type === "member" &&
        !!profile?.service &&
        !profile?.subscription_terms_acknowledged_at;

      if (memberNeedsSubscriptionAck) {
        setUserId(user.id);
        setAccountType("member");
        setResumeSubscriptionAckOnly(true);
        setMemberPaywallOpen(true);
        setChecking(false);
        return;
      }

      if (profile?.service || profile?.company_name) {
        window.location.href = "/pending";
        return;
      }

      // Pre-fill name from existing profile if available
      if (profile?.first_name) {
        setFirstName(profile.first_name);
        setEmpFirstName(profile.first_name);
      }

      // Pre-fill referral code from URL param or localStorage
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref") || localStorage.getItem("eod_ref") || "";
      if (ref) setReferralInput(ref.toUpperCase());

      setChecking(false);
    }
    check();
  }, []);

  async function handleSubmit() {
    if (!userId || !accountType) return;

    if (accountType === "member") {
      if (!firstName || !lastName || !service || !status) {
        alert("Please fill in all required fields.");
        return;
      }
    } else {
      if (!empFirstName || !empLastName || !companyName) {
        alert("Please fill in all required fields.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const updates =
        accountType === "member"
          ? {
              account_type: "member",
              first_name: firstName,
              last_name: lastName,
              service: service || null,
              status: status || null,
              skill_badge: skillBadge || null,
              years_experience: yearsExperience || null,
              verification_status: "pending",
              is_approved: false,
            }
          : {
              account_type: "employer",
              is_employer: true,
              first_name: empFirstName,
              last_name: empLastName,
              company_name: companyName,
              verification_status: "pending",
            };

      const finalUpdates = referralInput.trim()
        ? { ...updates, referred_by: referralInput.trim().toUpperCase() }
        : updates;

      const { error } = await supabase
        .from("profiles")
        .update(finalUpdates)
        .eq("user_id", userId);

      if (error) { alert("Error saving profile: " + error.message); return; }

      // Generate referral code for this user
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch("/api/generate-referral-code", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }

      localStorage.removeItem("eod_ref");

      if (accountType === "member") {
        setMemberPaywallOpen(true);
      } else {
        window.location.href = "/pending";
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function completeMemberSubscriptionAck() {
    if (!userId) return;
    const { error } = await supabase
      .from("profiles")
      .update({ subscription_terms_acknowledged_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) {
      alert("Could not save subscription acknowledgement: " + error.message);
      return;
    }
    setMemberPaywallOpen(false);
    window.location.href = "/pending";
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid #d1d5db", fontSize: 16, boxSizing: "border-box",
    fontFamily: "inherit",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, background: "white", cursor: "pointer",
  };

  if (duplicateProviders) {
    const hasEmail = duplicateProviders.includes("email");
    const hasGoogle = duplicateProviders.includes("google");
    const existingMethod =
      hasEmail && hasGoogle
        ? "email & password and Google (on a separate login record)"
        : hasEmail
          ? "email & password"
          : hasGoogle
            ? "Google"
            : duplicateProviders.join(", ");
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👤</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Account already exists</div>
          <div style={{ fontSize: 15, color: "#555", lineHeight: 1.6, marginBottom: 24 }}>
            This email is already used for EOD Hub with <strong>{existingMethod}</strong>. That can happen if the same address was registered twice before sign-in methods were linked.<br /><br />
            If you&apos;re already signed in on the main site, open the <strong>avatar menu</strong> (top-left) to switch to your other login. Otherwise sign out below and sign in the way you used originally. After you&apos;re in, use <strong>My Account → Sign-In Methods</strong> to add Google (or email &amp; password) so one account works everywhere.
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            style={{ padding: "12px 28px", borderRadius: 12, border: "none", background: "#111", color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", width: "100%" }}
          >
            Sign out &amp; go to login
          </button>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#888" }}>Loading...</div>
      </div>
    );
  }

  if (resumeSubscriptionAckOnly) {
    return (
      <>
        <div
          style={{
            minHeight: "100vh",
            background: "#f9fafb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>EOD HUB</div>
            <p style={{ margin: "18px 0 0", fontSize: 16, color: "#555", lineHeight: 1.55 }}>
              Finish member signup: review subscription details, then continue to verification.
            </p>
          </div>
        </div>
        <MemberPaywallModal
          open={memberPaywallOpen}
          onClose={() => {}}
          onboardingAck={{ onContinue: () => completeMemberSubscriptionAck() }}
        />
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", padding: "40px 20px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>EOD HUB</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            Built for EOD Techs, by an EOD Tech.
          </div>
        </div>

        <div style={{ background: "white", borderRadius: 16, padding: "32px 28px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>Set up your account</h2>
          <p style={{ fontSize: 14, color: "#666", margin: "0 0 28px", lineHeight: 1.6 }}>
            Tell us who you are. Your account will be reviewed before access is granted.
          </p>

          {/* Account type selector */}
          {!accountType ? (
            <div style={{ display: "grid", gap: 14 }}>
              <button
                onClick={() => setAccountType("member")}
                style={{
                  padding: "20px 24px", borderRadius: 14, border: "2px solid #e5e7eb",
                  background: "white", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#111"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
              >
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>EOD Community Member</div>
                <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                  Active, former, or retired EOD tech. Join the community, access the job board, and connect with fellow techs.
                </div>
              </button>

              <button
                onClick={() => setAccountType("employer")}
                style={{
                  padding: "20px 24px", borderRadius: 14, border: "2px solid #e5e7eb",
                  background: "white", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#111"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 900, fontSize: 16 }}>Employer Account</span>
                  <span style={{ background: "#dbeafe", color: "#1d4ed8", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>FREE</span>
                </div>
                <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                  Hiring organization or recruiter. Post jobs on the EOD job board and search candidates open to new opportunities.
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} style={{ display: "grid", gap: 14 }}>

              {/* Back to type selection */}
              <button
                type="button"
                onClick={() => setAccountType(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#666", fontSize: 13, fontWeight: 700, textAlign: "left", padding: 0, marginBottom: 4 }}
              >
                ← Back
              </button>

              {/* Account type badge */}
              <div style={{ padding: "10px 14px", borderRadius: 10, background: accountType === "employer" ? "#dbeafe" : "#f3f4f6", fontSize: 13, fontWeight: 800, color: accountType === "employer" ? "#1d4ed8" : "#374151" }}>
                {accountType === "employer" ? "Employer Account" : "EOD Community Member"}
              </div>

              {/* MEMBER FORM */}
              {accountType === "member" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>First Name *</label>
                      <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle} placeholder="First name" />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Last Name *</label>
                      <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle} placeholder="Last name" />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Service Branch *</label>
                    <select value={service} onChange={(e) => setService(e.target.value)} style={selectStyle}>
                      <option value="">Select service...</option>
                      {SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Status *</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
                      <option value="">Select status...</option>
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Skill Badge</label>
                      <select value={skillBadge} onChange={(e) => setSkillBadge(e.target.value)} style={selectStyle}>
                        <option value="">Select badge...</option>
                        {SKILL_BADGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Years of Experience</label>
                      <select value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} style={selectStyle}>
                        <option value="">Select years...</option>
                        {YEARS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                </>
              )}

              {/* EMPLOYER FORM */}
              {accountType === "employer" && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>First Name *</label>
                      <input value={empFirstName} onChange={(e) => setEmpFirstName(e.target.value)} style={inputStyle} placeholder="First name" />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Last Name *</label>
                      <input value={empLastName} onChange={(e) => setEmpLastName(e.target.value)} style={inputStyle} placeholder="Last name" />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>Company / Organization Name *</label>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} style={inputStyle} placeholder="e.g. Acme Defense Group" />
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fef9c3", fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
                    Employer accounts are manually reviewed. Once approved, you can post jobs and search candidates who are open to new opportunities.
                  </div>
                </>
              )}

              {/* Referral code — optional, shown for both account types */}
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 4 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5 }}>
                  Referral Code <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
                </label>
                <input
                  value={referralInput}
                  onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                  style={inputStyle}
                  placeholder="e.g. EOD7X2K9"
                  maxLength={8}
                />
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
                  If a community member invited you, enter their code here.
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: "13px", borderRadius: 12, border: "none", background: "black",
                  color: "white", fontWeight: 700, fontSize: 15, cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}
              >
                {submitting && <span className="btn-spinner" />}
                Continue
              </button>
            </form>
          )}
        </div>
      </div>

      <MemberPaywallModal
        open={memberPaywallOpen}
        onClose={() => {}}
        onboardingAck={{ onContinue: () => completeMemberSubscriptionAck() }}
      />
    </div>
  );
}
