"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { prepareImageUploadFile } from "../../lib/prepareUploadFile";

type Step = "login" | "profile";

type FormState = {
  linked_account_email: string;
  business_login_email: string;
  password: string;
  confirm_password: string;
  business_name: string;
  description: string;
  business_email: string;
  logo_url: string;
  website_url: string;
  location: string;
  address: string;
  phone: string;
  owner_info: string;
};

const EMPTY_FORM: FormState = {
  linked_account_email: "",
  business_login_email: "",
  password: "",
  confirm_password: "",
  business_name: "",
  description: "",
  business_email: "",
  logo_url: "",
  website_url: "",
  location: "",
  address: "",
  phone: "",
  owner_info: "",
};

export default function BusinessOrgOnboardingPage() {
  const { t } = useTheme();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("login");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleBusinessEmail, setGoogleBusinessEmail] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedEmail = params.get("linked_email") ?? "";
    const businessOauth = params.get("business_oauth") === "google";
    setForm((prev) => ({
      ...prev,
      linked_account_email: linkedEmail,
      business_email: prev.business_email || prev.business_login_email,
    }));
    if (businessOauth) {
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const email = user.email.trim().toLowerCase();
          setGoogleBusinessEmail(email);
          setForm((prev) => ({
            ...prev,
            business_login_email: email,
            business_email: prev.business_email || email,
            password: "google-oauth-placeholder",
            confirm_password: "google-oauth-placeholder",
          }));
          setStep("profile");
        }
      })();
      return;
    }
    if (linkedEmail) {
      void (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          window.location.href = "/login";
          return;
        }
        const res = await fetch("/api/business-org-pages/start-onboarding", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ linkedAccountEmail: linkedEmail }),
        });
        if (!res.ok) {
          window.location.href = "/login";
          return;
        }
      })();
    }
  }, []);

  const canContinueToProfile = useMemo(() => {
    return (
      form.linked_account_email.includes("@") &&
      form.business_login_email.includes("@") &&
      form.password.length >= 8 &&
      form.password === form.confirm_password
    );
  }, [form]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: "11px 12px",
    background: t.surface,
    color: t.text,
    boxSizing: "border-box",
  };

  const buttonPrimary: React.CSSProperties = {
    border: "none",
    borderRadius: 12,
    padding: "11px 14px",
    background: "#2563eb",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  };

  const buttonSecondary: React.CSSProperties = {
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: "10px 13px",
    background: t.surface,
    color: t.text,
    fontWeight: 800,
    cursor: "pointer",
  };

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startGoogleBusinessAuth() {
    if (!form.linked_account_email.trim()) {
      setError("Validate and carry forward the linked EOD-HUB user email first.");
      return;
    }
    const origin = window.location.origin;
    const next = `/business-org/onboarding?linked_email=${encodeURIComponent(form.linked_account_email.trim().toLowerCase())}&business_oauth=google`;
    void supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setError(null);
    try {
      const prepared = await prepareImageUploadFile(file);
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      const path = `business-org-logos/pending/${crypto.randomUUID()}-${prepared.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("feed-images")
        .upload(path, prepared.file, {
          contentType: prepared.file.type || "image/jpeg",
          upsert: false,
        });
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
      update("logo_url", data.publicUrl);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function submitBusinessPage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/business-org-pages/create-with-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          business_email: form.business_email || form.business_login_email,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok || !data.redirectTo) {
        setError(data.error ?? "Could not create business profile.");
        return;
      }
      setSuccessMessage("Your business profile has been successfully created. Return to login and use your business credentials.");
      window.setTimeout(() => {
        window.location.href = data.redirectTo || "/login";
      }, 2600);
    } finally {
      setSaving(false);
    }
  }

  async function submitGoogleBusinessPage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Google session not found. Please start the Google business login again.");
        return;
      }
      const res = await fetch("/api/business-org-pages/create-with-google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...form,
          business_email: form.business_email || form.business_login_email,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
      if (!res.ok || !data.redirectTo) {
        setError(data.error ?? "Could not create business profile.");
        return;
      }
      setSuccessMessage("Your business profile has been successfully created. Return to login and use your business credentials.");
      window.setTimeout(() => {
        window.location.href = data.redirectTo || "/login";
      }, 2600);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 18px 64px", color: t.text }}>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>Create Business / Organization Profile</h1>
      <p style={{ margin: "8px 0 0", color: t.textMuted, lineHeight: 1.55 }}>
        First create the unique business page login, then complete the public profile basics.
      </p>

      {error && (
        <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>
          {successMessage}
        </div>
      )}

      <form
        onSubmit={(e) => googleBusinessEmail ? void submitGoogleBusinessPage(e) : void submitBusinessPage(e)}
        style={{ marginTop: 24, border: `1px solid ${t.border}`, borderRadius: 20, padding: 20, background: t.surface, display: "grid", gap: 14 }}
      >
        {step === "login" ? (
          <>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Business Login</h2>
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Validated owner EOD-HUB email
              <input type="email" style={{ ...inputStyle, opacity: 0.82 }} value={form.linked_account_email} readOnly required />
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Business email / secondary login email *
              <input
                type="email"
                style={inputStyle}
                value={form.business_login_email}
                onChange={(e) => {
                  update("business_login_email", e.target.value);
                  if (!form.business_email) update("business_email", e.target.value);
                }}
                required
              />
              <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>
                This will be the future login email for the business page.
              </span>
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Business profile password *
              <input
                type={showPassword ? "text" : "password"}
                style={inputStyle}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Confirm password *
              <input
                type={showPassword ? "text" : "password"}
                style={inputStyle}
                value={form.confirm_password}
                onChange={(e) => update("confirm_password", e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: t.textMuted, fontSize: 13 }}>
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
              Show password
            </label>
            <button type="button" style={buttonPrimary} disabled={!canContinueToProfile} onClick={() => setStep("profile")}>
              Continue to Profile Setup
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: t.border }} />
              <span style={{ color: t.textMuted, fontSize: 13 }}>or</span>
              <div style={{ flex: 1, height: 1, background: t.border }} />
            </div>
            <button type="button" style={buttonSecondary} onClick={() => startGoogleBusinessAuth()}>
              Continue with Google for Business Login
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Profile Setup</h2>
            {googleBusinessEmail && (
              <div style={{ padding: 12, borderRadius: 12, background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe", fontSize: 13, lineHeight: 1.45 }}>
                Business login will use Google account: <strong>{googleBusinessEmail}</strong>
              </div>
            )}
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Business name *
              <input style={inputStyle} value={form.business_name} onChange={(e) => update("business_name", e.target.value)} required />
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Description *
              <textarea style={{ ...inputStyle, minHeight: 110, resize: "vertical" }} value={form.description} onChange={(e) => update("description", e.target.value)} required />
            </label>
            <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
              Public business email *
              <input type="email" style={inputStyle} value={form.business_email} onChange={(e) => update("business_email", e.target.value)} required />
            </label>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 800 }}>Profile photo / logo *</div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadLogo(file);
                }}
              />
              <button type="button" style={buttonSecondary} disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                {uploadingLogo ? "Uploading..." : "Upload photo / logo"}
              </button>
              {form.logo_url && (
                <div style={{ display: "grid", gap: 6 }}>
                  <div
                    style={{
                      aspectRatio: "16 / 5",
                      border: `1px solid ${t.border}`,
                      borderRadius: 14,
                      background: t.surface,
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                    }}
                  >
                    <img src={form.logo_url} alt="Business photo or logo preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                  <span style={{ fontSize: 12, color: t.textMuted }}>
                    Preview: original image ratio contained inside the site display frame.
                  </span>
                </div>
              )}
            </div>
            <input style={inputStyle} placeholder="Website URL (optional)" value={form.website_url} onChange={(e) => update("website_url", e.target.value)} />
            <input style={inputStyle} placeholder="Contact/location (optional)" value={form.location} onChange={(e) => update("location", e.target.value)} />
            <input style={inputStyle} placeholder="Address (optional)" value={form.address} onChange={(e) => update("address", e.target.value)} />
            <input style={inputStyle} placeholder="Phone number (optional)" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            <textarea style={{ ...inputStyle, minHeight: 76, resize: "vertical" }} placeholder="Owner info (optional)" value={form.owner_info} onChange={(e) => update("owner_info", e.target.value)} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={buttonSecondary} onClick={() => setStep("login")}>Back</button>
              <button type="submit" style={{ ...buttonPrimary, opacity: saving || uploadingLogo ? 0.7 : 1 }} disabled={saving || uploadingLogo}>
                {saving ? "Creating..." : "Create Business Profile"}
              </button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
