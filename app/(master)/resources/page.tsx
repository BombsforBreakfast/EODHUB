"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BizListingTagsField } from "../../components/biz/BizListingTagsField";
import { BizListingTagChips } from "../../components/biz/BizListingTagChips";
import {
  getBizTypePriority,
  httpsAssetUrl,
  isBizListingTagsMissingColumnError,
  isBizListingTypeMissingColumnError,
  isPermanentlyFeaturedListing,
  normalizeBizListingTypeForListing,
  normalizeUrl,
  OgCard,
  type BusinessListingRow,
} from "../../components/master/masterShared";
import { coerceTagsFromDb, normalizeBizTagsInput, rememberCustomBizTag } from "../../lib/bizListingTags";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";

type BusinessListing = BusinessListingRow;

const BUSINESS_LISTING_COLUMNS =
  "id, created_at, business_name, website_url, custom_blurb, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type, tags";

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

export default function ResourcesPage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [keyword, setKeyword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [resourceBlurb, setResourceBlurb] = useState("");
  const [resourceOgPreview, setResourceOgPreview] = useState<OgPreview | null>(null);
  const [fetchingResourceOg, setFetchingResourceOg] = useState(false);
  const [submittingResource, setSubmittingResource] = useState(false);
  const [resourceSubmitSuccess, setResourceSubmitSuccess] = useState(false);
  const [resourceTags, setResourceTags] = useState<string[]>([]);
  const [resourceImageFile, setResourceImageFile] = useState<File | null>(null);
  const [resourceImagePreview, setResourceImagePreview] = useState<string | null>(null);
  const resourceOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resourceImageInputRef = useRef<HTMLInputElement | null>(null);

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

      // Preserve existing resource overrides for known nonprofit listings while migration data catches up.
      const { data: resourceFallback } = await supabase
        .from("business_listings")
        .select(BUSINESS_LISTING_COLUMNS)
        .or(
          "website_url.ilike.*thelongwalkhome.org*,website_url.ilike.*eod-wf.org*,website_url.ilike.*eodwarriorfoundation.org*,business_name.ilike.*long walk*,business_name.ilike.*eod warrior foundation*"
        )
        .limit(10);

      if ((resourceFallback ?? []).length > 0) {
        const byId = new Map<string, BusinessListing>();
        combined.forEach((r) => byId.set(r.id, r));
        (resourceFallback as BusinessListing[]).forEach((r) => byId.set(r.id, r));
        combined = Array.from(byId.values());
      }

      if (error && combined.length === 0) {
        console.error("Resources page load error:", error);
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

  function handleResourceUrlChange(value: string) {
    setResourceUrl(value);
    setResourceOgPreview(null);
    const url = value.trim() ? normalizeUrl(value.trim()) : null;
    if (!url) return;
    if (resourceOgDebounceRef.current) clearTimeout(resourceOgDebounceRef.current);
    resourceOgDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingResourceOg(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
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
          setResourceOgPreview({
            url,
            title: data.title ?? null,
            description: data.description ?? null,
            image: data.image ?? null,
            siteName: data.siteName ?? null,
          });
          if (!resourceName && (data.title || data.siteName)) setResourceName(data.title || data.siteName || "");
          if (!resourceBlurb && data.description) setResourceBlurb(data.description);
        }
      } catch {
        /* ignore preview failures */
      } finally {
        setFetchingResourceOg(false);
      }
    }, 800);
  }

  async function uploadResourceImage(file: File): Promise<string> {
    const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const path = `resource-images/${safeFileName}`;
    const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(path).data.publicUrl;
  }

  async function submitResourceListing() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    const url = normalizeUrl(resourceUrl.trim());
    if (!url || !resourceName.trim()) return;
    try {
      setSubmittingResource(true);
      const tagList = normalizeBizTagsInput(resourceTags);
      for (const x of tagList) rememberCustomBizTag(x);
      const manualImageUrl = resourceImageFile ? await uploadResourceImage(resourceImageFile) : null;

      const basePayload = {
        website_url: url,
        business_name: resourceName.trim(),
        custom_blurb: resourceBlurb.trim() || null,
        og_title: resourceOgPreview?.title ?? null,
        og_description: resourceOgPreview?.description ?? null,
        og_image: manualImageUrl ?? resourceOgPreview?.image ?? null,
        og_site_name: resourceOgPreview?.siteName ?? null,
        is_approved: false,
        is_featured: false,
        tags: tagList,
      };
      let { error } = await supabase.from("business_listings").insert([{ ...basePayload, listing_type: "resource" }]);
      if (error && isBizListingTagsMissingColumnError(error)) {
        const { tags, ...noTags } = basePayload;
        void tags;
        const r2 = await supabase.from("business_listings").insert([{ ...noTags, listing_type: "resource" }]);
        error = r2.error;
        if (error && isBizListingTypeMissingColumnError(error)) {
          const r3 = await supabase.from("business_listings").insert([noTags]);
          error = r3.error;
        }
      } else if (error && isBizListingTypeMissingColumnError(error)) {
        const r2 = await supabase.from("business_listings").insert([basePayload]);
        error = r2.error;
        if (error && isBizListingTagsMissingColumnError(error)) {
          const { tags, ...noTags } = basePayload;
          void tags;
          const r3 = await supabase.from("business_listings").insert([noTags]);
          error = r3.error;
        }
      } else if (error) {
        alert(error.message);
        return;
      }
      if (error) {
        alert(error.message);
        return;
      }
      setResourceSubmitSuccess(true);
      setResourceUrl("");
      setResourceName("");
      setResourceBlurb("");
      setResourceTags([]);
      setResourceOgPreview(null);
      setResourceImageFile(null);
      if (resourceImagePreview) URL.revokeObjectURL(resourceImagePreview);
      setResourceImagePreview(null);
      if (resourceImageInputRef.current) resourceImageInputRef.current.value = "";
      setTimeout(() => {
        setResourceSubmitSuccess(false);
        setShowResourceForm(false);
      }, 3000);
    } finally {
      setSubmittingResource(false);
    }
  }

  const visibleResources = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    const terms = needle
      .split(",")
      .flatMap((part) => part.trim().split(/\s+/))
      .map((term) => term.trim())
      .filter(Boolean);

    const filtered = listings.filter((listing) => {
      if (normalizeBizListingTypeForListing(listing) !== "resource") {
        return false;
      }
      if (!needle) return true;
      const tagText = coerceTagsFromDb(listing.tags).join(" ");
      const haystack = [
        listing.business_name ?? "",
        listing.og_title ?? "",
        listing.og_description ?? "",
        listing.og_site_name ?? "",
        listing.custom_blurb ?? "",
        listing.website_url ?? "",
        normalizeBizListingTypeForListing(listing),
        tagText,
      ]
        .join(" ")
        .toLowerCase();

      // Match full query phrase OR any keyword token (title/description/site/tags).
      if (haystack.includes(needle)) return true;
      return terms.some((term) => haystack.includes(term));
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
  }, [listings, keyword]);

  return (
    <section
      style={{
        width: "100%",
        boxSizing: "border-box",
        color: t.text,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Resources</h1>
          <button
            type="button"
            onClick={() => {
              setShowResourceForm((p) => !p);
              setResourceSubmitSuccess(false);
            }}
            style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 18, cursor: "pointer", padding: 0, whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {showResourceForm ? "Cancel" : "Upload Resource \u2192"}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>
          Browse approved community resources, foundations, tools, and support links.
        </div>
      </div>

      {showResourceForm && (
        <div style={{ marginTop: 4, marginBottom: 14, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
          {resourceSubmitSuccess ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
              Submitted! Our team will review and approve your resource.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Resource URL *</label>
                <input
                  type="text"
                  value={resourceUrl}
                  onChange={(e) => handleResourceUrlChange(e.target.value)}
                  onBlur={(e) => {
                    if (e.target.value.trim()) {
                      const n = normalizeUrl(e.target.value);
                      setResourceUrl(n);
                      handleResourceUrlChange(n);
                    }
                  }}
                  placeholder="resource.org"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                />
                {fetchingResourceOg && <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>Fetching preview...</div>}
                {resourceOgPreview && <OgCard og={resourceOgPreview} />}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Resource photo</label>
                <input
                  ref={resourceImageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) return;
                    if (resourceImagePreview) URL.revokeObjectURL(resourceImagePreview);
                    setResourceImageFile(file);
                    setResourceImagePreview(URL.createObjectURL(file));
                  }}
                />
                {resourceImagePreview ? (
                  <div style={{ width: 220, maxWidth: "100%", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, marginBottom: 8, position: "relative" }}>
                    <img src={resourceImagePreview} alt="Selected resource preview" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                    <button
                      type="button"
                      onClick={() => {
                        if (resourceImagePreview) URL.revokeObjectURL(resourceImagePreview);
                        setResourceImagePreview(null);
                        setResourceImageFile(null);
                        if (resourceImageInputRef.current) resourceImageInputRef.current.value = "";
                      }}
                      style={{ position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
                    >
                      x
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => resourceImageInputRef.current?.click()}
                  style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {resourceImageFile ? "Change photo" : "Add photo"}
                </button>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                  Optional. If chosen, this replaces the scraped metadata image.
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Name *</label>
                <input
                  type="text"
                  value={resourceName}
                  onChange={(e) => setResourceName(e.target.value)}
                  placeholder="Resource name"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Short Description</label>
                <textarea
                  value={resourceBlurb}
                  onChange={(e) => setResourceBlurb(e.target.value)}
                  rows={2}
                  placeholder="What does this resource help with?"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              <BizListingTagsField value={resourceTags} onChange={setResourceTags} />

              <button
                type="button"
                onClick={submitResourceListing}
                disabled={submittingResource || !resourceUrl.trim() || !resourceName.trim()}
                style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: submittingResource ? "not-allowed" : "pointer", opacity: submittingResource || !resourceUrl.trim() || !resourceName.trim() ? 0.65 : 1 }}
              >
                {submittingResource ? "Submitting..." : "Submit for approval"}
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: 12, marginBottom: 14 }}>
        <div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search title, site, description, or tags (e.g. behavioral, suicide prevention, mental health)"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading resources...</div>
      ) : visibleResources.length === 0 ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>No approved resources found.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {visibleResources.map((listing) => {
            const displayTitle = listing.og_title || listing.business_name || listing.og_site_name || "Resource";
            const displayDescription = listing.custom_blurb || listing.og_description || "Visit resource";

            return (
              <div key={listing.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface }}>
                <a
                  href={listing.website_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  {listing.og_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={httpsAssetUrl(listing.og_image)}
                      alt={displayTitle}
                      style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                    />
                  ) : null}
                  <div style={{ padding: 14, paddingBottom: 10 }}>
                    <div style={{ fontWeight: 800, lineHeight: 1.3, fontSize: 18 }}>{displayTitle}</div>
                    <div style={{ marginTop: 8, fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>{displayDescription}</div>
                  </div>
                </a>
                <div style={{ padding: "0 14px 8px" }}>
                  <BizListingTagChips tags={coerceTagsFromDb(listing.tags)} />
                </div>
                <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                  {listing.is_featured || isPermanentlyFeaturedListing(listing) ? (
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
    </section>
  );
}
