"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useAuth } from "../lib/auth/AuthProvider";
import Link from "next/link";
import { isPureAdminEmail, STAFF_DEFAULT_PROFILE_PHOTO_PATH } from "../lib/pureAdminAllowlist";
import { loadActiveProfile } from "../lib/auth/activeProfile";
import { clearAppAuthState } from "../lib/auth/sessionState";
import {
  hasFullPlatformAccess,
  isInAdminReviewQueue,
  isOAuthOnlyGoogleUser,
  needsEmailVerification,
} from "../lib/verificationAccess";
import { devAuthLog } from "../lib/auth/signupErrors";

import {
  hasFullLastName,
  MEMBER_SERVICE_OPTIONS,
  MEMBER_STATUS_OPTIONS,
  parseSignupFullName,
  SIGNUP_LAST_NAME_REQUIRED_MESSAGE,
  splitFullName,
} from "../lib/profileCompleteness";
import { ONBOARDING_REQUIRED_FIELDS_MESSAGE } from "../lib/onboardingGate";
import { validateImagePick } from "../lib/uploadLimits";
import { prepareAvatarUploadFile } from "../lib/prepareUploadFile";
import {
  clearStoredReferral,
  readStoredReferral,
} from "../lib/referralCapture";
import { trackOnboardingStep } from "../lib/onboardingAnalytics";
import { useOnboardingStepTracking } from "../hooks/useOnboardingStepTracking";
const SERVICE_OPTIONS = [...MEMBER_SERVICE_OPTIONS];
const STATUS_OPTIONS = [...MEMBER_STATUS_OPTIONS];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "LEO/FED", "Civil Service"];
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
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreviewUrl, setProfilePhotoPreviewUrl] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState<string | null>(null);

  // Employer fields
  const [companyName, setCompanyName] = useState("");

  const [agreedLegal, setAgreedLegal] = useState(false);
  const [missingFieldId, setMissingFieldId] = useState<string | null>(null);
  const [showRequiredHelper, setShowRequiredHelper] = useState(false);
  const [employerConfirmOpen, setEmployerConfirmOpen] = useState(false);

  const { user: authUser, isLoading: authLoading } = useAuth();
  // Ensures the heavy first-load check (profile fetch, name prefill, routing)
  // runs once per session and isn't re-triggered by later auth updates such as
  // token refreshes, which would otherwise clobber in-progress form input.
  const didInitRef = useRef(false);

  useOnboardingStepTracking("onboarding_viewed", !checking);

  useEffect(() => {
    if (accountType) {
      trackOnboardingStep("onboarding_account_type", "action", { accountType });
    }
  }, [accountType]);

  useEffect(() => {
    const prevDocColorScheme = document.documentElement.style.colorScheme;
    const prevBodyColorScheme = document.body.style.colorScheme;
    document.documentElement.style.colorScheme = "light";
    document.body.style.colorScheme = "light";
    return () => {
      document.documentElement.style.colorScheme = prevDocColorScheme;
      document.body.style.colorScheme = prevBodyColorScheme;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
    };
  }, [profilePhotoPreviewUrl]);

  function markMissingField(fieldId: string) {
    setMissingFieldId(fieldId);
    setShowRequiredHelper(true);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(fieldId);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  function clearMissingFieldIfMatch(fieldId: string) {
    if (missingFieldId === fieldId) {
      setMissingFieldId(null);
      setShowRequiredHelper(false);
    }
  }

  function setNameFieldsFromFullName(name: string) {
    const parsed = parseSignupFullName(name);
    if (parsed) {
      setFirstName(parsed.firstName);
      setLastName(parsed.lastName);
      return;
    }
    const split = splitFullName(name);
    setFirstName(split.first_name);
    setLastName(split.last_name);
  }

  const isMissing = (fieldId: string) => missingFieldId === fieldId;

  function handleProfilePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    const validationError = validateImagePick(file);
    if (validationError) {
      setProfilePhotoError(validationError);
      setProfilePhotoFile(null);
      e.target.value = "";
      return;
    }

    setProfilePhotoError(null);
    setProfilePhotoFile(file);
    setProfilePhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function clearProfilePhotoPick() {
    setProfilePhotoFile(null);
    setProfilePhotoError(null);
    setProfilePhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function uploadOnboardingProfilePhoto(file: File, ownerUserId: string): Promise<string> {
    const prepared = await prepareAvatarUploadFile(file);
    if (!prepared.ok) throw new Error(prepared.error);
    const uploadFile = prepared.file;
    const filePath = `${ownerUserId}/${Date.now()}-onboarding.jpg`;
    const { error } = await supabase.storage.from("profile-photos").upload(filePath, uploadFile, {
      upsert: true,
      contentType: uploadFile.type || "image/jpeg",
    });
    if (error) throw error;
    return supabase.storage.from("profile-photos").getPublicUrl(filePath).data.publicUrl;
  }

  useEffect(() => {
    // Gate on the centralized auth state (AuthProvider) instead of issuing our
    // own getUser() on mount. AuthProvider resolves the session from cookies
    // before flipping isLoading off, so we never redirect during the post-OAuth
    // hydration window — which is what bounced the first login attempt.
    if (authLoading) return;
    if (didInitRef.current) return;
    if (!authUser) {
      window.location.href = "/login";
      return;
    }
    didInitRef.current = true;
    const user = authUser;

    async function check() {
      setUserId(user.id);

      // Pure-admin self-bootstrap: if this email is in the EOD HUB staff allowlist,
      // promote the profile to a "pure admin" (god rights, no public profile,
      // skip all onboarding questions) and redirect straight to the app.
      if (isPureAdminEmail(user.email)) {
        const { error: promoteErr } = await supabase
          .from("profiles")
          .update({
            is_pure_admin: true,
            is_admin: true,
            verification_status: "verified",
            email_verified: true,
            admin_verified: true,
            email_verified_at: new Date().toISOString(),
            is_approved: true,
            account_type: "admin",
            display_name: "EOD HUB",
            first_name: null,
            last_name: null,
            service: null,
            status: null,
            skill_badge: null,
            years_experience: null,
            company_name: null,
            photo_url: STAFF_DEFAULT_PROFILE_PHOTO_PATH,
          })
          .eq("user_id", user.id);
        if (promoteErr) {
          console.error("Pure admin auto-promote failed:", promoteErr);
        }
        // Staff allowlist accounts now have full access — remove any matching
        // pre-signup waitlist entry. Authorized by the just-applied is_admin
        // flag (see waitlist_signups_delete_admin RLS policy).
        if (user.email) {
          // Waitlist emails are stored lowercase/trimmed by the insert API,
          // so use an exact match against the normalized form rather than
          // ILIKE (avoids `_` / `%` wildcard pitfalls in email local parts).
          const normalizedEmail = user.email.trim().toLowerCase();
          const { error: waitlistDeleteErr } = await supabase
            .from("waitlist_signups")
            .delete()
            .eq("email", normalizedEmail);
          if (waitlistDeleteErr) {
            console.error("Pure admin waitlist cleanup failed:", waitlistDeleteErr);
          }
        }
        window.location.href = "/";
        return;
      }

      // Pre-fill name from OAuth metadata (Google, Apple, etc.)
      const oauthName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (oauthName) {
        setNameFieldsFromFullName(String(oauthName).trim());
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
      const { profile } = await loadActiveProfile<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
        service: string | null;
        company_name: string | null;
        account_type: "member" | "employer" | "admin" | null;
        verification_status: string | null;
        email_verified: boolean | null;
        admin_verified: boolean | null;
        must_complete_onboarding: boolean | null;
      }>(supabase, user, {
        route: "app/onboarding/page.tsx:check",
        select: "user_id, email, display_name, first_name, last_name, photo_url, service, company_name, account_type, verification_status, email_verified, admin_verified, must_complete_onboarding, is_pure_admin",
      });

      if (profile?.must_complete_onboarding) {
        const prefilled = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
        if (prefilled) setNameFieldsFromFullName(prefilled);
        const params = new URLSearchParams(window.location.search);
        if (params.get("notice") === "required" || params.get("error") === "incomplete") {
          setShowRequiredHelper(true);
        }
        setChecking(false);
        return;
      }

      if (
        profile &&
        hasFullPlatformAccess(profile) &&
        (profile.service || profile.company_name)
      ) {
        window.location.href = "/";
        return;
      }

      if (profile && needsEmailVerification(profile) && (profile.service || profile.company_name)) {
        window.location.href = "/verify-email";
        return;
      }

      if (profile?.service || profile?.company_name) {
        if (needsEmailVerification(profile)) {
          window.location.href = "/verify-email";
          return;
        }
        if (isInAdminReviewQueue(profile) || (!hasFullPlatformAccess(profile) && profile.email_verified)) {
          window.location.href = "/pending";
          return;
        }
        if (!hasFullPlatformAccess(profile)) {
          window.location.href = "/verify-email";
          return;
        }
      }

      // Pre-fill name from existing profile if available
      const profileFullName = [profile?.first_name, profile?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (profileFullName) {
        setNameFieldsFromFullName(profileFullName);
      } else if (profile?.display_name?.trim()) {
        setNameFieldsFromFullName(profile.display_name.trim());
      }

      // Pre-fill referral code from URL param or localStorage
      const params = new URLSearchParams(window.location.search);
      if (params.get("notice") === "required" || params.get("error") === "incomplete") {
        setShowRequiredHelper(true);
      }

      setChecking(false);
    }
    check();
  }, [authLoading, authUser]);

  async function redirectAfterOnboarding(skipsEmailVerification: boolean) {
    if (skipsEmailVerification) {
      devAuthLog("onboarding", { step: "redirect_pending_oauth", userId });
      window.location.href = "/pending";
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const sendRes = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (process.env.NODE_ENV === "development") {
        devAuthLog("onboarding", {
          step: "send_verification_email",
          status: sendRes.status,
          ok: sendRes.ok,
        });
      }
    } else {
      devAuthLog("onboarding", { step: "send_verification_skipped_no_session", userId });
    }
    window.location.href = "/verify-email";
  }

  async function handleSubmit() {
    if (!userId || !accountType) return;

    if (!firstName.trim()) return markMissingField("field-first-name");
    if (!lastName.trim() || !hasFullLastName(lastName)) return markMissingField("field-last-name");

    if (accountType === "member") {
      if (!service) return markMissingField("field-member-service");
      if (!status) return markMissingField("field-member-status");
    } else {
      if (!companyName.trim()) return markMissingField("field-employer-company");
    }

    if (!agreedLegal) return markMissingField("field-legal-agreement");

    setMissingFieldId(null);
    setShowRequiredHelper(false);

    trackOnboardingStep("onboarding_submit", "action", { accountType });

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("Session expired. Please sign in again.");
        window.location.href = "/login";
        return;
      }

      let uploadedProfilePhotoUrl: string | null = null;
      if (profilePhotoFile) {
        try {
          uploadedProfilePhotoUrl = await uploadOnboardingProfilePhoto(profilePhotoFile, userId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setProfilePhotoError(message);
          alert(`Profile picture upload failed: ${message}`);
          return;
        }
      }

      const saveRes = await fetch("/api/account/save-onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          accountType,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          service,
          status,
          skillBadge,
          yearsExperience,
          companyName,
          referralInput: readStoredReferral() ?? "",
          photoUrl: uploadedProfilePhotoUrl,
        }),
      });

      const saveJson = (await saveRes.json().catch(() => ({}))) as {
        error?: string;
        verification_status?: string;
        wasProvisioned?: boolean;
        isTrustedOAuth?: boolean;
        isGoogle?: boolean;
      };

      if (!saveRes.ok) {
        devAuthLog("onboarding", { step: "profile_update_failed", userId, status: saveRes.status });
        alert(saveJson.error ?? "Error saving profile.");
        return;
      }

      devAuthLog("onboarding", {
        step: "profile_updated",
        userId,
        verification_status: saveJson.verification_status,
        isTrustedOAuth: saveJson.isTrustedOAuth ?? saveJson.isGoogle,
      });

      if (saveJson.wasProvisioned) {
        const clearRes = await fetch("/api/account/complete-onboarding", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!clearRes.ok) {
          devAuthLog("onboarding", {
            step: "clear_onboarding_flag_failed",
            userId,
            status: clearRes.status,
          });
          alert("Onboarding saved but could not finalize. Please refresh and try again.");
          return;
        }
      }

      await fetch("/api/generate-referral-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      clearStoredReferral();

      await redirectAfterOnboarding(!!(saveJson.isTrustedOAuth ?? saveJson.isGoogle));
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", maxWidth: "100%", minWidth: 0, padding: "10px 14px", borderRadius: 10,
    border: "1px solid #d1d5db", fontSize: 16, boxSizing: "border-box",
    fontFamily: "inherit", color: "#111827", background: "#ffffff",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle, background: "white", cursor: "pointer", color: "#374151",
  };

  if (duplicateProviders) {
    const hasEmail = duplicateProviders.includes("email");
    const oauthMethods = duplicateProviders
      .filter((p) => p !== "email")
      .map((p) => (p === "google" ? "Google" : p === "apple" ? "Apple" : p));
    const existingMethod =
      hasEmail && oauthMethods.length > 0
        ? `email & password and ${oauthMethods.join(" / ")} (on a separate login record)`
        : hasEmail
          ? "email & password"
          : oauthMethods.length > 0
            ? oauthMethods.join(" / ")
            : duplicateProviders.join(", ");
    return (
      <div className="onboarding-page-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="onboarding-page-inner" style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>👤</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Account already exists</div>
          <div style={{ fontSize: 15, color: "#1f2937", lineHeight: 1.6, marginBottom: 24 }}>
            This email is already used for EOD Hub with <strong>{existingMethod}</strong>. That can happen if the same address was registered twice before sign-in methods were linked.<br /><br />
            If you&apos;re already signed in on the main site, open the <strong>avatar menu</strong> (top-left) to switch to your other login. Otherwise sign out below and sign in the way you used originally. After you&apos;re in, use <strong>My Account → Sign-In Methods</strong> to add Google (or email &amp; password) so one account works everywhere.
          </div>
          <button
            onClick={async () => { clearAppAuthState(); await supabase.auth.signOut(); window.location.href = "/login"; }}
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
        <div style={{ color: "#374151" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="onboarding-page-shell">
      <div className="onboarding-page-inner">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: "#111827" }}>EOD HUB</div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 6, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
            Built for EOD Techs, by an EOD Tech.
          </div>
        </div>

        <div className="onboarding-page-card">
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px", color: "#111827" }}>Set up your account</h2>
          <p style={{ fontSize: 14, color: "#1f2937", margin: "0 0 28px", lineHeight: 1.6 }}>
            Tell us who you are. Your account will be reviewed before access is granted.
          </p>

          {showRequiredHelper && (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid #10b981",
                background: "#ecfdf5",
                color: "#065f46",
                padding: "10px 12px",
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 20,
              }}
            >
              {ONBOARDING_REQUIRED_FIELDS_MESSAGE}
            </div>
          )}

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
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4, color: "#111827" }}>EOD Community Member</div>
                <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.5 }}>
                  Active, former, or retired EOD tech or public service Bomb Technician. Join the community, access the job board, and connect with fellow techs.
                </div>
              </button>

              <button
                onClick={() => setEmployerConfirmOpen(true)}
                style={{
                  padding: "20px 24px", borderRadius: 14, border: "2px solid #e5e7eb",
                  background: "white", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "#111"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#e5e7eb"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 900, fontSize: 16, color: "#111827" }}>Employer Account</span>
                </div>
                <div style={{ fontSize: 13, color: "#1f2937", lineHeight: 1.5 }}>
                  Hiring organization or recruiter. Post jobs on the EOD job board and search candidates open to new opportunities.
                </div>
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="onboarding-form">

              {/* Back to type selection */}
              <button
                type="button"
                onClick={() => setAccountType(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2937", fontSize: 13, fontWeight: 700, textAlign: "left", padding: 0, marginBottom: 4 }}
              >
                ← Back
              </button>

              {/* Account type badge */}
              <div style={{ padding: "10px 14px", borderRadius: 10, background: accountType === "employer" ? "#dbeafe" : "#f3f4f6", fontSize: 13, fontWeight: 800, color: accountType === "employer" ? "#1d4ed8" : "#111827" }}>
                {accountType === "employer" ? "Employer Account" : "EOD Community Member"}
              </div>

              <div className="onboarding-two-col">
                <div
                  id="field-first-name"
                  className="onboarding-field"
                  style={isMissing("field-first-name") ? { border: "1px solid #10b981", background: "#ecfdf5", borderRadius: 10, padding: 8 } : undefined}
                >
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>First Name *</label>
                  <input
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (e.target.value.trim()) clearMissingFieldIfMatch("field-first-name");
                    }}
                    style={inputStyle}
                    placeholder="First name"
                    autoComplete="given-name"
                  />
                  {isMissing("field-first-name") && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#047857", fontWeight: 700 }}>
                      First name is required.
                    </div>
                  )}
                </div>

                <div
                  id="field-last-name"
                  className="onboarding-field"
                  style={isMissing("field-last-name") ? { border: "1px solid #10b981", background: "#ecfdf5", borderRadius: 10, padding: 8 } : undefined}
                >
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>Last Name *</label>
                  <input
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (hasFullLastName(e.target.value)) clearMissingFieldIfMatch("field-last-name");
                    }}
                    style={inputStyle}
                    placeholder="Last name"
                    autoComplete="family-name"
                  />
                  {isMissing("field-last-name") && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#047857", fontWeight: 700 }}>
                      {lastName.trim() ? SIGNUP_LAST_NAME_REQUIRED_MESSAGE : "Last name is required."}
                    </div>
                  )}
                </div>
              </div>

              {/* MEMBER FORM */}
              {accountType === "member" && (
                <>
                  <div
                    id="field-member-service"
                    style={isMissing("field-member-service") ? { border: "1px solid #10b981", background: "#ecfdf5", borderRadius: 10, padding: 8 } : undefined}
                  >
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>Service Branch *</label>
                    <select
                      value={service}
                      onChange={(e) => {
                        setService(e.target.value);
                        if (e.target.value) clearMissingFieldIfMatch("field-member-service");
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select service...</option>
                      {SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {isMissing("field-member-service") && <div style={{ marginTop: 6, fontSize: 12, color: "#047857", fontWeight: 700 }}>Please fill out all required fields.</div>}
                  </div>

                  <div
                    id="field-member-status"
                    style={isMissing("field-member-status") ? { border: "1px solid #10b981", background: "#ecfdf5", borderRadius: 10, padding: 8 } : undefined}
                  >
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>Status *</label>
                    <select
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        if (e.target.value) clearMissingFieldIfMatch("field-member-status");
                      }}
                      style={selectStyle}
                    >
                      <option value="">Select status...</option>
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {isMissing("field-member-status") && <div style={{ marginTop: 6, fontSize: 12, color: "#047857", fontWeight: 700 }}>Please fill out all required fields.</div>}
                  </div>

                  <div className="onboarding-two-col">
                    <div className="onboarding-field">
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>Skill Badge</label>
                      <select value={skillBadge} onChange={(e) => setSkillBadge(e.target.value)} style={selectStyle}>
                        <option value="">Select badge...</option>
                        {SKILL_BADGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div className="onboarding-field">
                      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>Years of Experience</label>
                      <select value={yearsExperience} onChange={(e) => setYearsExperience(e.target.value)} style={selectStyle}>
                        <option value="">Select years...</option>
                        {YEARS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f9fafb" }}>
                    <label style={{ fontWeight: 800, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>
                      Include profile picture <span style={{ fontWeight: 400, color: "#4b5563" }}>(optional)</span>
                    </label>
                    <div style={{ fontSize: 12, color: "#047857", fontWeight: 800, marginBottom: 10 }}>
                      *users who include a profile picture get vouched 50% faster.
                    </div>
                    <div className="onboarding-photo-row">
                      {profilePhotoPreviewUrl && (
                        <img
                          src={profilePhotoPreviewUrl}
                          alt="Selected profile preview"
                          style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid #d1d5db" }}
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleProfilePhotoPick}
                        className="onboarding-file-input"
                      />
                      {profilePhotoFile && (
                        <button
                          type="button"
                          onClick={clearProfilePhotoPick}
                          style={{ border: "1px solid #d1d5db", background: "white", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", color: "#374151" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {profilePhotoError && (
                      <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 12, fontWeight: 700 }}>
                        {profilePhotoError}
                      </div>
                    )}
                  </div>

                </>
              )}

              {/* EMPLOYER FORM */}
              {accountType === "employer" && (
                <>
                  <div
                    id="field-employer-company"
                    style={isMissing("field-employer-company") ? { border: "1px solid #10b981", background: "#ecfdf5", borderRadius: 10, padding: 8 } : undefined}
                  >
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 5, color: "#111827" }}>Company / Organization Name *</label>
                    <input
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        if (e.target.value.trim()) clearMissingFieldIfMatch("field-employer-company");
                      }}
                      style={inputStyle}
                      placeholder="e.g. Acme Defense Group"
                    />
                    {isMissing("field-employer-company") && <div style={{ marginTop: 6, fontSize: 12, color: "#047857", fontWeight: 700 }}>Please fill out all required fields.</div>}
                  </div>

                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "#fef9c3", fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>
                    Employer accounts are manually reviewed. Once approved, you can post jobs and search candidates who are open to new opportunities.
                  </div>
                </>
              )}

              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 14, marginTop: 4 }}>
                <div
                  id="field-legal-agreement"
                  style={isMissing("field-legal-agreement") ? { border: "1px solid #10b981", background: "#ecfdf5", borderRadius: 10, padding: 10 } : undefined}
                >
                  <label className="onboarding-legal-label" style={{ fontSize: 14, lineHeight: 1.55, color: "#111827" }}>
                    <input
                      type="checkbox"
                      checked={agreedLegal}
                      onChange={(e) => {
                        setAgreedLegal(e.target.checked);
                        if (e.target.checked) clearMissingFieldIfMatch("field-legal-agreement");
                      }}
                      style={{ marginTop: 3, flexShrink: 0 }}
                    />
                    <span>
                      I agree to the{" "}
                      <Link href="/terms" target="_blank" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                        Terms of Service
                      </Link>
                      ,{" "}
                      <Link href="/privacy" target="_blank" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                        Privacy Policy
                      </Link>
                      , and{" "}
                      <Link href="/guidelines" target="_blank" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                        Community Guidelines
                      </Link>
                      .
                    </span>
                  </label>
                  {isMissing("field-legal-agreement") && (
                    <div style={{ marginTop: 8, marginLeft: 28, fontSize: 12, color: "#047857", fontWeight: 700 }}>
                      Please accept the agreements to continue.
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="onboarding-submit-btn"
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

      {employerConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="employer-confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 1000,
          }}
          onClick={() => setEmployerConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: 16,
              padding: "28px 24px",
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div id="employer-confirm-title" style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginBottom: 12 }}>
              Employer account
            </div>
            <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.65, margin: "0 0 24px" }}>
              Employer accounts are for businesses who intend to actively recruit and hire EOD/PSBTs for roles within their organization. If this is not your intent, please sign up for a user account.
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setEmployerConfirmOpen(false);
                  setAccountType("employer");
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "none",
                  background: "#111",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Confirm — continue onboarding for employer
              </button>
              <button
                type="button"
                onClick={() => setEmployerConfirmOpen(false)}
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "white",
                  color: "#111827",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Create user account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
