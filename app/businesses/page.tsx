"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ShareListingToFeedModal from "../components/ShareListingToFeedModal";
import { BizListingTagsField } from "../components/biz/BizListingTagsField";
import { BizListingTagChips } from "../components/biz/BizListingTagChips";
import { roundToNearestHalf, StarRatingDisplay, StarRatingInput } from "../components/StarRating";
import {
  compareBizListingsAlphabetically,
  httpsAssetUrl,
  isBizListingTagsMissingColumnError,
  isBizListingTypeMissingColumnError,
  normalizeBizListingTypeForListing,
  normalizeUrl,
  OgCard,
  type BusinessListingRow,
} from "../components/master/masterShared";
import { coerceTagsFromDb, normalizeBizTagsInput, rememberCustomBizTag } from "../lib/bizListingTags";
import { loadBusinessListingProfileLinks, resolveBusinessListingLinkTarget } from "../lib/businessListingLinks";
import { useTheme } from "../lib/ThemeContext";
import { getSupabaseSession, supabase } from "../lib/lib/supabaseClient";
import { prepareFeedThumbnailUploadFile } from "../lib/prepareUploadFile";
import { validateImagePick } from "../lib/uploadLimits";
import { usePageTracking } from "../hooks/usePageTracking";
import { useRequireFullAccess } from "../hooks/useRequireFullAccess";
import { PAGE_TRACKING } from "../lib/pageTrackingPaths";
import { shareListingToFeed } from "../lib/shareListingToFeed";
import type { PostAsMode } from "../lib/postAsIdentity";

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
  favicon?: string | null;
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

type BusinessOrgClaimPageOption = {
  id: string;
  owner_user_id: string;
  business_auth_user_id: string | null;
  business_name: string;
  business_email: string;
  website_url: string | null;
  logo_url: string;
  verification_status: string;
  subscription_status: string;
  is_active: boolean;
};

const BUSINESS_LISTING_COLUMNS =
  "id, created_at, business_name, website_url, custom_blurb, poc_name, phone_number, contact_email, city_state, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type, tags, managed_by_user_id, claimed_business_org_page_id";
const BUSINESS_LISTING_COLUMNS_FALLBACK =
  "id, created_at, business_name, website_url, custom_blurb, poc_name, phone_number, contact_email, city_state, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type, tags, managed_by_user_id";

function coerceBizOrgType(listing: Pick<BusinessListing, "listing_type">): BusinessOrgListingType {
  return listing.listing_type === "organization" ? "organization" : "business";
}

function listingEligibleForClaim(listing: BusinessListing): boolean {
  const t = normalizeBizListingTypeForListing(listing);
  if (t !== "business" && t !== "organization") return false;
  if (!listing.is_approved) return false;
  if (listing.managed_by_user_id) return false;
  return true;
}

function userManagesListing(listing: Pick<BusinessListing, "managed_by_user_id">, uid: string | null): boolean {
  return Boolean(uid && listing.managed_by_user_id === uid);
}

function canEditBizListing(listing: BusinessListing, uid: string | null, admin: boolean): boolean {
  if (admin) return true;
  return userManagesListing(listing, uid);
}

function hostnameFromUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const normalized = normalizeUrl(value);
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function emailDomain(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email.split("@").pop()?.replace(/^www\./, "") || null;
}

function pageSuggestsListingLink(
  page: BusinessOrgClaimPageOption,
  listing: BusinessListing,
  currentUserId: string | null,
): boolean {
  if (!currentUserId) return false;
  if (listing.claimed_business_org_page_id) return false;
  if (listing.managed_by_user_id && listing.managed_by_user_id !== page.owner_user_id) return false;

  const pageWebsiteHost = hostnameFromUrl(page.website_url);
  const listingWebsiteHost = hostnameFromUrl(listing.website_url);
  const pageEmailDomain = emailDomain(page.business_email);
  const listingEmailDomain = emailDomain(listing.contact_email);
  const pageName = page.business_name.trim().toLowerCase();
  const listingName = (listing.business_name || listing.og_title || listing.og_site_name || "").trim().toLowerCase();

  return (
    listing.managed_by_user_id === page.owner_user_id ||
    (!!pageWebsiteHost && pageWebsiteHost === listingWebsiteHost) ||
    (!!pageEmailDomain && pageEmailDomain === listingWebsiteHost) ||
    (!!listingEmailDomain && (listingEmailDomain === pageWebsiteHost || listingEmailDomain === pageEmailDomain)) ||
    (!!pageName && !!listingName && (pageName === listingName || listingName.includes(pageName) || pageName.includes(listingName)))
  );
}

function listingEligibleForBusinessOrgLink(
  listing: BusinessListing,
  approvedBusinessOrgPages: BusinessOrgClaimPageOption[],
  pendingBusinessOrgClaimListingIds: Set<string>,
): boolean {
  const listingType = normalizeBizListingTypeForListing(listing);
  if (listingType !== "business" && listingType !== "organization") return false;
  if (!listing.is_approved) return false;
  if (listing.claimed_business_org_page_id) return false;
  if (pendingBusinessOrgClaimListingIds.has(listing.id)) return false;
  return approvedBusinessOrgPages.length > 0;
}

