"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BizListingTagsField } from "../../components/biz/BizListingTagsField";
import { BizListingTagChips } from "../../components/biz/BizListingTagChips";
import { roundToNearestHalf, StarRatingDisplay, StarRatingInput } from "../../components/StarRating";
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
import ImageCropDialog from "../../components/ImageCropDialog";
import { ASPECT_EVENT_COVER } from "../../lib/imageCropTargets";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";

type BusinessListing = BusinessListingRow;

const BUSINESS_LISTING_COLUMNS =
  "id, created_at, business_name, website_url, custom_blurb, poc_name, phone_number, contact_email, city_state, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type, tags";

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type ResourceCommentRow = {
  id: string;
  resource_id: string;
  user_id: string;
  content: string;
  rating: number | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

type ResourceComment = ResourceCommentRow & {
  authorName: string;
  authorPhotoUrl: string | null;
};

export default function ResourcesPage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [keyword, setKeyword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [resourceBlurb, setResourceBlurb] = useState("");
  const [resourcePocName, setResourcePocName] = useState("");
  const [resourcePhoneNumber, setResourcePhoneNumber] = useState("");
  const [resourceContactEmail, setResourceContactEmail] = useState("");
  const [resourceCityState, setResourceCityState] = useState("");
  const [resourceOgPreview, setResourceOgPreview] = useState<OgPreview | null>(null);
  const [fetchingResourceOg, setFetchingResourceOg] = useState(false);
  const [submittingResource, setSubmittingResource] = useState(false);
  const [resourceSubmitSuccess, setResourceSubmitSuccess] = useState(false);
  const [resourceTags, setResourceTags] = useState<string[]>([]);
  const [resourceImageFile, setResourceImageFile] = useState<File | null>(null);
  const [resourceImagePreview, setResourceImagePreview] = useState<string | null>(null);
  const [resourceCropOpen, setResourceCropOpen] = useState(false);
  const [resourceCropSrc, setResourceCropSrc] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("You");
  const [resourceCommentsById, setResourceCommentsById] = useState<Record<string, ResourceComment[]>>({});
  const [resourceCommentInputs, setResourceCommentInputs] = useState<Record<string, string>>({});
  const [resourceCommentRatings, setResourceCommentRatings] = useState<Record<string, number | null>>({});
  const [submittingResourceCommentFor, setSubmittingResourceCommentFor] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<BusinessListing | null>(null);
  const resourceFormRef = useRef<HTMLDivElement | null>(null);
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
      const uid = data.session?.user?.id ?? null;
      if (!mounted) return;
      setUserId(uid);
      if (!uid) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name, is_admin")
        .eq("user_id", uid)
        .maybeSingle();
      const p = profile as { display_name?: string | null; first_name?: string | null; last_name?: string | null; is_admin?: boolean | null } | null;
      const composed = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      setCurrentUserName(p?.display_name?.trim() || composed || "You");
      setIsAdmin(Boolean(p?.is_admin));
    }
    void loadUser();
    return () => {
      mounted = false;
    };
  }, []);

  function profileName(p: ProfileRow | undefined, fallbackUserId: string): string {
    if (!p) return "Member";
    const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return p.display_name?.trim() || composed || (fallbackUserId === userId ? currentUserName : "Member");
  }

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

  function closeResourceCrop() {
    if (resourceCropSrc) URL.revokeObjectURL(resourceCropSrc);
    setResourceCropSrc(null);
    setResourceCropOpen(false);
  }

  function onPickResourcePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (resourceCropSrc) URL.revokeObjectURL(resourceCropSrc);
    setResourceCropSrc(URL.createObjectURL(f));
    setResourceCropOpen(true);
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
        poc_name: resourcePocName.trim() || null,
        phone_number: resourcePhoneNumber.trim() || null,
        contact_email: resourceContactEmail.trim() || null,
        city_state: resourceCityState.trim() || null,
        og_title: resourceOgPreview?.title ?? null,
        og_description: resourceOgPreview?.description ?? null,
        og_image: manualImageUrl ?? resourceOgPreview?.image ?? null,
        og_site_name: resourceOgPreview?.siteName ?? null,
        is_approved: isAdmin,
        is_featured: false,
        tags: tagList,
      };
      let error: { message: string } | null = null;
      if (editingResourceId) {
        const res = await supabase
          .from("business_listings")
          .update({
            ...basePayload,
            listing_type: "resource",
            is_approved: true,
          })
          .eq("id", editingResourceId);
        error = res.error as { message: string } | null;
      } else {
        const res = await supabase.from("business_listings").insert([{ ...basePayload, listing_type: "resource" }]);
        error = res.error as { message: string } | null;
      }
      if (error && isBizListingTagsMissingColumnError(error)) {
        const { tags, ...noTags } = basePayload;
        void tags;
        const r2 = editingResourceId
          ? await supabase
              .from("business_listings")
              .update({ ...noTags, listing_type: "resource", is_approved: true })
              .eq("id", editingResourceId)
          : await supabase.from("business_listings").insert([{ ...noTags, listing_type: "resource" }]);
        error = r2.error;
        if (error && isBizListingTypeMissingColumnError(error)) {
          const r3 = editingResourceId
            ? await supabase
                .from("business_listings")
                .update({ ...noTags, is_approved: true })
                .eq("id", editingResourceId)
            : await supabase.from("business_listings").insert([noTags]);
          error = r3.error;
        }
      } else if (error && isBizListingTypeMissingColumnError(error)) {
        const r2 = editingResourceId
          ? await supabase
              .from("business_listings")
              .update({ ...basePayload, is_approved: true })
              .eq("id", editingResourceId)
          : await supabase.from("business_listings").insert([basePayload]);
        error = r2.error;
        if (error && isBizListingTagsMissingColumnError(error)) {
          const { tags, ...noTags } = basePayload;
          void tags;
          const r3 = editingResourceId
            ? await supabase
                .from("business_listings")
                .update({ ...noTags, is_approved: true })
                .eq("id", editingResourceId)
            : await supabase.from("business_listings").insert([noTags]);
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
      setResourcePocName("");
      setResourcePhoneNumber("");
      setResourceContactEmail("");
      setResourceCityState("");
      setEditingResourceId(null);
      setResourceTags([]);
      setResourceOgPreview(null);
      setResourceImageFile(null);
      if (resourceImagePreview) URL.revokeObjectURL(resourceImagePreview);
      setResourceImagePreview(null);
      closeResourceCrop();
      if (resourceImageInputRef.current) resourceImageInputRef.current.value = "";
      setTimeout(() => {
        setResourceSubmitSuccess(false);
        setShowResourceForm(false);
        void loadResourceEngagement(visibleResourceIds);
      }, 3000);
    } finally {
      setSubmittingResource(false);
    }
  }

  function beginEditResource(resource: BusinessListing) {
    if (!isAdmin) return;
    setEditingResourceId(resource.id);
    setResourceUrl(resource.website_url ?? "");
    setResourceName(resource.business_name ?? resource.og_title ?? "");
    setResourceBlurb(resource.custom_blurb ?? resource.og_description ?? "");
    setResourcePocName(resource.poc_name ?? "");
    setResourcePhoneNumber(resource.phone_number ?? "");
    setResourceContactEmail(resource.contact_email ?? "");
    setResourceCityState(resource.city_state ?? "");
    setResourceTags(coerceTagsFromDb(resource.tags));
    setResourceOgPreview({
      url: resource.website_url ?? "",
      title: resource.og_title ?? null,
      description: resource.og_description ?? null,
      image: resource.og_image ?? null,
      siteName: resource.og_site_name ?? null,
    });
    setShowResourceForm(true);
    setSelectedResource(null);
    setTimeout(() => resourceFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
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

  const visibleResourceIds = useMemo(() => visibleResources.map((r) => r.id), [visibleResources]);

  useEffect(() => {
    if (!selectedResource) return;
    const stillPresent = visibleResources.some((r) => r.id === selectedResource.id);
    if (!stillPresent) setSelectedResource(null);
  }, [selectedResource, visibleResources]);

  useEffect(() => {
    function onEsc(ev: KeyboardEvent) {
      if (ev.key === "Escape") setSelectedResource(null);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  async function loadResourceEngagement(resourceIds: string[]) {
    if (resourceIds.length === 0) {
      setResourceCommentsById({});
      return;
    }
    const { data: commentRows } = await supabase
      .from("resource_comments")
      .select("id, resource_id, user_id, content, rating, created_at")
      .in("resource_id", resourceIds)
      .order("created_at", { ascending: true });

    const comments = (commentRows ?? []) as ResourceCommentRow[];

    const uniqueUserIds = Array.from(new Set(comments.map((c) => c.user_id)));
    let profileMap = new Map<string, ProfileRow>();
    if (uniqueUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, photo_url")
        .in("user_id", uniqueUserIds);
      const profileRows = (profiles ?? []) as ProfileRow[];
      profileMap = new Map(profileRows.map((p) => [p.user_id, p]));
    }

    const commentByResource: Record<string, ResourceComment[]> = {};
    for (const c of comments) {
      const row: ResourceComment = {
        ...c,
        rating: c.rating === null ? null : Number(c.rating),
        authorName: profileName(profileMap.get(c.user_id), c.user_id),
        authorPhotoUrl: profileMap.get(c.user_id)?.photo_url ?? null,
      };
      if (!commentByResource[c.resource_id]) commentByResource[c.resource_id] = [];
      commentByResource[c.resource_id].push(row);
    }

    setResourceCommentsById(commentByResource);
  }

  useEffect(() => {
    void loadResourceEngagement(visibleResourceIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, visibleResourceIds.join("|")]);

  function getRatingSummary(resourceId: string): { average: number | null; averageRounded: number | null; ratedCount: number } {
    const comments = resourceCommentsById[resourceId] ?? [];
    const rated = comments.filter((c) => typeof c.rating === "number") as Array<ResourceComment & { rating: number }>;
    if (rated.length === 0) return { average: null, averageRounded: null, ratedCount: 0 };
    const average = rated.reduce((sum, row) => sum + row.rating, 0) / rated.length;
    return {
      average,
      averageRounded: roundToNearestHalf(average),
      ratedCount: rated.length,
    };
  }

  async function handleSubmitResourceComment(resourceId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    const content = (resourceCommentInputs[resourceId] ?? "").trim();
    if (!content || submittingResourceCommentFor === resourceId) return;
    setSubmittingResourceCommentFor(resourceId);
    try {
      await supabase.from("resource_comments").insert({
        resource_id: resourceId,
        user_id: userId,
        content,
        rating: resourceCommentRatings[resourceId] ?? null,
      });
      setResourceCommentInputs((prev) => ({ ...prev, [resourceId]: "" }));
      setResourceCommentRatings((prev) => ({ ...prev, [resourceId]: null }));
      await loadResourceEngagement(visibleResourceIds);
    } finally {
      setSubmittingResourceCommentFor(null);
    }
  }

  return (
    <section
      style={{
        width: "100%",
        boxSizing: "border-box",
        color: t.text,
      }}
    >
      <ImageCropDialog
        open={resourceCropOpen}
        imageSrc={resourceCropSrc}
        aspect={ASPECT_EVENT_COVER}
        cropShape="rect"
        title="Crop resource photo"
        onCancel={closeResourceCrop}
        onComplete={async (blob) => {
          if (resourceImagePreview) URL.revokeObjectURL(resourceImagePreview);
          const file = new File([blob], "resource-cover.jpg", { type: "image/jpeg" });
          setResourceImageFile(file);
          setResourceImagePreview(URL.createObjectURL(file));
          closeResourceCrop();
        }}
      />
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Resources</h1>
          <button
            type="button"
            onClick={() => {
              setShowResourceForm((p) => {
                if (p) setEditingResourceId(null);
                return !p;
              });
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
        <div ref={resourceFormRef} style={{ marginTop: 4, marginBottom: 14, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
          {resourceSubmitSuccess ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
              {editingResourceId ? "Resource updated." : "Submitted! Our team will review and approve your resource."}
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
                  onChange={onPickResourcePhoto}
                />
                {resourceImagePreview ? (
                  <div style={{ width: 220, maxWidth: "100%", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, marginBottom: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
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
                  Optional. Crop to a wide card (16:9). If chosen, this replaces the scraped metadata image.
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

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>POC Information</label>
                  <input
                    type="text"
                    value={resourcePocName}
                    onChange={(e) => setResourcePocName(e.target.value)}
                    placeholder="Point of contact name"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Phone Number</label>
                  <input
                    type="text"
                    value={resourcePhoneNumber}
                    onChange={(e) => setResourcePhoneNumber(e.target.value)}
                    placeholder="(555) 555-5555"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Email</label>
                  <input
                    type="text"
                    value={resourceContactEmail}
                    onChange={(e) => setResourceContactEmail(e.target.value)}
                    placeholder="support@example.org"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>City / State</label>
                  <input
                    type="text"
                    value={resourceCityState}
                    onChange={(e) => setResourceCityState(e.target.value)}
                    placeholder="City, State"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
              </div>

              <BizListingTagsField value={resourceTags} onChange={setResourceTags} />

              <button
                type="button"
                onClick={submitResourceListing}
                disabled={submittingResource || !resourceUrl.trim() || !resourceName.trim()}
                style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: submittingResource ? "not-allowed" : "pointer", opacity: submittingResource || !resourceUrl.trim() || !resourceName.trim() ? 0.65 : 1 }}
              >
                {submittingResource ? (editingResourceId ? "Saving..." : "Submitting...") : (editingResourceId ? "Save Resource" : "Submit for approval")}
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
            const comments = resourceCommentsById[listing.id] ?? [];
            const { averageRounded, ratedCount } = getRatingSummary(listing.id);

            return (
              <article
                key={listing.id}
                onClick={() => setSelectedResource(listing)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedResource(listing);
                  }
                }}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: t.surface,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{ display: "block", textDecoration: "none", color: "inherit" }}
                >
                  {listing.og_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={httpsAssetUrl(listing.og_image)}
                      alt={displayTitle}
                      style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }}
                    />
                  ) : null}
                  <div style={{ padding: 14, paddingBottom: 8 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        lineHeight: 1.25,
                        fontSize: 16,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {displayTitle}
                    </div>
                    <div
                      style={{
                        marginTop: 7,
                        fontSize: 13,
                        color: t.textMuted,
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {displayDescription}
                    </div>
                  </div>
                </div>
                <div style={{ padding: "0 14px 8px" }}>
                  <BizListingTagChips tags={coerceTagsFromDb(listing.tags)} maxVisible={3} />
                </div>
                <div style={{ padding: "0 14px 12px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedResource(listing);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                      color: t.text,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Comment</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.textMuted }}>{comments.length}</span>
                  </button>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {averageRounded === null ? (
                      <span style={{ fontSize: 12, color: t.textMuted }}>No ratings yet</span>
                    ) : (
                      <>
                        <StarRatingDisplay value={averageRounded} size={15} />
                        <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>
                          {averageRounded.toFixed(1)} ({ratedCount})
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {selectedResource && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedResource(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1200,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(760px, 100%)",
              maxHeight: "88vh",
              overflowY: "auto",
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 14,
            }}
          >
            <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
                  {selectedResource.og_title || selectedResource.business_name || selectedResource.og_site_name || "Resource"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted }}>
                  {(resourceCommentsById[selectedResource.id] ?? []).length} comments
                </div>
              </div>
              <button type="button" onClick={() => setSelectedResource(null)} style={{ background: "none", border: "none", color: t.text, fontSize: 24, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
                x
              </button>
            </div>
            {selectedResource.og_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={httpsAssetUrl(selectedResource.og_image)}
                alt={selectedResource.business_name || "Resource"}
                style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
              />
            ) : null}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>
                {selectedResource.custom_blurb || selectedResource.og_description || "Visit resource"}
              </div>
              {(selectedResource.poc_name || selectedResource.phone_number || selectedResource.contact_email || selectedResource.city_state) && (
                <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
                  {selectedResource.poc_name && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>POC:</span> {selectedResource.poc_name}
                    </div>
                  )}
                  {selectedResource.phone_number && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Phone:</span> {selectedResource.phone_number}
                    </div>
                  )}
                  {selectedResource.contact_email && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Email:</span> {selectedResource.contact_email}
                    </div>
                  )}
                  {selectedResource.city_state && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Location:</span> {selectedResource.city_state}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <BizListingTagChips
                  tags={coerceTagsFromDb(selectedResource.tags)}
                  maxVisible={coerceTagsFromDb(selectedResource.tags).length}
                />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {(() => {
                  const { averageRounded, ratedCount } = getRatingSummary(selectedResource.id);
                  if (averageRounded === null) return <span style={{ fontSize: 13, color: t.textMuted }}>No ratings yet</span>;
                  return (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <StarRatingDisplay value={averageRounded} size={16} />
                      <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 700 }}>
                        {averageRounded.toFixed(1)} ({ratedCount})
                      </span>
                    </div>
                  );
                })()}
                <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <a
                    href={selectedResource.website_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ background: "#2563eb", color: "white", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                  >
                    Visit Website
                  </a>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => beginEditResource(selectedResource)}
                      style={{ background: "#374151", color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 18, borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Leave a comment</div>
                <div style={{ marginBottom: 8 }}>
                  <StarRatingInput
                    value={resourceCommentRatings[selectedResource.id] ?? null}
                    onChange={(next) => setResourceCommentRatings((prev) => ({ ...prev, [selectedResource.id]: next }))}
                  />
                  <div style={{ marginTop: 4, fontSize: 12, color: t.textMuted }}>Optional rating</div>
                </div>
                <textarea
                  value={resourceCommentInputs[selectedResource.id] ?? ""}
                  onChange={(e) => setResourceCommentInputs((prev) => ({ ...prev, [selectedResource.id]: e.target.value }))}
                  rows={3}
                  placeholder="Add your comment"
                  style={{ width: "100%", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 13, boxSizing: "border-box", padding: "9px 10px", resize: "vertical", fontFamily: "inherit" }}
                />
                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => handleSubmitResourceComment(selectedResource.id)}
                    disabled={!userId || submittingResourceCommentFor === selectedResource.id || !(resourceCommentInputs[selectedResource.id] ?? "").trim()}
                    style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "8px 13px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: !userId || submittingResourceCommentFor === selectedResource.id || !(resourceCommentInputs[selectedResource.id] ?? "").trim() ? 0.6 : 1 }}
                  >
                    {submittingResourceCommentFor === selectedResource.id ? "Posting..." : "Post Comment"}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {(resourceCommentsById[selectedResource.id] ?? []).length === 0 ? (
                  <div style={{ fontSize: 13, color: t.textMuted }}>No comments yet.</div>
                ) : (
                  (resourceCommentsById[selectedResource.id] ?? []).map((comment) => (
                    <div key={comment.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, background: t.bg }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", background: t.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                          {comment.authorPhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={comment.authorPhotoUrl} alt={comment.authorName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          ) : (
                            comment.authorName[0]?.toUpperCase() ?? "M"
                          )}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{comment.authorName}</div>
                        {comment.rating !== null && (
                          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <StarRatingDisplay value={comment.rating} size={14} />
                            <span style={{ fontSize: 12, color: t.textMuted }}>{comment.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.45, color: t.text }}>{comment.content}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
