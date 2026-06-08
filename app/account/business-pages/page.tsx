"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import { prepareLogoUploadFile } from "../../lib/prepareUploadFile";
import type { BusinessOrgPageRow } from "../../lib/businessOrgPages";

type FormState = {
  business_name: string;
  description: string;
  business_email: string;
  linked_account_email: string;
  logo_url: string;
  website_url: string;
  location: string;
  address: string;
  phone: string;
  owner_info: string;
  page_type: "business" | "organization";
};

const EMPTY_FORM: FormState = {
  business_name: "",
  description: "",
  business_email: "",
  linked_account_email: "",
  logo_url: "",
  website_url: "",
  location: "",
  address: "",
  phone: "",
  owner_info: "",
  page_type: "business",
};

export default function BusinessPagesAccountPage() {
  const { t } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [billingFor, setBillingFor] = useState<string | null>(null);
  const [pages, setPages] = useState<BusinessOrgPageRow[]>([]);
  const [authEmail, setAuthEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isBusinessLogin, setIsBusinessLogin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editingPage = useMemo(
    () => pages.find((page) => page.id === editingId) ?? null,
    [editingId, pages],
  );

  async function authHeaders(): Promise<HeadersInit | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    return { Authorization: `Bearer ${session.access_token}` };
  }

  function resetForm(nextEmail = authEmail) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, linked_account_email: nextEmail });
    setError(null);
  }

  async function loadPages() {
    setLoading(true);
    const headers = await authHeaders();
    if (!headers) {
      window.location.href = "/login";
      return;
    }
    const res = await fetch("/api/business-org-pages", { headers, cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      pages?: BusinessOrgPageRow[];
      authEmail?: string | null;
      accountType?: string | null;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Could not load business pages.");
      setLoading(false);
      return;
    }
    const email = data.authEmail ?? "";
    setAuthEmail(email);
    setPages(data.pages ?? []);
    setIsBusinessLogin(data.accountType === "business_org" || (data.pages ?? []).some((page) => page.business_auth_user_id));
    setForm((prev) => ({
      ...prev,
      linked_account_email: prev.linked_account_email || email,
    }));
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hintedEmail = params.get("linked_email");
    if (hintedEmail) {
      setForm((prev) => ({ ...prev, linked_account_email: hintedEmail }));
    }
    void loadPages();
  }, []);

  function editPage(page: BusinessOrgPageRow) {
    setEditingId(page.id);
    setForm({
      business_name: page.business_name,
      description: page.description,
      business_email: page.business_email,
      linked_account_email: page.linked_account_email,
      logo_url: page.logo_url,
      website_url: page.website_url ?? "",
      location: page.location ?? "",
      address: page.address ?? "",
      phone: page.phone ?? "",
      owner_info: page.owner_info ?? "",
      page_type: page.page_type === "organization" ? "organization" : "business",
    });
    setError(null);
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setError(null);
    try {
      const prepared = await prepareLogoUploadFile(file);
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const ext = prepared.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `business-org-logos/${user.id}/${crypto.randomUUID()}.${ext}`;
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
      setForm((prev) => ({ ...prev, logo_url: data.publicUrl }));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function submitPage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        window.location.href = "/login";
        return;
      }
      const endpoint = editingPage ? `/api/business-org-pages/${editingPage.id}` : "/api/business-org-pages";
      const res = await fetch(endpoint, {
        method: editingPage ? "PATCH" : "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not save business page.");
        return;
      }
      setNotice(editingPage ? "Business page updated for review." : "Business page created and sent for admin review.");
      resetForm(authEmail);
      await loadPages();
    } finally {
      setSaving(false);
    }
  }

  async function startBilling(pageId: string, portal: boolean) {
    setBillingFor(pageId);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        window.location.href = "/login";
        return;
      }
      const res = await fetch(portal ? "/api/stripe/business-org-portal" : "/api/stripe/business-org-checkout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Could not open billing.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBillingFor(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${t.border}`,
    borderRadius: 12,
    padding: "11px 12px",
    background: t.surface,
    color: t.text,
  };

  const buttonPrimary: React.CSSProperties = {
    border: "none",
    borderRadius: 12,
    padding: "11px 14px",
    background: "#2563eb",
    color: "white",
    fontWeight: 800,
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

  const primaryPage = pages[0] ?? null;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px 60px", color: t.text }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>{isBusinessLogin ? "Business Profile" : "Business / Organization Pages"}</h1>
          <p style={{ margin: "8px 0 0", color: t.textMuted, lineHeight: 1.55 }}>
            {isBusinessLogin
              ? "Manage your Business / Organization profile and billing from your business account."
              : "Create public-facing pages linked to your validated personal EOD-HUB account. Pages are reviewed and billed separately."}
          </p>
        </div>
        <Link href="/business-org" style={{ color: "#2563eb", fontWeight: 800 }}>Browse public pages</Link>
      </div>

      {notice && <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}>{notice}</div>}
      {error && <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}>{error}</div>}

      {isBusinessLogin && primaryPage ? (
        <section style={{ marginTop: 24, border: `1px solid ${t.border}`, borderRadius: 22, background: t.surface, overflow: "hidden" }}>
          <div style={{ minHeight: 210, background: "linear-gradient(135deg, rgba(37,99,235,.16), rgba(15,23,42,.04))", display: "grid", placeItems: "center", padding: 22 }}>
            <div style={{ width: "min(100%, 560px)", aspectRatio: "16 / 5", borderRadius: 18, border: `1px solid ${t.border}`, background: t.bg, display: "grid", placeItems: "center", overflow: "hidden" }}>
              <img src={primaryPage.logo_url} alt={`${primaryPage.business_name} logo`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            </div>
          </div>
          <div style={{ padding: 22, display: "grid", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 28, fontWeight: 950 }}>{primaryPage.business_name}</h2>
              <div style={{ marginTop: 6, color: t.textMuted, fontSize: 13 }}>
                Review: {primaryPage.verification_status} · Billing: {primaryPage.subscription_status}
              </div>
            </div>
            <p style={{ margin: 0, color: t.text, lineHeight: 1.6 }}>{primaryPage.description}</p>
            <div style={{ display: "grid", gap: 6, color: t.textMuted, fontSize: 14 }}>
              <div><strong style={{ color: t.text }}>Public email:</strong> {primaryPage.business_email}</div>
              {primaryPage.website_url && <div><strong style={{ color: t.text }}>Website:</strong> {primaryPage.website_url}</div>}
              {primaryPage.location && <div><strong style={{ color: t.text }}>Location:</strong> {primaryPage.location}</div>}
              {primaryPage.address && <div><strong style={{ color: t.text }}>Address:</strong> {primaryPage.address}</div>}
              {primaryPage.phone && <div><strong style={{ color: t.text }}>Phone:</strong> {primaryPage.phone}</div>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button type="button" style={buttonSecondary} onClick={() => editPage(primaryPage)}>Edit profile</button>
              <Link href={`/business-org/${primaryPage.id}`} style={{ ...buttonSecondary, textDecoration: "none" }}>View public page</Link>
              <button
                type="button"
                style={buttonSecondary}
                disabled={billingFor === primaryPage.id}
                onClick={() => void startBilling(primaryPage.id, Boolean(primaryPage.stripe_customer_id))}
              >
                {billingFor === primaryPage.id ? "Opening..." : primaryPage.stripe_customer_id ? "Manage billing" : "Start page subscription"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 22, marginTop: 24, alignItems: "start" }}>
        {!isBusinessLogin && pages.length > 0 && (
        <div style={{ display: "grid", gap: 14 }}>
          {loading ? (
            <div style={{ color: t.textMuted }}>Loading business pages...</div>
          ) : pages.length === 0 ? (
            <div style={{ border: `1px dashed ${t.border}`, borderRadius: 16, padding: 18, background: t.surface, color: t.textMuted }}>
              No Business / Organization pages yet. Use the form to create your first page.
            </div>
          ) : (
            pages.map((page) => (
              <article key={page.id} style={{ border: `1px solid ${t.border}`, borderRadius: 18, padding: 16, background: t.surface }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 92, height: 58, borderRadius: 12, border: `1px solid ${t.border}`, background: t.surface, display: "grid", placeItems: "center", overflow: "hidden" }}>
                    <img src={page.logo_url} alt={`${page.business_name} logo`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{page.business_name}</h2>
                    <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>
                      Review: {page.verification_status} · Billing: {page.subscription_status}
                    </div>
                    <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>
                      Linked email: {page.linked_account_email}
                    </div>
                  </div>
                </div>
                <p style={{ color: t.textMuted, lineHeight: 1.5 }}>{page.description}</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={buttonSecondary} onClick={() => editPage(page)}>Edit</button>
                  <Link href={`/business-org/${page.id}`} style={{ ...buttonSecondary, textDecoration: "none" }}>View public page</Link>
                  <button
                    type="button"
                    style={buttonSecondary}
                    disabled={billingFor === page.id}
                    onClick={() => void startBilling(page.id, Boolean(page.stripe_customer_id))}
                  >
                    {billingFor === page.id ? "Opening..." : page.stripe_customer_id ? "Manage billing" : "Start page subscription"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        )}
        {!isBusinessLogin && pages.length === 0 && !loading && (
          <div style={{ border: `1px dashed ${t.border}`, borderRadius: 16, padding: 18, background: t.surface, color: t.textMuted }}>
            No Business / Organization pages yet. Use the login page&apos;s Create Business / Organization Profile flow to create one.
          </div>
        )}

        {editingPage && (
        <form onSubmit={(e) => void submitPage(e)} style={{ border: `1px solid ${t.border}`, borderRadius: 18, padding: 18, background: t.surface, display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Edit Page</h2>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
            Business name *
            <input style={inputStyle} value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
            Display as *
            <select
              style={{ ...inputStyle, cursor: "pointer" }}
              value={form.page_type}
              onChange={(e) => setForm({ ...form, page_type: e.target.value === "organization" ? "organization" : "business" })}
              required
            >
              <option value="business">Business Profile</option>
              <option value="organization">Organization Profile</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
            Business description *
            <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
            Public business email *
            <input type="email" style={inputStyle} value={form.business_email} onChange={(e) => setForm({ ...form, business_email: e.target.value })} required />
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>Public/business-facing contact email.</span>
          </label>
          <label style={{ display: "grid", gap: 6, fontWeight: 800 }}>
            Linked EOD-HUB account email *
            <input type="email" style={{ ...inputStyle, opacity: 0.82 }} value={form.linked_account_email} readOnly required />
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>Required. Must match your authenticated EOD-HUB account email.</span>
          </label>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Photo / logo *</div>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadLogo(file);
            }} />
            <button type="button" style={buttonSecondary} onClick={() => fileInputRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? "Uploading..." : "Upload photo / logo"}
            </button>
            {form.logo_url && (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ aspectRatio: "16 / 5", border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, display: "grid", placeItems: "center", overflow: "hidden" }}>
                  <img src={form.logo_url} alt="Business photo or logo preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
                <span style={{ fontSize: 12, color: t.textMuted }}>
                  Preview: original image ratio contained inside the site display frame.
                </span>
              </div>
            )}
          </div>
          <input style={inputStyle} placeholder="Website URL (optional)" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
          <input style={inputStyle} placeholder="Location (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <input style={inputStyle} placeholder="Physical address (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input style={inputStyle} placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <textarea style={{ ...inputStyle, minHeight: 72, resize: "vertical" }} placeholder="Owner info (optional)" value={form.owner_info} onChange={(e) => setForm({ ...form, owner_info: e.target.value })} />
          <button type="submit" style={{ ...buttonPrimary, opacity: saving ? 0.7 : 1 }} disabled={saving || uploadingLogo}>
            {saving ? "Saving..." : editingPage ? "Save updates" : "Create Business / Organization Page"}
          </button>
          {editingPage && <button type="button" style={buttonSecondary} onClick={() => resetForm(authEmail)}>Cancel edit</button>}
        </form>
        )}
      </section>
    </main>
  );
}