export default function BusinessesPage() {
  const router = useRouter();
  useRequireFullAccess("app/businesses/page.tsx");
  usePageTracking(PAGE_TRACKING.businesses);
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
  const [bizImageLookupStatus, setBizImageLookupStatus] = useState<"idle" | "loading" | "not-found">("idle");
  const [submittingBiz, setSubmittingBiz] = useState(false);
  const [bizSubmitSuccess, setBizSubmitSuccess] = useState(false);
  const [bizTags, setBizTags] = useState<string[]>([]);
  const [bizImageFile, setBizImageFile] = useState<File | null>(null);
  const [bizImagePreview, setBizImagePreview] = useState<string | null>(null);
  const [bizPersistedImageUrl, setBizPersistedImageUrl] = useState<string | null>(null);
  const bizImageInputRef = useRef<HTMLInputElement | null>(null);
  const bizOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bizMetadataRequestRef = useRef(0);

  const [listingCommentsById, setListingCommentsById] = useState<Record<string, ListingComment[]>>({});
  const [listingCommentInputs, setListingCommentInputs] = useState<Record<string, string>>({});
  const [listingCommentRatings, setListingCommentRatings] = useState<Record<string, number | null>>({});
  const [submittingListingCommentFor, setSubmittingListingCommentFor] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<BusinessListing | null>(null);
  const [pendingClaimListingIds, setPendingClaimListingIds] = useState<Set<string>>(() => new Set());
  const [businessOrgPages, setBusinessOrgPages] = useState<BusinessOrgClaimPageOption[]>([]);
  const [pendingBusinessOrgClaimListingIds, setPendingBusinessOrgClaimListingIds] = useState<Set<string>>(() => new Set());
  const [dismissedLinkSuggestionListingIds, setDismissedLinkSuggestionListingIds] = useState<Set<string>>(() => new Set());
  const [dismissLinkSuggestionFor, setDismissLinkSuggestionFor] = useState<string | null>(null);
  const [claimAsBusinessPageId, setClaimAsBusinessPageId] = useState("");
  const [claimSubmittingFor, setClaimSubmittingFor] = useState<string | null>(null);
  const [claimConfirmListing, setClaimConfirmListing] = useState<BusinessListing | null>(null);
  const [linkConfirmListing, setLinkConfirmListing] = useState<BusinessListing | null>(null);
  const [linkAsBusinessPageId, setLinkAsBusinessPageId] = useState("");
  const [linkedProfileByPageId, setLinkedProfileByPageId] = useState<Record<string, string>>({});
  const [bizNotice, setBizNotice] = useState<string | null>(null);
  const [sharingListingId, setSharingListingId] = useState<string | null>(null);
  const [shareComposerListing, setShareComposerListing] = useState<BusinessListing | null>(null);

  const approvedBusinessOrgPages = useMemo(
    () => businessOrgPages.filter((page) => page.verification_status === "approved" && page.is_active),
    [businessOrgPages],
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      const { data } = await getSupabaseSession();
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

  useEffect(() => {
    if (!userId) {
      setPendingClaimListingIds(new Set());
      setPendingBusinessOrgClaimListingIds(new Set());
      setDismissedLinkSuggestionListingIds(new Set());
      setBusinessOrgPages([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [userClaimsRes, pagesRes, dismissalsRes] = await Promise.all([
        supabase
          .from("business_listing_claims")
          .select("listing_id")
          .eq("claimant_user_id", userId)
          .eq("status", "pending"),
        supabase
          .from("business_organization_pages")
          .select("id, owner_user_id, business_auth_user_id, business_name, business_email, website_url, logo_url, verification_status, subscription_status, is_active")
          .or(`owner_user_id.eq.${userId},business_auth_user_id.eq.${userId}`),
        supabase
          .from("business_listing_link_suggestion_dismissals")
          .select("business_listing_id")
          .eq("user_id", userId),
      ]);
      if (cancelled) return;
      if (userClaimsRes.error) {
        console.error("Pending business claims load error:", userClaimsRes.error);
        setPendingClaimListingIds(new Set());
      } else {
        setPendingClaimListingIds(new Set((userClaimsRes.data ?? []).map((r) => (r as { listing_id: string }).listing_id)));
      }
      if (pagesRes.error) {
        console.error("Business org pages load error:", pagesRes.error);
        setBusinessOrgPages([]);
      } else {
        const pageRows = (pagesRes.data ?? []) as BusinessOrgClaimPageOption[];
        setBusinessOrgPages(pageRows);
        setClaimAsBusinessPageId((prev) => prev || pageRows[0]?.id || "");
      }
      if (dismissalsRes.error) {
        console.error("Link suggestion dismissals load error:", dismissalsRes.error);
        setDismissedLinkSuggestionListingIds(new Set());
      } else {
        setDismissedLinkSuggestionListingIds(
          new Set((dismissalsRes.data ?? []).map((r) => (r as { business_listing_id: string }).business_listing_id)),
        );
      }
      const pageIds = ((pagesRes.data ?? []) as BusinessOrgClaimPageOption[]).map((page) => page.id);
      if (pageIds.length > 0) {
        const { data: orgClaims, error: orgClaimsError } = await supabase
          .from("business_org_claim_requests")
          .select("business_listing_id")
          .in("business_org_page_id", pageIds)
          .in("status", ["pending"]);
        if (!cancelled) {
          if (orgClaimsError) {
            console.error("Pending business org claims load error:", orgClaimsError);
            setPendingBusinessOrgClaimListingIds(new Set());
          } else {
            setPendingBusinessOrgClaimListingIds(
              new Set((orgClaims ?? []).map((r) => (r as { business_listing_id: string }).business_listing_id)),
            );
          }
        }
      } else {
        setPendingBusinessOrgClaimListingIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function profileName(p: ProfileRow | undefined, fallbackUserId: string): string {
    if (!p) return "Member";
    const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    return p.display_name?.trim() || composed || (fallbackUserId === userId ? currentUserName : "Member");
  }

  useEffect(() => {
    let mounted = true;
    async function init() {
      let { data, error } = await supabase
        .from("business_listings")
        .select(BUSINESS_LISTING_COLUMNS)
        .eq("is_approved", true)
        .order("business_name", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) {
        const fallback = await supabase
          .from("business_listings")
          .select(BUSINESS_LISTING_COLUMNS_FALLBACK)
          .eq("is_approved", true)
          .order("business_name", { ascending: true, nullsFirst: false })
          .limit(500);
        data = fallback.data?.map((row) => ({ ...row, claimed_business_org_page_id: null })) ?? null;
        error = fallback.error;
      }

      const combined = (data ?? []) as BusinessListing[];

      if (error && combined.length === 0) {
        console.error("Businesses page load error:", error);
        if (mounted) setListings([]);
      } else if (mounted) {
        setListings(combined);
        const profileLinks = await loadBusinessListingProfileLinks(supabase, combined);
        if (mounted) setLinkedProfileByPageId(profileLinks);
      }
      if (mounted) setLoading(false);
    }
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshApprovedBizListings() {
    let { data, error } = await supabase
      .from("business_listings")
      .select(BUSINESS_LISTING_COLUMNS)
      .eq("is_approved", true)
      .order("business_name", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) {
      const fallback = await supabase
        .from("business_listings")
        .select(BUSINESS_LISTING_COLUMNS_FALLBACK)
        .eq("is_approved", true)
        .order("business_name", { ascending: true, nullsFirst: false })
        .limit(500);
      data = fallback.data?.map((row) => ({ ...row, claimed_business_org_page_id: null })) ?? null;
      error = fallback.error;
    }

    const combined = (data ?? []) as BusinessListing[];

    if (error && combined.length === 0) {
      console.error("Businesses list refresh error:", error);
      return;
    }

    setListings(combined);
    setSelectedListing((prev) => {
      if (!prev) return null;
      return combined.find((r) => r.id === prev.id) ?? null;
    });
    const profileLinks = await loadBusinessListingProfileLinks(supabase, combined);
    setLinkedProfileByPageId(profileLinks);
  }

  function handleBizUrlChange(value: string) {
    setBizUrl(value);
    setBizOgPreview(null);
    setBizImageLookupStatus("idle");
    const requestId = bizMetadataRequestRef.current + 1;
    bizMetadataRequestRef.current = requestId;
    const url = value.trim() ? normalizeUrl(value.trim()) : null;
    if (!url) return;
    if (bizOgDebounceRef.current) clearTimeout(bizOgDebounceRef.current);
    bizOgDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingBizOg(true);
        setBizImageLookupStatus("loading");
        const res = await fetch("/api/fetch-url-metadata", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });
        if (bizMetadataRequestRef.current !== requestId) return;
        if (res.ok) {
          const data = await res.json();
          const image = data.image ?? data.favicon ?? null;
          setBizOgPreview({
            url,
            title: data.title ?? null,
            description: data.description ?? null,
            image,
            siteName: data.siteName ?? null,
            favicon: data.favicon ?? null,
          });
          setBizImageLookupStatus(image ? "idle" : "not-found");
          if (!bizName && (data.title || data.siteName)) setBizName(data.title || data.siteName || "");
          if (!bizBlurb && data.description) setBizBlurb(data.description);
        } else {
          setBizImageLookupStatus("not-found");
        }
      } catch {
        if (bizMetadataRequestRef.current === requestId) setBizImageLookupStatus("not-found");
      } finally {
        if (bizMetadataRequestRef.current === requestId) setFetchingBizOg(false);
      }
    }, 800);
  }

  function onPickBizPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const pickError = validateImagePick(f);
    if (pickError) {
      alert(pickError);
      return;
    }
    if (bizImagePreview) URL.revokeObjectURL(bizImagePreview);
    setBizImageFile(f);
    setBizImagePreview(URL.createObjectURL(f));
  }

  async function uploadBizImage(file: File): Promise<string> {
    const prepared = await prepareFeedThumbnailUploadFile(file);
    if (!prepared.ok) throw new Error(prepared.error);
    file = prepared.file;
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
      const resolvedImageUrl = manualImageUrl ?? bizOgPreview?.image ?? (editingBizId ? bizPersistedImageUrl : null);

      const contentPayload = {
        website_url: url,
        business_name: bizName.trim(),
        custom_blurb: bizBlurb.trim() || null,
        poc_name: bizPocName.trim() || null,
        phone_number: bizPhoneNumber.trim() || null,
        contact_email: bizContactEmail.trim() || null,
        city_state: bizCityState.trim() || null,
        og_title: bizOgPreview?.title ?? null,
        og_description: bizOgPreview?.description ?? null,
        og_image: resolvedImageUrl,
        og_site_name: bizOgPreview?.siteName ?? null,
        tags: tagList,
      };

      const listingTypeForRow = bizType;
      const ownerScopedUpdate = Boolean(editingBizId && !isAdmin);

      async function runUpdate(payload: Record<string, unknown>) {
        let q = supabase.from("business_listings").update(payload).eq("id", editingBizId!);
        if (ownerScopedUpdate) q = q.eq("managed_by_user_id", userId);
        return q;
      }

      let error: { message: string; code?: string } | null = null;

      if (editingBizId) {
        const adminUpdatePayload = { ...contentPayload, listing_type: listingTypeForRow, is_approved: true as const };
        const ownerUpdatePayload = { ...contentPayload, listing_type: listingTypeForRow };
        const res = await runUpdate(ownerScopedUpdate ? ownerUpdatePayload : adminUpdatePayload);
        error = res.error;
        if (error && isBizListingTagsMissingColumnError(error)) {
          const { tags, ...noTagsContent } = contentPayload;
          void tags;
          const r2 = await runUpdate(
            ownerScopedUpdate
              ? { ...noTagsContent, listing_type: listingTypeForRow }
              : { ...noTagsContent, listing_type: listingTypeForRow, is_approved: true as const },
          );
          error = r2.error;
          if (error && isBizListingTypeMissingColumnError(error)) {
            const r3 = await runUpdate(ownerScopedUpdate ? { ...noTagsContent } : { ...noTagsContent, is_approved: true as const });
            error = r3.error;
          }
        } else if (error && isBizListingTypeMissingColumnError(error)) {
          const r2 = await runUpdate(
            ownerScopedUpdate ? { ...contentPayload } : { ...contentPayload, is_approved: true as const },
          );
          error = r2.error;
          if (error && isBizListingTagsMissingColumnError(error)) {
            const { tags, ...noTagsContent } = contentPayload;
            void tags;
            const r3 = await runUpdate(ownerScopedUpdate ? { ...noTagsContent } : { ...noTagsContent, is_approved: true as const });
            error = r3.error;
          }
        }
      } else {
        const insertPayload = {
          ...contentPayload,
          listing_type: listingTypeForRow,
          is_approved: isAdmin,
          is_featured: false,
        };
        const res = await supabase.from("business_listings").insert([insertPayload]);
        error = res.error;
        if (error && isBizListingTagsMissingColumnError(error)) {
          const { tags, ...noTags } = contentPayload;
          void tags;
          const r2 = await supabase.from("business_listings").insert([{ ...noTags, listing_type: listingTypeForRow, is_approved: isAdmin, is_featured: false }]);
          error = r2.error;
          if (error && isBizListingTypeMissingColumnError(error)) {
            const r3 = await supabase.from("business_listings").insert([{ ...noTags, is_approved: isAdmin, is_featured: false }]);
            error = r3.error;
          }
        } else if (error && isBizListingTypeMissingColumnError(error)) {
          const r2 = await supabase.from("business_listings").insert([{ ...contentPayload, is_approved: isAdmin, is_featured: false }]);
          error = r2.error;
          if (error && isBizListingTagsMissingColumnError(error)) {
            const { tags, ...noTags } = contentPayload;
            void tags;
            const r3 = await supabase.from("business_listings").insert([{ ...noTags, is_approved: isAdmin, is_featured: false }]);
            error = r3.error;
          }
        }
      }

      if (error) {
        alert(error.message);
        return;
      }

      await refreshApprovedBizListings();

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
      setBizImageLookupStatus("idle");
      setBizImageFile(null);
      setBizPersistedImageUrl(null);
      if (bizImagePreview) URL.revokeObjectURL(bizImagePreview);
      setBizImagePreview(null);
      if (bizImageInputRef.current) bizImageInputRef.current.value = "";

      setTimeout(() => {
        setBizSubmitSuccess(false);
        setShowBizForm(false);
        void loadListingEngagement(visibleListingIds);
      }, 3000);
    } finally {
      setSubmittingBiz(false);
    }
  }

  async function submitBizClaim(listing: BusinessListing) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (!listingEligibleForClaim(listing)) return;
    if (pendingClaimListingIds.has(listing.id)) {
      setBizNotice("You already have a pending claim for this listing.");
      window.setTimeout(() => setBizNotice(null), 4500);
      return;
    }
    setClaimSubmittingFor(listing.id);
    try {
      const { error } = await supabase.from("business_listing_claims").insert({
        listing_id: listing.id,
        claimant_user_id: userId,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        const msg = error.message?.toLowerCase() ?? "";
        if (code === "23505" || msg.includes("duplicate")) {
          setBizNotice("You already have a pending claim for this listing.");
        } else {
          setBizNotice(error.message || "Could not submit claim.");
        }
        window.setTimeout(() => setBizNotice(null), 5000);
        return;
      }
      setPendingClaimListingIds((prev) => new Set(prev).add(listing.id));
      setBizNotice("Claim submitted for review. An admin will approve or reject your request.");
      window.setTimeout(() => setBizNotice(null), 5500);
    } finally {
      setClaimSubmittingFor(null);
    }
  }

  async function submitBusinessOrgClaim(listing: BusinessListing, pageId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    const page = businessOrgPages.find((p) => p.id === pageId) ?? null;
    const isSuggestedOwnerLink = !!page && pageSuggestsListingLink(page, listing, userId);
    if (!listingEligibleForClaim(listing) && !isSuggestedOwnerLink) return;
    if (!pageId) {
      setBizNotice("Choose a Business / Organization page for this claim.");
      window.setTimeout(() => setBizNotice(null), 4500);
      return;
    }
    if (pendingBusinessOrgClaimListingIds.has(listing.id)) {
      setBizNotice("A Business / Organization page claim is already pending for this listing.");
      window.setTimeout(() => setBizNotice(null), 4500);
      return;
    }
    setClaimSubmittingFor(listing.id);
    try {
      const { data: { session } } = await getSupabaseSession();
      const res = await fetch("/api/business-org-pages/claims", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ pageId, listingId: listing.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBizNotice(data.error ?? "Could not submit Business / Organization page claim.");
        window.setTimeout(() => setBizNotice(null), 5500);
        return;
      }
      setPendingBusinessOrgClaimListingIds((prev) => new Set(prev).add(listing.id));
      setBizNotice("Link request submitted for admin review.");
      await refreshApprovedBizListings();
      window.setTimeout(() => setBizNotice(null), 5500);
    } finally {
      setClaimSubmittingFor(null);
    }
  }

  async function submitSuggestedBusinessOrgLink(listing: BusinessListing, pageId: string) {
    if (!pageId) return;
    const page = businessOrgPages.find((p) => p.id === pageId);
    if (!page) return;
    if (page.verification_status !== "approved" || !page.is_active) {
      setBizNotice("This match was detected, but the Business / Organization page must be admin-approved before the link request can be submitted.");
      window.setTimeout(() => setBizNotice(null), 6500);
      return;
    }
    await submitBusinessOrgClaim(listing, pageId);
  }

  async function dismissLinkSuggestion(listing: BusinessListing) {
    if (!userId) return;
    setDismissLinkSuggestionFor(listing.id);
    try {
      const { error } = await supabase.from("business_listing_link_suggestion_dismissals").upsert(
        { user_id: userId, business_listing_id: listing.id },
        { onConflict: "user_id,business_listing_id" },
      );
      if (error) {
        setBizNotice(error.message);
        window.setTimeout(() => setBizNotice(null), 5500);
        return;
      }
      setDismissedLinkSuggestionListingIds((prev) => new Set(prev).add(listing.id));
    } finally {
      setDismissLinkSuggestionFor(null);
    }
  }

  async function handleLinkConfirmSubmit() {
    if (!linkConfirmListing) return;
    const pageId = linkAsBusinessPageId || approvedBusinessOrgPages[0]?.id || "";
    if (!pageId) {
      setBizNotice("Choose an approved Business / Organization page to link.");
      window.setTimeout(() => setBizNotice(null), 4500);
      return;
    }
    await submitBusinessOrgClaim(linkConfirmListing, pageId);
    setLinkConfirmListing(null);
  }

  function openLinkConfirm(listing: BusinessListing) {
    setLinkAsBusinessPageId(approvedBusinessOrgPages[0]?.id ?? "");
    setLinkConfirmListing(listing);
  }

  async function handleClaimConfirmSubmit() {
    if (!claimConfirmListing) return;
    const listing = claimConfirmListing;
    if (claimAsBusinessPageId) {
      await submitBusinessOrgClaim(listing, claimAsBusinessPageId);
    } else {
      await submitBizClaim(listing);
    }
    setClaimConfirmListing(null);
  }

  async function deleteManagedBizListing(listing: BusinessListing) {
    if (!userId || listing.managed_by_user_id !== userId) return;
    if (!window.confirm("Remove this listing from the directory? This cannot be undone.")) return;
    const { error } = await supabase.from("business_listings").delete().eq("id", listing.id).eq("managed_by_user_id", userId);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedListing(null);
    await refreshApprovedBizListings();
    setBizNotice("Listing removed.");
    window.setTimeout(() => setBizNotice(null), 4000);
  }

  function beginEditBizListing(listing: BusinessListing) {
    if (!canEditBizListing(listing, userId, isAdmin)) return;
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
    setBizImageFile(null);
    if (bizImagePreview) URL.revokeObjectURL(bizImagePreview);
    setBizImagePreview(null);
    setBizPersistedImageUrl(listing.og_image ?? null);
    setBizOgPreview({
      url: listing.website_url ?? "",
      title: listing.og_title ?? null,
      description: listing.og_description ?? null,
      image: listing.og_image ?? null,
      siteName: listing.og_site_name ?? null,
    });
    setBizImageLookupStatus("idle");
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

    return [...filtered].sort(compareBizListingsAlphabetically);
  }, [listings, filters]);

  const visibleListingIds = useMemo(() => visibleListings.map((r) => r.id), [visibleListings]);

  useEffect(() => {
    if (!selectedListing) return;
    const stillPresent = visibleListings.some((r) => r.id === selectedListing.id);
    if (!stillPresent) setSelectedListing(null);
  }, [selectedListing, visibleListings]);

  useEffect(() => {
    function onEsc(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      if (claimConfirmListing) {
        setClaimConfirmListing(null);
        return;
      }
      if (shareComposerListing) {
        setShareComposerListing(null);
        return;
      }
      setSelectedListing(null);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [claimConfirmListing, shareComposerListing]);

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

  function openShareComposer(listing: BusinessListing) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    setShareComposerListing(listing);
  }

  async function handleShareListing(listing: BusinessListing, content: string, postAsMode?: PostAsMode) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (sharingListingId === listing.id) return;
    setSharingListingId(listing.id);
    setBizNotice(null);
    try {
      const result = await shareListingToFeed(supabase, listing.id, content, postAsMode);
      if (!result.ok) {
        setBizNotice(result.error ?? "Could not share to the feed.");
        return;
      }
      const type = normalizeBizListingTypeForListing(listing);
      setBizNotice(`${type === "organization" ? "Organization" : "Business"} shared to the feed.`);
      setShareComposerListing(null);
    } catch {
      setBizNotice("Could not share to the feed.");
    } finally {
      setSharingListingId(null);
      window.setTimeout(() => setBizNotice(null), 4500);
    }
  }

  const suggestedBizImage = bizOgPreview?.image ?? (editingBizId ? bizPersistedImageUrl : null);
  const displayedBizFormImage = bizImagePreview ?? suggestedBizImage;
  const hasManualBizImage = Boolean(bizImagePreview);

  return (
    <section
      style={{
        width: "100%",
        boxSizing: "border-box",
        color: t.text,
      }}
    >
      <ShareListingToFeedModal
        key={shareComposerListing?.id ?? "closed"}
        listing={shareComposerListing}
        label={shareComposerListing ? (normalizeBizListingTypeForListing(shareComposerListing) === "organization" ? "Organization" : "Business") : "Listing"}
        submitting={Boolean(shareComposerListing && sharingListingId === shareComposerListing.id)}
        onClose={() => {
          if (!sharingListingId) setShareComposerListing(null);
        }}
        onSubmit={(content, postAsMode) => {
          if (shareComposerListing) void handleShareListing(shareComposerListing, content, postAsMode);
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

      {bizNotice ? (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: "11px 14px",
            borderRadius: 10,
            background: "#ecfdf5",
            color: "#065f46",
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.45,
            border: "1px solid #6ee7b7",
          }}
        >
          {bizNotice}
        </div>
      ) : null}

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
                {displayedBizFormImage ? (
                  <div style={{ width: 320, maxWidth: "100%", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, marginBottom: 8, position: "relative", background: "#111827" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={httpsAssetUrl(displayedBizFormImage)}
                      alt="Selected listing preview"
                      style={{ width: "100%", aspectRatio: "2 / 1", objectFit: "contain", display: "block" }}
                    />
                    {hasManualBizImage ? (
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
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => bizImageInputRef.current?.click()}
                  style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {displayedBizFormImage ? "Replace image" : "Add photo"}
                </button>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                  {hasManualBizImage
                    ? "Uploaded photo selected. It will keep its original shape and display inside the wide listing frame."
                    : suggestedBizImage
                      ? "Saved listing image. Use the photo picker to replace it."
                      : bizImageLookupStatus === "loading"
                        ? "Looking for website image..."
                        : bizImageLookupStatus === "not-found"
                          ? "No saved image found. Use the photo picker to add one."
                          : "Optional. Choose a logo or photo. It will display inside the listing frame without cropping."}
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
            const suggestedLinkPage =
              !listing.claimed_business_org_page_id &&
              !pendingBusinessOrgClaimListingIds.has(listing.id) &&
              !dismissedLinkSuggestionListingIds.has(listing.id)
                ? businessOrgPages.find((page) => pageSuggestsListingLink(page, listing, userId)) ?? null
                : null;
            const suggestedLinkBlocked =
              !!suggestedLinkPage && (suggestedLinkPage.verification_status !== "approved" || !suggestedLinkPage.is_active);
            const linkTarget = resolveBusinessListingLinkTarget(listing, linkedProfileByPageId);
            const canRequestLink = listingEligibleForBusinessOrgLink(
              listing,
              approvedBusinessOrgPages,
              pendingBusinessOrgClaimListingIds,
            );

            return (
              <article
                key={listing.id}
                onClick={() => {
                  if (!linkTarget.external) {
                    router.push(linkTarget.href);
                    return;
                  }
                  setSelectedListing(listing);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!linkTarget.external) {
                      router.push(linkTarget.href);
                      return;
                    }
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
                    <div style={{ width: "100%", aspectRatio: "2 / 1", background: "#111827", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={httpsAssetUrl(listing.og_image)}
                        alt={displayTitle}
                        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                      />
                    </div>
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
                {suggestedLinkPage ? (
                  <div
                    style={{
                      margin: "0 14px 10px",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${suggestedLinkBlocked ? "#f59e0b" : "#93c5fd"}`,
                      background: suggestedLinkBlocked ? "rgba(245,158,11,0.12)" : "rgba(37,99,235,0.10)",
                      display: "grid",
                      gap: 7,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, color: suggestedLinkBlocked ? "#b45309" : "#2563eb" }}>
                      Suggested match: {suggestedLinkPage.business_name}
                    </div>
                    <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.4 }}>
                      This listing appears connected to your Business / Organization page. Confirming submits an admin-reviewed link request.
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <button
                        type="button"
                        disabled={claimSubmittingFor === listing.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void submitSuggestedBusinessOrgLink(listing, suggestedLinkPage.id);
                        }}
                        style={{
                          border: "none",
                          background: suggestedLinkBlocked ? "#b45309" : "#2563eb",
                          color: "white",
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 850,
                          cursor: claimSubmittingFor === listing.id ? "wait" : "pointer",
                          opacity: claimSubmittingFor === listing.id ? 0.7 : 1,
                        }}
                      >
                        {suggestedLinkBlocked ? "Page approval required" : claimSubmittingFor === listing.id ? "Submitting..." : "Link Business Page"}
                      </button>
                      <button
                        type="button"
                        disabled={dismissLinkSuggestionFor === listing.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void dismissLinkSuggestion(listing);
                        }}
                        style={{
                          border: `1px solid ${t.border}`,
                          background: t.surface,
                          color: t.textMuted,
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 750,
                          cursor: dismissLinkSuggestionFor === listing.id ? "wait" : "pointer",
                          opacity: dismissLinkSuggestionFor === listing.id ? 0.7 : 1,
                        }}
                      >
                        {dismissLinkSuggestionFor === listing.id ? "Dismissing..." : "Not my listing"}
                      </button>
                    </div>
                  </div>
                ) : null}
                {listing.claimed_business_org_page_id ? (
                  <div style={{ margin: "0 14px 10px", fontSize: 12, fontWeight: 800, color: "#15803d" }}>
                    Linked to EOD HUB business profile
                  </div>
                ) : null}
                <div style={{ padding: "0 14px 12px", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "inline-flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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
                    <button
                      type="button"
                      disabled={sharingListingId === listing.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openShareComposer(listing);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#2563eb",
                        cursor: sharingListingId === listing.id ? "wait" : "pointer",
                        opacity: sharingListingId === listing.id ? 0.65 : 1,
                      }}
                    >
                      {sharingListingId === listing.id ? "Sharing..." : "Share"}
                    </button>
                    {canRequestLink ? (
                      pendingBusinessOrgClaimListingIds.has(listing.id) ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Link pending</span>
                      ) : (
                        <button
                          type="button"
                          disabled={claimSubmittingFor === listing.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openLinkConfirm(listing);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#2563eb",
                            cursor: claimSubmittingFor === listing.id ? "wait" : "pointer",
                            opacity: claimSubmittingFor === listing.id ? 0.65 : 1,
                          }}
                        >
                          {claimSubmittingFor === listing.id ? "Linking…" : "Link"}
                        </button>
                      )
                    ) : null}
                    {userId && listingEligibleForClaim(listing) ? (
                      pendingClaimListingIds.has(listing.id) || pendingBusinessOrgClaimListingIds.has(listing.id) ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.textMuted }}>Claim pending</span>
                      ) : (
                        <button
                          type="button"
                          disabled={claimSubmittingFor === listing.id}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setClaimConfirmListing(listing);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#2563eb",
                            cursor: claimSubmittingFor === listing.id ? "wait" : "pointer",
                            opacity: claimSubmittingFor === listing.id ? 0.65 : 1,
                          }}
                        >
                          {claimSubmittingFor === listing.id ? "Claim…" : "Claim"}
                        </button>
                      )
                    ) : null}
                    {userManagesListing(listing, userId) ? (
                      <>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#15803d" }}>You manage this</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            beginEditBizListing(listing);
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            fontSize: 13,
                            fontWeight: 700,
                            color: "#2563eb",
                            cursor: "pointer",
                          }}
                        >
                          Edit listing
                        </button>
                      </>
                    ) : null}
                  </div>
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

      {linkConfirmListing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-confirm-title"
          onClick={() => {
            if (claimSubmittingFor === linkConfirmListing.id) return;
            setLinkConfirmListing(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1300,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 14,
              padding: 20,
              boxSizing: "border-box",
            }}
          >
            <div id="link-confirm-title" style={{ fontSize: 18, fontWeight: 900, color: t.text, lineHeight: 1.3, marginBottom: 10 }}>
              Link directory listing
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 15, color: t.text, lineHeight: 1.55 }}>
              Link this directory card to your Business / Organization profile inside EOD HUB.
            </p>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 18, lineHeight: 1.45 }}>
              <strong style={{ color: t.text }}>Listing:</strong>{" "}
              {linkConfirmListing.og_title || linkConfirmListing.business_name || linkConfirmListing.og_site_name || "This listing"}
            </div>
            {approvedBusinessOrgPages.length > 1 ? (
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 18 }}>
                Link to
                <select
                  value={linkAsBusinessPageId}
                  onChange={(e) => setLinkAsBusinessPageId(e.target.value)}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: "9px 10px",
                    background: t.input,
                    color: t.text,
                  }}
                >
                  {approvedBusinessOrgPages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.business_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 18 }}>
                <strong style={{ color: t.text }}>Profile:</strong> {approvedBusinessOrgPages[0]?.business_name}
              </div>
            )}
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 18, lineHeight: 1.45 }}>
              An admin must approve the link. After approval, visitors stay in EOD HUB and open your business profile instead of leaving for an external website.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={claimSubmittingFor === linkConfirmListing.id}
                onClick={() => setLinkConfirmListing(null)}
                style={{
                  background: t.surface,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: claimSubmittingFor === linkConfirmListing.id ? "not-allowed" : "pointer",
                  opacity: claimSubmittingFor === linkConfirmListing.id ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={claimSubmittingFor === linkConfirmListing.id}
                onClick={() => void handleLinkConfirmSubmit()}
                style={{
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: claimSubmittingFor === linkConfirmListing.id ? "wait" : "pointer",
                  opacity: claimSubmittingFor === linkConfirmListing.id ? 0.85 : 1,
                }}
              >
                {claimSubmittingFor === linkConfirmListing.id ? "Submitting…" : "Submit link request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {claimConfirmListing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="claim-confirm-title"
          onClick={() => {
            if (claimSubmittingFor === claimConfirmListing.id) return;
            setClaimConfirmListing(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1300,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 14,
              padding: 20,
              boxSizing: "border-box",
            }}
          >
            <div id="claim-confirm-title" style={{ fontSize: 18, fontWeight: 900, color: t.text, lineHeight: 1.3, marginBottom: 10 }}>
              Confirm ownership claim
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 15, color: t.text, lineHeight: 1.55 }}>
              You are submitting that you are the owner of this business or organization.
            </p>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 18, lineHeight: 1.45 }}>
              <strong style={{ color: t.text }}>Listing:</strong>{" "}
              {claimConfirmListing.og_title || claimConfirmListing.business_name || claimConfirmListing.og_site_name || "This listing"}
            </div>
            {businessOrgPages.length > 0 && (
              <label style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 18 }}>
                Claim as
                <select
                  value={claimAsBusinessPageId}
                  onChange={(e) => setClaimAsBusinessPageId(e.target.value)}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: "9px 10px",
                    background: t.input,
                    color: t.text,
                  }}
                >
                  <option value="">My personal account ({currentUserName})</option>
                  {businessOrgPages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.business_name} ({page.subscription_status})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted }}>
                  Individual user claims stay available. Business / Organization page claims require admin review and an active page subscription.
                </span>
              </label>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={claimSubmittingFor === claimConfirmListing.id}
                onClick={() => setClaimConfirmListing(null)}
                style={{
                  background: t.surface,
                  color: t.text,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: claimSubmittingFor === claimConfirmListing.id ? "not-allowed" : "pointer",
                  opacity: claimSubmittingFor === claimConfirmListing.id ? 0.6 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={claimSubmittingFor === claimConfirmListing.id}
                onClick={() => void handleClaimConfirmSubmit()}
                style={{
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: claimSubmittingFor === claimConfirmListing.id ? "wait" : "pointer",
                  opacity: claimSubmittingFor === claimConfirmListing.id ? 0.85 : 1,
                }}
              >
                {claimSubmittingFor === claimConfirmListing.id ? "Submitting…" : "Confirm"}
              </button>
            </div>
          </div>
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
                {userManagesListing(selectedListing, userId) ? (
                  <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#15803d" }}>You manage this listing</span>
                    <button
                      type="button"
                      onClick={() => beginEditBizListing(selectedListing)}
                      style={{
                        background: "#2563eb",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        padding: "6px 11px",
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Edit listing
                    </button>
                  </div>
                ) : canEditBizListing(selectedListing, userId, isAdmin) ? (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => beginEditBizListing(selectedListing)}
                      style={{
                        background: "#374151",
                        color: "white",
                        border: "none",
                        borderRadius: 8,
                        padding: "6px 11px",
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Edit listing
                    </button>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={() => setSelectedListing(null)} style={{ background: "none", border: "none", color: t.text, fontSize: 24, fontWeight: 800, cursor: "pointer", lineHeight: 1 }}>
                x
              </button>
            </div>
            {selectedListing.og_image ? (
              <div style={{ width: "100%", aspectRatio: "2 / 1", maxHeight: 320, background: "#111827", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={httpsAssetUrl(selectedListing.og_image)}
                  alt={selectedListing.business_name || "Listing"}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              </div>
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
                <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {(() => {
                    const destination = resolveBusinessListingLinkTarget(selectedListing, linkedProfileByPageId);
                    if (destination.external) {
                      return (
                        <a
                          href={destination.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ background: "#2563eb", color: "white", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
                        >
                          {destination.label}
                        </a>
                      );
                    }
                    return (
                      <button
                        type="button"
                        onClick={() => router.push(destination.href)}
                        style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                      >
                        {destination.label}
                      </button>
                    );
                  })()}
                  <button
                    type="button"
                    disabled={sharingListingId === selectedListing.id}
                    onClick={() => openShareComposer(selectedListing)}
                    style={{
                      background: "#ecfdf5",
                      color: "#047857",
                      border: "1px solid #a7f3d0",
                      borderRadius: 8,
                      padding: "7px 12px",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: sharingListingId === selectedListing.id ? "wait" : "pointer",
                      opacity: sharingListingId === selectedListing.id ? 0.65 : 1,
                    }}
                  >
                    {sharingListingId === selectedListing.id ? "Sharing..." : "Share to feed"}
                  </button>
                  {userId && listingEligibleForClaim(selectedListing) ? (
                    pendingClaimListingIds.has(selectedListing.id) || pendingBusinessOrgClaimListingIds.has(selectedListing.id) ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.textMuted }}>Claim pending review</span>
                    ) : (
                      <button
                        type="button"
                        disabled={claimSubmittingFor === selectedListing.id}
                        onClick={() => setClaimConfirmListing(selectedListing)}
                        style={{
                          background: "#eef2ff",
                          color: "#3730a3",
                          border: "1px solid #c7d2fe",
                          borderRadius: 8,
                          padding: "7px 12px",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: claimSubmittingFor === selectedListing.id ? "wait" : "pointer",
                          opacity: claimSubmittingFor === selectedListing.id ? 0.65 : 1,
                        }}
                      >
                        {claimSubmittingFor === selectedListing.id ? "Submitting…" : "Claim listing"}
                      </button>
                    )
                  ) : null}
                  {userManagesListing(selectedListing, userId) ? (
                    <button
                      type="button"
                      onClick={() => void deleteManagedBizListing(selectedListing)}
                      style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      Delete listing
                    </button>
                  ) : null}
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
