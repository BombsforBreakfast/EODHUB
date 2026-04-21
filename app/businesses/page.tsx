"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";
import { isBizListingTypeMissingColumnError, normalizeUrl, OgCard, type BizListingType } from "../components/master/masterShared";

type BizPageFilter = "all" | BizListingType;
type BizFilterState = {
  listingType: BizPageFilter;
  keyword: string;
};

type BusinessListing = {
  id: string;
  created_at: string;
  business_name: string | null;
  website_url: string;
  custom_blurb: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  is_approved: boolean;
  is_featured: boolean;
  like_count: number;
  listing_type?: "business" | "organization" | "resource" | null;
};

const BUSINESS_LISTING_COLUMNS =
  "id, created_at, business_name, website_url, custom_blurb, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type";

function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice("http://".length)}`;
  return u;
}

function normalizeBizListingType(value: string | null | undefined): BizListingType {
  if (value === "organization" || value === "resource") return value;
  return "business";
}

function isPermanentlyFeaturedListing(listing: Pick<BusinessListing, "website_url" | "business_name" | "og_title" | "og_site_name">): boolean {
  const url = (listing.website_url || "").toLowerCase();
  const text = `${listing.business_name || ""} ${listing.og_title || ""} ${listing.og_site_name || ""}`.toLowerCase();
  return (
    url.includes("thelongwalkhome.org") ||
    url.includes("eod-wf.org") ||
    url.includes("eodwarriorfoundation.org") ||
    text.includes("the long walk") ||
    text.includes("eod warrior foundation")
  );
}

function normalizeBizListingTypeForListing(
  listing: Pick<BusinessListing, "listing_type" | "website_url" | "business_name" | "og_title" | "og_site_name">
): BizListingType {
  if (isPermanentlyFeaturedListing(listing)) return "resource";
  return normalizeBizListingType(listing.listing_type);
}

function getBizTypePriority(
  listing: Pick<BusinessListing, "listing_type" | "website_url" | "business_name" | "og_title" | "og_site_name">
): number {
  const type = normalizeBizListingTypeForListing(listing);
  if (type === "business") return 0;
  if (type === "organization") return 1;
  return 2;
}

export default function BusinessesPage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [filters, setFilters] = useState<BizFilterState>({ listingType: "all", keyword: "" });
  const [userId, setUserId] = useState<string | null>(null);
  const [showBizForm, setShowBizForm] = useState(false);
  const [bizUrl, setBizUrl] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizBlurb, setBizBlurb] = useState("");
  const [bizType, setBizType] = useState<BizListingType>("business");
  const [bizOgPreview, setBizOgPreview] = useState<OgPreview | null>(null);
  const [fetchingBizOg, setFetchingBizOg] = useState(false);
  const [submittingBiz, setSubmittingBiz] = useState(false);
  const [bizSubmitSuccess, setBizSubmitSuccess] = useState(false);
  const bizOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      const { data } = await supabase.auth.getSession();
      if (mounted) setUserId(data.session?.user?.id ?? null);
    }
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const { data, error } = await supabase
        .from("business_listings")
        .select(BUSINESS_LISTING_COLUMNS)
        .eq("is_approved", true)
        .order("is_featured", { ascending: false })
        .order("business_name", { ascending: true, nullsFirst: false })
        .limit(500);

      let combined = (data ?? []) as BusinessListing[];

      // Ensure known nonprofit resource entries always appear even if approval data is out of sync.
      const { data: resourceFallback } = await supabase
        .from("business_listings")
        .select(BUSINESS_LISTING_COLUMNS)
        .or("website_url.ilike.*thelongwalkhome.org*,website_url.ilike.*eod-wf.org*,website_url.ilike.*eodwarriorfoundation.org*,business_name.ilike.*long walk*,business_name.ilike.*eod warrior foundation*")
        .limit(10);

      if ((resourceFallback ?? []).length > 0) {
        const byId = new Map<string, BusinessListing>();
        combined.forEach((r) => byId.set(r.id, r));
        (resourceFallback as BusinessListing[]).forEach((r) => byId.set(r.id, r));
        combined = Array.from(byId.values());
      }

      if (error && combined.length === 0) {
        console.error("Businesses page load error:", error);
        if (mounted) setListings([]);
      } else if (mounted) {
        setListings(combined);
      }
      if (mounted) setLoading(false);
    }
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  type OgPreview = {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
  };

  function handleBizUrlChange(value: string) {
    setBizUrl(value);
    setBizOgPreview(null);
    const url = value.trim() ? normalizeUrl(value.trim()) : null;
    if (!url) return;
    if (bizOgDebounceRef.current) clearTimeout(bizOgDebounceRef.current);
    bizOgDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingBizOg(true);
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/preview-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ url }),
        });
        if (res.ok) {
          const data = await res.json();
          setBizOgPreview({ url, title: data.title ?? null, description: data.description ?? null, image: data.image ?? null, siteName: data.siteName ?? null });
          if (!bizName && (data.title || data.siteName)) setBizName(data.title || data.siteName || "");
          if (!bizBlurb && data.description) setBizBlurb(data.description);
        }
      } catch {
        /* ignore */
      } finally {
        setFetchingBizOg(false);
      }
    }, 800);
  }

  async function submitBizListing() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    const url = normalizeUrl(bizUrl.trim());
    if (!url || !bizName.trim()) return;
    try {
      setSubmittingBiz(true);
      const basePayload = {
        website_url: url,
        business_name: bizName.trim(),
        custom_blurb: bizBlurb.trim() || null,
        og_title: bizOgPreview?.title ?? null,
        og_description: bizOgPreview?.description ?? null,
        og_image: bizOgPreview?.image ?? null,
        og_site_name: bizOgPreview?.siteName ?? null,
        is_approved: false,
        is_featured: false,
      };
      const { error } = await supabase.from("business_listings").insert([{ ...basePayload, listing_type: bizType }]);
      if (error && isBizListingTypeMissingColumnError(error)) {
        const legacy = await supabase.from("business_listings").insert([basePayload]);
        if (legacy.error) {
          alert(legacy.error.message);
          return;
        }
      } else if (error) {
        alert(error.message);
        return;
      }
      setBizSubmitSuccess(true);
      setBizUrl("");
      setBizName("");
      setBizBlurb("");
      setBizType("business");
      setBizOgPreview(null);
      setTimeout(() => {
        setBizSubmitSuccess(false);
        setShowBizForm(false);
      }, 3000);
    } finally {
      setSubmittingBiz(false);
    }
  }

  const visibleListings = useMemo(() => {
    const keyword = filters.keyword.trim().toLowerCase();
    const filtered = listings.filter((l) => {
      if (filters.listingType !== "all" && normalizeBizListingTypeForListing(l) !== filters.listingType) {
        return false;
      }
      if (!keyword) return true;
      const haystack = [
        l.business_name ?? "",
        l.og_title ?? "",
        l.og_description ?? "",
        l.og_site_name ?? "",
        l.custom_blurb ?? "",
        l.website_url ?? "",
        normalizeBizListingTypeForListing(l),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
    return [...filtered].sort((a, b) => {
      const aPinned = isPermanentlyFeaturedListing(a) ? 1 : 0;
      const bPinned = isPermanentlyFeaturedListing(b) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      const aFeatured = a.is_featured ? 1 : 0;
      const bFeatured = b.is_featured ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      const typeDiff = getBizTypePriority(a) - getBizTypePriority(b);
      if (typeDiff !== 0) return typeDiff;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [listings, filters]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1800,
        margin: "0 auto",
        padding: "24px 20px",
        boxSizing: "border-box",
        background: t.bg,
        minHeight: "100vh",
        color: t.text,
      }}
    >
      <NavBar />

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Biz/Org/Resources</h1>
          <button
            type="button"
            onClick={() => {
              setShowBizForm((p) => !p);
              setBizSubmitSuccess(false);
            }}
            style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 18, cursor: "pointer", padding: 0, whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {showBizForm ? "Cancel" : "Add Biz/Org/Resource →"}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>
          Browse the full approved community directory.
        </div>
      </div>

      {showBizForm && (
        <div style={{ marginTop: 4, marginBottom: 14, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
          {bizSubmitSuccess ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
              Submitted! Our team will review and approve your listing.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Website URL *</label>
                <input
                  type="text"
                  value={bizUrl}
                  onChange={(e) => handleBizUrlChange(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      const n = normalizeUrl(e.target.value);
                      setBizUrl(n);
                      handleBizUrlChange(n);
                    }
                  }}
                  placeholder="yourbusiness.com"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                />
                {fetchingBizOg && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>Fetching preview...</div>}
                {bizOgPreview && <OgCard og={bizOgPreview} />}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Type *</label>
                <select
                  value={bizType}
                  onChange={(e) => setBizType(e.target.value as BizListingType)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                >
                  <option value="business">Business</option>
                  <option value="organization">Organization</option>
                  <option value="resource">Resource</option>
                </select>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Name *</label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  placeholder="Business or organization name"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Short Description</label>
                <textarea
                  value={bizBlurb}
                  onChange={(e) => setBizBlurb(e.target.value)}
                  rows={2}
                  placeholder="What does this business/org/resource do?"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              <button
                type="button"
                onClick={submitBizListing}
                disabled={submittingBiz || !bizUrl.trim() || !bizName.trim()}
                style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: submittingBiz ? "not-allowed" : "pointer", opacity: submittingBiz || !bizUrl.trim() || !bizName.trim() ? 0.65 : 1 }}
              >
                {submittingBiz ? "Submitting..." : "Submit for approval"}
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <select
            value={filters.listingType}
            onChange={(e) => setFilters((prev) => ({ ...prev, listingType: e.target.value as BizPageFilter }))}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text }}
          >
            <option value="all">All listing types</option>
            <option value="business">Businesses</option>
            <option value="organization">Organizations</option>
            <option value="resource">Resources</option>
          </select>

          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            placeholder="Keyword/site (e.g. disposal, training, foundation)"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading listings...</div>
      ) : visibleListings.length === 0 ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>No approved listings found.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {visibleListings.map((listing) => {
            const displayTitle =
              listing.og_title ||
              listing.business_name ||
              listing.og_site_name ||
              "Business Listing";
            const displayDescription =
              listing.custom_blurb || listing.og_description || "Visit website";

            return (
              <div key={listing.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface }}>
                <a
                  href={listing.website_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  {listing.og_image ? (
                    <img
                      src={httpsAssetUrl(listing.og_image)}
                      alt={displayTitle}
                      style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                    />
                  ) : null}
                  <div style={{ padding: 14, paddingBottom: 10 }}>
                    <div style={{ fontWeight: 800, lineHeight: 1.3, fontSize: 18 }}>
                      {displayTitle}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>
                      {displayDescription}
                    </div>
                  </div>
                </a>
                <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                  {(listing.is_featured || isPermanentlyFeaturedListing(listing)) ? (
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#111", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>
                      Featured
                    </span>
                  ) : null}
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "capitalize" }}>
                    {normalizeBizListingTypeForListing(listing)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

