"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import ImageCropDialog from "../components/ImageCropDialog";
import { BizListingTagsField } from "../components/biz/BizListingTagsField";
import { BizListingTagChips } from "../components/biz/BizListingTagChips";
import { roundToNearestHalf, StarRatingDisplay, StarRatingInput } from "../components/StarRating";
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
} from "../components/master/masterShared";
import { ASPECT_EVENT_COVER } from "../lib/imageCropTargets";
import { coerceTagsFromDb, normalizeBizTagsInput, rememberCustomBizTag } from "../lib/bizListingTags";
import { useTheme } from "../lib/ThemeContext";
import { supabase } from "../lib/lib/supabaseClient";

type BusinessOrgListingType = "business" | "organization";

type BizPageFilter = "all" | BusinessOrgListingType;

type BizFilterState = {
  listingType: BizPageFilter;
  keyword: string;
};

type BusinessListing = BusinessListingRow;

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type ListingCommentRow = {
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

type ListingComment = ListingCommentRow & {
  authorName: string;
  authorPhotoUrl: string | null;
};

const BUSINESS_LISTING_COLUMNS =
  "id, created_at, business_name, website_url, custom_blurb, poc_name, phone_number, contact_email, city_state, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type, tags";

function coerceBizOrgType(listing: Pick<BusinessListing, "listing_type">): BusinessOrgListingType {
  return listing.listing_type === "organization" ? "organization" : "business";
}

export default function BusinessesPage() {
  const { t } = useTheme();
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [listings, setListings] = useState<BusinessListing[]>([]);
  const [filters, setFilters] = useState<BizFilterState>({ listingType: "all", keyword: "" });
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string>("You");

  const [showBizForm, setShowBizForm] = useState(false);
  const [editingBizId, setEditingBizId] = useState<string | null>(null);
  const bizFormRef = useRef<HTMLDivElement | null>(null);

  const [bizUrl, setBizUrl] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizBlurb, setBizBlurb] = useState("");
  const [bizPocName, setBizPocName] = useState("");
  const [bizPhoneNumber, setBizPhoneNumber] = useState("");
  const [bizContactEmail, setBizContactEmail] = useState("");
  const [bizCityState, setBizCityState] = useState("");
  const [bizType, setBizType] = useState<BusinessOrgListingType>("business");
  const [bizOgPreview, setBizOgPreview] = useState<OgPreview | null>(null);
  const [fetchingBizOg, setFetchingBizOg] = useState(false);
  const [submittingBiz, setSubmittingBiz] = useState(false);
  const [bizSubmitSuccess, setBizSubmitSuccess] = useState(false);
  const [bizTags, setBizTags] = useState<string[]>([]);
  const [bizImageFile, setBizImageFile] = useState<File | null>(null);
  const [bizImagePreview, setBizImagePreview] = useState<string | null>(null);
  const [bizCropOpen, setBizCropOpen] = useState(false);
  const [bizCropSrc, setBizCropSrc] = useState<string | null>(null);
  const bizImageInputRef = useRef<HTMLInputElement | null>(null);
  const bizOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [listingCommentsById, setListingCommentsById] = useState<Record<string, ListingComment[]>>({});
  const [listingCommentInputs, setListingCommentInputs] = useState<Record<string, string>>({});
  const [listingCommentRatings, setListingCommentRatings] = useState<Record<string, number | null>>({});
  const [submittingListingCommentFor, setSubmittingListingCommentFor] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<BusinessListing | null>(null);

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
      const p = profile as {
        display_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        is_admin?: boolean | null;
      } | null;
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

      const combined = (data ?? []) as BusinessListing[];

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

  function handleBizUrlChange(value: string) {
    setBizUrl(value);
    setBizOgPreview(null);
    const url = value.trim() ? normalizeUrl(value.trim()) : null;
    if (!url) return;
    if (bizOgDebounceRef.current) clearTimeout(bizOgDebounceRef.current);
    bizOgDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingBizOg(true);
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
          setBizOgPreview({
            url,
            title: data.title ?? null,
            description: data.description ?? null,
            image: data.image ?? null,
            siteName: data.siteName ?? null,
          });
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

  function closeBizCrop() {
    if (bizCropSrc) URL.revokeObjectURL(bizCropSrc);
    setBizCropSrc(null);
    setBizCropOpen(false);
  }

  function onPickBizPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (bizCropSrc) URL.revokeObjectURL(bizCropSrc);
    setBizCropSrc(URL.createObjectURL(f));
    setBizCropOpen(true);
  }

  async function uploadBizImage(file: File): Promise<string> {
    const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
    const path = `biz-listing-images/${safeFileName}`;
    const { error } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(path).data.publicUrl;
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
      const tagList = normalizeBizTagsInput(bizTags);
      for (const x of tagList) rememberCustomBizTag(x);
      const manualImageUrl = bizImageFile ? await uploadBizImage(bizImageFile) : null;

      const basePayload = {
        website_url: url,
        business_name: bizName.trim(),
        custom_blurb: bizBlurb.trim() || null,
        poc_name: bizPocName.trim() || null,
        phone_number: bizPhoneNumber.trim() || null,
        contact_email: bizContactEmail.trim() || null,
        city_state: bizCityState.trim() || null,
        og_title: bizOgPreview?.title ?? null,
        og_description: bizOgPreview?.description ?? null,
        og_image: manualImageUrl ?? bizOgPreview?.image ?? null,
        og_site_name: bizOgPreview?.siteName ?? null,
        is_approved: isAdmin,
        is_featured: false,
        tags: tagList,
      };

      let error: { message: string } | null = null;
      const listingTypeForRow = bizType;

      if (editingBizId) {
        const res = await supabase
          .from("business_listings")
          .update({
            ...basePayload,
            listing_type: listingTypeForRow,
            is_approved: true,
          })
          .eq("id", editingBizId);
        error = res.error as { message: string } | null;
      } else {
        const res = await supabase.from("business_listings").insert([{ ...basePayload, listing_type: listingTypeForRow }]);
        error = res.error as { message: string } | null;
      }

      if (error && isBizListingTagsMissingColumnError(error)) {
        const { tags, ...noTags } = basePayload;
        void tags;
        const r2 = editingBizId
          ? await supabase
              .from("business_listings")
              .update({ ...noTags, listing_type: listingTypeForRow, is_approved: true })
              .eq("id", editingBizId)
          : await supabase.from("business_listings").insert([{ ...noTags, listing_type: listingTypeForRow }]);
        error = r2.error;
        if (error && isBizListingTypeMissingColumnError(error)) {
          const r3 = editingBizId
            ? await supabase.from("business_listings").update({ ...noTags, is_approved: true }).eq("id", editingBizId)
            : await supabase.from("business_listings").insert([noTags]);
          error = r3.error;
        }
      } else if (error && isBizListingTypeMissingColumnError(error)) {
        const r2 = editingBizId
          ? await supabase.from("business_listings").update({ ...basePayload, is_approved: true }).eq("id", editingBizId)
          : await supabase.from("business_listings").insert([basePayload]);
        error = r2.error;
        if (error && isBizListingTagsMissingColumnError(error)) {
          const { tags, ...noTags } = basePayload;
          void tags;
          const r3 = editingBizId
            ? await supabase.from("business_listings").update({ ...noTags, is_approved: true }).eq("id", editingBizId)
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

      setBizSubmitSuccess(true);
      setBizUrl("");
      setBizName("");
      setBizBlurb("");
      setBizPocName("");
      setBizPhoneNumber("");
      setBizContactEmail("");
      setBizCityState("");
      setBizType("business");
      setEditingBizId(null);
      setBizTags([]);
      setBizOgPreview(null);
      setBizImageFile(null);
      if (bizImagePreview) URL.revokeObjectURL(bizImagePreview);
      setBizImagePreview(null);
      closeBizCrop();
      if (bizImageInputRef.current) bizImageInputRef.current.value = "";

      setTimeout(() => {
        setBizSubmitSuccess(false);
        setShowBizForm(false);
        void loadListingEngagement(visibleListingIds);
        void (async () => {
          const { data: refreshed } = await supabase
            .from("business_listings")
            .select(BUSINESS_LISTING_COLUMNS)
            .eq("is_approved", true)
            .order("is_featured", { ascending: false })
            .order("business_name", { ascending: true, nullsFirst: false })
            .limit(500);
          setListings((refreshed ?? []) as BusinessListing[]);
        })();
      }, 3000);
    } finally {
      setSubmittingBiz(false);
    }
  }

  function beginEditBizListing(listing: BusinessListing) {
    if (!isAdmin) return;
    setEditingBizId(listing.id);
    setBizUrl(listing.website_url ?? "");
    setBizName(listing.business_name ?? listing.og_title ?? "");
    setBizBlurb(listing.custom_blurb ?? listing.og_description ?? "");
    setBizPocName(listing.poc_name ?? "");
    setBizPhoneNumber(listing.phone_number ?? "");
    setBizContactEmail(listing.contact_email ?? "");
    setBizCityState(listing.city_state ?? "");
    setBizType(coerceBizOrgType(listing));
    setBizTags(coerceTagsFromDb(listing.tags));
    setBizOgPreview({
      url: listing.website_url ?? "",
      title: listing.og_title ?? null,
      description: listing.og_description ?? null,
      image: listing.og_image ?? null,
      siteName: listing.og_site_name ?? null,
    });
    setShowBizForm(true);
    setSelectedListing(null);
    setTimeout(() => bizFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const visibleListings = useMemo(() => {
    const needle = filters.keyword.trim().toLowerCase();
    const terms = needle
      .split(",")
      .flatMap((part) => part.trim().split(/\s+/))
      .map((term) => term.trim())
      .filter(Boolean);

    const filtered = listings.filter((l) => {
      const listingType = normalizeBizListingTypeForListing(l);
      if (listingType === "resource") {
        return false;
      }
      if (filters.listingType !== "all" && listingType !== filters.listingType) {
        return false;
      }
      if (!needle) return true;
      const tagText = coerceTagsFromDb(l.tags).join(" ");
      const haystack = [
        l.business_name ?? "",
        l.og_title ?? "",
        l.og_description ?? "",
        l.og_site_name ?? "",
        l.custom_blurb ?? "",
        l.website_url ?? "",
        listingType,
        tagText,
      ]
        .join(" ")
        .toLowerCase();

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
  }, [listings, filters]);

  const visibleListingIds = useMemo(() => visibleListings.map((r) => r.id), [visibleListings]);

  useEffect(() => {
    if (!selectedListing) return;
    const stillPresent = visibleListings.some((r) => r.id === selectedListing.id);
    if (!stillPresent) setSelectedListing(null);
  }, [selectedListing, visibleListings]);

  useEffect(() => {
    function onEsc(ev: KeyboardEvent) {
      if (ev.key === "Escape") setSelectedListing(null);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  async function loadListingEngagement(listingIds: string[]) {
    if (listingIds.length === 0) {
      setListingCommentsById({});
      return;
    }
    const { data: commentRows } = await supabase
      .from("resource_comments")
      .select("id, resource_id, user_id, content, rating, created_at")
      .in("resource_id", listingIds)
      .order("created_at", { ascending: true });

    const comments = (commentRows ?? []) as ListingCommentRow[];

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

    const commentByListing: Record<string, ListingComment[]> = {};
    for (const c of comments) {
      const row: ListingComment = {
        ...c,
        rating: c.rating === null ? null : Number(c.rating),
        authorName: profileName(profileMap.get(c.user_id), c.user_id),
        authorPhotoUrl: profileMap.get(c.user_id)?.photo_url ?? null,
      };
      if (!commentByListing[c.resource_id]) commentByListing[c.resource_id] = [];
      commentByListing[c.resource_id].push(row);
    }

    setListingCommentsById(commentByListing);
  }

  useEffect(() => {
    void loadListingEngagement(visibleListingIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, visibleListingIds.join("|")]);

  function getRatingSummary(listingId: string): { average: number | null; averageRounded: number | null; ratedCount: number } {
    const comments = listingCommentsById[listingId] ?? [];
    const rated = comments.filter((c) => typeof c.rating === "number") as Array<ListingComment & { rating: number }>;
    if (rated.length === 0) return { average: null, averageRounded: null, ratedCount: 0 };
    const average = rated.reduce((sum, row) => sum + row.rating, 0) / rated.length;
    return {
      average,
      averageRounded: roundToNearestHalf(average),
      ratedCount: rated.length,
    };
  }

  async function handleSubmitListingComment(listingId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    const content = (listingCommentInputs[listingId] ?? "").trim();
    if (!content || submittingListingCommentFor === listingId) return;
    setSubmittingListingCommentFor(listingId);
    try {
      await supabase.from("resource_comments").insert({
        resource_id: listingId,
        user_id: userId,
        content,
        rating: listingCommentRatings[listingId] ?? null,
      });
      setListingCommentInputs((prev) => ({ ...prev, [listingId]: "" }));
      setListingCommentRatings((prev) => ({ ...prev, [listingId]: null }));
      await loadListingEngagement(visibleListingIds);
    } finally {
      setSubmittingListingCommentFor(null);
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
        open={bizCropOpen}
        imageSrc={bizCropSrc}
        aspect={ASPECT_EVENT_COVER}
        cropShape="rect"
        title="Crop listing photo"
        onCancel={closeBizCrop}
        onComplete={async (blob) => {
          if (bizImagePreview) URL.revokeObjectURL(bizImagePreview);
          const file = new File([blob], "biz-cover.jpg", { type: "image/jpeg" });
          setBizImageFile(file);
          setBizImagePreview(URL.createObjectURL(file));
          closeBizCrop();
        }}
      />

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Businesses/Orgs</h1>
          <button
            type="button"
            onClick={() => {
              setShowBizForm((p) => {
                if (p) setEditingBizId(null);
                return !p;
              });
              setBizSubmitSuccess(false);
            }}
            style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 18, cursor: "pointer", padding: 0, whiteSpace: "nowrap", textDecoration: "none" }}
          >
            {showBizForm ? "Cancel" : "Add Business/Org →"}
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted }}>
          Browse EOD owned and operated businesses and organizations
        </div>
      </div>

      {showBizForm && (
        <div ref={bizFormRef} style={{ marginTop: 4, marginBottom: 14, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
          {bizSubmitSuccess ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
              {editingBizId ? "Listing updated." : isAdmin ? "Listing published." : "Submitted! Our team will review and approve your listing."}
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
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Listing photo</label>
                <input ref={bizImageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onPickBizPhoto} />
                {bizImagePreview ? (
                  <div style={{ width: 220, maxWidth: "100%", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, marginBottom: 8, position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={bizImagePreview} alt="Selected listing preview" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                    <button
                      type="button"
                      onClick={() => {
                        if (bizImagePreview) URL.revokeObjectURL(bizImagePreview);
                        setBizImagePreview(null);
                        setBizImageFile(null);
                        if (bizImageInputRef.current) bizImageInputRef.current.value = "";
                      }}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        border: "none",
                        background: "rgba(0,0,0,0.7)",
                        color: "#fff",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      x
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => bizImageInputRef.current?.click()}
                  style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {bizImageFile ? "Change photo" : "Add photo"}
                </button>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                  Optional. Crop to a wide card (16:9). If chosen, this replaces the scraped metadata image.
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Type *</label>
                <select
                  value={bizType}
                  onChange={(e) => setBizType(e.target.value as BusinessOrgListingType)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                >
                  <option value="business">Business</option>
                  <option value="organization">Organization</option>
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
                  placeholder="What does this business/org do?"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${t.inputBorder}`,
                    fontSize: 13,
                    boxSizing: "border-box",
                    background: t.input,
                    color: t.text,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>POC Information</label>
                  <input
                    type="text"
                    value={bizPocName}
                    onChange={(e) => setBizPocName(e.target.value)}
                    placeholder="Point of contact name"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Phone Number</label>
                  <input
                    type="text"
                    value={bizPhoneNumber}
                    onChange={(e) => setBizPhoneNumber(e.target.value)}
                    placeholder="(555) 555-5555"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Email</label>
                  <input
                    type="text"
                    value={bizContactEmail}
                    onChange={(e) => setBizContactEmail(e.target.value)}
                    placeholder="support@example.org"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>City / State</label>
                  <input
                    type="text"
                    value={bizCityState}
                    onChange={(e) => setBizCityState(e.target.value)}
                    placeholder="City, State"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                  />
                </div>
              </div>

              <BizListingTagsField value={bizTags} onChange={setBizTags} />

              <button
                type="button"
                onClick={submitBizListing}
                disabled={submittingBiz || !bizUrl.trim() || !bizName.trim()}
                style={{
                  background: "#111",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 14px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: submittingBiz ? "not-allowed" : "pointer",
                  opacity: submittingBiz || !bizUrl.trim() || !bizName.trim() ? 0.65 : 1,
                }}
              >
                {submittingBiz ? (editingBizId ? "Saving..." : "Submitting...") : editingBizId ? "Save Listing" : isAdmin ? "Publish" : "Submit for approval"}
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
            <option value="all">All businesses/orgs</option>
            <option value="business">Businesses</option>
            <option value="organization">Organizations</option>
          </select>

          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            placeholder="Search title, site, description, or tags"
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
            const displayTitle = listing.og_title || listing.business_name || listing.og_site_name || "Business Listing";
            const displayDescription = listing.custom_blurb || listing.og_description || "Visit website";
            const comments = listingCommentsById[listing.id] ?? [];
            const { averageRounded, ratedCount } = getRatingSummary(listing.id);

            return (
              <article
                key={listing.id}
                onClick={() => setSelectedListing(listing)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedListing(listing);
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
                <div style={{ display: "block", textDecoration: "none", color: "inherit" }}>
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
                      setSelectedListing(listing);
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

      {selectedListing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedListing(null)}
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
                  {selectedListing.og_title || selectedListing.business_name || selectedListing.og_site_name || "Listing"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted }}>
                  {(listingCommentsById[selectedListing.id] ?? []).length} comments
                </div>
              </div>
              <button type="button" onClick={() => setSelectedListing(null)} style={{ background: "none", border: "none", color: t.text, fontSize: 24, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
                x
              </button>
            </div>
            {selectedListing.og_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={httpsAssetUrl(selectedListing.og_image)}
                alt={selectedListing.business_name || "Listing"}
                style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
              />
            ) : null}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>
                {selectedListing.custom_blurb || selectedListing.og_description || "Visit website"}
              </div>
              {(selectedListing.poc_name || selectedListing.phone_number || selectedListing.contact_email || selectedListing.city_state) && (
                <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
                  {selectedListing.poc_name && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>POC:</span> {selectedListing.poc_name}
                    </div>
                  )}
                  {selectedListing.phone_number && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Phone:</span> {selectedListing.phone_number}
                    </div>
                  )}
                  {selectedListing.contact_email && (
                    <div style={{ fontSize: 13, color: t.textMuted, wordBreak: "break-word" }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Email:</span> {selectedListing.contact_email}
                    </div>
                  )}
                  {selectedListing.city_state && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Location:</span> {selectedListing.city_state}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <BizListingTagChips tags={coerceTagsFromDb(selectedListing.tags)} maxVisible={coerceTagsFromDb(selectedListing.tags).length} />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {(() => {
                  const { averageRounded, ratedCount } = getRatingSummary(selectedListing.id);
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
                    href={selectedListing.website_url}
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
                      onClick={() => beginEditBizListing(selectedListing)}
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
                    value={listingCommentRatings[selectedListing.id] ?? null}
                    onChange={(next) => setListingCommentRatings((prev) => ({ ...prev, [selectedListing.id]: next }))}
                  />
                  <div style={{ marginTop: 4, fontSize: 12, color: t.textMuted }}>Optional rating</div>
                </div>
                <textarea
                  value={listingCommentInputs[selectedListing.id] ?? ""}
                  onChange={(e) => setListingCommentInputs((prev) => ({ ...prev, [selectedListing.id]: e.target.value }))}
                  rows={3}
                  placeholder="Add your comment"
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    border: `1px solid ${t.inputBorder}`,
                    background: t.input,
                    color: t.text,
                    fontSize: 13,
                    boxSizing: "border-box",
                    padding: "9px 10px",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => handleSubmitListingComment(selectedListing.id)}
                    disabled={
                      !userId ||
                      submittingListingCommentFor === selectedListing.id ||
                      !(listingCommentInputs[selectedListing.id] ?? "").trim()
                    }
                    style={{
                      background: "#111",
                      color: "white",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 13px",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      opacity:
                        !userId ||
                        submittingListingCommentFor === selectedListing.id ||
                        !(listingCommentInputs[selectedListing.id] ?? "").trim()
                          ? 0.6
                          : 1,
                    }}
                  >
                    {submittingListingCommentFor === selectedListing.id ? "Posting..." : "Post Comment"}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {(listingCommentsById[selectedListing.id] ?? []).length === 0 ? (
                  <div style={{ fontSize: 13, color: t.textMuted }}>No comments yet.</div>
                ) : (
                  (listingCommentsById[selectedListing.id] ?? []).map((comment) => (
                    <div key={comment.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, background: t.bg }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            overflow: "hidden",
                            background: t.border,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
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
