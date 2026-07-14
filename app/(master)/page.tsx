"use client";

import Link from "next/link";
import Image from "next/image";
import React, { ChangeEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { getAccessToken, getSupabaseSession, supabase } from "../lib/lib/supabaseClient";
import { useAuth } from "../lib/auth/AuthProvider";
import { clearNativeOAuthCompleting } from "../lib/auth/sessionState";
import { useTheme } from "../lib/ThemeContext";
import MentionTextarea, { extractMentionIds } from "../components/MentionTextarea";
import { PostLikersStack, type PostLikerBrief } from "../components/PostLikersStack";
import { getSidebarNudgePeer, sidebarNudgeDismissStorageKey } from "../lib/commentSidebarEligibility";
import { prepareFeedUploadFile } from "../lib/prepareUploadFile";
import { uploadResumableFeedFile } from "../lib/resumableFeedUpload";
import { handlePasteImageFromClipboard } from "../lib/pasteImageFromClipboard";
import { FEED_VIDEO_PDF_ACCEPT, openFeedMediaPicker } from "../lib/native/pickFeedMedia";
import { shareOrCopyUrl } from "../lib/native/nativeShare";
import {
  CAD_PREVIEW_IMAGE_ACCEPT,
  FEED_ATTACHMENT_ACCEPT,
  UPLOAD_LIMITS,
  attachmentRenderKindFromFile,
  feedUploadLimitsForAccount,
  formatUploadBytes,
  isVideoFile,
  validateFeedAttachmentPick,
  validateImagePick,
} from "../lib/uploadLimits";
import {
  attachmentsFromUrls,
  buildCadStorageFileName,
  createCadAttachmentToken,
  isPreviewImageForCad,
} from "../lib/postAttachments";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../lib/flagCategories";
import type { JobModalData } from "../components/jobs/JobDetailsModal";
import JobCardActions from "../components/jobs/JobCardActions";
import JobFeedCard from "../components/jobs/JobFeedCard";
import EventFeedActions from "../components/EventFeedActions";
import { ExternalSiteLink } from "../components/ExternalSiteEmbedModal";
import EventAttendeeAvatarRows from "../components/events/EventAttendeeAvatarRows";
import ExpandableText from "../components/ExpandableText";
import { fetchEventAttendeePreviews } from "../lib/fetchEventAttendeePreviews";
import { FeedMediaAttachment } from "../components/FeedMediaAttachment";
import FeedPostHeader from "../components/FeedPostHeader";
import HideBlockUserButton from "../components/HideBlockUserButton";
import OptimizedAvatarImg from "../components/OptimizedAvatarImg";
import { useFeedImageGallery } from "../hooks/useFeedImageGallery";
import YouTubeEmbed, { firstYouTubeUrlFromText, getYouTubeVideoId, sameYouTubeVideo } from "../components/YouTubeEmbed";
import DesktopLayout from "../components/DesktopLayout";
import { useMasterShell } from "../components/master/masterShellContext";
import { usePageTracking } from "../hooks/usePageTracking";
import { PAGE_TRACKING } from "../lib/pageTrackingPaths";
import { sectionTitleLinkZoom } from "../components/master/masterShared";
import { BizListingTagChips } from "../components/biz/BizListingTagChips";
import { roundToNearestHalf, StarRatingDisplay } from "../components/StarRating";
import { coerceTagsFromDb, normalizeBizTagsInput, rememberCustomBizTag } from "../lib/bizListingTags";
import { Award, Medal } from "lucide-react";
import { getFeatureAccess } from "../lib/featureAccess";
import { extractFirstUrl, isEmailDomainMatch, URL_PATTERN_G } from "../lib/urlPreview";
import { applyJobFilters, uniqueJobRegionOptions, type JobFilterState } from "../lib/jobFilters";
import { jobListingCutoffIso } from "../lib/jobRetention";
import { cancelDelayedLikeNotify, scheduleDelayedLikeNotify } from "../lib/likeNotifyDelay";
import { postNotifyJson } from "../lib/postNotifyClient";
import {
  fetchSavedJobs,
  savedJobIdsFromRows,
  savedJobRowFromJob,
  SAVED_JOBS_STALE_MS,
  toggleSavedJob,
} from "../lib/queries/savedJobs";
import {
  BIZ_LIKES_STALE_MS,
  fetchBizLikes,
  likedBizIdsFromRows,
  toggleBizLike,
} from "../lib/queries/bizLikes";
import {
  DISCOVER_PROFILES_STALE_MS,
  fetchDiscoverProfiles,
  runDiscoverKnowAction,
} from "../lib/queries/discoverProfiles";
import { queryKeys } from "../lib/queryKeys";
import { fetchBlockedUserIds, filterBlockedRows } from "../lib/userBlocks";
import { hasPublicMemberProfile } from "../lib/pureAdminAllowlist";
import PostAsSelector from "../components/PostAsSelector";
import {
  adminPostDisplayName,
  canUsePostAsSelector,
  loadStoredPostAsMode,
  resolvePostAsModeFromPost,
  resolvePostAsUserIdForSubmit,
  storePostAsMode,
  type PostAsAdminProfile,
  type PostAsMode,
} from "../lib/postAsIdentity";
import type {
  FeedKangarooBundle,
  KangarooCourtOptionRow,
  KangarooCourtRow,
  KangarooCourtVerdictRow,
  KangarooCourtVoteTotalRow,
  KcDurationHours,
} from "../lib/kangarooCourt";
import {
  judgeAvatarSrc,
  KC_CONFIRM_SUBTITLE,
  KC_CONFIRM_TITLE,
  KC_DURATION_HOURS,
  voteCountsByCourtFromTotals,
} from "../lib/kangarooCourt";
import {
  FEED_ACTION_ROW_GAP,
  FEED_ACTION_ROW_PADDING,
  FEED_MEDIA_FRAME_BG,
  FEED_MEDIA_GRID_GAP,
  FEED_MEDIA_RADIUS,
  FEED_POST_AVATAR_SIZE,
  FEED_POST_EMBED_MAX_WIDTH,
  FEED_POST_IMAGES_MAX_WIDTH,
  FEED_SECTION_GAP,
  feedContainedImageStyle,
  feedPostCardStyle,
  feedSingleMediaFrameStyle,
  feedSingleImageStyle,
} from "../lib/feedLayout";
import {
  compareFeedPosts,
  diversifyFeedPosts,
  KNOWN_AUTHOR_AFFINITY_MULTIPLIER,
  WORKED_WITH_AUTHOR_AFFINITY_MULTIPLIER,
} from "../lib/feedRanking";
import { sanitizeRumintOgDescription } from "../lib/sanitizeRumintOgDescription";
import { ReactionLeaderboard, ReactionPickerTrigger } from "../components/ReactionBar";
import {
  aggregatesBySubjectId,
  applyContentReaction,
  buildReactorDisplayNamesByTypeForSubject,
  emptyAggregate,
  fetchContentReactionsForSubjects,
  type ReactionType,
} from "../lib/reactions";
import { MemorialDisclaimer } from "../components/memorial/MemorialDisclaimer";
import { memorialTheme } from "../components/memorial/memorialModalShared";
import { getServiceRingColor } from "../lib/serviceBranchVisual";
import { ensureWelcomeSidebarOnce } from "../lib/welcomeSidebarClient";
import {
  shouldRedirectToOnboarding,
} from "../lib/onboardingGate";
import {
  hasFullPlatformAccess,
} from "../lib/verificationAccess";
import {
  fetchViewerProfileCached,
  invalidateViewerProfile,
} from "../lib/queries/viewerProfile";
import {
  fetchFeedPostEnrichment,
  type FeedPostEnrichmentBundle,
} from "../lib/queries/feedPostEnrichment";
import {
  dismissPlankHolderModal,
  fetchPlankHolderProgress,
  isPlankHolderChallengeOpen,
  newlyCompletedTasks,
  PLANK_HOLDER_TASK_LABELS,
  plankHolderBannerDismissedKey,
  recordPlankHolderInvite,
  trackPlankHolderEvent,
  type PlankHolderResponse,
  type PlankHolderToastState,
} from "../lib/plankHolderChallengeClient";

const EODWF_DONATION_URL = "https://eod-wf.org/?form=supportEODWF";
const BTMF_DONATION_URL = "https://www.paypal.com/ncp/payment/SMU4NWRW55V6L";

/** Lazy chunks — load on interaction or when feed content needs them (no extra data fetching). */
const EmojiPickerButton = dynamic(() => import("../components/EmojiPickerButton"), { ssr: false });
const GifPickerButton = dynamic(() => import("../components/GifPickerButton"), { ssr: false });
const OnlineNowStrip = dynamic(() => import("../components/OnlineNowStrip"), { ssr: false });
const MemberPaywallModal = dynamic(() => import("../components/MemberPaywallModal"), { ssr: false });
const SidebarThreadDrawer = dynamic(() => import("../components/SidebarThreadDrawer"), { ssr: false });
const UpgradePromptModal = dynamic(() => import("../components/UpgradePromptModal"), { ssr: false });
const JobDetailsModal = dynamic(() => import("../components/jobs/JobDetailsModal"), { ssr: false });
const EventPostCard = dynamic(() => import("../components/EventPostCard"), { ssr: false });
const EventScrapbookFeedCard = dynamic(() => import("../components/events/EventScrapbookFeedCard"), { ssr: false });
const EventScrapbookPreview = dynamic(() => import("../components/events/EventScrapbookPreview"), { ssr: false });
const MemorialScrapbookPreview = dynamic(
  () => import("../components/memorial/scrapbook").then((m) => m.MemorialScrapbookPreview),
  { ssr: false },
);
const EventAttendeesListModal = dynamic(
  () => import("../components/events/EventAttendeesListModal").then((m) => m.EventAttendeesListModal),
  { ssr: false },
);
const FeedImageGalleryModal = dynamic(() => import("../components/FeedImageGalleryModal"), { ssr: false });
const KangarooCourtFeedSection = dynamic(() => import("../components/KangarooCourtFeedSection"), { ssr: false });
const AddToRabbitholeModal = dynamic(() => import("../rabbithole/components/AddToRabbitholeModal"), { ssr: false });
const MurphyRabbitholeBanner = dynamic(
  () => import("../components/MurphyRabbitholeBanner").then((m) => m.MurphyRabbitholeBanner),
  { ssr: false },
);
const KangarooCourtVerdictBanner = dynamic(
  () => import("../components/KangarooCourtVerdictBanner").then((m) => m.KangarooCourtVerdictBanner),
  { ssr: false },
);
const PlankHolderChallengeCard = dynamic(
  () => import("../components/challenges/PlankHolderChallengeCard").then((m) => m.PlankHolderChallengeCard),
  { ssr: false },
);
const PlankHolderFeedBanner = dynamic(
  () => import("../components/challenges/PlankHolderFeedBanner").then((m) => m.PlankHolderFeedBanner),
  { ssr: false },
);
const PlankHolderEarnedModal = dynamic(
  () => import("../components/challenges/PlankHolderEarnedModal").then((m) => m.PlankHolderEarnedModal),
  { ssr: false },
);
const PlankHolderChallengeToast = dynamic(
  () => import("../components/challenges/PlankHolderChallengeToast").then((m) => m.PlankHolderChallengeToast),
  { ssr: false },
);
const BizListingTagsField = dynamic(
  () => import("../components/biz/BizListingTagsField").then((m) => m.BizListingTagsField),
  { ssr: false },
);
const StarRatingInput = dynamic(
  () => import("../components/StarRating").then((m) => m.StarRatingInput),
  { ssr: false },
);

type MemorialCategory = "military" | "leo_fed" | null | undefined;

function memorialDonationConfig(category: MemorialCategory, service?: string | null) {
  const isLeoFed = category === "leo_fed";
  const theme = memorialTheme(category, service);
  return {
    url: isLeoFed ? BTMF_DONATION_URL : EODWF_DONATION_URL,
    color: theme.color,
    title: isLeoFed
      ? "Donate as Tribute to the Bomb Technician Memorial Fund"
      : "Donate as Tribute to the EOD Warrior Foundation",
  };
}

type Job = {
  id: string;
  created_at: string | null;
  title: string | null;
  category: string | null;
  location: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  description: string | null;
  apply_url: string | null;
  company_name: string | null;
  is_approved: boolean | null;
  source_type: string | null;
  applications_under_review?: boolean | null;
  user_id: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  anonymous: boolean | null;
};

type SelectedPostImage = {
  file: File;
  previewUrl: string;
  kind: "image" | "video" | "pdf" | "cad3d" | "other";
  cadToken?: string;
  cadRole?: "file" | "preview";
};

type SelectedCommentImage = {
  file: File;
  previewUrl: string;
};

type RankedPostRow = {
  id: string;
  user_id: string;
  post_as_user_id?: string | null;
  content: string;
  created_at: string;
  score?: number;
  ranking_score?: number;
  feed_rank_age_offset_hours?: number;
};

type LegacyPostImageRow = {
  id: string;
  image_url: string | null;
};

type PostImageRow = {
  id: string;
  post_id: string;
  image_url: string;
  sort_order: number | null;
};

type LegacyPostRow = LegacyPostImageRow & {
  gif_url?: string | null;
  og_url?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_site_name?: string | null;
  event_id?: string | null;
  content_type?: string | null;
  system_generated?: boolean | null;
  news_item_id?: string | null;
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
  tags?: string[] | null;
  poc_name?: string | null;
  phone_number?: string | null;
  contact_email?: string | null;
  city_state?: string | null;
};

type BizListingCommentRow = {
  id: string;
  resource_id: string;
  user_id: string;
  content: string;
  rating: number | null;
  created_at: string;
};

type BizListingCommentProfile = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
};

type BizListingComment = BizListingCommentRow & {
  authorName: string;
  authorPhotoUrl: string | null;
};

const JOB_COLUMNS =
  "id, created_at, title, category, location, pay_min, pay_max, clearance, description, apply_url, company_name, is_approved, source_type, user_id, og_title, og_description, og_image, og_site_name, anonymous";
const BUSINESS_LISTING_COLUMNS =
  "id, created_at, business_name, website_url, custom_blurb, poc_name, phone_number, contact_email, city_state, og_title, og_description, og_image, og_site_name, is_approved, is_featured, like_count, listing_type, tags";
const PERF_DEBUG = process.env.NODE_ENV !== "production";
const INITIAL_FEED_POST_LIMIT = 5;
/** Above-fold feed avatars load eagerly (small transforms; helps first paint). */
const EAGER_FEED_AVATAR_COUNT = 2;
const FEED_AUTO_LOAD_LIMIT = 10;
const FEED_LOAD_MORE_INCREMENT = 10;
/** Ranked rows to prefetch before wall/moderation filters; keep small — only 5 render on first paint. */
const INITIAL_RANKED_POSTS_LIMIT = INITIAL_FEED_POST_LIMIT + 10;
const FULL_FEED_HYDRATION_DELAY_MS = 400;

/** Cached Pass-1 feed data so Pass-2 interaction hydrate avoids re-querying ranked posts / enrichment. */
type InitialFeedBatchCache = {
  initialPosts: RankedPostRow[];
  postAsUserIdByPostId: Map<string, string | null>;
  legacyPostImageMap: Map<string, string | null>;
  postGifMap: Map<string, string | null>;
  postOgMap: Map<
    string,
    {
      og_url: string | null;
      og_title: string | null;
      og_description: string | null;
      og_image: string | null;
      og_site_name: string | null;
    }
  >;
  eventIdByPostId: Map<string, string | null>;
  postMetaMap: Map<
    string,
    {
      content_type: string | null;
      system_generated: boolean | null;
      news_item_id: string | null;
      feed_rank_age_offset_hours: number;
    }
  >;
  verdictAtByPostId: Map<string, string | null>;
  rabbitholeThreadIdByPostId: Map<string, string | null>;
  rabbitholeContributionIdByPostId: Map<string, string | null>;
  multiPostImageMap: Map<string, string[]>;
  reactionRows: { subject_id: string; user_id: string; reaction_type: string }[];
  enrichment: FeedPostEnrichmentBundle | null;
  profileNameMap: Map<string, string>;
  profilePhotoMap: Map<string, string | null>;
  profileServiceMap: Map<string, string | null>;
  profileEmployerMap: Map<string, boolean | null>;
  profilePureAdminMap: Map<string, boolean | null>;
  profilePublicMemberMap: Map<string, boolean>;
};
const FEED_REALTIME_DEBOUNCE_MS = 2000;
const FEED_QUERY_BUFFER = 20;
const HOME_WIDGET_LOAD_DELAY_MS = 1500;
/** Defer vouch/discover/memorial/banners until after the first feed paint to limit CLS. */
const FEED_ABOVE_FOLD_EXTRAS_DELAY_MS = 600;

function perfNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function logPerf(label: string, startedAtMs: number, extra?: Record<string, unknown>) {
  if (!PERF_DEBUG) return;
  const elapsedMs = Math.round(perfNowMs() - startedAtMs);
  if (extra) {
    console.info(`[perf] ${label}`, { elapsedMs, ...extra });
  } else {
    console.info(`[perf] ${label}`, { elapsedMs });
  }
}

type ProfileName = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean | null;
  is_pure_admin: boolean | null;
  email: string | null;
};

type PendingMemberVoucher = {
  user_id: string;
  name: string;
  photo_url: string | null;
};

type PendingMember = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  service: string | null;
  vouch_count: number;
  user_vouched: boolean;
  vouchers: PendingMemberVoucher[];
};

const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

/** How many avatars show per "page" on desktop before clicking the arrows. */
const DISCOVER_PAGE_SIZE = 5;
/** Avatar diameter in the People You May Know strip (was 44px; +25%). */
const DISCOVER_AVATAR_SIZE = 55;
const DISCOVER_CARD_WIDTH = 125;

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url: string | null;
  gif_url: string | null;
  parent_comment_id: string | null;
};

type FeedComment = Comment & {
  authorName: string;
  authorPhotoUrl: string | null;
  authorService: string | null;
  authorIsEmployer: boolean | null;
  likeCount: number;
  myReaction: ReactionType | null;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
  replies: FeedComment[];
  replyCount: number;
};

type MemorialComment = {
  id: string;
  memorial_id: string;
  user_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorPhotoUrl: string | null;
  myReaction: ReactionType | null;
  likeCount: number;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
};

type MemorialEngagementState = {
  myReaction: ReactionType | null;
  totalReactionCount: number;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
};

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type FeedEventSnapshot = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  description: string | null;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  unit_id?: string | null;
  visibility?: string | null;
};

type FeedPost = RankedPostRow & {
  image_url: string | null;
  image_urls: string[];
  gif_url: string | null;
  content_type?: string | null;
  system_generated?: boolean | null;
  news_item_id?: string | null;
  authorUserId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  authorService: string | null;
  authorIsEmployer: boolean | null;
  authorIsPureAdmin: boolean | null;
  authorHasPublicMemberProfile: boolean;
  likeCount: number;
  commentCount: number;
  myReaction: ReactionType | null;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
  likers: PostLikerBrief[];
  comments: FeedComment[];
  og_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  admin_manual_image_url: string | null;
  og_site_name: string | null;
  event_id: string | null;
  feed_event: FeedEventSnapshot | null;
  event_interested_count: number;
  event_going_count: number;
  event_my_attendance: "interested" | "going" | null;
  event_saved: boolean;
  kangaroo?: FeedKangarooBundle | null;
  court_verdict_at?: string | null;
  rabbithole_thread_id?: string | null;
  rabbithole_contribution_id?: string | null;
  isInteractionHydrating?: boolean;
  feed_rank_age_offset_hours?: number;
};

type FeedSelectedEvent = {
  id: string;
  title: string | null;
  description: string | null;
  date: string | null;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
};

type UnitFeedHighlight = {
  id: string;
  unit_id: string;
  unit_name: string;
  unit_slug: string;
  unit_cover_image_url: string | null;
  user_id: string;
  author_name: string;
  author_photo: string | null;
  content: string | null;
  photo_url: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
};

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function formatEventDisplayDate(dateIso: string | null | undefined) {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function extractLegacyEventTitle(content: string | null | undefined): string | null {
  if (!content) return null;
  // Older auto-post formats often looked like:
  // "📅 New Event: Title 🗓️ Wednesday... 🏢 Org"
  // We only want the actual event title segment.
  const line = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /new event:/i.test(l));
  if (!line) return null;

  const afterLabel = line.replace(/^.*?\bnew event:\s*/i, "").trim();
  if (!afterLabel) return null;

  const titleOnly = afterLabel
    // strip trailing date/location chunks often prefixed with emojis
    .replace(/\s+[🗓📅🏢📍].*$/u, "")
    .trim();
  return titleOnly || null;
}

function normalizeEventTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

type BizListingType = "business" | "organization" | "resource";
type BusinessOrgListingType = Exclude<BizListingType, "resource">;
type BizMobileFilter = "all" | BusinessOrgListingType;

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
  // Until the listing_type migration is applied everywhere, force known nonprofit listings to Resource.
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

function isBizListingTypeMissingColumnError(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message?.toLowerCase?.() ?? "";
  return msg.includes("column") && msg.includes("listing_type");
}

function isBizListingTagsMissingColumnError(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message?.toLowerCase?.() ?? "";
  return msg.includes("column") && msg.includes("tags");
}

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function normalizePreviewUrl(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const withScheme = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  try {
    const url = new URL(withScheme);
    url.hash = "";
    return `${url.hostname.replace(/^www\./i, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return withScheme.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase();
  }
}

function isOnlyPreviewUrl(content: string | null | undefined, previewUrl: string | null | undefined): boolean {
  if (!content?.trim() || !previewUrl?.trim()) return false;
  return normalizePreviewUrl(content.trim()) === normalizePreviewUrl(previewUrl);
}

const FEED_COMMENT_TEXT_SIZE = 14;
const FEED_COMMENT_META_SIZE = 13;

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Combined pattern: mention first, then URL
  const combined = new RegExp(`(${MENTION_RE.source})|${URL_PATTERN_G.source}`, "g");
  let lastIndex = 0;
  let match;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[0].startsWith("@[")) {
      // It's a mention: @[Name](userId)
      const name = match[2];
      const uid = match[3];
      parts.push(
        <Link key={`mention-${match.index}`} href={`/profile/${uid}`} style={{ color: "#3b82f6", fontWeight: 600, textDecoration: "none" }}>
          @{name}
        </Link>
      );
    } else if (isEmailDomainMatch(text, match.index)) {
      parts.push(match[0]);
    } else {
      // It's a URL
      const raw = match[0].replace(/[.,)>]+$/, "");
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      parts.push(
        <ExternalSiteLink key={`url-${match.index}`} href={href} style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}>
          {raw}
        </ExternalSiteLink>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/** Stored previews often use http://; force https in the DOM to avoid mixed-content warnings on our HTTPS app. */
function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

function OgCard({ og }: { og: OgPreview }) {
  const { t } = useTheme();
  const candidateImgUrl = og.image ? httpsAssetUrl(og.image) : "";
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imgUrl = candidateImgUrl && failedImageUrl !== candidateImgUrl ? candidateImgUrl : "";
  return (
    <ExternalSiteLink
      href={og.url ? httpsAssetUrl(og.url) : "#"}
      style={{ display: "block", width: "100%", marginTop: FEED_SECTION_GAP, border: `1px solid ${t.borderLight}`, borderRadius: FEED_MEDIA_RADIUS, overflow: "hidden", background: t.bg, textDecoration: "none", color: "inherit", textAlign: "left" }}
    >
      {imgUrl ? (
        <span
          style={{
            width: "100%",
            aspectRatio: "2 / 1",
            background: "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt={og.title || ""}
            onError={() => setFailedImageUrl(imgUrl)}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </span>
      ) : null}
      <span style={{ display: "block", padding: imgUrl ? "10px 14px" : "12px 14px" }}>
        {og.siteName && <span style={{ display: "block", fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{og.siteName}</span>}
        {og.title && <span style={{ display: "block", fontWeight: 800, fontSize: 14, lineHeight: 1.3, color: t.text }}>{og.title}</span>}
        {og.description && <span style={{ fontSize: 13, color: t.textMuted, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{og.description}</span>}
        <span style={{ display: "block", marginTop: 6, fontSize: 12, color: t.textFaint, wordBreak: "break-all" }}>{og.url}</span>
      </span>
    </ExternalSiteLink>
  );
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  const combined = [
    maybeError.message,
    maybeError.details,
    maybeError.hint,
    maybeError.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return combined.includes(columnName.toLowerCase());
}

function memorialDismissStorageKey(userId: string): string {
  return `eodhub.dismissedMemorialIds:${userId}`;
}

/** Local calendar day (YYYY-MM-DD) — dismissals reset after midnight in the user's timezone. */
function localCalendarDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type MemorialDismissStore = { date: string; ids: string[] };

function readDayDismissedMemorialIds(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(memorialDismissStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as MemorialDismissStore;
    if (parsed?.date !== localCalendarDateKey()) return new Set();
    return new Set(
      Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === "string") : [],
    );
  } catch {
    return new Set();
  }
}

function persistDayDismissedMemorialIds(userId: string, ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const payload: MemorialDismissStore = {
      date: localCalendarDateKey(),
      ids: Array.from(ids),
    };
    localStorage.setItem(memorialDismissStorageKey(userId), JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

function Avatar({
  photoUrl,
  name,
  size = 44,
  service,
  isEmployer,
  isPureAdmin,
  imageLoading = "lazy",
  imageFetchPriority = "auto",
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
  service?: string | null;
  isEmployer?: boolean | null;
  isPureAdmin?: boolean | null;
  imageLoading?: "lazy" | "eager";
  imageFetchPriority?: "high" | "low" | "auto";
}) {
  const { t } = useTheme();
  const useLogoTile = Boolean(isEmployer || isPureAdmin);
  const ringColor = useLogoTile ? null : getServiceRingColor(service);
  // Employers + pure-admin logos get a rounded-rect tile so logos aren't squished into a circle.
  const borderRadius = useLogoTile ? Math.max(4, size * 0.18) : "50%";
  const bgColor = useLogoTile ? "#f0f0f0" : t.badgeBg;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius,
        overflow: "hidden",
        background: bgColor,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: t.textMuted,
        fontSize: size * 0.32,
        boxSizing: "border-box",
        border: ringColor ? `${size <= 36 ? 3 : 4}px solid ${ringColor}` : undefined,
      }}
    >
      {photoUrl ? (
        <OptimizedAvatarImg
          photoUrl={photoUrl}
          displayName={name}
          sizePx={size}
          objectFit={isPureAdmin ? "contain" : "cover"}
          loading={imageLoading}
          fetchPriority={imageFetchPriority}
          style={{
            padding: isPureAdmin ? 2 : 0,
            background: isPureAdmin ? "#f0f0f0" : undefined,
          }}
        />
      ) : (
        (name?.trim()?.[0] || "U").toUpperCase()
      )}
    </div>
  );
}

export default function HomePage() {
  usePageTracking(PAGE_TRACKING.feed);
  const { t, isDark } = useTheme();
  const queryClient = useQueryClient();
  const { user: authUser, isLoading: authLoading } = useAuth();
  /** Stable key — OAuth/token refresh must not re-run feed init when the user id is unchanged. */
  const authUserId = authUser?.id ?? null;
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobSubmitters, setJobSubmitters] = useState<Map<string, string>>(new Map());
  const [jobLeaderboard, setJobLeaderboard] = useState<{ user_id: string; name: string; photo_url: string | null; count: number }[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  /** Event IDs currently rendered on the feed (for Realtime RSVP refresh). */
  const feedEventIdsRef = React.useRef<Set<string>>(new Set());
  const [unitFeedHighlights, setUnitFeedHighlights] = useState<UnitFeedHighlight[]>([]);
  const [businessListings, setBusinessListings] = useState<BusinessListing[]>(
    []
  );
  const [content, setContent] = useState("");
  const [selectedPostImages, setSelectedPostImages] = useState<
    SelectedPostImage[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [feedAboveFoldExtrasReady, setFeedAboveFoldExtrasReady] = useState(false);
  const feedAboveFoldExtrasTimerRef = useRef<number | null>(null);
  const [feedPostLimit, setFeedPostLimit] = useState(INITIAL_FEED_POST_LIMIT);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const postsLoadedRef = useRef(false);
  const feedPostLimitRef = useRef(INITIAL_FEED_POST_LIMIT);
  const feedDirtyWhileHiddenRef = useRef(false);
  const feedAutoLoadTriggeredRef = useRef(false);
  const feedHydrationTimerRef = useRef<number | null>(null);
  const unitFeedHighlightsLoadedForRef = useRef<string | null>(null);
  const unitFeedHighlightsLoadingForRef = useRef<string | null>(null);
  // Set to the postId when a deep-link target post is known to be unavailable
  // (deleted, hidden for review, or a wall post not shown in the public feed).
  const [deepLinkPostUnavailable, setDeepLinkPostUnavailable] = useState<string | null>(null);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [jobsLastUpdated, setJobsLastUpdated] = useState<string | null>(null);
  const [jobsTotalApprovedCount, setJobsTotalApprovedCount] = useState<number | null>(null);
  const [jobsNewTodayCount, setJobsNewTodayCount] = useState<number | null>(null);
  const [jobSort, setJobSort] = useState<"recent" | "az" | "za">("recent");
  const [jobFilters, setJobFilters] = useState<JobFilterState>({ keyword: "", locationRegion: "", salaryMin: "" });
  const [canViewFullJobs, setCanViewFullJobs] = useState(true);
  const [canUseJobFilters, setCanUseJobFilters] = useState(true);
  const [showJobsUpgradePrompt, setShowJobsUpgradePrompt] = useState(false);
  const [bizLoaded, setBizLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const savedJobsQuery = useQuery({
    queryKey: userId ? queryKeys.savedJobs(userId) : queryKeys.savedJobs("pending"),
    queryFn: () => fetchSavedJobs(supabase, userId as string),
    enabled: !!userId,
    staleTime: SAVED_JOBS_STALE_MS,
  });
  const savedJobIds = useMemo(
    () => savedJobIdsFromRows(savedJobsQuery.data),
    [savedJobsQuery.data]
  );
  const bizLikesQuery = useQuery({
    queryKey: userId ? queryKeys.bizLikes(userId) : queryKeys.bizLikes("pending"),
    queryFn: () => fetchBizLikes(supabase, userId as string),
    enabled: !!userId,
    staleTime: BIZ_LIKES_STALE_MS,
  });
  const likedBizIds = useMemo(
    () => likedBizIdsFromRows(bizLikesQuery.data),
    [bizLikesQuery.data],
  );
  const discoverProfilesQuery = useQuery({
    queryKey: userId ? queryKeys.discoverProfiles(userId) : queryKeys.discoverProfiles("pending"),
    queryFn: () => fetchDiscoverProfiles(supabase, userId as string),
    enabled: !!userId && feedAboveFoldExtrasReady,
    staleTime: DISCOVER_PROFILES_STALE_MS,
  });
  const discoverProfiles = discoverProfilesQuery.data ?? [];
  const visibleDiscoverProfiles = useMemo(
    () => filterBlockedRows(discoverProfiles, blockedUserIds, (profile) => profile.user_id),
    [blockedUserIds, discoverProfiles],
  );
  const [isMobile, setIsMobile] = useState(false);
  const { isDesktopShell, openSidebarPeer, showMemorialFeedCards, setShowMemorialFeedCards } = useMasterShell();
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserPhotoUrl, setCurrentUserPhotoUrl] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserAccountType, setCurrentUserAccountType] = useState<string | null>(null);
  const currentFeedUploadLimits = feedUploadLimitsForAccount(currentUserAccountType);
  const [postAsMode, setPostAsMode] = useState<PostAsMode>(() => loadStoredPostAsMode());
  const [postAsAdminProfile, setPostAsAdminProfile] = useState<PostAsAdminProfile | null>(null);
  const [currentUserReferralCode, setCurrentUserReferralCode] = useState<string | null>(null);
  const [recruiterNudgeHidden, setRecruiterNudgeHidden] = useState(false);
  const [recruiterCount, setRecruiterCount] = useState(0);
  const [referralCopied, setReferralCopied] = useState(false);
  const [plankHolderChallenge, setPlankHolderChallenge] = useState<PlankHolderResponse | null>(null);
  const plankHolderChallengeRef = useRef<PlankHolderResponse | null>(null);
  const plankHolderInitializedRef = useRef(false);
  const plankHolderViewedRef = useRef(false);
  const plankHolderToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [plankHolderToast, setPlankHolderToast] = useState<PlankHolderToastState>(null);
  const [plankHolderModalOpen, setPlankHolderModalOpen] = useState(false);
  // Hidden state lives in sessionStorage so it resets on each new login/tab session.
  const [plankHolderCardHidden, setPlankHolderCardHidden] = useState<boolean>(false);
  // Earned banner dismiss is permanent (localStorage) — badge remains on profile.
  const [plankHolderBannerDismissed, setPlankHolderBannerDismissed] = useState<boolean>(false);

  // Biz/Org submission form
  const [showBizForm, setShowBizForm] = useState(false);
  const [bizUrl, setBizUrl] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizBlurb, setBizBlurb] = useState("");
  const [bizType, setBizType] = useState<BusinessOrgListingType>("business");
  const [bizMobileFilter, setBizMobileFilter] = useState<BizMobileFilter>("all");
  const [bizOgPreview, setBizOgPreview] = useState<OgPreview | null>(null);
  const [featuredBizBillboardIndex, setFeaturedBizBillboardIndex] = useState(0);
  const [fetchingBizOg, setFetchingBizOg] = useState(false);
  const [submittingBiz, setSubmittingBiz] = useState(false);
  const [bizSubmitSuccess, setBizSubmitSuccess] = useState(false);
  const [bizTags, setBizTags] = useState<string[]>([]);
  const bizOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [submittingPost, setSubmittingPost] = useState(false);
  const [vouchingFor, setVouchingFor] = useState<string | null>(null);
  const [actingOnUser, setActingOnUser] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<
    Record<string, boolean>
  >({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [selectedCommentImages, setSelectedCommentImages] = useState<
    Record<string, SelectedCommentImage | null>
  >({});
  const [submittingCommentFor, setSubmittingCommentFor] = useState<
    string | null
  >(null);

  // Replies (one level deep): keyed by the top-level comment id being replied to.
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyTargetAuthor, setReplyTargetAuthor] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const replyRawsRef = useRef<Record<string, string>>({});
  const [submittingReplyFor, setSubmittingReplyFor] = useState<string | null>(null);

  const [togglingBizLikeFor, setTogglingBizLikeFor] = useState<string | null>(null);

  const [listingCommentsById, setListingCommentsById] = useState<Record<string, BizListingComment[]>>({});
  const [listingCommentInputs, setListingCommentInputs] = useState<Record<string, string>>({});
  const [listingCommentRatings, setListingCommentRatings] = useState<Record<string, number | null>>({});
  const [submittingListingCommentFor, setSubmittingListingCommentFor] = useState<string | null>(null);
  const [mobileBizDetailListing, setMobileBizDetailListing] = useState<BusinessListing | null>(null);

  const [togglingLikeFor, setTogglingLikeFor] = useState<string | null>(null);
  const [togglingCommentLikeFor, setTogglingCommentLikeFor] = useState<
    string | null
  >(null);

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null
  );

  const [togglingJobSaveFor, setTogglingJobSaveFor] = useState<string | null>(null);
  const [jobDetailsModal, setJobDetailsModal] = useState<JobModalData | null>(null);
  const [selectedFeedEvent, setSelectedFeedEvent] = useState<FeedSelectedEvent | null>(null);
  const [selectedFeedEventCounts, setSelectedFeedEventCounts] = useState<{ interested: number; going: number }>({ interested: 0, going: 0 });
  const [selectedFeedEventMyStatus, setSelectedFeedEventMyStatus] = useState<"interested" | "going" | null>(null);
  const [selectedFeedEventBusy, setSelectedFeedEventBusy] = useState(false);
  const [selectedFeedEventAttendeePreviews, setSelectedFeedEventAttendeePreviews] = useState<{
    going: PostLikerBrief[];
    interested: PostLikerBrief[];
  }>({ going: [], interested: [] });
  const [feedEventAttendeesListModal, setFeedEventAttendeesListModal] = useState<"interested" | "going" | null>(null);

  const [todayMemorials, setTodayMemorials] = useState<
    { id: string; name: string; bio: string | null; photo_url: string | null; death_date: string; category?: "military" | "leo_fed" | null; service?: string | null; source_url?: string | null }[]
  >([]);
  const [dismissedMemorialIds, setDismissedMemorialIds] = useState<Set<string>>(new Set());
  const dismissedMemorialIdsRef = useRef<Set<string>>(new Set());
  const [expandedMemorialCards, setExpandedMemorialCards] = useState<Record<string, boolean>>({});
  const [memorialEngagement, setMemorialEngagement] = useState<Record<string, MemorialEngagementState>>({});
  const [memorialComments, setMemorialComments] = useState<Record<string, MemorialComment[]>>({});
  const [memorialCommentInputs, setMemorialCommentInputs] = useState<Record<string, string>>({});
  const [submittingMemorialComment, setSubmittingMemorialComment] = useState<string | null>(null);
  const [memorialCommentsOpen, setMemorialCommentsOpen] = useState<Record<string, boolean>>({});
  const [togglingMemorialReactionFor, setTogglingMemorialReactionFor] = useState<string | null>(null);
  const [togglingMemorialCommentReactionFor, setTogglingMemorialCommentReactionFor] = useState<string | null>(null);
  const [editingMemorialCommentId, setEditingMemorialCommentId] = useState<string | null>(null);
  const [editingMemorialCommentContent, setEditingMemorialCommentContent] = useState("");
  const [savingMemorialCommentId, setSavingMemorialCommentId] = useState<string | null>(null);
  const [deletingMemorialCommentId, setDeletingMemorialCommentId] = useState<string | null>(null);
  const [donateModal, setDonateModal] = useState<ReturnType<typeof memorialDonationConfig> | null>(null);
  const [discoverPageIndex, setDiscoverPageIndex] = useState(0);
  // Ephemeral confirmation shown after a successful Know request from the
  // People You May Know carousel. Holds the requested member's display name
  // so we can phrase the toast ("Know request sent to Jane Doe").
  const [discoverKnowToast, setDiscoverKnowToast] = useState<string | null>(null);
  const discoverKnowToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [openVouchPopoverFor, setOpenVouchPopoverFor] = useState<string | null>(null);
  const [hiddenPendingMemberIds, setHiddenPendingMemberIds] = useState<Set<string>>(() => new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const memberInteractionAllowedRef = useRef(true);
  const activeProfileLoadSeqRef = useRef(0);
  const [memberPaywallOpen, setMemberPaywallOpen] = useState(false);
  const [showNavHelper, setShowNavHelper] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [editingPostAsMode, setEditingPostAsMode] = useState<PostAsMode>("self");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagModal, setFlagModal] = useState<{ contentType: "post" | "comment"; contentId: string } | null>(null);

  // TODO: set to false before launch — bypasses engagement threshold so button shows on every post for testing
  const RABBITHOLE_THRESHOLD_BYPASS = true;
  const [rabbitholeModalPost, setRabbitholeModalPost] = useState<{ id: string; content: string; og_title: string | null } | null>(null);
  const [flagCategoryChoice, setFlagCategoryChoice] = useState<FlagCategory>("general");

  const {
    galleryImages,
    galleryIndex,
    isGalleryOpen,
    openGallery,
    closeGallery,
    showPrevGalleryImage,
    showNextGalleryImage,
  } = useFeedImageGallery();

  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);

  const [selectedPostGif, setSelectedPostGif] = useState<string | null>(null);
  const [kcComposerPhase, setKcComposerPhase] = useState<null | "confirm" | "builder">(null);
  const [kcOpt1, setKcOpt1] = useState("");
  const [kcOpt2, setKcOpt2] = useState("");
  const [kcOpt3, setKcOpt3] = useState("");
  const [kcOpt4, setKcOpt4] = useState("");
  const [kcComposerDuration, setKcComposerDuration] = useState<KcDurationHours>(24);
  const [selectedCommentGifs, setSelectedCommentGifs] = useState<Record<string, string | null>>({});

  /** Clears KC composer UI (confirm/builder, options, duration). Called on cancel, judge toggle-off, and successful post. Failed posts leave state so the user can retry. */
  function resetKcComposer() {
    setKcComposerPhase(null);
    setKcOpt1("");
    setKcOpt2("");
    setKcOpt3("");
    setKcOpt4("");
    setKcComposerDuration(24);
  }

  const postImageInputRef = useRef<HTMLInputElement | null>(null);
  const postVideoPdfInputRef = useRef<HTMLInputElement | null>(null);
  const postCadPreviewInputRef = useRef<HTMLInputElement | null>(null);
  const postTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const contentRawRef = useRef("");
  const commentRawsRef = useRef<Record<string, string>>({});
  const memorialCommentRawsRef = useRef<Record<string, string>>({});
  const commentImageInputRefs = useRef<Record<string, HTMLInputElement | null>>(
    {}
  );

  const [sidebarDrawer, setSidebarDrawer] = useState<{ open: boolean; peerId: string | null }>({
    open: false,
    peerId: null,
  });
  const [sidebarNudgeBump, setSidebarNudgeBump] = useState(0);

  function isCommentSidebarNudgeDismissed(postId: string, peerId: string) {
    void sidebarNudgeBump;
    if (!userId || typeof window === "undefined") return true;
    return localStorage.getItem(sidebarNudgeDismissStorageKey(postId, userId, peerId)) === "1";
  }
  const ogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPostImagesRef = useRef<SelectedPostImage[]>([]);
  const selectedCommentImagesRef = useRef<
    Record<string, SelectedCommentImage | null>
  >({});
  const postsRef = useRef<FeedPost[]>([]);

  const applyPlankHolderResponse = useCallback((next: PlankHolderResponse | null) => {
    if (!next) return;
    const previous = plankHolderChallengeRef.current;
    const completed = newlyCompletedTasks(previous?.progress, next.progress);

    plankHolderChallengeRef.current = next;
    setPlankHolderChallenge(next);

    if (plankHolderInitializedRef.current && completed.length > 0 && isPlankHolderChallengeOpen(next)) {
      const task = completed[0];
      setPlankHolderToast({
        title: "⚓ Challenge Updated",
        detail: `${PLANK_HOLDER_TASK_LABELS[task]} Complete`,
        progress: `${next.progress.completedCount} / ${next.progress.total} Complete`,
      });
      trackPlankHolderEvent("challenge_task_completed", {
        task,
        completedCount: next.progress.completedCount,
        claimedCount: next.claimedCount,
        remainingSpots: next.remainingSpots,
      });
      if (plankHolderToastTimerRef.current) clearTimeout(plankHolderToastTimerRef.current);
      plankHolderToastTimerRef.current = setTimeout(() => setPlankHolderToast(null), 3200);
    }

    if (next.awarded && !next.seenModal) {
      setPlankHolderModalOpen(true);
      trackPlankHolderEvent("challenge_awarded", {
        completedCount: next.progress.completedCount,
        claimedCount: next.claimedCount,
        remainingSpots: next.remainingSpots,
      });
    }

    plankHolderInitializedRef.current = true;
  }, []);

  const refreshPlankHolderChallenge = useCallback(async () => {
    try {
      const next = await fetchPlankHolderProgress();
      applyPlankHolderResponse(next);
    } catch (error) {
      console.error("plank holder challenge refresh failed:", error);
    }
  }, [applyPlankHolderResponse]);

  const handlePlankHolderCta = useCallback((href: string) => {
    const challenge = plankHolderChallengeRef.current;
    trackPlankHolderEvent("challenge_cta_clicked", {
      completedCount: challenge?.progress.completedCount,
      claimedCount: challenge?.claimedCount,
      remainingSpots: challenge?.remainingSpots,
    });

    if (href === "/") {
      postTextareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      postTextareaRef.current?.focus();
      return;
    }

    window.location.href = href;
  }, []);

  const plankHolderCardHiddenKey = useCallback(
    (uid: string | null) => (uid ? `eod_plank_holder_card_hidden:${uid}` : null),
    [],
  );

  const readPlankHolderCardHidden = useCallback((uid: string | null) => {
    if (typeof window === "undefined") return false;
    const key = plankHolderCardHiddenKey(uid);
    if (!key) return false;
    try {
      return window.sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [plankHolderCardHiddenKey]);

  const recruiterNudgeHiddenKey = useCallback(
    (uid: string | null) => (uid ? `eod_recruiter_nudge_hidden:${uid}` : null),
    [],
  );

  const readRecruiterNudgeHidden = useCallback((uid: string | null) => {
    if (typeof window === "undefined") return false;
    const key = recruiterNudgeHiddenKey(uid);
    if (!key) return false;
    try {
      return window.sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [recruiterNudgeHiddenKey]);

  const hideRecruiterNudge = useCallback(() => {
    setRecruiterNudgeHidden(true);
    if (typeof window === "undefined") return;
    const key = recruiterNudgeHiddenKey(userId);
    if (key) {
      try { window.sessionStorage.setItem(key, "1"); } catch {}
    }
  }, [recruiterNudgeHiddenKey, userId]);

  const hidePendingMember = useCallback(async (memberId: string) => {
    setHiddenPendingMemberIds((prev) => {
      const next = new Set(prev);
      next.add(memberId);
      return next;
    });
    setOpenVouchPopoverFor((prev) => (prev === memberId ? null : prev));
    // Admins need recurring visibility on the vouch queue. Hide only for the
    // current page session; non-admin members persist dismissals.
    if (!userId || isAdmin) return;
    try {
      const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
      const res = await fetch("/api/profile-vouch/dismiss", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ vouchee_user_id: memberId }),
      });
      if (!res.ok) {
        console.error("profile-vouch dismiss failed:", await res.text());
      }
    } catch (err) {
      console.error("profile-vouch dismiss failed:", err);
    }
  }, [isAdmin, userId]);

  const hidePlankHolderCard = useCallback(() => {
    setPlankHolderCardHidden(true);
    if (typeof window === "undefined") return;
    const key = plankHolderCardHiddenKey(userId);
    if (key) {
      try { window.sessionStorage.setItem(key, "1"); } catch {}
    }
  }, [plankHolderCardHiddenKey, userId]);

  const revealPlankHolderCard = useCallback(() => {
    setPlankHolderCardHidden(false);
    if (typeof window === "undefined") return;
    const key = plankHolderCardHiddenKey(userId);
    if (key) {
      try { window.sessionStorage.removeItem(key); } catch {}
    }
  }, [plankHolderCardHiddenKey, userId]);

  const dismissPlankHolderEarnedBanner = useCallback(() => {
    if (!userId) return;
    setPlankHolderBannerDismissed(true);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(plankHolderBannerDismissedKey(userId), "1");
    } catch {}
  }, [userId]);

  const handlePlankHolderBannerClick = useCallback(() => {
    const challenge = plankHolderChallengeRef.current;
    trackPlankHolderEvent("challenge_cta_clicked", {
      completedCount: challenge?.progress.completedCount,
      claimedCount: challenge?.claimedCount,
      remainingSpots: challenge?.remainingSpots,
    });
    revealPlankHolderCard();
    requestAnimationFrame(() => {
      document.getElementById("plank-holder-challenge")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [revealPlankHolderCard]);

  useEffect(() => {
    setPlankHolderCardHidden(readPlankHolderCardHidden(userId));
  }, [userId, readPlankHolderCardHidden]);

  useEffect(() => {
    setRecruiterNudgeHidden(readRecruiterNudgeHidden(userId));
  }, [userId, readRecruiterNudgeHidden]);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) {
      setPlankHolderBannerDismissed(false);
      return;
    }
    try {
      setPlankHolderBannerDismissed(
        window.localStorage.getItem(plankHolderBannerDismissedKey(userId)) === "1",
      );
    } catch {
      setPlankHolderBannerDismissed(false);
    }
  }, [userId]);

  const closePlankHolderModal = useCallback(() => {
    setPlankHolderModalOpen(false);
    setPlankHolderChallenge((prev) => prev ? { ...prev, seenModal: true } : prev);
    plankHolderChallengeRef.current = plankHolderChallengeRef.current
      ? { ...plankHolderChallengeRef.current, seenModal: true }
      : null;
    void dismissPlankHolderModal().catch((error) => {
      console.error("plank holder modal dismiss failed:", error);
    });
  }, []);

  useEffect(() => {
    selectedPostImagesRef.current = selectedPostImages;
  }, [selectedPostImages]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    postsLoadedRef.current = postsLoaded;
  }, [postsLoaded]);

  useEffect(() => {
    feedPostLimitRef.current = feedPostLimit;
  }, [feedPostLimit]);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    function syncViewport() {
      setIsMobile(mq.matches);
    }
    syncViewport();
    mq.addEventListener("change", syncViewport);
    return () => mq.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    return () => {
      if (plankHolderToastTimerRef.current) clearTimeout(plankHolderToastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!plankHolderChallenge?.eligible || plankHolderViewedRef.current) return;
    if (!isPlankHolderChallengeOpen(plankHolderChallenge)) return;
    plankHolderViewedRef.current = true;
    trackPlankHolderEvent("challenge_viewed", {
      completedCount: plankHolderChallenge.progress.completedCount,
      claimedCount: plankHolderChallenge.claimedCount,
      remainingSpots: plankHolderChallenge.remainingSpots,
    });
  }, [plankHolderChallenge]);

  /** Legacy mobile ?tab= links → dedicated routes (no in-page section tabs on mobile). */
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (!tab || tab === "feed") return;
    const dest: Record<string, string> = {
      jobs: "/jobs",
      businesses: "/businesses",
      lemonlot: "/lemon-lot",
      dashboard: "/",
    };
    const path = dest[tab];
    if (!path) return;
    const u = new URL(window.location.href);
    u.searchParams.delete("tab");
    const qs = u.searchParams.toString();
    const target = path === "/" ? `/${qs ? `?${qs}` : ""}` : path;
    window.location.replace(target);
  }, []);

  useEffect(() => {
    selectedCommentImagesRef.current = selectedCommentImages;
  }, [selectedCommentImages]);

  useEffect(() => {
    if (!userId) {
      dismissedMemorialIdsRef.current = new Set();
      setDismissedMemorialIds(new Set());
      return;
    }
    const stored = readDayDismissedMemorialIds(userId);
    dismissedMemorialIdsRef.current = stored;
    setDismissedMemorialIds(stored);
  }, [userId]);

  function blockMemberInteraction(): boolean {
    if (memberInteractionAllowedRef.current) return false;
    setMemberPaywallOpen(true);
    return true;
  }

  async function dismissNavHelper() {
    setShowNavHelper(false);
    if (!userId) return;
    await supabase.from("profiles").update({ nav_helper_seen: true }).eq("user_id", userId);
  }

  const loadFeedEventAttendeePreviews = React.useCallback(async (eventId: string) => {
    const p = await fetchEventAttendeePreviews(supabase, eventId);
    setSelectedFeedEventAttendeePreviews(p);
  }, []);

  const refreshFeedEventAttendance = React.useCallback(
    async (eventId: string) => {
      const { data } = await supabase
        .from("event_attendance")
        .select("user_id, status")
        .eq("event_id", eventId);

      let interested = 0;
      let going = 0;
      let mine: "interested" | "going" | null = null;
      for (const row of (data ?? []) as Array<{ user_id: string; status: "interested" | "going" }>) {
        if (row.status === "interested") interested += 1;
        else if (row.status === "going") going += 1;
        if (userId && row.user_id === userId) mine = row.status;
      }

      let saved = false;
      if (userId) {
        const { data: savedRow } = await supabase
          .from("saved_events")
          .select("id")
          .eq("user_id", userId)
          .eq("event_id", eventId)
          .maybeSingle();
        saved = Boolean(savedRow);
      }

      setSelectedFeedEventCounts({ interested, going });
      setSelectedFeedEventMyStatus(mine);
      setPosts((prev) =>
        prev.map((p) =>
          p.event_id === eventId
            ? {
                ...p,
                event_interested_count: interested,
                event_going_count: going,
                event_my_attendance: mine,
                event_saved: saved,
              }
            : p
        )
      );
      void loadFeedEventAttendeePreviews(eventId);
    },
    [userId, loadFeedEventAttendeePreviews]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSavedEventsChanged = (event: Event) => {
      const custom = event as CustomEvent<{ eventId?: string }>;
      const eventId = custom.detail?.eventId;
      if (!eventId) return;
      void refreshFeedEventAttendance(eventId);
      void refreshPlankHolderChallenge();
    };
    window.addEventListener("eod:saved-events-changed", handleSavedEventsChanged as EventListener);
    return () => {
      window.removeEventListener("eod:saved-events-changed", handleSavedEventsChanged as EventListener);
    };
  }, [refreshFeedEventAttendance, refreshPlankHolderChallenge]);

  useEffect(() => {
    if (!selectedFeedEvent) {
      setFeedEventAttendeesListModal(null);
    }
  }, [selectedFeedEvent]);

  useEffect(() => {
    if (!selectedFeedEvent?.id) return;
    void loadFeedEventAttendeePreviews(selectedFeedEvent.id);
  }, [selectedFeedEvent?.id, loadFeedEventAttendeePreviews]);

  useEffect(() => {
    if (!selectedFeedEvent?.id) return;
    const id = selectedFeedEvent.id;
    const ch = supabase
      .channel(`feed-event-attendance-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_attendance",
          filter: `event_id=eq.${id}`,
        },
        () => {
          void refreshFeedEventAttendance(id);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [selectedFeedEvent?.id, refreshFeedEventAttendance]);

  useEffect(() => {
    const s = new Set<string>();
    for (const p of posts) {
      if (p.event_id) s.add(p.event_id);
    }
    feedEventIdsRef.current = s;
  }, [posts]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`feed-inline-event-attendance-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_attendance" },
        (payload) => {
          const row = (payload.new as { event_id?: string } | null) ?? (payload.old as { event_id?: string } | null);
          const eid = row?.event_id;
          if (!eid || !feedEventIdsRef.current.has(eid)) return;
          void refreshFeedEventAttendance(eid);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, refreshFeedEventAttendance]);

  const openFeedEventModal = React.useCallback(
    async (eventId: string) => {
      setSelectedFeedEventBusy(true);
      try {
        const [eventRes, attRes] = await Promise.all([
          supabase
            .from("events")
            .select("id, title, description, date, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, unit_id, visibility")
            .eq("id", eventId)
            .is("unit_id", null)
            .eq("visibility", "public")
            .maybeSingle(),
          supabase
            .from("event_attendance")
            .select("user_id, status")
            .eq("event_id", eventId),
        ]);

        if (eventRes.error || !eventRes.data) return;

        let interested = 0;
        let going = 0;
        let mine: "interested" | "going" | null = null;
        for (const row of (attRes.data ?? []) as Array<{ user_id: string; status: "interested" | "going" }>) {
          if (row.status === "interested") interested += 1;
          else if (row.status === "going") going += 1;
          if (userId && row.user_id === userId) mine = row.status;
        }

        setSelectedFeedEvent(eventRes.data as FeedSelectedEvent);
        setSelectedFeedEventCounts({ interested, going });
        setSelectedFeedEventMyStatus(mine);
        void loadFeedEventAttendeePreviews(eventId);
      } finally {
        setSelectedFeedEventBusy(false);
      }
    },
    [userId, loadFeedEventAttendeePreviews]
  );

  const toggleSelectedFeedEventRsvp = React.useCallback(
    async (status: "interested" | "going") => {
      if (!selectedFeedEvent) return;
      if (!userId) {
        window.location.href = "/login";
        return;
      }
      setSelectedFeedEventBusy(true);
      try {
        const {
          data: { session },
        } = await getSupabaseSession({ source: "HomePage" });

        const res = await fetch("/api/events/feed-actions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            action: "toggle_attendance",
            eventId: selectedFeedEvent.id,
            status,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          interested?: number;
          going?: number;
          myAttendance?: "interested" | "going" | null;
          saved?: boolean;
        };
        if (!res.ok) {
          throw new Error(json.error ?? "Could not update attendance.");
        }

        const interested = json.interested ?? 0;
        const going = json.going ?? 0;
        const mine = json.myAttendance ?? null;

        setSelectedFeedEventCounts({ interested, going });
        setSelectedFeedEventMyStatus(mine);
        setPosts((prev) =>
          prev.map((p) =>
            p.event_id === selectedFeedEvent.id
              ? {
                  ...p,
                  event_interested_count: interested,
                  event_going_count: going,
                  event_my_attendance: mine,
                  event_saved: Boolean(json.saved),
                }
              : p
          )
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("eod:saved-events-changed", { detail: { eventId: selectedFeedEvent.id } }));
        }
        void refreshPlankHolderChallenge();
      } catch (err) {
        console.error("feed event RSVP failed:", err);
        alert(err instanceof Error ? err.message : "Could not update your RSVP.");
      } finally {
        setSelectedFeedEventBusy(false);
      }
      await refreshFeedEventAttendance(selectedFeedEvent.id);
    },
    [refreshFeedEventAttendance, refreshPlankHolderChallenge, selectedFeedEvent, userId]
  );

  async function loadBusinessListings() {
    const perfStart = perfNowMs();
    const { data, error } = await supabase
      .from("business_listings")
      .select(BUSINESS_LISTING_COLUMNS)
      .eq("is_approved", true)
      .order("is_featured", { ascending: false })
      .order("business_name", { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) {
      console.error("Business listings load error:", error);
      return;
    }

    setBusinessListings((data ?? []) as BusinessListing[]);
    setBizLoaded(true);
    logPerf("home.loadBusinessListings", perfStart, { count: (data ?? []).length });
  }

  async function handleBizLike(e: React.MouseEvent, bizId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!userId || togglingBizLikeFor === bizId) return;
    if (blockMemberInteraction()) return;
    setTogglingBizLikeFor(bizId);
    const already = likedBizIds.has(bizId);
    try {
      await toggleBizLike({
        queryClient,
        supabase,
        userId,
        bizId,
        liked: already,
      });
      // Mobile home still keeps listings in local state (not the shared listings query).
      setBusinessListings((prev) =>
        prev.map((b) =>
          b.id === bizId
            ? {
                ...b,
                like_count: Math.max(0, (b.like_count ?? 0) + (already ? -1 : 1)),
              }
            : b,
        ),
      );
    } catch (err) {
      console.error("Toggle business like error:", err);
    } finally {
      setTogglingBizLikeFor(null);
    }
  }

  async function loadJobs(limit = 500) {
    const perfStart = perfNowMs();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfNextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const listingCutoff = jobListingCutoffIso();

    const [jobsRes, lastSeenRes, totalRes, todayRes] = await Promise.all([
      supabase.from("jobs").select(JOB_COLUMNS).eq("is_approved", true).neq("is_rejected", true).gte("created_at", listingCutoff).order("created_at", { ascending: false }).limit(limit),
      supabase.from("jobs").select("last_seen_at").eq("source_type", "usajobs").order("last_seen_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_approved", true).neq("is_rejected", true).gte("created_at", listingCutoff),
      supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("is_approved", true)
        .neq("is_rejected", true)
        .gte("created_at", listingCutoff)
        .gte("created_at", startOfDay.toISOString())
        .lt("created_at", startOfNextDay.toISOString()),
    ]);

    if (jobsRes.error) {
      console.error("Jobs load error:", jobsRes.error);
      logPerf("home.loadJobs.error", perfStart, { limit });
      return;
    }

    if (totalRes.error) {
      console.error("Jobs total count error:", totalRes.error);
      setJobsTotalApprovedCount(null);
    } else {
      setJobsTotalApprovedCount(totalRes.count ?? 0);
    }
    if (todayRes.error) {
      console.error("Jobs new-today count error:", todayRes.error);
      setJobsNewTodayCount(null);
    } else {
      setJobsNewTodayCount(todayRes.count ?? 0);
    }

    const loadedJobs = (jobsRes.data ?? []) as Job[];
    setJobs(loadedJobs);
    setJobsLoaded(true);
    if (lastSeenRes.data?.last_seen_at) {
      setJobsLastUpdated(lastSeenRes.data.last_seen_at);
    }

    // Load submitter profiles for non-anonymous community jobs
    const communityJobs = loadedJobs.filter((j) => j.source_type === "community" && j.user_id && !j.anonymous);
    const communityUserIds = [...new Set(communityJobs.map((j) => j.user_id as string))];
    if (communityUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, photo_url")
        .in("user_id", communityUserIds);
      type ProfileRow = { user_id: string; display_name: string | null; first_name: string | null; last_name: string | null; photo_url: string | null };
      const profileRows = (profiles ?? []) as ProfileRow[];

      // Name map for tile attribution
      const nameMap = new Map<string, string>();
      profileRows.forEach((p) => {
        const name = p.display_name || [p.first_name, p.last_name?.charAt(0) ? p.last_name.charAt(0) + "." : ""].filter(Boolean).join(" ") || "Member";
        nameMap.set(p.user_id, name);
      });
      setJobSubmitters(nameMap);

      // Leaderboard: count approved community jobs per user
      const counts = new Map<string, number>();
      communityJobs.forEach((j) => { counts.set(j.user_id!, (counts.get(j.user_id!) ?? 0) + 1); });
      const board = profileRows
        .map((p) => ({
          user_id: p.user_id,
          name: nameMap.get(p.user_id) ?? "Member",
          photo_url: p.photo_url,
          count: counts.get(p.user_id) ?? 0,
        }))
        .filter((e) => e.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setJobLeaderboard(board);
    }
    logPerf("home.loadJobs", perfStart, {
      limit,
      loaded: loadedJobs.length,
      totalApproved: totalRes.count ?? null,
      newToday: todayRes.count ?? null,
    });
  }

  async function loadTodayMemorials(forUserId: string) {
    const { data: pref } = await supabase
      .from("profiles")
      .select("show_memorial_feed_cards")
      .eq("user_id", forUserId)
      .maybeSingle();
    if (pref && (pref as { show_memorial_feed_cards?: boolean | null }).show_memorial_feed_cards === false) {
      setTodayMemorials([]);
      setMemorialEngagement({});
      setMemorialComments({});
      setMemorialCommentInputs({});
      setMemorialCommentsOpen({});
      setExpandedMemorialCards({});
      return;
    }

    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    const { data, error } = await supabase
      .from("memorials")
      .select("id, name, bio, photo_url, death_date, category, service, source_url");

    if (error) { console.error("Memorials load error:", error); return; }

    const todayAnniversaries = (data ?? []).filter((m: { death_date: string }) => {
      const parts = m.death_date.split("-");
      return parts[1] === mm && parts[2] === dd;
    });

    const anniversaryList = todayAnniversaries as {
      id: string;
      name: string;
      bio: string | null;
      photo_url: string | null;
      death_date: string;
      category?: "military" | "leo_fed" | null;
      service?: string | null;
      source_url?: string | null;
    }[];
    setTodayMemorials(anniversaryList);
    void loadMemorialInteractions(anniversaryList.map(m => m.id));

    // Re-apply today's dismissals after reloads (navigation, pref refresh, etc.).
    const storedToday = readDayDismissedMemorialIds(forUserId);
    setDismissedMemorialIds((prev) => {
      const merged = new Set([...prev, ...storedToday, ...dismissedMemorialIdsRef.current]);
      dismissedMemorialIdsRef.current = merged;
      return merged;
    });
  }

  function dismissMemorial(id: string) {
    setDismissedMemorialIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      dismissedMemorialIdsRef.current = next;
      if (userId) persistDayDismissedMemorialIds(userId, next);
      return next;
    });
  }

  async function loadMemorialInteractions(ids: string[]) {
    if (ids.length === 0) return;
    const [commentsRes, memorialReactionRows] = await Promise.all([
      supabase
        .from("memorial_comments")
        .select("id, memorial_id, user_id, content, created_at")
        .in("memorial_id", ids)
        .order("created_at", { ascending: true }),
      fetchContentReactionsForSubjects(supabase, "memorial", ids),
    ]);

    const commentRows = (commentsRes.data ?? []) as Array<{
      id: string;
      memorial_id: string;
      user_id: string;
      content: string;
      created_at: string;
    }>;
    const commentIds = commentRows.map((c) => c.id);
    const commentReactionRows =
      commentIds.length > 0
        ? await fetchContentReactionsForSubjects(supabase, "memorial_comment", commentIds)
        : [];

    const profileUserIds = new Set<string>();
    for (const c of commentRows) profileUserIds.add(c.user_id);
    for (const r of memorialReactionRows) profileUserIds.add(r.user_id);
    for (const r of commentReactionRows) profileUserIds.add(r.user_id);

    const profileMap: Record<string, { name: string; photo: string | null }> = {};
    const profileNameMap = new Map<string, string>();
    if (profileUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, photo_url")
        .in("user_id", [...profileUserIds]);
      for (const p of (profiles ?? []) as {
        user_id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      }[]) {
        const name =
          (p.display_name?.trim() || null) ||
          `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
          "User";
        profileMap[p.user_id] = { name, photo: p.photo_url ?? null };
        profileNameMap.set(p.user_id, name);
      }
    }

    const memorialAggregates = aggregatesBySubjectId(memorialReactionRows, userId);
    const commentAggregates = aggregatesBySubjectId(commentReactionRows, userId);

    const engagementMap: Record<string, MemorialEngagementState> = {};
    for (const id of ids) {
      const agg = memorialAggregates.get(id) ?? emptyAggregate();
      engagementMap[id] = {
        myReaction: agg.myReaction,
        totalReactionCount: agg.totalCount,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          memorialReactionRows,
          id,
          profileNameMap,
        ),
      };
    }
    setMemorialEngagement(engagementMap);

    const commentsMap: Record<string, MemorialComment[]> = {};
    for (const c of commentRows) {
      const cAgg = commentAggregates.get(c.id) ?? emptyAggregate();
      const enriched: MemorialComment = {
        ...c,
        authorName: profileMap[c.user_id]?.name ?? "User",
        authorPhotoUrl: profileMap[c.user_id]?.photo ?? null,
        myReaction: cAgg.myReaction,
        likeCount: cAgg.totalCount,
        reactionCountsByType: cAgg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          commentReactionRows,
          c.id,
          profileNameMap,
        ),
      };
      if (!commentsMap[c.memorial_id]) commentsMap[c.memorial_id] = [];
      commentsMap[c.memorial_id].push(enriched);
    }
    setMemorialComments(commentsMap);
  }

  async function handleMemorialReaction(memorialId: string, picked: ReactionType) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    try {
      setTogglingMemorialReactionFor(memorialId);
      await applyContentReaction(supabase, {
        subjectKind: "memorial",
        subjectId: memorialId,
        userId,
        picked,
      });
      await loadMemorialInteractions([memorialId]);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingMemorialReactionFor(null);
    }
  }

  async function handleMemorialCommentReaction(commentId: string, memorialId: string, picked: ReactionType) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    try {
      setTogglingMemorialCommentReactionFor(commentId);
      await applyContentReaction(supabase, {
        subjectKind: "memorial_comment",
        subjectId: commentId,
        userId,
        picked,
      });
      await loadMemorialInteractions([memorialId]);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingMemorialCommentReactionFor(null);
    }
  }

  async function submitMemorialComment(memorialId: string) {
    if (!userId) { window.location.href = "/login"; return; }
    if (blockMemberInteraction()) return;
    const text = (memorialCommentRawsRef.current[memorialId] || memorialCommentInputs[memorialId] || "").trim();
    if (!text) return;
    setSubmittingMemorialComment(memorialId);
    const { data, error } = await supabase.from("memorial_comments")
      .insert({ memorial_id: memorialId, user_id: userId, content: text })
      .select("id, memorial_id, user_id, content, created_at").single();
    if (!error && data) {
      setMemorialCommentsOpen((prev) => ({ ...prev, [memorialId]: true }));
      await loadMemorialInteractions([memorialId]);
      setMemorialCommentInputs(prev => ({ ...prev, [memorialId]: "" }));
      memorialCommentRawsRef.current[memorialId] = "";
      const mentionIds = extractMentionIds(text).filter(id => id !== userId);
      if (mentionIds.length > 0) {
        await Promise.all(
          mentionIds.map((uid) =>
            postNotifyJson(supabase, {
              user_id: uid,
              type: "memorial_mention",
              category: "social",
              message: `${currentUserName ?? "Someone"} mentioned you in a memorial comment`,
              actor_name: currentUserName ?? "Someone",
              group_key: `memorial:${memorialId}:mentions`,
              dedupe_key: `memorial_mention:${memorialId}:${uid}:${data.id}`,
              metadata: { memorial_id: memorialId, comment_id: data.id },
            }),
          ),
        );
      }
    }
    setSubmittingMemorialComment(null);
  }

  async function saveMemorialCommentEdit(memorialId: string, commentId: string) {
    if (!userId) return;
    const content = editingMemorialCommentContent.trim();
    if (!content) return;
    setSavingMemorialCommentId(commentId);
    const { error } = await supabase
      .from("memorial_comments")
      .update({ content })
      .eq("id", commentId)
      .eq("user_id", userId);
    if (!error) {
      setMemorialComments((prev) => ({
        ...prev,
        [memorialId]: (prev[memorialId] ?? []).map((c) => (c.id === commentId ? { ...c, content } : c)),
      }));
      setEditingMemorialCommentId(null);
      setEditingMemorialCommentContent("");
    }
    setSavingMemorialCommentId(null);
  }

  async function deleteMemorialComment(memorialId: string, commentId: string) {
    if (!userId) return;
    setDeletingMemorialCommentId(commentId);
    const { error } = await supabase
      .from("memorial_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", userId);
    if (!error) {
      setMemorialComments((prev) => ({
        ...prev,
        [memorialId]: (prev[memorialId] ?? []).filter((c) => c.id !== commentId),
      }));
      if (editingMemorialCommentId === commentId) {
        setEditingMemorialCommentId(null);
        setEditingMemorialCommentContent("");
      }
    }
    setDeletingMemorialCommentId(null);
  }

  useEffect(() => {
    if (!userId || !showMemorialFeedCards) {
      setTodayMemorials([]);
      setMemorialEngagement({});
      setMemorialComments({});
      setMemorialCommentInputs({});
      setMemorialCommentsOpen({});
      setExpandedMemorialCards({});
      return;
    }
    if (!feedAboveFoldExtrasReady) return;
    void loadTodayMemorials(userId);
    // loadTodayMemorials is re-created each render; this effect is intentionally keyed on userId + showMemorialFeedCards only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, showMemorialFeedCards, feedAboveFoldExtrasReady]);

  useEffect(() => {
    if (!feedAboveFoldExtrasReady || !userId) return;
    void loadPendingMembers().catch((err) => console.error("loadPendingMembers failed:", err));
  }, [feedAboveFoldExtrasReady, userId]);

  useEffect(() => {
    if (!postsLoaded) {
      setFeedAboveFoldExtrasReady(false);
      if (feedAboveFoldExtrasTimerRef.current) {
        window.clearTimeout(feedAboveFoldExtrasTimerRef.current);
        feedAboveFoldExtrasTimerRef.current = null;
      }
      return;
    }

    const markExtrasReady = () => {
      feedAboveFoldExtrasTimerRef.current = window.setTimeout(() => {
        feedAboveFoldExtrasTimerRef.current = null;
        setFeedAboveFoldExtrasReady(true);
      }, FEED_ABOVE_FOLD_EXTRAS_DELAY_MS);
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(markExtrasReady, {
        timeout: FEED_ABOVE_FOLD_EXTRAS_DELAY_MS + 500,
      });
      return () => {
        window.cancelIdleCallback(idleId);
        if (feedAboveFoldExtrasTimerRef.current) {
          window.clearTimeout(feedAboveFoldExtrasTimerRef.current);
          feedAboveFoldExtrasTimerRef.current = null;
        }
      };
    }

    markExtrasReady();
    return () => {
      if (feedAboveFoldExtrasTimerRef.current) {
        window.clearTimeout(feedAboveFoldExtrasTimerRef.current);
        feedAboveFoldExtrasTimerRef.current = null;
      }
    };
  }, [postsLoaded]);

  async function loadPendingMembers() {
    const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
    const res = await fetch("/api/profile-vouch/candidates", {
      headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
    });

    if (!res.ok) {
      console.error("loadPendingMembers failed:", await res.text());
      setPendingMembers([]);
      return;
    }

    const json = (await res.json()) as {
      candidates?: PendingMember[];
      hidden_ids?: string[];
      error?: string;
    };

    if (json.error) {
      console.warn("loadPendingMembers skipped:", json.error);
    }

    setHiddenPendingMemberIds(new Set(json.hidden_ids ?? []));
    setPendingMembers(json.candidates ?? []);
  }

  async function vouchForMember(voucheeId: string) {
    if (!userId || vouchingFor) return;
    if (blockMemberInteraction()) return;
    setVouchingFor(voucheeId);
    try {
      const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
      const res = await fetch("/api/profile-vouch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ vouchee_user_id: voucheeId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.approved) {
          setPendingMembers((prev) => prev.filter((m) => m.user_id !== voucheeId));
        } else {
          setPendingMembers((prev) =>
            prev.map((m) => m.user_id === voucheeId
              ? {
                  ...m,
                  vouch_count: json.vouches,
                  user_vouched: true,
                  vouchers: m.vouchers.some((v) => v.user_id === userId)
                    ? m.vouchers
                    : [...m.vouchers, { user_id: userId, name: currentUserName ?? "You", photo_url: currentUserPhotoUrl }],
                }
              : m)
          );
        }
      }
    } finally {
      setVouchingFor(null);
    }
  }

  async function approveUser(targetUserId: string) {
    if (!userId || actingOnUser) return;
    setActingOnUser(targetUserId);
    try {
      const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
      const res = await fetch("/api/admin/verify-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { emailSent?: boolean; emailSkippedReason?: string };
        if (process.env.NODE_ENV === "development") {
          console.debug("[auth:admin-approve-feed]", { userId: targetUserId, ...json });
        }
        setPendingMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
      }
    } finally {
      setActingOnUser(null);
    }
  }

  async function denyUser(targetUserId: string) {
    if (!userId || actingOnUser) return;
    setActingOnUser(targetUserId);
    try {
      const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
      const res = await fetch("/api/admin/deny-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ userId: targetUserId }),
      });
      if (res.ok) setPendingMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
    } finally {
      setActingOnUser(null);
    }
  }

  function handleUserBlocked(blockedUserId: string) {
    setBlockedUserIds((prev) => new Set([...prev, blockedUserId]));
    setPosts((prev) =>
      prev
        .filter((post) => post.authorUserId !== blockedUserId && post.user_id !== blockedUserId)
        .map((post) => {
          const visibleComments = post.comments.filter((comment) => comment.user_id !== blockedUserId);
          return {
            ...post,
            comments: visibleComments,
            commentCount: visibleComments.length,
          };
        }),
    );
    queryClient.setQueryData(queryKeys.discoverProfiles(userId ?? "pending"), (rows: unknown) =>
      Array.isArray(rows)
        ? rows.filter((profile: { user_id?: string }) => profile.user_id !== blockedUserId)
        : rows,
    );
  }

  async function toggleDiscoverConnection(targetUserId: string) {
    if (!userId) return;
    if (blockMemberInteraction()) return;
    const profile = visibleDiscoverProfiles.find((p) => p.user_id === targetUserId);
    if (!profile) return;
    if (profile.knowStatus === "pending_outgoing" || profile.knowStatus === "accepted") return;

    const prevDiscoverPageIndex = discoverPageIndex;

    try {
      const result = await runDiscoverKnowAction({
        queryClient,
        supabase,
        viewerId: userId,
        targetUserId,
        currentKnowStatus: profile.knowStatus,
      });

      const targetName =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        "this member";
      if (discoverKnowToastTimerRef.current) {
        clearTimeout(discoverKnowToastTimerRef.current);
      }
      setDiscoverKnowToast(
        result.state === "accepted"
          ? `You and ${targetName} now know each other`
          : `Know request sent to ${targetName}`,
      );
      discoverKnowToastTimerRef.current = setTimeout(() => {
        setDiscoverKnowToast(null);
        discoverKnowToastTimerRef.current = null;
      }, 3500);
    } catch (err) {
      console.error("[know] unexpected error:", err);
      setDiscoverPageIndex(prevDiscoverPageIndex);
      alert(err instanceof Error ? err.message : "Failed to send Know request. Please try again.");
    }
  }

  async function toggleSaveJob(jobId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    try {
      setTogglingJobSaveFor(jobId);
      const isSaved = savedJobIds.has(jobId);

      if (isSaved) {
        await toggleSavedJob({
          queryClient,
          supabase,
          userId,
          jobId,
          saved: true,
        });
      } else {
        const job = jobs.find((j) => j.id === jobId);
        await toggleSavedJob({
          queryClient,
          supabase,
          userId,
          jobId,
          saved: false,
          optimisticRow: job ? savedJobRowFromJob(job) : undefined,
        });
        // Notify job poster (fire and forget ΓÇö no actor name for privacy)
        if (job?.source_type === "community" && job.user_id && job.user_id !== userId) {
          void postNotifyJson(supabase, {
            user_id: job.user_id,
            actor_name: "A member",
            type: "job_save",
            category: "jobs",
            message: `Someone saved your job listing: ${job.title || "your posting"}`,
            group_key: `job:${jobId}:saves`,
            dedupe_key: `job_save:${jobId}:${userId}`,
            metadata: { job_id: jobId },
          });
        }
      }
    } catch (err) {
      console.error("Toggle save job error:", err);
    } finally {
      setTogglingJobSaveFor(null);
    }
  }

  async function loadCommentsForPosts(postIds: string[], blockedIds: Set<string> = blockedUserIds) {
    /** Only non-hidden comments; if column missing (older DB), load without this filter. */
    let commentsWithImageQuery = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at, image_url, gif_url, parent_comment_id")
      .in("post_id", postIds)
      .or("hidden_for_review.is.null,hidden_for_review.eq.false")
      .order("created_at", { ascending: true });

    if (
      commentsWithImageQuery.error &&
      isMissingColumnError(commentsWithImageQuery.error, "hidden_for_review")
    ) {
      commentsWithImageQuery = await supabase
        .from("post_comments")
        .select("id, post_id, user_id, content, created_at, image_url, gif_url, parent_comment_id")
        .in("post_id", postIds)
        .order("created_at", { ascending: true });
    }

    // Older DBs may not have parent_comment_id yet; retry without it.
    if (
      commentsWithImageQuery.error &&
      isMissingColumnError(commentsWithImageQuery.error, "parent_comment_id")
    ) {
      let legacyQuery = await supabase
        .from("post_comments")
        .select("id, post_id, user_id, content, created_at, image_url, gif_url")
        .in("post_id", postIds)
        .or("hidden_for_review.is.null,hidden_for_review.eq.false")
        .order("created_at", { ascending: true });

      if (
        legacyQuery.error &&
        isMissingColumnError(legacyQuery.error, "hidden_for_review")
      ) {
        legacyQuery = await supabase
          .from("post_comments")
          .select("id, post_id, user_id, content, created_at, image_url, gif_url")
          .in("post_id", postIds)
          .order("created_at", { ascending: true });
      }

      if (!legacyQuery.error) {
        const normalized: Comment[] = (legacyQuery.data ?? []).map((comment) => ({
          ...(comment as Omit<Comment, "parent_comment_id">),
          parent_comment_id: null,
        }));
        return { comments: filterBlockedRows(normalized, blockedIds, (comment) => comment.user_id) };
      }
      commentsWithImageQuery = legacyQuery;
    }

    if (!commentsWithImageQuery.error) {
      return {
        comments: filterBlockedRows((commentsWithImageQuery.data ?? []) as Comment[], blockedIds, (comment) => comment.user_id),
      };
    }

    if (!isMissingColumnError(commentsWithImageQuery.error, "image_url")) {
      console.error("Comments load error:", {
        message: commentsWithImageQuery.error.message,
        details: commentsWithImageQuery.error.details,
        hint: commentsWithImageQuery.error.hint,
        code: commentsWithImageQuery.error.code,
      });

      return {
        comments: [] as Comment[],
      };
    }

    let commentsWithoutImageQuery = await supabase
      .from("post_comments")
      .select("id, post_id, user_id, content, created_at, parent_comment_id")
      .in("post_id", postIds)
      .or("hidden_for_review.is.null,hidden_for_review.eq.false")
      .order("created_at", { ascending: true });

    if (
      commentsWithoutImageQuery.error &&
      isMissingColumnError(commentsWithoutImageQuery.error, "hidden_for_review")
    ) {
      commentsWithoutImageQuery = await supabase
        .from("post_comments")
        .select("id, post_id, user_id, content, created_at, parent_comment_id")
        .in("post_id", postIds)
        .order("created_at", { ascending: true });
    }

    // Older DBs without parent_comment_id: retry the no-image query without it.
    if (
      commentsWithoutImageQuery.error &&
      isMissingColumnError(commentsWithoutImageQuery.error, "parent_comment_id")
    ) {
      let legacyNoImageQuery = await supabase
        .from("post_comments")
        .select("id, post_id, user_id, content, created_at")
        .in("post_id", postIds)
        .or("hidden_for_review.is.null,hidden_for_review.eq.false")
        .order("created_at", { ascending: true });

      if (
        legacyNoImageQuery.error &&
        isMissingColumnError(legacyNoImageQuery.error, "hidden_for_review")
      ) {
        legacyNoImageQuery = await supabase
          .from("post_comments")
          .select("id, post_id, user_id, content, created_at")
          .in("post_id", postIds)
          .order("created_at", { ascending: true });
      }

      if (legacyNoImageQuery.error) {
        console.error("Comments fallback load error:", {
          message: legacyNoImageQuery.error.message,
          details: legacyNoImageQuery.error.details,
          hint: legacyNoImageQuery.error.hint,
          code: legacyNoImageQuery.error.code,
        });
        return { comments: [] as Comment[] };
      }

      const legacyComments: Comment[] = (legacyNoImageQuery.data ?? []).map(
        (comment) =>
          ({
            ...(comment as Record<string, unknown>),
            image_url: null,
            gif_url: null,
            parent_comment_id: null,
          }) as Comment,
      );
      return { comments: filterBlockedRows(legacyComments, blockedIds, (comment) => comment.user_id) };
    }

    if (commentsWithoutImageQuery.error) {
      console.error("Comments fallback load error:", {
        message: commentsWithoutImageQuery.error.message,
        details: commentsWithoutImageQuery.error.details,
        hint: commentsWithoutImageQuery.error.hint,
        code: commentsWithoutImageQuery.error.code,
      });

      return {
        comments: [] as Comment[],
      };
    }

    const normalizedComments: Comment[] = (
      commentsWithoutImageQuery.data ?? []
    ).map(
      (comment) =>
        ({
          ...(comment as Record<string, unknown>),
          image_url: null,
          gif_url: null,
          parent_comment_id:
            (comment as { parent_comment_id?: string | null }).parent_comment_id ?? null,
        }) as Comment,
    );

    return {
      comments: filterBlockedRows(normalizedComments, blockedIds, (comment) => comment.user_id),
    };
  }

  async function loadUnitFeedHighlightsForUser(effectiveUserId: string | null): Promise<void> {
    if (!effectiveUserId) {
      unitFeedHighlightsLoadedForRef.current = null;
      unitFeedHighlightsLoadingForRef.current = null;
      setUnitFeedHighlights([]);
      return;
    }
    if (
      unitFeedHighlightsLoadedForRef.current === effectiveUserId ||
      unitFeedHighlightsLoadingForRef.current === effectiveUserId
    ) {
      return;
    }
    unitFeedHighlightsLoadingForRef.current = effectiveUserId;
    const { data: memberships } = await supabase
      .from("unit_members")
      .select("unit_id")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved");

    const unitIds = ((memberships ?? []) as { unit_id: string }[]).map((m) => m.unit_id);
    if (unitIds.length === 0) {
      setUnitFeedHighlights([]);
      unitFeedHighlightsLoadedForRef.current = effectiveUserId;
      unitFeedHighlightsLoadingForRef.current = null;
      return;
    }
    const sinceIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString();
    const { data: unitPosts } = await supabase
      .from("unit_posts")
      .select("id, unit_id, user_id, content, photo_url, created_at, post_type")
      .in("unit_id", unitIds)
      .eq("post_type", "post")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(120);

    const candidatePosts = (unitPosts ?? []) as {
      id: string;
      unit_id: string;
      user_id: string;
      content: string | null;
      photo_url: string | null;
      created_at: string;
    }[];

    if (candidatePosts.length === 0) {
      setUnitFeedHighlights([]);
      unitFeedHighlightsLoadedForRef.current = effectiveUserId;
      unitFeedHighlightsLoadingForRef.current = null;
      return;
    }

    const candidatePostIds = candidatePosts.map((p) => p.id);
    const candidateAuthorIds = [...new Set(candidatePosts.map((p) => p.user_id))];

    const [{ data: unitLikes }, { data: unitComments }, unitsData, { data: unitAuthors }] =
      await Promise.all([
        supabase.from("unit_post_likes").select("unit_post_id").in("unit_post_id", candidatePostIds),
        supabase.from("unit_post_comments").select("unit_post_id").in("unit_post_id", candidatePostIds),
        (async () => {
          const unitsRes = await supabase
            .from("units")
            .select("id, name, slug, cover_photo_url")
            .in("id", unitIds);
          if (!unitsRes.error) {
            return (unitsRes.data ?? []) as {
              id: string;
              name: string;
              slug: string;
              cover_photo_url: string | null;
            }[];
          }
          if (!isMissingColumnError(unitsRes.error, "cover_photo_url")) {
            console.warn("Unit highlight units load warning:", unitsRes.error.message);
            return [];
          }
          const unitsFallback = await supabase
            .from("units")
            .select("id, name, slug, cover_image_url")
            .in("id", unitIds);
          if (unitsFallback.error) {
            console.warn("Unit highlight units fallback warning:", unitsFallback.error.message);
            unitFeedHighlightsLoadingForRef.current = null;
            return [];
          }
          return ((unitsFallback.data ?? []) as {
            id: string;
            name: string;
            slug: string;
            cover_image_url: string | null;
          }[]).map((u) => ({
            id: u.id,
            name: u.name,
            slug: u.slug,
            cover_photo_url: u.cover_image_url ?? null,
          }));
        })(),
        supabase.from("profiles").select("user_id, first_name, last_name, display_name, photo_url").in("user_id", candidateAuthorIds),
      ]);

    const likeMap = new Map<string, number>();
    ((unitLikes ?? []) as { unit_post_id: string }[]).forEach((row) => {
      likeMap.set(row.unit_post_id, (likeMap.get(row.unit_post_id) ?? 0) + 1);
    });
    const commentMap = new Map<string, number>();
    ((unitComments ?? []) as { unit_post_id: string }[]).forEach((row) => {
      commentMap.set(row.unit_post_id, (commentMap.get(row.unit_post_id) ?? 0) + 1);
    });

    const unitMap = new Map<string, { name: string; slug: string; cover_photo_url: string | null }>();
    ((unitsData ?? []) as { id: string; name: string; slug: string; cover_photo_url: string | null }[]).forEach((u) => {
      unitMap.set(u.id, { name: u.name, slug: u.slug, cover_photo_url: u.cover_photo_url ?? null });
    });
    const authorMap = new Map<string, { name: string; photo_url: string | null }>();
    ((unitAuthors ?? []) as { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; photo_url: string | null }[])
      .forEach((a) => {
        const name =
          a.display_name?.trim() ||
          `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() ||
          "Member";
        authorMap.set(a.user_id, { name, photo_url: a.photo_url ?? null });
      });

    const scored = candidatePosts
      .map((p) => {
        const likes = likeMap.get(p.id) ?? 0;
        const comments = commentMap.get(p.id) ?? 0;
        const engagement = likes + comments * 2;
        return { ...p, likes, comments, engagement };
      })
      // Keep this high-signal so one-off low engagement posts do not spill into global feed.
      .filter((p) => p.engagement >= 4 && (p.likes + p.comments) >= 2)
      .sort((a, b) => {
        if (b.engagement !== a.engagement) return b.engagement - a.engagement;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 3)
      .map((p) => {
        const unit = unitMap.get(p.unit_id);
        if (!unit?.slug) return null;
        const author = authorMap.get(p.user_id);
        return {
          id: p.id,
          unit_id: p.unit_id,
          unit_name: unit.name,
          unit_slug: unit.slug,
          unit_cover_image_url: unit.cover_photo_url ?? null,
          user_id: p.user_id,
          author_name: author?.name ?? "Member",
          author_photo: author?.photo_url ?? null,
          content: p.content ?? null,
          photo_url: p.photo_url ?? null,
          created_at: p.created_at,
          like_count: p.likes,
          comment_count: p.comments,
        } as UnitFeedHighlight;
      })
      .filter((p): p is UnitFeedHighlight => Boolean(p));

    setUnitFeedHighlights(scored);
    unitFeedHighlightsLoadedForRef.current = effectiveUserId;
    unitFeedHighlightsLoadingForRef.current = null;
  }

  function createFeedPostShell(
    post: RankedPostRow,
    overrides: Partial<FeedPost> = {},
  ): FeedPost {
    return {
      ...post,
      image_url: null,
      image_urls: [],
      gif_url: null,
      content_type: "user_post",
      system_generated: false,
      news_item_id: null,
      authorUserId: post.user_id,
      authorName: "User",
      authorPhotoUrl: null,
      authorService: null,
      authorIsEmployer: null,
      authorIsPureAdmin: null,
      authorHasPublicMemberProfile: true,
      likeCount: 0,
      commentCount: 0,
      myReaction: null,
      reactionCountsByType: {},
      reactorNamesByType: {},
      likers: [],
      comments: [],
      og_url: null,
      og_title: null,
      og_description: null,
      og_image: null,
      admin_manual_image_url: null,
      og_site_name: null,
      event_id: null,
      feed_event: null,
      event_interested_count: 0,
      event_going_count: 0,
      event_my_attendance: null,
      event_saved: false,
      kangaroo: null,
      court_verdict_at: null,
      rabbithole_thread_id: null,
    rabbithole_contribution_id: null,
    isInteractionHydrating: false,
    feed_rank_age_offset_hours: 0,
    ...overrides,
    };
  }

  async function loadInitialFeedBatch(
    rawPosts: RankedPostRow[],
    effectiveUserId: string | null,
    perfStart: number,
    effectiveBlockedUserIds: Set<string>,
  ): Promise<InitialFeedBatchCache> {
    const initialPosts = rawPosts.slice(0, INITIAL_FEED_POST_LIMIT);
    const postIds = initialPosts.map((post) => post.id);

    const [legacyWithEvent, postAsRes, enrichment] = await Promise.all([
      supabase
        .from("posts")
        .select("id, image_url, gif_url, og_url, og_title, og_description, og_image, og_site_name, event_id, content_type, system_generated, news_item_id, court_verdict_at, rabbithole_thread_id, rabbithole_contribution_id, feed_rank_age_offset_hours")
        .in("id", postIds),
      supabase
        .from("posts")
        .select("id, post_as_user_id")
        .in("id", postIds),
      fetchFeedPostEnrichment(supabase, postIds),
    ]);

    const postAsUserIdByPostId = new Map<string, string | null>();
    if (!postAsRes.error) {
      for (const row of (postAsRes.data ?? []) as Array<{ id: string; post_as_user_id: string | null }>) {
        postAsUserIdByPostId.set(row.id, row.post_as_user_id ?? null);
      }
    }

    const authorUserIds = [
      ...new Set(initialPosts.map((post) => postAsUserIdByPostId.get(post.id) ?? post.user_id)),
    ];
    const profileRes =
      authorUserIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, first_name, last_name, photo_url, service, is_employer, is_pure_admin, email")
            .in("user_id", authorUserIds)
        : { data: [], error: null };

    if (legacyWithEvent.error) {
      console.error("Initial post media load error:", legacyWithEvent.error);
    }
    if (profileRes.error) {
      console.error("Initial profile load error:", profileRes.error);
    }

    const legacyPostImageMap = new Map<string, string | null>();
    const postGifMap = new Map<string, string | null>();
    const postOgMap = new Map<string, { og_url: string | null; og_title: string | null; og_description: string | null; og_image: string | null; og_site_name: string | null }>();
    const eventIdByPostId = new Map<string, string | null>();
    const postMetaMap = new Map<string, { content_type: string | null; system_generated: boolean | null; news_item_id: string | null; feed_rank_age_offset_hours: number }>();
    const verdictAtByPostId = new Map<string, string | null>();
    const rabbitholeThreadIdByPostId = new Map<string, string | null>();
    const rabbitholeContributionIdByPostId = new Map<string, string | null>();

    ((legacyWithEvent.data ?? []) as Array<LegacyPostRow & {
      court_verdict_at?: string | null;
      rabbithole_thread_id?: string | null;
      rabbithole_contribution_id?: string | null;
      feed_rank_age_offset_hours?: number | null;
    }>).forEach((row) => {
      legacyPostImageMap.set(row.id, row.image_url ?? null);
      postGifMap.set(row.id, row.gif_url ?? null);
      postOgMap.set(row.id, {
        og_url: row.og_url ?? null,
        og_title: row.og_title ?? null,
        og_description: row.og_description ?? null,
        og_image: row.og_image ?? null,
        og_site_name: row.og_site_name ?? null,
      });
      eventIdByPostId.set(row.id, row.event_id ?? null);
      postMetaMap.set(row.id, {
        content_type: row.content_type ?? null,
        system_generated: row.system_generated ?? null,
        news_item_id: row.news_item_id ?? null,
        feed_rank_age_offset_hours: Number(row.feed_rank_age_offset_hours ?? 0),
      });
      verdictAtByPostId.set(row.id, row.court_verdict_at ?? null);
      rabbitholeThreadIdByPostId.set(row.id, row.rabbithole_thread_id ?? null);
      rabbitholeContributionIdByPostId.set(row.id, row.rabbithole_contribution_id ?? null);
    });

    const multiPostImageMap = enrichment?.multiPostImageMap ?? new Map<string, string[]>();
    if (!enrichment) {
      const { data: postImagesData, error: postImagesError } = await supabase
        .from("post_images")
        .select("id, post_id, image_url, sort_order")
        .in("post_id", postIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (postImagesError) {
        console.error("Initial post images load error:", postImagesError);
      }
      ((postImagesData ?? []) as PostImageRow[]).forEach((row) => {
        const existing = multiPostImageMap.get(row.post_id) || [];
        existing.push(row.image_url);
        multiPostImageMap.set(row.post_id, existing);
      });
    }

    let reactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
    if (enrichment) {
      reactionRows = enrichment.postReactionRows;
    } else {
      try {
        reactionRows = await fetchContentReactionsForSubjects(supabase, "post", postIds);
      } catch (error) {
        console.error("Initial reactions load error:", error);
      }
    }
    const aggregatesMap = aggregatesBySubjectId(reactionRows, effectiveUserId);
    const commentCountMap = new Map<string, number>();
    if (enrichment) {
      enrichment.comments.forEach((comment) => {
        commentCountMap.set(comment.post_id, (commentCountMap.get(comment.post_id) ?? 0) + 1);
      });
    } else {
      const commentCountResult = await supabase
        .from("post_comments")
        .select("post_id, parent_comment_id")
        .in("post_id", postIds)
        .or("hidden_for_review.is.null,hidden_for_review.eq.false")
        .then(async (result) => {
          if (!result.error || !isMissingColumnError(result.error, "hidden_for_review")) return result;
          return supabase
            .from("post_comments")
            .select("post_id, parent_comment_id")
            .in("post_id", postIds);
        })
        .then(async (result) => {
          if (!result.error || !isMissingColumnError(result.error, "parent_comment_id")) return result;
          const fallback = await supabase
            .from("post_comments")
            .select("post_id")
            .in("post_id", postIds);
          return {
            ...fallback,
            data: (fallback.data ?? []).map((row) => ({ ...row, parent_comment_id: null })),
          };
        });
      if (commentCountResult.error) {
        console.error("Initial comment count load error:", commentCountResult.error);
      }
      ((commentCountResult.data ?? []) as { post_id: string; parent_comment_id?: string | null }[]).forEach((comment) => {
        commentCountMap.set(comment.post_id, (commentCountMap.get(comment.post_id) ?? 0) + 1);
      });
    }

    const profileNameMap = new Map<string, string>();
    const profilePhotoMap = new Map<string, string | null>();
    const profileServiceMap = new Map<string, string | null>();
    const profileEmployerMap = new Map<string, boolean | null>();
    const profilePureAdminMap = new Map<string, boolean | null>();
    const profilePublicMemberMap = new Map<string, boolean>();

    (profileRes.data as ProfileName[] | null)?.forEach((profile) => {
      const fullName =
        (profile.display_name?.trim() || null) ||
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        "User";
      profileNameMap.set(profile.user_id, fullName);
      profilePhotoMap.set(profile.user_id, profile.photo_url ?? null);
      profileServiceMap.set(profile.user_id, profile.service ?? null);
      profileEmployerMap.set(profile.user_id, profile.is_employer ?? null);
      profilePureAdminMap.set(profile.user_id, profile.is_pure_admin ?? null);
      profilePublicMemberMap.set(
        profile.user_id,
        hasPublicMemberProfile({
          email: profile.email,
          is_pure_admin: profile.is_pure_admin,
        }),
      );
    });

    enrichment?.profiles.forEach((profile) => {
      if (profileNameMap.has(profile.user_id)) return;
      const fullName =
        (profile.display_name?.trim() || null) ||
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        "User";
      profileNameMap.set(profile.user_id, fullName);
    });

    const initialFeedPosts = initialPosts.map((post) => {
      const agg = aggregatesMap.get(post.id) ?? emptyAggregate();
      const multiImages = multiPostImageMap.get(post.id) || [];
      const legacyImage = legacyPostImageMap.get(post.id) ?? null;
      const ogData = postOgMap.get(post.id);
      const postMeta = postMetaMap.get(post.id);
      const authorUserId = postAsUserIdByPostId.get(post.id) ?? post.user_id;

      return createFeedPostShell(post, {
        post_as_user_id: postAsUserIdByPostId.get(post.id) ?? null,
        image_url: legacyImage,
        image_urls: multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        gif_url: postGifMap.get(post.id) ?? null,
        content_type: postMeta?.content_type ?? "user_post",
        system_generated: postMeta?.system_generated ?? false,
        news_item_id: postMeta?.news_item_id ?? null,
        feed_rank_age_offset_hours: postMeta?.feed_rank_age_offset_hours ?? 0,
        authorUserId,
        authorName: profileNameMap.get(authorUserId) || "User",
        authorPhotoUrl: profilePhotoMap.get(authorUserId) || null,
        authorService: profileServiceMap.get(authorUserId) ?? null,
        authorIsEmployer: profileEmployerMap.get(authorUserId) ?? null,
        authorIsPureAdmin: profilePureAdminMap.get(authorUserId) ?? null,
        authorHasPublicMemberProfile: profilePublicMemberMap.get(authorUserId) ?? true,
        likeCount: agg.totalCount,
        commentCount: commentCountMap.get(post.id) ?? 0,
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(reactionRows, post.id, profileNameMap),
        og_url: ogData?.og_url ?? null,
        og_title: ogData?.og_title ?? null,
        og_description: ogData?.og_description ?? null,
        og_image: ogData?.og_image ?? null,
        og_site_name: ogData?.og_site_name ?? null,
        event_id: eventIdByPostId.get(post.id) ?? null,
        court_verdict_at: verdictAtByPostId.get(post.id) ?? null,
        rabbithole_thread_id: rabbitholeThreadIdByPostId.get(post.id) ?? null,
        rabbithole_contribution_id: rabbitholeContributionIdByPostId.get(post.id) ?? null,
        isInteractionHydrating: true,
      });
    });

    setPosts(initialFeedPosts);
    postsLoadedRef.current = true;
    setPostsLoaded(true);
    logPerf("home.loadPosts.initialBatch", perfStart, {
      rankedCount: rawPosts.length,
      renderedCount: initialFeedPosts.length,
      postIdsCount: postIds.length,
    });

    return {
      initialPosts,
      postAsUserIdByPostId,
      legacyPostImageMap,
      postGifMap,
      postOgMap,
      eventIdByPostId,
      postMetaMap,
      verdictAtByPostId,
      rabbitholeThreadIdByPostId,
      rabbitholeContributionIdByPostId,
      multiPostImageMap,
      reactionRows,
      enrichment,
      profileNameMap,
      profilePhotoMap,
      profileServiceMap,
      profileEmployerMap,
      profilePureAdminMap,
      profilePublicMemberMap,
    };
  }

  async function hydrateFromInitialCache(
    cache: InitialFeedBatchCache,
    effectiveUserId: string | null,
    effectiveBlockedUserIds: Set<string>,
  ): Promise<void> {
    const perfStart = perfNowMs();
    const rawPosts = cache.initialPosts;
    const postIds = rawPosts.map((post) => post.id);
    if (postIds.length === 0) return;

    const {
      postAsUserIdByPostId,
      legacyPostImageMap,
      postGifMap,
      postOgMap,
      eventIdByPostId,
      postMetaMap,
      verdictAtByPostId,
      rabbitholeThreadIdByPostId,
      rabbitholeContributionIdByPostId,
      multiPostImageMap,
      reactionRows,
      enrichment,
    } = cache;

    const profileNameMap = new Map(cache.profileNameMap);
    const profilePhotoMap = new Map(cache.profilePhotoMap);
    const profileServiceMap = new Map(cache.profileServiceMap);
    const profileEmployerMap = new Map(cache.profileEmployerMap);
    const profilePureAdminMap = new Map(cache.profilePureAdminMap);
    const profilePublicMemberMap = new Map(cache.profilePublicMemberMap);

    const mergeProfiles = (rows: ProfileName[] | null | undefined) => {
      (rows ?? []).forEach((profile) => {
        const fullName =
          (profile.display_name?.trim() || null) ||
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
          "User";
        if (!profileNameMap.has(profile.user_id)) {
          profileNameMap.set(profile.user_id, fullName);
        }
        if (!profilePhotoMap.has(profile.user_id)) {
          profilePhotoMap.set(profile.user_id, profile.photo_url ?? null);
        }
        if (!profileServiceMap.has(profile.user_id)) {
          profileServiceMap.set(profile.user_id, profile.service ?? null);
        }
        if (!profileEmployerMap.has(profile.user_id)) {
          profileEmployerMap.set(profile.user_id, profile.is_employer ?? null);
        }
        if (!profilePureAdminMap.has(profile.user_id)) {
          profilePureAdminMap.set(profile.user_id, profile.is_pure_admin ?? null);
        }
        if (!profilePublicMemberMap.has(profile.user_id)) {
          profilePublicMemberMap.set(
            profile.user_id,
            hasPublicMemberProfile({
              email: profile.email,
              is_pure_admin: profile.is_pure_admin,
            }),
          );
        }
      });
    };

    mergeProfiles(enrichment?.profiles as ProfileName[] | undefined);

    const newsItemIdsForPosts = [
      ...new Set(
        Array.from(postMetaMap.values())
          .map((meta) => meta.news_item_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const newsManualImageById = new Map<string, string | null>();
    if (newsItemIdsForPosts.length > 0) {
      const { data: newsImageRows, error: newsImageError } = await supabase
        .from("news_items")
        .select("id, admin_manual_image_url")
        .in("id", newsItemIdsForPosts);
      if (newsImageError) {
        console.error("News manual image override load error:", newsImageError);
      } else {
        ((newsImageRows ?? []) as Array<{ id: string; admin_manual_image_url: string | null }>).forEach((row) => {
          newsManualImageById.set(row.id, row.admin_manual_image_url ?? null);
        });
      }
    }

    const missingEventCandidates = rawPosts
      .filter((post) => !eventIdByPostId.get(post.id))
      .map((post) => ({
        postId: post.id,
        userId: post.user_id,
        postCreatedAt: post.created_at,
        eventTitle: extractLegacyEventTitle(post.content),
      }))
      .filter(
        (
          p,
        ): p is {
          postId: string;
          userId: string;
          postCreatedAt: string;
          eventTitle: string;
        } => Boolean(p.eventTitle),
      );

    if (missingEventCandidates.length > 0) {
      const candidateUserIds = [...new Set(missingEventCandidates.map((c) => c.userId))];
      const { data: candidateEvents, error: candidateEventsErr } = await supabase
        .from("events")
        .select("id, user_id, title, date")
        .in("user_id", candidateUserIds);
      if (candidateEventsErr) {
        console.error("Legacy event inference load error:", candidateEventsErr);
      } else {
        const grouped = new Map<string, Array<{ id: string; user_id: string; title: string; date: string }>>();
        ((candidateEvents ?? []) as Array<{ id: string; user_id: string; title: string; date: string }>).forEach((ev) => {
          const key = `${ev.user_id}::${normalizeEventTitle(ev.title)}`;
          const arr = grouped.get(key) ?? [];
          arr.push(ev);
          grouped.set(key, arr);
        });

        missingEventCandidates.forEach((candidate) => {
          const key = `${candidate.userId}::${normalizeEventTitle(candidate.eventTitle)}`;
          const matches = grouped.get(key) ?? [];
          if (matches.length === 0) return;
          const postTs = new Date(candidate.postCreatedAt).getTime();
          const best = [...matches].sort((a, b) => {
            const da = Math.abs(new Date(a.date).getTime() - postTs);
            const db = Math.abs(new Date(b.date).getTime() - postTs);
            return da - db;
          })[0];
          if (best?.id) eventIdByPostId.set(candidate.postId, best.id);
        });
      }
    }

    const rawComments: Comment[] = filterBlockedRows(
      enrichment ? (enrichment.comments as Comment[]) : (await loadCommentsForPosts(postIds, effectiveBlockedUserIds)).comments,
      effectiveBlockedUserIds,
      (comment) => comment.user_id,
    );

    const commentIds = rawComments.map((comment) => comment.id);

    let commentReactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
    if (enrichment) {
      commentReactionRows = enrichment.commentReactionRows;
    } else {
      try {
        commentReactionRows =
          commentIds.length > 0
            ? await fetchContentReactionsForSubjects(supabase, "post_comment", commentIds)
            : [];
      } catch (commentReactionsErr) {
        console.error("Comment reactions load error:", commentReactionsErr);
      }
    }

    const aggregatesMap = aggregatesBySubjectId(reactionRows, effectiveUserId);
    const commentAggregatesMap = aggregatesBySubjectId(commentReactionRows, effectiveUserId);

    const postLikerUserIds = reactionRows.map((l) => l.user_id);
    const commentReactorUserIds = commentReactionRows.map((l) => l.user_id);
    const uniqueUserIds = [
      ...new Set(rawPosts.map((post) => postAsUserIdByPostId.get(post.id) ?? post.user_id)),
    ];
    const missingProfileIds = [
      ...new Set(
        [
          ...uniqueUserIds,
          ...rawPosts.map((post) => postAsUserIdByPostId.get(post.id) ?? post.user_id),
          ...rawComments.map((comment) => comment.user_id),
          ...postLikerUserIds,
          ...commentReactorUserIds,
        ].filter((id): id is string => Boolean(id) && !profileNameMap.has(id)),
      ),
    ];

    if (missingProfileIds.length > 0) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, photo_url, service, is_employer, is_pure_admin, email")
        .in("user_id", missingProfileIds);
      if (profileError) {
        console.error("Profile name load error:", profileError);
      } else {
        mergeProfiles(profileData as ProfileName[] | null);
      }
    }

    const enrichedById = new Map<string, FeedComment>();
    rawComments.forEach((comment) => {
      const agg = commentAggregatesMap.get(comment.id) ?? emptyAggregate();
      enrichedById.set(comment.id, {
        ...comment,
        authorName: profileNameMap.get(comment.user_id) || "User",
        authorPhotoUrl: profilePhotoMap.get(comment.user_id) || null,
        authorService: profileServiceMap.get(comment.user_id) ?? null,
        authorIsEmployer: profileEmployerMap.get(comment.user_id) ?? null,
        likeCount: agg.totalCount,
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          commentReactionRows,
          comment.id,
          profileNameMap,
        ),
        replies: [],
        replyCount: 0,
      });
    });

    const commentsByPost = new Map<string, FeedComment[]>();
    rawComments.forEach((comment) => {
      const enriched = enrichedById.get(comment.id);
      if (!enriched) return;
      const isReply =
        comment.parent_comment_id != null &&
        enrichedById.has(comment.parent_comment_id);
      if (isReply) return;
      const existing = commentsByPost.get(comment.post_id) || [];
      existing.push(enriched);
      commentsByPost.set(comment.post_id, existing);
    });
    rawComments.forEach((comment) => {
      if (comment.parent_comment_id == null) return;
      const enriched = enrichedById.get(comment.id);
      const parent = enrichedById.get(comment.parent_comment_id);
      if (!enriched || !parent) return;
      parent.replies.push(enriched);
      parent.replyCount = parent.replies.length;
    });

    const uniqueFeedEventIds = [
      ...new Set(
        Array.from(eventIdByPostId.values()).filter((id): id is string => Boolean(id)),
      ),
    ];

    const eventSnapshotById = new Map<string, FeedEventSnapshot>();
    const eventAttCounts = new Map<string, { interested: number; going: number }>();
    const eventMyAttendance = new Map<string, "interested" | "going" | null>();
    const savedFeedEventIds = new Set<string>();

    if (uniqueFeedEventIds.length > 0) {
      const eventsResult = await supabase
        .from("events")
        .select("id, user_id, title, date, description, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, unit_id, visibility")
        .in("id", uniqueFeedEventIds);
      let eventRows: FeedEventSnapshot[] = [];
      if (
        eventsResult.error &&
        (
          isMissingColumnError(eventsResult.error, "image_url") ||
          isMissingColumnError(eventsResult.error, "description") ||
          isMissingColumnError(eventsResult.error, "location") ||
          isMissingColumnError(eventsResult.error, "event_time") ||
          isMissingColumnError(eventsResult.error, "poc_name") ||
          isMissingColumnError(eventsResult.error, "poc_phone")
        )
      ) {
        const fallback = await supabase
          .from("events")
          .select("id, user_id, title, date, organization, signup_url, unit_id, visibility")
          .in("id", uniqueFeedEventIds);
        if (fallback.error) {
          console.error("Feed events load error:", fallback.error);
        } else {
          eventRows = ((fallback.data ?? []) as Array<{
            id: string;
            user_id: string;
            title: string;
            date: string;
            organization: string | null;
            signup_url: string | null;
            unit_id?: string | null;
            visibility?: string | null;
          }>).map((row) => ({
            ...row,
            description: null as string | null,
            image_url: null as string | null,
            location: null as string | null,
            event_time: null as string | null,
            poc_name: null as string | null,
            poc_phone: null as string | null,
          }));
        }
      } else if (eventsResult.error) {
        console.error("Feed events load error:", eventsResult.error);
      } else {
        eventRows = (eventsResult.data ?? []) as FeedEventSnapshot[];
      }
      eventRows.forEach((e) => {
        eventSnapshotById.set(e.id, e);
      });

      const { data: attRows, error: attErr } = await supabase
        .from("event_attendance")
        .select("event_id, user_id, status")
        .in("event_id", uniqueFeedEventIds);
      if (attErr) {
        console.error("Feed event attendance load error:", attErr);
      } else {
        ((attRows ?? []) as { event_id: string; user_id: string; status: "interested" | "going" }[]).forEach((r) => {
          const cur = eventAttCounts.get(r.event_id) ?? { interested: 0, going: 0 };
          cur[r.status]++;
          eventAttCounts.set(r.event_id, cur);
          if (effectiveUserId && r.user_id === effectiveUserId) {
            eventMyAttendance.set(r.event_id, r.status);
          }
        });
      }

      if (effectiveUserId) {
        const { data: savedEv, error: savedErr } = await supabase
          .from("saved_events")
          .select("event_id")
          .eq("user_id", effectiveUserId)
          .in("event_id", uniqueFeedEventIds);
        if (savedErr) {
          console.error("Feed saved events load error:", savedErr);
        } else {
          ((savedEv ?? []) as { event_id: string }[]).forEach((r) => savedFeedEventIds.add(r.event_id));
        }
      }
    }

    const kcBundleByPostId = new Map<string, FeedKangarooBundle>();
    const kcDebug =
      typeof window !== "undefined" && window.localStorage?.getItem("eod_debug_kc") === "1";
    const kcViewerId = effectiveUserId;

    if (postIds.length > 0) {
      const { data: courtsRaw, error: courtsErr } = await supabase
        .from("kangaroo_courts")
        .select(
          "id, feed_post_id, unit_post_id, unit_id, opened_by, status, duration_hours, expires_at, closed_at, winning_option_id, total_votes, source, created_at",
        )
        .in("feed_post_id", postIds);

      if (courtsErr) {
        console.error("[KC] Phase A kangaroo_courts failed:", courtsErr.message, courtsErr);
      } else if (kcDebug) {
        console.info("[KC] courts rows:", (courtsRaw ?? []).length, courtsRaw);
      }

      const courtsList = (courtsRaw ?? []) as KangarooCourtRow[];
      if (!courtsErr && courtsList.length > 0) {
        const byPost = new Map<string, KangarooCourtRow[]>();
        for (const c of courtsList) {
          if (!c.feed_post_id) continue;
          const arr = byPost.get(c.feed_post_id) ?? [];
          arr.push(c);
          byPost.set(c.feed_post_id, arr);
        }

        const courtIds = courtsList.map((c) => c.id);

        const optsRes = await supabase
          .from("kangaroo_court_options")
          .select("id, court_id, label, sort_order")
          .in("court_id", courtIds)
          .order("sort_order", { ascending: true });
        const verdictsRes = await supabase
          .from("kangaroo_court_verdicts")
          .select("id, court_id, winning_option_id, winning_label_snapshot, total_votes, body, created_at")
          .in("court_id", courtIds);
        const voteTotalsRes = await supabase.rpc("kangaroo_court_vote_totals", {
          p_court_ids: courtIds,
        });
        const myVoteRes = kcViewerId
          ? await supabase
              .from("kangaroo_court_votes")
              .select("court_id, option_id")
              .in("court_id", courtIds)
              .eq("user_id", kcViewerId)
          : { data: [] as { court_id: string; option_id: string }[], error: null };

        if (optsRes.error) {
          console.error("[KC] Phase A kangaroo_court_options failed:", optsRes.error.message, optsRes.error);
        }
        if (verdictsRes.error) {
          console.error("[KC] Phase A kangaroo_court_verdicts failed:", verdictsRes.error.message, verdictsRes.error);
        }
        if (voteTotalsRes.error) {
          console.error("[KC] Phase A kangaroo_court_vote_totals failed:", voteTotalsRes.error.message, voteTotalsRes.error);
        }
        if (myVoteRes.error) {
          console.error("[KC] Phase B kangaroo_court_votes (mine) failed:", myVoteRes.error.message, myVoteRes.error);
        }

        if (!optsRes.error) {
          const optsByCourt = new Map<string, KangarooCourtOptionRow[]>();
          for (const o of (optsRes.data ?? []) as KangarooCourtOptionRow[]) {
            const arr = optsByCourt.get(o.court_id) ?? [];
            arr.push(o);
            optsByCourt.set(o.court_id, arr);
          }

          const verdictByCourt = new Map<string, KangarooCourtVerdictRow>();
          if (!verdictsRes.error) {
            for (const v of (verdictsRes.data ?? []) as KangarooCourtVerdictRow[]) {
              verdictByCourt.set(v.court_id, v);
            }
          }

          const voteCountsByCourt = voteTotalsRes.error
            ? new Map<string, Record<string, number>>()
            : voteCountsByCourtFromTotals((voteTotalsRes.data ?? []) as KangarooCourtVoteTotalRow[]);
          const myVoteByCourtId = new Map<string, string>();
          if (!myVoteRes.error) {
            for (const v of (myVoteRes.data ?? []) as { court_id: string; option_id: string }[]) {
              myVoteByCourtId.set(v.court_id, v.option_id);
            }
          }

          for (const [, courtArr] of byPost) {
            courtArr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const court = courtArr[0];
            const postKey = court.feed_post_id;
            if (!postKey) continue;

            const opts = optsByCourt.get(court.id) ?? [];
            const verdict = verdictByCourt.get(court.id) ?? null;
            const voteCounts = voteCountsByCourt.get(court.id) ?? {};
            const myVoteOptionId: string | null = myVoteByCourtId.get(court.id) ?? null;

            kcBundleByPostId.set(postKey, {
              court,
              options: opts,
              verdict,
              myVoteOptionId,
              voteCounts,
            });
          }
        }
      }
    }

    const mergedPosts: FeedPost[] = rawPosts.map((post) => {
      const agg = aggregatesMap.get(post.id) ?? emptyAggregate();
      const likesForPost = agg.userIds;
      const seenLiker = new Set<string>();
      const orderedLikerIds = likesForPost.filter((uid) => {
        if (seenLiker.has(uid)) return false;
        seenLiker.add(uid);
        return true;
      });
      const likers: PostLikerBrief[] = orderedLikerIds.map((uid) => ({
        userId: uid,
        name: profileNameMap.get(uid) || "User",
        photoUrl: profilePhotoMap.get(uid) ?? null,
        service: profileServiceMap.get(uid) ?? null,
        isEmployer: profileEmployerMap.get(uid) ?? null,
      }));
      const commentsForPost = commentsByPost.get(post.id) || [];
      const multiImages = multiPostImageMap.get(post.id) || [];
      const legacyImage = legacyPostImageMap.get(post.id) ?? null;
      const gifUrl = postGifMap.get(post.id) ?? null;
      const ogData = postOgMap.get(post.id);
      const postMeta = postMetaMap.get(post.id);

      const eid = eventIdByPostId.get(post.id) ?? null;
      const feedEvent = eid ? eventSnapshotById.get(eid) ?? null : null;
      const ac = eid ? eventAttCounts.get(eid) ?? { interested: 0, going: 0 } : { interested: 0, going: 0 };
      const myEvAtt = eid ? eventMyAttendance.get(eid) ?? null : null;
      const evSaved = Boolean(eid && effectiveUserId && savedFeedEventIds.has(eid));
      const authorUserId = postAsUserIdByPostId.get(post.id) ?? post.user_id;

      return {
        ...post,
        post_as_user_id: postAsUserIdByPostId.get(post.id) ?? null,
        image_url: legacyImage,
        image_urls: multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        gif_url: gifUrl,
        content_type: postMeta?.content_type ?? "user_post",
        system_generated: postMeta?.system_generated ?? false,
        news_item_id: postMeta?.news_item_id ?? null,
        feed_rank_age_offset_hours: postMeta?.feed_rank_age_offset_hours ?? 0,
        authorUserId,
        authorName: profileNameMap.get(authorUserId) || "User",
        authorPhotoUrl: profilePhotoMap.get(authorUserId) || null,
        authorService: profileServiceMap.get(authorUserId) ?? null,
        authorIsEmployer: profileEmployerMap.get(authorUserId) ?? null,
        authorIsPureAdmin: profilePureAdminMap.get(authorUserId) ?? null,
        authorHasPublicMemberProfile: profilePublicMemberMap.get(authorUserId) ?? true,
        likeCount: agg.totalCount,
        commentCount: commentsForPost.reduce((sum, c) => sum + 1 + c.replyCount, 0),
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          reactionRows,
          post.id,
          profileNameMap,
        ),
        likers,
        comments: commentsForPost,
        og_url: ogData?.og_url ?? null,
        og_title: ogData?.og_title ?? null,
        og_description: ogData?.og_description ?? null,
        og_image: ogData?.og_image ?? null,
        admin_manual_image_url: postMeta?.news_item_id
          ? newsManualImageById.get(postMeta.news_item_id) ?? null
          : null,
        og_site_name: ogData?.og_site_name ?? null,
        event_id: eid,
        feed_event: feedEvent,
        event_interested_count: ac.interested,
        event_going_count: ac.going,
        event_my_attendance: myEvAtt,
        event_saved: evSaved,
        kangaroo: kcBundleByPostId.get(post.id) ?? null,
        court_verdict_at: verdictAtByPostId.get(post.id) ?? null,
        rabbithole_thread_id: rabbitholeThreadIdByPostId.get(post.id) ?? null,
        rabbithole_contribution_id: rabbitholeContributionIdByPostId.get(post.id) ?? null,
        isInteractionHydrating: false,
      };
    });

    const authorAffinityBoost = new Map<string, number>();
    if (effectiveUserId) {
      const affinityResult = await supabase
        .from("profile_connections")
        .select("requester_user_id, target_user_id, requester_worked_with_target, target_worked_with_requester")
        .eq("status", "accepted")
        .or(`requester_user_id.eq.${effectiveUserId},target_user_id.eq.${effectiveUserId}`);
      const acceptedConnections = affinityResult.error &&
        String(affinityResult.error.message ?? "").toLowerCase().includes("requester_worked_with_target")
        ? await supabase
          .from("profile_connections")
          .select("requester_user_id, target_user_id, worked_with")
          .eq("status", "accepted")
          .or(`requester_user_id.eq.${effectiveUserId},target_user_id.eq.${effectiveUserId}`)
        : affinityResult;
      ((acceptedConnections.data ?? []) as {
        requester_user_id: string;
        target_user_id: string;
        worked_with?: boolean | null;
        requester_worked_with_target?: boolean | null;
        target_worked_with_requester?: boolean | null;
      }[]).forEach((row) => {
        const otherId =
          row.requester_user_id === effectiveUserId
            ? row.target_user_id
            : row.requester_user_id;
        const viewerWorkedWithAuthor = row.requester_user_id === effectiveUserId
          ? row.requester_worked_with_target === true
          : row.target_worked_with_requester === true;
        authorAffinityBoost.set(
          otherId,
          viewerWorkedWithAuthor || row.worked_with === true
            ? WORKED_WITH_AUTHOR_AFFINITY_MULTIPLIER
            : KNOWN_AUTHOR_AFFINITY_MULTIPLIER,
        );
      });
    }

    const feedSortOpts = { nowMs: Date.now(), authorAffinityBoost };
    mergedPosts.sort((a, b) => compareFeedPosts(a, b, feedSortOpts));
    const diversifiedPosts = diversifyFeedPosts(mergedPosts);

    setPosts(diversifiedPosts);
    logPerf("home.loadPosts.interactionHydrate", perfStart, {
      renderedCount: diversifiedPosts.length,
      postIdsCount: postIds.length,
    });
  }

  async function loadPosts(
    currentUserId?: string | null,
    options: { forceFullHydration?: boolean; limit?: number; blockedUserIds?: Set<string> } = {},
  ) {
    const perfStart = perfNowMs();
    const isInitialProgressiveLoad = !postsLoadedRef.current && !options.forceFullHydration;
    if (options.forceFullHydration && feedHydrationTimerRef.current) {
      window.clearTimeout(feedHydrationTimerRef.current);
      feedHydrationTimerRef.current = null;
    }
    const requestedLimit = Math.max(
      INITIAL_FEED_POST_LIMIT,
      options.limit ?? feedPostLimitRef.current,
    );
    const queryLimit = requestedLimit + FEED_QUERY_BUFFER;
    // Resolve user id from the live session first. Google OAuth often hydrates the Supabase session
    // before React `userId` updates; realtime loadPosts() can also close over a stale null userId.
    // Kangaroo Court (and other RLS paths) need a consistent id that matches the JWT.
    const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
    const effectiveUserId =
      session?.user?.id ?? currentUserId ?? userId ?? null;
    const effectiveBlockedUserIds = options.blockedUserIds ?? blockedUserIds;

    // Feed readiness should not wait on sidebar/highlight enrichment.
    void loadUnitFeedHighlightsForUser(effectiveUserId).catch((err) => {
      console.error("Unit feed highlights load error:", err);
      setUnitFeedHighlights([]);
    });

    let rankedPostsQuery = supabase
      .from("ranked_posts")
      .select("id, user_id, content, created_at, score, ranking_score")
      .lte("created_at", new Date().toISOString());

    rankedPostsQuery = rankedPostsQuery.limit(
      isInitialProgressiveLoad ? INITIAL_RANKED_POSTS_LIMIT : queryLimit,
    );

    const { data: rankedPostsData, error: postsError } = await rankedPostsQuery;

    if (postsError) {
      console.error("Feed load error:", postsError);
      logPerf("home.loadPosts.error", perfStart);
      return;
    }

    const fetchedRankedPostCount = (rankedPostsData ?? []).length;
    let rawPosts = (rankedPostsData ?? []) as RankedPostRow[];

    // Notification deep links use /?postId=ΓÇª; that post may not appear in ranked_posts anymore.
    if (typeof window !== "undefined") {
      const deepId = new URLSearchParams(window.location.search).get("postId");
      if (deepId && !rawPosts.some((p) => p.id === deepId)) {
        let deepQuery = await supabase
          .from("posts")
          .select("id, user_id, content, created_at, wall_user_id, hidden_for_review")
          .eq("id", deepId)
          .maybeSingle();
        if (deepQuery.error && isMissingColumnError(deepQuery.error, "hidden_for_review")) {
          deepQuery = await supabase
            .from("posts")
            .select("id, user_id, content, created_at, wall_user_id")
            .eq("id", deepId)
            .maybeSingle();
        }
        const deepRow = deepQuery.data as {
          id: string;
          user_id: string;
          content: string;
          created_at: string;
          wall_user_id?: string | null;
          hidden_for_review?: boolean | null;
        } | null;
        if (!deepQuery.error && deepRow && !deepRow.wall_user_id && !deepRow.hidden_for_review) {
          rawPosts = [
            {
              id: deepRow.id,
              user_id: deepRow.user_id,
              content: deepRow.content,
              created_at: deepRow.created_at,
              score: 0,
              ranking_score: 0,
            },
            ...rawPosts,
          ];
        } else {
          // Post is deleted, hidden for review, or a wall-only post ΓÇö it will never
          // appear in the public feed. Flag it so the scroll effect can clean up
          // the URL params instead of retrying forever.
          setDeepLinkPostUnavailable(deepId);
        }
      }
    }

    if (rawPosts.length > 0) {
      const rankedIds = rawPosts.map((p) => p.id);
      // Always strip wall-targeted posts from the public feed.
      const [wallQuery, visQuery] = await Promise.all([
        supabase
          .from("posts")
          .select("id, wall_user_id")
          .in("id", rankedIds),
        supabase
          .from("posts")
          .select("id, hidden_for_review")
          .in("id", rankedIds),
      ]);

      if (!wallQuery.error) {
        const publicFeedIds = new Set(
          (wallQuery.data ?? [])
            .filter((r: { wall_user_id?: string | null }) => !r.wall_user_id)
            .map((r: { id: string }) => r.id)
        );
        rawPosts = rawPosts.filter((p) => publicFeedIds.has(p.id));
      } else {
        console.warn("Wall visibility filter unavailable; loading feed without wall-target filter.", wallQuery.error.message);
      }

      if (!visQuery.error) {
        const visibleIds = new Set(
          (visQuery.data ?? [])
            .filter((r: { hidden_for_review?: boolean | null }) => !r.hidden_for_review)
            .map((r: { id: string }) => r.id)
        );
        rawPosts = rawPosts.filter((p) => visibleIds.has(p.id));
      } else {
        // Backward compatibility if hidden_for_review is not migrated yet.
        console.warn("Post visibility filter unavailable; loading feed without moderation hide filter.", visQuery.error.message);
      }
    }

    rawPosts = filterBlockedRows(rawPosts, effectiveBlockedUserIds, (post) => post.user_id);

    const hasMoreRankedPosts =
      rawPosts.length > requestedLimit || fetchedRankedPostCount >= (isInitialProgressiveLoad ? INITIAL_RANKED_POSTS_LIMIT : queryLimit);

    if (isInitialProgressiveLoad) {
      setFeedHasMore(hasMoreRankedPosts);

      if (rawPosts.length === 0) {
        setPosts([]);
        postsLoadedRef.current = true;
        setPostsLoaded(true);
        logPerf("home.loadPosts.empty", perfStart);
        return;
      }

      const initialCache = await loadInitialFeedBatch(rawPosts, effectiveUserId, perfStart, effectiveBlockedUserIds);

      if (feedHydrationTimerRef.current) {
        window.clearTimeout(feedHydrationTimerRef.current);
      }
      feedHydrationTimerRef.current = window.setTimeout(() => {
        feedHydrationTimerRef.current = null;
        void hydrateFromInitialCache(initialCache, effectiveUserId, effectiveBlockedUserIds).catch((err) =>
          console.error("Feed interaction hydration failed:", err),
        );
      }, FULL_FEED_HYDRATION_DELAY_MS);
      return;
    }

    rawPosts = rawPosts.slice(0, requestedLimit);
    setFeedHasMore(hasMoreRankedPosts);

    if (rawPosts.length === 0) {
      setPosts([]);
      postsLoadedRef.current = true;
      setPostsLoaded(true);
      logPerf("home.loadPosts.empty", perfStart);
      return;
    }

    const postIds = rawPosts.map((post) => post.id);

    const [legacyWithEvent, postAsRes, enrichment] = await Promise.all([
      supabase
        .from("posts")
        .select("id, image_url, gif_url, og_url, og_title, og_description, og_image, og_site_name, event_id, content_type, system_generated, news_item_id, feed_rank_age_offset_hours")
        .in("id", postIds),
      supabase
        .from("posts")
        .select("id, post_as_user_id")
        .in("id", postIds),
      fetchFeedPostEnrichment(supabase, postIds),
    ]);

    const postAsUserIdByPostId = new Map<string, string | null>();
    if (!postAsRes.error) {
      for (const row of (postAsRes.data ?? []) as Array<{ id: string; post_as_user_id: string | null }>) {
        postAsUserIdByPostId.set(row.id, row.post_as_user_id ?? null);
      }
    }

    const uniqueUserIds = [
      ...new Set(rawPosts.map((post) => postAsUserIdByPostId.get(post.id) ?? post.user_id)),
    ];

    let legacyPostImagesData: LegacyPostRow[] | null = legacyWithEvent.data as LegacyPostRow[] | null;
    if (legacyWithEvent.error) {
      const missingNewsMetaColumns =
        isMissingColumnError(legacyWithEvent.error, "content_type") ||
        isMissingColumnError(legacyWithEvent.error, "system_generated") ||
        isMissingColumnError(legacyWithEvent.error, "news_item_id") ||
        isMissingColumnError(legacyWithEvent.error, "feed_rank_age_offset_hours");

      if (missingNewsMetaColumns) {
        const fbWithEvent = await supabase
          .from("posts")
          .select("id, image_url, gif_url, og_url, og_title, og_description, og_image, og_site_name, event_id")
          .in("id", postIds);

        if (fbWithEvent.error && isMissingColumnError(fbWithEvent.error, "event_id")) {
          const fbNoEvent = await supabase
            .from("posts")
            .select("id, image_url, gif_url, og_url, og_title, og_description, og_image, og_site_name")
            .in("id", postIds);
          legacyPostImagesData = (fbNoEvent.data as LegacyPostRow[] | null)?.map((row) => ({
            ...row,
            event_id: null,
            content_type: null,
            system_generated: null,
            news_item_id: null,
          })) ?? null;
          if (fbNoEvent.error) {
            console.error("Legacy post image load error:", fbNoEvent.error);
          }
        } else {
          legacyPostImagesData = (fbWithEvent.data as LegacyPostRow[] | null)?.map((row) => ({
            ...row,
            content_type: null,
            system_generated: null,
            news_item_id: null,
          })) ?? null;
          if (fbWithEvent.error) {
            console.error("Legacy post image load error:", fbWithEvent.error);
          }
        }
      } else if (isMissingColumnError(legacyWithEvent.error, "event_id")) {
        const fb = await supabase
          .from("posts")
          .select("id, image_url, gif_url, og_url, og_title, og_description, og_image, og_site_name, content_type, system_generated, news_item_id")
          .in("id", postIds);
        legacyPostImagesData = (fb.data as LegacyPostRow[] | null)?.map((row) => ({
          ...row,
          event_id: null,
        })) ?? null;
        if (fb.error) {
          console.error("Legacy post image load error:", fb.error);
        }
      } else {
        console.error("Legacy post image load error:", legacyWithEvent.error);
      }
    }

    const legacyPostImageMap = new Map<string, string | null>();
    const postGifMap = new Map<string, string | null>();
    const postOgMap = new Map<string, { og_url: string | null; og_title: string | null; og_description: string | null; og_image: string | null; og_site_name: string | null }>();
    const eventIdByPostId = new Map<string, string | null>();
    const postMetaMap = new Map<string, { content_type: string | null; system_generated: boolean | null; news_item_id: string | null; feed_rank_age_offset_hours: number }>();
    ((legacyPostImagesData ?? []) as Array<LegacyPostRow & { feed_rank_age_offset_hours?: number | null }>).forEach((row) => {
      legacyPostImageMap.set(row.id, row.image_url ?? null);
      postGifMap.set(row.id, row.gif_url ?? null);
      postOgMap.set(row.id, { og_url: row.og_url ?? null, og_title: row.og_title ?? null, og_description: row.og_description ?? null, og_image: row.og_image ?? null, og_site_name: row.og_site_name ?? null });
      eventIdByPostId.set(row.id, row.event_id ?? null);
      postMetaMap.set(row.id, {
        content_type: row.content_type ?? null,
        system_generated: row.system_generated ?? null,
        news_item_id: row.news_item_id ?? null,
        feed_rank_age_offset_hours: Number(row.feed_rank_age_offset_hours ?? 0),
      });
    });

    const newsItemIdsForPosts = [
      ...new Set(
        Array.from(postMetaMap.values())
          .map((meta) => meta.news_item_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const newsManualImageById = new Map<string, string | null>();
    if (newsItemIdsForPosts.length > 0) {
      const { data: newsImageRows, error: newsImageError } = await supabase
        .from("news_items")
        .select("id, admin_manual_image_url")
        .in("id", newsItemIdsForPosts);
      if (newsImageError) {
        console.error("News manual image override load error:", newsImageError);
      } else {
        ((newsImageRows ?? []) as Array<{ id: string; admin_manual_image_url: string | null }>).forEach((row) => {
          newsManualImageById.set(row.id, row.admin_manual_image_url ?? null);
        });
      }
    }

    // Legacy resilience: older event feed posts can exist without posts.event_id.
    // Infer linkage by matching "📅 New Event: <title>" + same author.
    const missingEventCandidates = rawPosts
      .filter((post) => !eventIdByPostId.get(post.id))
      .map((post) => ({
        postId: post.id,
        userId: post.user_id,
        postCreatedAt: post.created_at,
        eventTitle: extractLegacyEventTitle(post.content),
      }))
      .filter(
        (
          p
        ): p is {
          postId: string;
          userId: string;
          postCreatedAt: string;
          eventTitle: string;
        } => Boolean(p.eventTitle)
      );

    if (missingEventCandidates.length > 0) {
      const candidateUserIds = [...new Set(missingEventCandidates.map((c) => c.userId))];
      const { data: candidateEvents, error: candidateEventsErr } = await supabase
        .from("events")
        .select("id, user_id, title, date")
        .in("user_id", candidateUserIds);
      if (candidateEventsErr) {
        console.error("Legacy event inference load error:", candidateEventsErr);
      } else {
        const grouped = new Map<string, Array<{ id: string; user_id: string; title: string; date: string }>>();
        ((candidateEvents ?? []) as Array<{ id: string; user_id: string; title: string; date: string }>).forEach((ev) => {
          const key = `${ev.user_id}::${normalizeEventTitle(ev.title)}`;
          const arr = grouped.get(key) ?? [];
          arr.push(ev);
          grouped.set(key, arr);
        });

        missingEventCandidates.forEach((candidate) => {
          const key = `${candidate.userId}::${normalizeEventTitle(candidate.eventTitle)}`;
          const matches = grouped.get(key) ?? [];
          if (matches.length === 0) return;
          const postTs = new Date(candidate.postCreatedAt).getTime();
          const best = [...matches].sort((a, b) => {
            const da = Math.abs(new Date(a.date).getTime() - postTs);
            const db = Math.abs(new Date(b.date).getTime() - postTs);
            return da - db;
          })[0];
          if (best?.id) eventIdByPostId.set(candidate.postId, best.id);
        });
      }
    }

    const multiPostImageMap = enrichment?.multiPostImageMap ?? new Map<string, string[]>();
    if (!enrichment) {
      const { data: postImagesData, error: postImagesError } = await supabase
        .from("post_images")
        .select("id, post_id, image_url, sort_order")
        .in("post_id", postIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (postImagesError) {
        console.error("Post images load error:", postImagesError);
      }

      ((postImagesData ?? []) as PostImageRow[]).forEach((row) => {
        const existing = multiPostImageMap.get(row.post_id) || [];
        existing.push(row.image_url);
        multiPostImageMap.set(row.post_id, existing);
      });
    }

    let reactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
    if (enrichment) {
      reactionRows = enrichment.postReactionRows;
    } else {
      try {
        reactionRows = await fetchContentReactionsForSubjects(supabase, "post", postIds);
      } catch (reactionsErr) {
        console.error("Reactions load error:", reactionsErr);
      }
    }

    const aggregatesMap = aggregatesBySubjectId(reactionRows, effectiveUserId);

    const rawComments: Comment[] = filterBlockedRows(
      enrichment ? enrichment.comments : (await loadCommentsForPosts(postIds, effectiveBlockedUserIds)).comments,
      effectiveBlockedUserIds,
      (comment) => comment.user_id,
    );

    const commentIds = rawComments.map((comment) => comment.id);

    let commentReactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
    if (enrichment) {
      commentReactionRows = enrichment.commentReactionRows;
    } else {
      try {
        commentReactionRows =
          commentIds.length > 0
            ? await fetchContentReactionsForSubjects(supabase, "post_comment", commentIds)
            : [];
      } catch (commentReactionsErr) {
        console.error("Comment reactions load error:", commentReactionsErr);
      }
    }

    const commentAggregatesMap = aggregatesBySubjectId(commentReactionRows, effectiveUserId);

    const postLikerUserIds = reactionRows.map((l) => l.user_id);
    const commentReactorUserIds = commentReactionRows.map((l) => l.user_id);

    const allProfileUserIds = [
      ...new Set(
        [
          ...uniqueUserIds,
          ...rawPosts.map((post) => postAsUserIdByPostId.get(post.id) ?? post.user_id),
          ...rawComments.map((comment) => comment.user_id),
          ...postLikerUserIds,
          ...commentReactorUserIds,
        ].filter((id): id is string => Boolean(id))
      ),
    ];

    const { data: profileData, error: profileError } =
      allProfileUserIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, first_name, last_name, photo_url, service, is_employer, is_pure_admin, email")
            .in("user_id", allProfileUserIds)
        : { data: [], error: null };

    if (profileError) {
      console.error("Profile name load error:", profileError);
    }

    const profileNameMap = new Map<string, string>();
    const profilePhotoMap = new Map<string, string | null>();
    const profileServiceMap = new Map<string, string | null>();
    const profileEmployerMap = new Map<string, boolean | null>();
    const profilePureAdminMap = new Map<string, boolean | null>();
    const profilePublicMemberMap = new Map<string, boolean>();

    (profileData as ProfileName[] | null)?.forEach((profile) => {
      // System / pure-admin accounts (EOD-HUB, RUMINT, etc.) intentionally
      // have no first_name/last_name — they carry a display_name instead.
      // Prefer display_name so those accounts never surface as "User".
      const fullName =
        (profile.display_name?.trim() || null) ||
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        "User";

      profileNameMap.set(profile.user_id, fullName);
      profilePhotoMap.set(profile.user_id, profile.photo_url ?? null);
      profileServiceMap.set(profile.user_id, profile.service ?? null);
      profileEmployerMap.set(profile.user_id, profile.is_employer ?? null);
      profilePureAdminMap.set(profile.user_id, profile.is_pure_admin ?? null);
      profilePublicMemberMap.set(
        profile.user_id,
        hasPublicMemberProfile({
          email: profile.email,
          is_pure_admin: profile.is_pure_admin,
        }),
      );
    });

    // Enrich every comment row (top-level and replies) into a FeedComment, keyed
    // by id, so we can assemble a one-level reply tree below.
    const enrichedById = new Map<string, FeedComment>();
    rawComments.forEach((comment) => {
      const agg = commentAggregatesMap.get(comment.id) ?? emptyAggregate();
      enrichedById.set(comment.id, {
        ...comment,
        authorName: profileNameMap.get(comment.user_id) || "User",
        authorPhotoUrl: profilePhotoMap.get(comment.user_id) || null,
        authorService: profileServiceMap.get(comment.user_id) ?? null,
        authorIsEmployer: profileEmployerMap.get(comment.user_id) ?? null,
        likeCount: agg.totalCount,
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          commentReactionRows,
          comment.id,
          profileNameMap,
        ),
        replies: [],
        replyCount: 0,
      });
    });

    const commentsByPost = new Map<string, FeedComment[]>();
    // First pass: register top-level comments (no parent, or parent missing/hidden).
    rawComments.forEach((comment) => {
      const enriched = enrichedById.get(comment.id);
      if (!enriched) return;
      const isReply =
        comment.parent_comment_id != null &&
        enrichedById.has(comment.parent_comment_id);
      if (isReply) return;
      const existing = commentsByPost.get(comment.post_id) || [];
      existing.push(enriched);
      commentsByPost.set(comment.post_id, existing);
    });
    // Second pass: attach replies to their top-level parent (one level deep).
    rawComments.forEach((comment) => {
      if (comment.parent_comment_id == null) return;
      const enriched = enrichedById.get(comment.id);
      const parent = enrichedById.get(comment.parent_comment_id);
      if (!enriched || !parent) return;
      parent.replies.push(enriched);
      parent.replyCount = parent.replies.length;
    });

    const uniqueFeedEventIds = [
      ...new Set(
        Array.from(eventIdByPostId.values()).filter((id): id is string => Boolean(id))
      ),
    ];

    const eventSnapshotById = new Map<string, FeedEventSnapshot>();
    const eventAttCounts = new Map<string, { interested: number; going: number }>();
    const eventMyAttendance = new Map<string, "interested" | "going" | null>();
    const savedFeedEventIds = new Set<string>();

    if (uniqueFeedEventIds.length > 0) {
      const eventsResult = await supabase
        .from("events")
        .select("id, user_id, title, date, description, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, unit_id, visibility")
        .in("id", uniqueFeedEventIds);
      let eventRows: FeedEventSnapshot[] = [];
      // Backward compatibility if image_url hasn't been migrated yet.
      if (
        eventsResult.error &&
        (
          isMissingColumnError(eventsResult.error, "image_url") ||
          isMissingColumnError(eventsResult.error, "description") ||
          isMissingColumnError(eventsResult.error, "location") ||
          isMissingColumnError(eventsResult.error, "event_time") ||
          isMissingColumnError(eventsResult.error, "poc_name") ||
          isMissingColumnError(eventsResult.error, "poc_phone")
        )
      ) {
        const fallback = await supabase
          .from("events")
          .select("id, user_id, title, date, organization, signup_url, unit_id, visibility")
          .in("id", uniqueFeedEventIds);
        if (fallback.error) {
          console.error("Feed events load error:", fallback.error);
        } else {
          eventRows = ((fallback.data ?? []) as Array<{
            id: string;
            user_id: string;
            title: string;
            date: string;
            organization: string | null;
            signup_url: string | null;
            unit_id?: string | null;
            visibility?: string | null;
          }>).map((row) => ({
            ...row,
            description: null as string | null,
            image_url: null as string | null,
            location: null as string | null,
            event_time: null as string | null,
            poc_name: null as string | null,
            poc_phone: null as string | null,
          }));
        }
      } else if (eventsResult.error) {
        console.error("Feed events load error:", eventsResult.error);
      } else {
        eventRows = (eventsResult.data ?? []) as FeedEventSnapshot[];
      }
      eventRows.forEach((e) => {
        eventSnapshotById.set(e.id, e);
      });

      const { data: attRows, error: attErr } = await supabase
        .from("event_attendance")
        .select("event_id, user_id, status")
        .in("event_id", uniqueFeedEventIds);
      if (attErr) {
        console.error("Feed event attendance load error:", attErr);
      } else {
        ((attRows ?? []) as { event_id: string; user_id: string; status: "interested" | "going" }[]).forEach((r) => {
          const cur = eventAttCounts.get(r.event_id) ?? { interested: 0, going: 0 };
          cur[r.status]++;
          eventAttCounts.set(r.event_id, cur);
          if (effectiveUserId && r.user_id === effectiveUserId) {
            eventMyAttendance.set(r.event_id, r.status);
          }
        });
      }

      if (effectiveUserId) {
        const { data: savedEv, error: savedErr } = await supabase
          .from("saved_events")
          .select("event_id")
          .eq("user_id", effectiveUserId)
          .in("event_id", uniqueFeedEventIds);
        if (savedErr) {
          console.error("Feed saved events load error:", savedErr);
        } else {
          ((savedEv ?? []) as { event_id: string }[]).forEach((r) => savedFeedEventIds.add(r.event_id));
        }
      }
    }

    const kcBundleByPostId = new Map<string, FeedKangarooBundle>();
    const verdictAtByPostId = new Map<string, string | null>();

    const rabbitholeThreadIdByPostId = new Map<string, string | null>();
    const rabbitholeContributionIdByPostId = new Map<string, string | null>();

    if (postIds.length > 0) {
      const bumpRes = await supabase
        .from("posts")
        .select("id, court_verdict_at, rabbithole_thread_id, rabbithole_contribution_id")
        .in("id", postIds);
      if (!bumpRes.error && bumpRes.data) {
        for (const row of bumpRes.data as {
          id: string;
          court_verdict_at: string | null;
          rabbithole_thread_id?: string | null;
          rabbithole_contribution_id?: string | null;
        }[]) {
          verdictAtByPostId.set(row.id, row.court_verdict_at ?? null);
          rabbitholeThreadIdByPostId.set(row.id, row.rabbithole_thread_id ?? null);
          rabbitholeContributionIdByPostId.set(row.id, row.rabbithole_contribution_id ?? null);
        }
      } else if (bumpRes.error) {
        // Fallback: rabbithole_thread_id column may not exist yet on older DBs.
        const bumpFallback = await supabase
          .from("posts")
          .select("id, court_verdict_at, rabbithole_contribution_id")
          .in("id", postIds);
        if (!bumpFallback.error && bumpFallback.data) {
          for (const row of bumpFallback.data as {
            id: string;
            court_verdict_at: string | null;
            rabbithole_contribution_id?: string | null;
          }[]) {
            verdictAtByPostId.set(row.id, row.court_verdict_at ?? null);
            rabbitholeContributionIdByPostId.set(row.id, row.rabbithole_contribution_id ?? null);
          }
        } else if (bumpFallback.error && !isMissingColumnError(bumpFallback.error, "court_verdict_at")) {
          console.error("[KC] court_verdict_at posts query:", bumpFallback.error.message, bumpFallback.error);
        }
      }
    }

    // --- Kangaroo Court: isolated from React userId; uses a fresh getSession() for JWT-backed RLS ---
    // Phase A: courts, options, verdicts, aggregate vote counts (metadata for all viewers with a session).
    // Phase B: myVoteOptionId only (viewer-specific); never gates whether bundles exist.
    const kcDebug =
      typeof window !== "undefined" && window.localStorage?.getItem("eod_debug_kc") === "1";
    const { data: kcAuth } = await getSupabaseSession({ source: "HomePage" });
    const kcViewerId = kcAuth.session?.user?.id ?? null;

    if (postIds.length > 0) {
      const { data: courtsRaw, error: courtsErr } = await supabase
        .from("kangaroo_courts")
        .select(
          "id, feed_post_id, unit_post_id, unit_id, opened_by, status, duration_hours, expires_at, closed_at, winning_option_id, total_votes, source, created_at"
        )
        .in("feed_post_id", postIds);

      if (courtsErr) {
        console.error("[KC] Phase A kangaroo_courts failed:", courtsErr.message, courtsErr);
      } else if (kcDebug) {
        console.info("[KC] courts rows:", (courtsRaw ?? []).length, courtsRaw);
      }

      const courtsList = (courtsRaw ?? []) as KangarooCourtRow[];
      if (!courtsErr && courtsList.length > 0) {
        const byPost = new Map<string, KangarooCourtRow[]>();
        for (const c of courtsList) {
          if (!c.feed_post_id) continue;
          const arr = byPost.get(c.feed_post_id) ?? [];
          arr.push(c);
          byPost.set(c.feed_post_id, arr);
        }

        const courtIds = courtsList.map((c) => c.id);

        const optsRes = await supabase
          .from("kangaroo_court_options")
          .select("id, court_id, label, sort_order")
          .in("court_id", courtIds)
          .order("sort_order", { ascending: true });
        const verdictsRes = await supabase
          .from("kangaroo_court_verdicts")
          .select("id, court_id, winning_option_id, winning_label_snapshot, total_votes, body, created_at")
          .in("court_id", courtIds);
        const voteTotalsRes = await supabase.rpc("kangaroo_court_vote_totals", {
          p_court_ids: courtIds,
        });
        const myVoteRes = kcViewerId
          ? await supabase
              .from("kangaroo_court_votes")
              .select("court_id, option_id")
              .in("court_id", courtIds)
              .eq("user_id", kcViewerId)
          : { data: [] as { court_id: string; option_id: string }[], error: null };

        if (optsRes.error) {
          console.error("[KC] Phase A kangaroo_court_options failed:", optsRes.error.message, optsRes.error);
        } else if (kcDebug) {
          console.info("[KC] options rows:", (optsRes.data ?? []).length);
        }
        if (verdictsRes.error) {
          console.error("[KC] Phase A kangaroo_court_verdicts failed:", verdictsRes.error.message, verdictsRes.error);
        } else if (kcDebug) {
          console.info("[KC] verdicts rows:", (verdictsRes.data ?? []).length);
        }
        if (voteTotalsRes.error) {
          console.error("[KC] Phase A kangaroo_court_vote_totals failed:", voteTotalsRes.error.message, voteTotalsRes.error);
        } else if (kcDebug) {
          console.info("[KC] vote total rows:", (voteTotalsRes.data ?? []).length);
        }
        if (myVoteRes.error) {
          console.error("[KC] Phase B kangaroo_court_votes (mine) failed:", myVoteRes.error.message, myVoteRes.error);
        }

        if (!optsRes.error) {
          const optsRaw = optsRes.data;
          const verdictsRaw = verdictsRes.data;

          const optsByCourt = new Map<string, KangarooCourtOptionRow[]>();
          for (const o of (optsRaw ?? []) as KangarooCourtOptionRow[]) {
            const arr = optsByCourt.get(o.court_id) ?? [];
            arr.push(o);
            optsByCourt.set(o.court_id, arr);
          }

          const verdictByCourt = new Map<string, KangarooCourtVerdictRow>();
          if (!verdictsRes.error) {
            for (const v of (verdictsRes.data ?? []) as KangarooCourtVerdictRow[]) {
              verdictByCourt.set(v.court_id, v);
            }
          }

          const voteCountsByCourt = voteTotalsRes.error
            ? new Map<string, Record<string, number>>()
            : voteCountsByCourtFromTotals((voteTotalsRes.data ?? []) as KangarooCourtVoteTotalRow[]);
          const myVoteByCourtId = new Map<string, string>();
          if (!myVoteRes.error) {
            for (const v of (myVoteRes.data ?? []) as { court_id: string; option_id: string }[]) {
              myVoteByCourtId.set(v.court_id, v.option_id);
            }
          }

          for (const [, courtArr] of byPost) {
            courtArr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const court = courtArr[0];
            const postKey = court.feed_post_id;
            if (!postKey) continue;

            const opts = optsByCourt.get(court.id) ?? [];
            const verdict = verdictByCourt.get(court.id) ?? null;
            const voteCounts = voteCountsByCourt.get(court.id) ?? {};
            const myVoteOptionId: string | null = myVoteByCourtId.get(court.id) ?? null;

            kcBundleByPostId.set(postKey, {
              court,
              options: opts,
              verdict,
              myVoteOptionId,
              voteCounts,
            });
          }
        }
      } else if (postIds.length > 0 && kcViewerId && !courtsErr && courtsList.length === 0 && kcDebug) {
        console.info("[KC] courts query returned 0 rows for these post ids (no KC or RLS empty)");
      }
    }

    if (kcDebug) {
      let withKc = 0;
      for (const id of postIds) {
        if (kcBundleByPostId.has(id)) withKc += 1;
      }
      console.info("[KC] final posts with kangaroo bundle:", withKc, "/", postIds.length);
    }

    const mergedPosts: FeedPost[] = rawPosts.map((post) => {
      const agg = aggregatesMap.get(post.id) ?? emptyAggregate();
      const likesForPost = agg.userIds;
      const seenLiker = new Set<string>();
      const orderedLikerIds = likesForPost.filter((uid) => {
        if (seenLiker.has(uid)) return false;
        seenLiker.add(uid);
        return true;
      });
      const likers: PostLikerBrief[] = orderedLikerIds.map((uid) => ({
        userId: uid,
        name: profileNameMap.get(uid) || "User",
        photoUrl: profilePhotoMap.get(uid) ?? null,
        service: profileServiceMap.get(uid) ?? null,
        isEmployer: profileEmployerMap.get(uid) ?? null,
      }));
      const commentsForPost = commentsByPost.get(post.id) || [];
      const multiImages = multiPostImageMap.get(post.id) || [];
      const legacyImage = legacyPostImageMap.get(post.id) ?? null;
      const gifUrl = postGifMap.get(post.id) ?? null;
      const ogData = postOgMap.get(post.id);
      const postMeta = postMetaMap.get(post.id);

      const eid = eventIdByPostId.get(post.id) ?? null;
      const feedEvent = eid ? eventSnapshotById.get(eid) ?? null : null;
      const ac = eid ? eventAttCounts.get(eid) ?? { interested: 0, going: 0 } : { interested: 0, going: 0 };
      const myEvAtt = eid ? eventMyAttendance.get(eid) ?? null : null;
      const evSaved = Boolean(eid && effectiveUserId && savedFeedEventIds.has(eid));

      return {
        ...post,
        post_as_user_id: postAsUserIdByPostId.get(post.id) ?? null,
        image_url: legacyImage,
        image_urls:
          multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        gif_url: gifUrl,
        content_type: postMeta?.content_type ?? "user_post",
        system_generated: postMeta?.system_generated ?? false,
        news_item_id: postMeta?.news_item_id ?? null,
        feed_rank_age_offset_hours: postMeta?.feed_rank_age_offset_hours ?? 0,
        authorUserId: postAsUserIdByPostId.get(post.id) ?? post.user_id,
        authorName: profileNameMap.get(postAsUserIdByPostId.get(post.id) ?? post.user_id) || "User",
        authorPhotoUrl: profilePhotoMap.get(postAsUserIdByPostId.get(post.id) ?? post.user_id) || null,
        authorService: profileServiceMap.get(postAsUserIdByPostId.get(post.id) ?? post.user_id) ?? null,
        authorIsEmployer: profileEmployerMap.get(postAsUserIdByPostId.get(post.id) ?? post.user_id) ?? null,
        authorIsPureAdmin: profilePureAdminMap.get(postAsUserIdByPostId.get(post.id) ?? post.user_id) ?? null,
        authorHasPublicMemberProfile: profilePublicMemberMap.get(postAsUserIdByPostId.get(post.id) ?? post.user_id) ?? true,
        likeCount: agg.totalCount,
        commentCount: commentsForPost.reduce(
          (sum, c) => sum + 1 + c.replyCount,
          0,
        ),
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          reactionRows,
          post.id,
          profileNameMap,
        ),
        likers,
        comments: commentsForPost,
        og_url: ogData?.og_url ?? null,
        og_title: ogData?.og_title ?? null,
        og_description: ogData?.og_description ?? null,
        og_image: ogData?.og_image ?? null,
        admin_manual_image_url: postMeta?.news_item_id
          ? newsManualImageById.get(postMeta.news_item_id) ?? null
          : null,
        og_site_name: ogData?.og_site_name ?? null,
        event_id: eid,
        feed_event: feedEvent,
        event_interested_count: ac.interested,
        event_going_count: ac.going,
        event_my_attendance: myEvAtt,
        event_saved: evSaved,
        kangaroo: kcBundleByPostId.get(post.id) ?? null,
        court_verdict_at: verdictAtByPostId.get(post.id) ?? null,
        rabbithole_thread_id: rabbitholeThreadIdByPostId.get(post.id) ?? null,
        rabbithole_contribution_id: rabbitholeContributionIdByPostId.get(post.id) ?? null,
      };
    });

    const authorAffinityBoost = new Map<string, number>();
    if (effectiveUserId) {
      // Confirmed Know relationships increase mutual feed visibility.
      // Worked-with is stronger only when the viewer marked that specific author.
      const affinityResult = await supabase
        .from("profile_connections")
        .select("requester_user_id, target_user_id, requester_worked_with_target, target_worked_with_requester")
        .eq("status", "accepted")
        .or(`requester_user_id.eq.${effectiveUserId},target_user_id.eq.${effectiveUserId}`);
      const acceptedConnections = affinityResult.error &&
        String(affinityResult.error.message ?? "").toLowerCase().includes("requester_worked_with_target")
        ? await supabase
          .from("profile_connections")
          .select("requester_user_id, target_user_id, worked_with")
          .eq("status", "accepted")
          .or(`requester_user_id.eq.${effectiveUserId},target_user_id.eq.${effectiveUserId}`)
        : affinityResult;
      ((acceptedConnections.data ?? []) as {
        requester_user_id: string;
        target_user_id: string;
        worked_with?: boolean | null;
        requester_worked_with_target?: boolean | null;
        target_worked_with_requester?: boolean | null;
      }[]).forEach((row) => {
        const otherId =
          row.requester_user_id === effectiveUserId
            ? row.target_user_id
            : row.requester_user_id;
        const viewerWorkedWithAuthor = row.requester_user_id === effectiveUserId
          ? row.requester_worked_with_target === true
          : row.target_worked_with_requester === true;
        authorAffinityBoost.set(
          otherId,
          viewerWorkedWithAuthor || row.worked_with === true
            ? WORKED_WITH_AUTHOR_AFFINITY_MULTIPLIER
            : KNOWN_AUTHOR_AFFINITY_MULTIPLIER,
        );
      });
    }

    // Rank: fresh posts float to top; staff posts soft-pin ~2h; RUMINT news ~3h.
    const feedSortOpts = { nowMs: Date.now(), authorAffinityBoost };
    mergedPosts.sort((a, b) => compareFeedPosts(a, b, feedSortOpts));
    const diversifiedPosts = diversifyFeedPosts(mergedPosts);

    setPosts(diversifiedPosts);
    postsLoadedRef.current = true;
    setPostsLoaded(true);
    logPerf("home.loadPosts", perfStart, {
      rankedCount: rawPosts.length,
      renderedCount: diversifiedPosts.length,
      postIdsCount: postIds.length,
      uniqueAuthors: uniqueUserIds.length,
      limit: requestedLimit,
      hasMore: hasMoreRankedPosts,
    });
  }

  function openPostImagePicker() {
    void openFeedMediaPicker({
      mediaInputRef: postImageInputRef,
      videoPdfInputRef: postVideoPdfInputRef,
      onFiles: addPostImagesFromFiles,
      remainingSlots: 10 - selectedPostImages.length,
    });
  }

  function missingCadPreviewTokens(items: SelectedPostImage[]): string[] {
    const fileTokens = new Set(
      items
        .filter((item) => item.kind === "cad3d" && item.cadRole === "file" && item.cadToken)
        .map((item) => item.cadToken as string),
    );
    const previewTokens = new Set(
      items
        .filter((item) => item.cadRole === "preview" && item.cadToken)
        .map((item) => item.cadToken as string),
    );
    return [...fileTokens].filter((token) => !previewTokens.has(token));
  }

  function addPostImagesFromFiles(files: File[]) {
    if (files.length === 0) return;

    setSelectedPostImages((prev) => {
      const remainingSlots = 10 - prev.length;

      if (remainingSlots <= 0) {
        alert("You can attach up to 10 files per post.");
        return prev;
      }

      const filesToAdd = files.slice(0, remainingSlots);

      if (files.length > remainingSlots) {
        alert("Only the first files were added. Max is 10 files per post.");
      }

      const pickError = validateFeedAttachmentPick(
        filesToAdd,
        currentFeedUploadLimits,
      );
      if (pickError) {
        alert(pickError);
        return prev;
      }

      const newItems: SelectedPostImage[] = filesToAdd.map((file) => {
        const kind = attachmentRenderKindFromFile(file);
        if (kind === "cad3d") {
          return {
            file,
            previewUrl: "",
            kind: "cad3d",
            cadRole: "file",
            cadToken: createCadAttachmentToken(),
          };
        }
        return {
          file,
          previewUrl: URL.createObjectURL(file),
          kind: kind === "pdf" ? "pdf" : kind === "video" ? "video" : kind === "image" ? "image" : "other",
        };
      });

      return [...prev, ...newItems];
    });
  }

  function addCadPreviewImagesFromFiles(files: File[]) {
    if (files.length === 0) return;

    setSelectedPostImages((prev) => {
      const missingTokens = missingCadPreviewTokens(prev);
      if (missingTokens.length === 0) {
        alert("All CAD/3D files already have previews.");
        return prev;
      }

      const validImages = files.filter((file) => isPreviewImageForCad(file));
      if (validImages.length === 0) {
        alert("Please choose a JPG, PNG, or WEBP preview image.");
        return prev;
      }

      const previewsToAdd = validImages.slice(0, missingTokens.length);
      const next = [...prev];

      previewsToAdd.forEach((file, index) => {
        const token = missingTokens[index];
        const pickError = validateImagePick(file);
        if (pickError) {
          alert(pickError);
          return;
        }
        next.push({
          file,
          previewUrl: URL.createObjectURL(file),
          kind: "image",
          cadRole: "preview",
          cadToken: token,
        });
      });

      if (validImages.length > missingTokens.length) {
        alert("Only required CAD preview images were added.");
      }

      return next;
    });
  }

  function handlePostImageChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    addPostImagesFromFiles(files);

    if (postImageInputRef.current) {
      postImageInputRef.current.value = "";
    }
  }

  function handlePostImagePaste(e: React.ClipboardEvent) {
    handlePasteImageFromClipboard(e, addPostImagesFromFiles);
  }

  function removeSelectedPostImage(indexToRemove: number) {
    setSelectedPostImages((prev) => {
      const itemToRemove = prev[indexToRemove];
      if (itemToRemove?.previewUrl) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }
      if (itemToRemove?.kind === "cad3d" && itemToRemove.cadToken) {
        return prev.filter((item, index) => {
          if (index === indexToRemove) return false;
          if (item.cadToken === itemToRemove.cadToken) {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return false;
          }
          return true;
        });
      }
      return prev.filter((_, index) => index !== indexToRemove);
    });
  }

  function clearSelectedPostImages() {
    setSelectedPostImages((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });

    if (postImageInputRef.current) {
      postImageInputRef.current.value = "";
    }
  }

  function handleContentChange(value: string) {
    setContent(value);
    const url = extractFirstUrl(value);
    if (!url) { setOgPreview(null); return; }
    if (ogPreview?.url === url) return;
    if (ogDebounceRef.current) clearTimeout(ogDebounceRef.current);
    ogDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingOg(true);
        const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
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
          if (data.title || data.image) setOgPreview({ url, title: data.title ?? null, description: data.description ?? null, image: data.image ?? null, siteName: data.siteName ?? null });
          else setOgPreview(null);
        }
      } catch { /* ignore */ } finally { setFetchingOg(false); }
    }, 800);
  }

  function openCommentImagePicker(postId: string) {
    commentImageInputRefs.current[postId]?.click();
  }

  function attachCommentImage(postId: string, file: File) {
    const pickError = validateImagePick(file);
    if (pickError) {
      alert(pickError);
      if (commentImageInputRefs.current[postId]) {
        commentImageInputRefs.current[postId]!.value = "";
      }
      return;
    }

    setSelectedCommentImages((prev) => {
      const existing = prev[postId];
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      return {
        ...prev,
        [postId]: {
          file,
          previewUrl: URL.createObjectURL(file),
        },
      };
    });

    if (commentImageInputRefs.current[postId]) {
      commentImageInputRefs.current[postId]!.value = "";
    }
  }

  function handleCommentImageChange(
    postId: string,
    e: ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    attachCommentImage(postId, file);
  }

  function handleCommentImagePaste(postId: string, e: React.ClipboardEvent) {
    handlePasteImageFromClipboard(e, (files) => {
      if (files[0]) attachCommentImage(postId, files[0]);
    }, { imagesOnly: true });
  }

  function clearSelectedCommentImage(postId: string) {
    setSelectedCommentImages((prev) => {
      const existing = prev[postId];
      if (existing) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      return {
        ...prev,
        [postId]: null,
      };
    });

    if (commentImageInputRefs.current[postId]) {
      commentImageInputRefs.current[postId]!.value = "";
    }
  }

  async function uploadFileToFeedImagesBucket(
    file: File,
    pathPrefix: string,
    forcedFileName?: string,
  ): Promise<string> {
    const prepared = await prepareFeedUploadFile(file, {
      accountType: currentUserAccountType,
    });
    if (!prepared.ok) throw new Error(prepared.error);
    file = prepared.file;

    const safeFileName = forcedFileName ?? `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = `${pathPrefix}/${safeFileName}`;

    if (isVideoFile(file)) {
      await uploadResumableFeedFile(file, filePath);
    } else {
      const { error: uploadError } = await supabase.storage
        .from("feed-images")
        .upload(filePath, file, {
          upsert: false,
        });

      if (uploadError) {
        console.error("Storage upload error:", uploadError);
        throw new Error(uploadError.message);
      }
    }

    const { data } = supabase.storage.from("feed-images").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function submitPost() {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    const labelsForKc = [kcOpt1, kcOpt2, kcOpt3, kcOpt4].map((s) => s.trim()).filter(Boolean);
    if (kcComposerPhase === "confirm") {
      alert('Use "Start Court" to add poll options, or click the judge again to cancel Kangaroo Court.');
      return;
    }
    if (kcComposerPhase === "builder") {
      if (labelsForKc.length < 2 || labelsForKc.length > 4) {
        alert("Enter between 2 and 4 options for Kangaroo Court.");
        return;
      }
    }

    if (!content.trim() && selectedPostImages.length === 0 && !selectedPostGif) return;

    const postAsUserId = resolvePostAsUserIdForSubmit(postAsMode, postAsAdminProfile?.userId ?? null);
    const actorName =
      postAsMode === "admin" && postAsAdminProfile
        ? postAsAdminProfile.displayName
        : (currentUserName ?? "Someone");

    try {
      setSubmittingPost(true);

      const contentToPost = (contentRawRef.current || content).trim();
      const imagesToUpload = [...selectedPostImages];
      const gifToPost = selectedPostGif;
      const missingCadTokens = missingCadPreviewTokens(imagesToUpload);
      if (missingCadTokens.length > 0) {
        alert("Each CAD/3D file needs a preview image (JPG, PNG, or WEBP) before posting.");
        setSubmittingPost(false);
        return;
      }

      const currentOg = ogPreview;

      if (kcComposerPhase === "builder" && labelsForKc.length >= 2) {
        const uploadedUrls: string[] = [];
        const uploadPrefix = `${userId}/posts/kc-${Date.now()}`;
        for (let i = 0; i < imagesToUpload.length; i += 1) {
          const item = imagesToUpload[i];
          const forcedFileName =
            item.cadToken && item.cadRole
              ? buildCadStorageFileName(item.cadToken, item.cadRole, item.file.name)
              : undefined;
          const publicUrl = await uploadFileToFeedImagesBucket(item.file, uploadPrefix, forcedFileName);
          uploadedUrls.push(publicUrl);
        }

        const { data: kcRpcData, error: kcRpcError } = await supabase.rpc("create_feed_post_with_kangaroo_court", {
          p_content: contentToPost,
          p_gif_url: gifToPost ?? "",
          p_og_url: currentOg?.url ?? "",
          p_og_title: currentOg?.title ?? "",
          p_og_description: currentOg?.description ?? "",
          p_og_image: currentOg?.image ?? "",
          p_og_site_name: currentOg?.siteName ?? "",
          p_image_urls: uploadedUrls,
          p_option_labels: labelsForKc,
          p_duration_hours: kcComposerDuration,
          p_post_as_user_id: postAsUserId,
        });

        if (kcRpcError || kcRpcData == null) {
          console.error("create_feed_post_with_kangaroo_court:", kcRpcError);
          alert(kcRpcError?.message || "Failed to create post with Kangaroo Court.");
          setSubmittingPost(false);
          return;
        }

        const kcRow = Array.isArray(kcRpcData) ? kcRpcData[0] : kcRpcData;
        const postId = (kcRow as { post_id: string }).post_id;

        const mentionIds = extractMentionIds(contentToPost).filter((id) => id !== userId);
        if (mentionIds.length > 0) {
          await Promise.all(
            mentionIds.map((uid) =>
              postNotifyJson(supabase, {
                user_id: uid,
                actor_name: actorName,
                post_owner_id: userId,
                type: "mention_post",
                category: "social",
                post_id: postId,
                message: `${actorName} mentioned you in a post`,
                link: `/?postId=${encodeURIComponent(postId)}`,
                group_key: `post:${postId}:mentions`,
                dedupe_key: `mention_post:${postId}:${uid}`,
                metadata: { feed: true, post_id: postId },
              }),
            ),
          );
        }

        setContent("");
        contentRawRef.current = "";
        setOgPreview(null);
        clearSelectedPostImages();
        setSelectedPostGif(null);
        resetKcComposer();
        setSubmittingPost(false);
        void loadPosts();
        void refreshPlankHolderChallenge();
        return;
      }

      const { data: insertedPost, error: insertError } = await supabase
        .from("posts")
        .insert([
          {
            user_id: userId,
            post_as_user_id: postAsUserId,
            content: contentToPost,
            image_url: null,
            gif_url: gifToPost ?? null,
            og_url: currentOg?.url ?? null,
            og_title: currentOg?.title ?? null,
            og_description: currentOg?.description ?? null,
            og_image: currentOg?.image ?? null,
            og_site_name: currentOg?.siteName ?? null,
          },
        ])
        .select("id")
        .single();

      if (insertError || !insertedPost?.id) {
        console.error("INSERT ERROR:", insertError);
        alert(insertError?.message || "Failed to create post.");
        setSubmittingPost(false);
        return;
      }

      const postId = insertedPost.id;

      // Mention notifications
      const mentionIds = extractMentionIds(contentToPost).filter(id => id !== userId);
      if (mentionIds.length > 0) {
        await Promise.all(
          mentionIds.map((uid) =>
            postNotifyJson(supabase, {
              user_id: uid,
              actor_name: actorName,
              post_owner_id: userId,
              type: "mention_post",
              category: "social",
              post_id: postId,
              message: `${actorName} mentioned you in a post`,
              link: `/?postId=${encodeURIComponent(postId)}`,
              group_key: `post:${postId}:mentions`,
              dedupe_key: `mention_post:${postId}:${uid}`,
              metadata: { feed: true, post_id: postId },
            }),
          ),
        );
      }
      const uploadedUrls: string[] = [];

      for (let i = 0; i < imagesToUpload.length; i += 1) {
        const item = imagesToUpload[i];
        const forcedFileName =
          item.cadToken && item.cadRole
            ? buildCadStorageFileName(item.cadToken, item.cadRole, item.file.name)
            : undefined;
        const publicUrl = await uploadFileToFeedImagesBucket(
          item.file,
          `${userId}/posts/${postId}`,
          forcedFileName,
        );
        uploadedUrls.push(publicUrl);
      }

      if (uploadedUrls.length > 0) {
        const postImageRows = uploadedUrls.map((url, index) => ({
          post_id: postId,
          image_url: url,
          sort_order: index,
        }));

        const { error: postImagesInsertError } = await supabase
          .from("post_images")
          .insert(postImageRows);

        if (postImagesInsertError) {
          console.error("POST IMAGES INSERT ERROR:", postImagesInsertError);
          alert(postImagesInsertError.message);
          setSubmittingPost(false);
          return;
        }

        const { error: legacyUpdateError } = await supabase
          .from("posts")
          .update({ image_url: uploadedUrls[0] })
          .eq("id", postId);

        if (legacyUpdateError) {
          console.error("LEGACY IMAGE UPDATE ERROR:", legacyUpdateError);
        }
      }

      setContent("");
      contentRawRef.current = "";
      setOgPreview(null);
      clearSelectedPostImages();
      setSelectedPostGif(null);
      resetKcComposer();
      setSubmittingPost(false);

      void loadPosts();
      void refreshPlankHolderChallenge();
    } catch (err) {
      console.error("submitPost crashed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Something went wrong while posting."
      );
      setSubmittingPost(false);
    }
  }

  function handleBizUrlChange(value: string) {
    setBizUrl(value);
    setBizOgPreview(null);
    const url = value.trim() ? normalizeUrl(value.trim()) : null;
    if (!url) return;
    if (bizOgDebounceRef.current) clearTimeout(bizOgDebounceRef.current);
    bizOgDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingBizOg(true);
        const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
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
      } catch { /* ignore */ } finally { setFetchingBizOg(false); }
    }, 800);
  }

  async function submitBizListing() {
    if (!userId) { window.location.href = "/login"; return; }
    if (blockMemberInteraction()) return;
    const url = normalizeUrl(bizUrl.trim());
    if (!url || !bizName.trim()) return;
    try {
      setSubmittingBiz(true);
      const tagList = normalizeBizTagsInput(bizTags);
      for (const x of tagList) rememberCustomBizTag(x);
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
        tags: tagList,
      };
      let { error } = await supabase.from("business_listings").insert([{ ...basePayload, listing_type: bizType }]);
      if (error && isBizListingTagsMissingColumnError(error)) {
        const { tags: _drop, ...noTags } = basePayload;
        const r2 = await supabase.from("business_listings").insert([{ ...noTags, listing_type: bizType }]);
        error = r2.error;
        if (error && isBizListingTypeMissingColumnError(error)) {
          const r3 = await supabase.from("business_listings").insert([noTags]);
          error = r3.error;
        }
      } else if (error && isBizListingTypeMissingColumnError(error)) {
        const r2 = await supabase.from("business_listings").insert([basePayload]);
        error = r2.error;
        if (error && isBizListingTagsMissingColumnError(error)) {
          const { tags: _drop, ...noTags } = basePayload;
          const r3 = await supabase.from("business_listings").insert([noTags]);
          error = r3.error;
        }
      } else if (error) { alert(error.message); return; }
      if (error) { alert(error.message); return; }
      setBizSubmitSuccess(true);
      setBizUrl(""); setBizName(""); setBizBlurb(""); setBizType("business"); setBizTags([]); setBizOgPreview(null);
      setTimeout(() => { setBizSubmitSuccess(false); setShowBizForm(false); }, 3000);
    } finally { setSubmittingBiz(false); }
  }

  async function notify(
    recipientId: string,
    message: string,
    postOwnerId: string,
    extra?: {
      type?: string;
      post_id?: string | null;
      comment_id?: string | null;
      parent_entity_id?: string | null;
    },
  ) {
    if (!userId || recipientId === userId) return;
    const actorName = currentUserName?.trim() || "Someone";
    const commentId = extra?.comment_id ?? null;
    const parentEntityId = extra?.parent_entity_id ?? commentId;
    return postNotifyJson(supabase, {
      user_id: recipientId,
      message,
      post_owner_id: postOwnerId,
      type: extra?.type ?? "feed_activity",
      category: "social",
      post_id: extra?.post_id ?? null,
      link: extra?.post_id
        ? `/?postId=${encodeURIComponent(extra.post_id)}${commentId ? `&commentId=${encodeURIComponent(commentId)}` : ""}`
        : null,
      group_key: extra?.post_id
        ? `post:${extra.post_id}:${extra?.type ?? "feed_activity"}`
        : `feed:${extra?.type ?? "activity"}`,
      dedupe_key: extra?.post_id
        ? `${extra?.type ?? "feed_activity"}:${extra.post_id}:${commentId ?? "post"}:${userId}`
        : `${extra?.type ?? "feed_activity"}:${recipientId}:${userId}`,
      parent_entity_type: parentEntityId ? "comment" : null,
      parent_entity_id: parentEntityId ?? null,
      actor_name: actorName,
      metadata: {
        feed: true,
        ...(commentId ? { comment_id: commentId } : {}),
      },
    });
  }

  async function handleFeedPostReaction(postId: string, picked: ReactionType) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    try {
      setTogglingLikeFor(postId);
      cancelDelayedLikeNotify(`feed:post:${postId}:${userId}`);

      const priorReaction = postsRef.current.find((p) => p.id === postId)?.myReaction ?? null;

      await applyContentReaction(supabase, {
        subjectKind: "post",
        subjectId: postId,
        userId,
        picked,
      });

      if (picked === "like" && priorReaction !== "like") {
        let postRow = posts.find((p) => p.id === postId);
        if (!postRow) {
          const { data: row } = await supabase.from("posts").select("user_id").eq("id", postId).maybeSingle();
          if (row?.user_id) {
            postRow = { user_id: row.user_id } as FeedPost;
          }
        }
        const actorName = currentUserName?.trim() || "Someone";
        if (postRow && postRow.user_id !== userId) {
          const recipientId = postRow.user_id;
          scheduleDelayedLikeNotify(`feed:post:${postId}:${userId}`, () => {
            const p = postsRef.current.find((x) => x.id === postId);
            if (p?.myReaction !== "like") return;
            return notify(recipientId, `${actorName} liked your post`, recipientId, { type: "feed_like", post_id: postId });
          });
        }
      }

      await loadPosts();
      void refreshPlankHolderChallenge();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingLikeFor(null);
    }
  }

  async function handleFeedCommentReaction(commentId: string, picked: ReactionType) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    try {
      setTogglingCommentLikeFor(commentId);
      cancelDelayedLikeNotify(`feed:comment:${commentId}:${userId}`);

      const allCurrentComments = postsRef.current.flatMap((p) =>
        p.comments.flatMap((c) => [c, ...(c.replies ?? [])]),
      );
      const priorReaction = allCurrentComments.find((c) => c.id === commentId)?.myReaction ?? null;

      await applyContentReaction(supabase, {
        subjectKind: "post_comment",
        subjectId: commentId,
        userId,
        picked,
      });

      if (picked === "like" && priorReaction !== "like") {
        const comment = posts
          .flatMap((p) => p.comments.flatMap((c) => [c, ...(c.replies ?? [])]))
          .find((c) => c.id === commentId);
        if (comment && comment.user_id !== userId) {
          const ownerPost = posts.find((p) => p.id === comment.post_id);
          if (ownerPost) {
            const actorName = currentUserName?.trim() || "Someone";
            const postIdForComment = comment.post_id;
            const ownerId = ownerPost.user_id;
            const recipientCommentUserId = comment.user_id;
            scheduleDelayedLikeNotify(`feed:comment:${commentId}:${userId}`, () => {
              const p = postsRef.current.find((x) => x.id === postIdForComment);
              const c = p?.comments
                .flatMap((x) => [x, ...(x.replies ?? [])])
                .find((x) => x.id === commentId);
              if (c?.myReaction !== "like") return;
              return notify(recipientCommentUserId, `${actorName} liked your comment`, ownerId, {
                type: "feed_comment_like",
                post_id: postIdForComment,
                comment_id: commentId,
              });
            });
          }
        }
      }

      await loadPosts();
      void refreshPlankHolderChallenge();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingCommentLikeFor(null);
    }
  }

  async function submitComment(postId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    const commentText = (commentRawsRef.current[postId] || commentInputs[postId] || "").trim();
    const selectedCommentImage = selectedCommentImages[postId] || null;
    const commentGif = selectedCommentGifs[postId] || null;

    if (!commentText && !selectedCommentImage && !commentGif) return;

    try {
      setSubmittingCommentFor(postId);

      let imageUrl: string | null = null;

      if (selectedCommentImage) {
        imageUrl = await Promise.race<string>([
          uploadFileToFeedImagesBucket(
            selectedCommentImage.file,
            `${userId}/comments/${postId}`
          ),
          new Promise<string>((_, reject) =>
            setTimeout(
              () => reject(new Error("Comment image upload timed out.")),
              20000
            )
          ),
        ]);
      }

      let insertError: {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      } | null = null;

      let insertedCommentId: string | null = null;

      const insertWithImage = await supabase.from("post_comments").insert([
        {
          post_id: postId,
          user_id: userId,
          content: commentText,
          image_url: imageUrl,
          gif_url: commentGif,
        },
      ]).select("id").single();

      insertError = insertWithImage.error;
      if (!insertError && insertWithImage.data?.id) {
        insertedCommentId = insertWithImage.data.id;
      }

      if (insertError && isMissingColumnError(insertError, "image_url")) {
        const fallbackInsert = await supabase.from("post_comments").insert([
          {
            post_id: postId,
            user_id: userId,
            content: commentText,
          },
        ]).select("id").single();

        insertError = fallbackInsert.error;
        if (!insertError && fallbackInsert.data?.id) {
          insertedCommentId = fallbackInsert.data.id;
        }

        if (!insertError && selectedCommentImage) {
          alert(
            "Your comment posted, but the database is not fully set up for comment images yet."
          );
        }
      }

      if (insertError) {
        console.error("Comment insert error:", insertError);
        alert(insertError.message || "Failed to post comment.");
        return;
      }

      // Mention notifications
      const mentionIds = extractMentionIds(commentText).filter(id => id !== userId);
      if (mentionIds.length > 0) {
        const post = posts.find((p) => p.id === postId);
        const ownerId = post?.user_id ?? userId;
        const meta: Record<string, unknown> = { feed: true };
        if (insertedCommentId) meta.comment_id = insertedCommentId;
        await Promise.all(
          mentionIds.map((uid) =>
            postNotifyJson(supabase, {
              user_id: uid,
              actor_name: currentUserName ?? "Someone",
              post_owner_id: ownerId,
              type: "mention_comment",
              category: "social",
              post_id: postId,
              parent_entity_type: "comment",
              parent_entity_id: insertedCommentId,
              message: `${currentUserName ?? "Someone"} mentioned you in a comment`,
              link: `/?postId=${encodeURIComponent(postId)}${insertedCommentId ? `&commentId=${encodeURIComponent(insertedCommentId)}` : ""}`,
              group_key: `post:${postId}:mentions`,
              dedupe_key: insertedCommentId ? `mention_comment:${insertedCommentId}:${uid}` : `mention_comment:${postId}:${uid}`,
              metadata: meta,
            }),
          ),
        );
      }

      setCommentInputs((prev) => ({
        ...prev,
        [postId]: "",
      }));
      commentRawsRef.current[postId] = "";

      clearSelectedCommentImage(postId);
      setSelectedCommentGifs((prev) => ({ ...prev, [postId]: null }));

      setExpandedComments((prev) => ({
        ...prev,
        [postId]: true,
      }));

      // Notifications (await delivery so failures are not silent)
      const post = posts.find((p) => p.id === postId);
      if (post && userId) {
        const actorName = currentUserName?.trim() || "Someone";
        const tasks: Promise<unknown>[] = [];
        if (post.user_id !== userId) {
          tasks.push(
            notify(post.user_id, `${actorName} commented on your post`, post.user_id, {
              type: "feed_comment",
              post_id: postId,
              comment_id: insertedCommentId,
            }),
          );
        }
        const { data: td } = await supabase.from("post_comments").select("user_id").eq("post_id", postId).neq("user_id", userId);
        const participants = [...new Set(((td ?? []) as { user_id: string }[]).map((c) => c.user_id))].filter((id) => id !== post.user_id);
        for (const pid of participants) {
          tasks.push(
            notify(pid, `${actorName} also commented on a post you're following`, post.user_id, {
              type: "feed_comment_thread",
              post_id: postId,
              comment_id: insertedCommentId,
            }),
          );
        }
        await Promise.all(tasks);
      }

      setSubmittingCommentFor(null);
      void loadPosts();
      void refreshPlankHolderChallenge();
    } catch (err) {
      console.error("submitComment crashed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Something went wrong while posting your comment."
      );
      setSubmittingCommentFor(null);
    }
  }

  function openReplyComposer(
    targetCommentId: string,
    author: { userId: string; name: string },
  ) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    // Clicking the same target's Reply again closes the composer.
    if (
      replyingToCommentId === targetCommentId &&
      replyTargetAuthor?.userId === author.userId
    ) {
      setReplyingToCommentId(null);
      setReplyTargetAuthor(null);
      return;
    }
    setReplyingToCommentId(targetCommentId);
    setReplyTargetAuthor(author);
    setExpandedReplies((prev) => ({ ...prev, [targetCommentId]: true }));
  }

  // Replies are one level deep: parentCommentId is always a top-level comment.
  async function submitReply(postId: string, parentCommentId: string) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (blockMemberInteraction()) return;

    const replyText = (
      replyRawsRef.current[parentCommentId] ||
      replyInputs[parentCommentId] ||
      ""
    ).trim();
    if (!replyText) return;

    try {
      setSubmittingReplyFor(parentCommentId);

      const insert = await supabase
        .from("post_comments")
        .insert([
          {
            post_id: postId,
            user_id: userId,
            content: replyText,
            parent_comment_id: parentCommentId,
          },
        ])
        .select("id")
        .single();

      if (insert.error) {
        console.error("Reply insert error:", insert.error);
        alert(insert.error.message || "Failed to post reply.");
        return;
      }

      const insertedReplyId = insert.data?.id ?? null;
      const post = posts.find((p) => p.id === postId);
      const ownerId = post?.user_id ?? userId;
      const actorName = currentUserName?.trim() || "Someone";
      const replyLink = `/?postId=${encodeURIComponent(postId)}${insertedReplyId ? `&commentId=${encodeURIComponent(insertedReplyId)}` : ""}`;
      const replyTo = replyTargetAuthor;

      const notified = new Set<string>([userId]);
      const tasks: Promise<unknown>[] = [];

      // Mention notifications
      const mentionIds = extractMentionIds(replyText).filter((id) => id !== userId);
      for (const uid of mentionIds) {
        notified.add(uid);
        tasks.push(
          postNotifyJson(supabase, {
            user_id: uid,
            actor_name: actorName,
            post_owner_id: ownerId,
            type: "mention_comment",
            category: "social",
            post_id: postId,
            parent_entity_type: "comment",
            parent_entity_id: insertedReplyId,
            message: `${actorName} mentioned you in a reply`,
            link: replyLink,
            group_key: `post:${postId}:mentions`,
            dedupe_key: insertedReplyId
              ? `mention_comment:${insertedReplyId}:${uid}`
              : `mention_comment:${postId}:${uid}`,
            metadata: {
              feed: true,
              ...(insertedReplyId ? { comment_id: insertedReplyId } : {}),
            },
          }),
        );
      }

      // Notify the author of the comment being replied to.
      if (replyTo && replyTo.userId !== userId && !notified.has(replyTo.userId)) {
        notified.add(replyTo.userId);
        tasks.push(
          postNotifyJson(supabase, {
            user_id: replyTo.userId,
            actor_name: actorName,
            post_owner_id: ownerId,
            type: "feed_comment_reply",
            category: "social",
            post_id: postId,
            parent_entity_type: "comment",
            parent_entity_id: insertedReplyId,
            message: `${actorName} replied to your comment`,
            link: replyLink,
            metadata: {
              feed: true,
              ...(insertedReplyId ? { comment_id: insertedReplyId } : {}),
            },
          }),
        );
      }

      // Post owner (skip if already notified above).
      if (post && ownerId !== userId && !notified.has(ownerId)) {
        notified.add(ownerId);
        tasks.push(
          notify(ownerId, `${actorName} commented on your post`, ownerId, {
            type: "feed_comment",
            post_id: postId,
            comment_id: insertedReplyId,
          }),
        );
      }

      // Thread participants (everyone else who commented on this post).
      const { data: td } = await supabase
        .from("post_comments")
        .select("user_id")
        .eq("post_id", postId)
        .neq("user_id", userId);
      const participants = [
        ...new Set(((td ?? []) as { user_id: string }[]).map((c) => c.user_id)),
      ].filter((id) => !notified.has(id));
      for (const pid of participants) {
        tasks.push(
          notify(
            pid,
            `${actorName} also commented on a post you're following`,
            ownerId,
            {
              type: "feed_comment_thread",
              post_id: postId,
              comment_id: insertedReplyId,
            },
          ),
        );
      }

      await Promise.all(tasks);

      setReplyInputs((prev) => ({ ...prev, [parentCommentId]: "" }));
      replyRawsRef.current[parentCommentId] = "";
      setReplyingToCommentId(null);
      setReplyTargetAuthor(null);
      setExpandedReplies((prev) => ({ ...prev, [parentCommentId]: true }));
      setExpandedComments((prev) => ({ ...prev, [postId]: true }));

      setSubmittingReplyFor(null);
      void loadPosts();
      void refreshPlankHolderChallenge();
    } catch (err) {
      console.error("submitReply crashed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Something went wrong while posting your reply.",
      );
      setSubmittingReplyFor(null);
    }
  }

  async function deletePost(postId: string) {
    if (!userId) return;
    if (blockMemberInteraction()) return;
    const target = posts.find((p) => p.id === postId);
    const isOwn = target?.user_id === userId;
    const isNewsPost = target?.content_type === "news";
    const confirmMessage =
      isAdmin && !isOwn
        ? isNewsPost
          ? "Delete this news post from the feed? It will move back to rejected status."
          : "Delete this post from the feed as admin?"
        : "Delete this post?";
    if (!window.confirm(confirmMessage)) return;

    try {
      setDeletingPostId(postId);

      let errorMessage: string | null = null;
      if (isAdmin && !isOwn) {
        const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
        const res = await fetch(`/api/admin/feed-posts/${encodeURIComponent(postId)}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { error?: string }));
          errorMessage = body.error ?? "Failed to delete post.";
        }
      } else {
        const { error } = await supabase.from("posts").delete().eq("id", postId);
        if (error) errorMessage = error.message;
      }

      if (errorMessage) {
        alert(errorMessage);
        return;
      }

      await loadPosts();
    } finally {
      setDeletingPostId(null);
    }
  }

  async function deleteComment(commentId: string) {
    if (!userId) return;
    if (blockMemberInteraction()) return;
    if (!window.confirm("Delete this comment?")) return;

    try {
      setDeletingCommentId(commentId);

      const { error } = await supabase
        .from("post_comments")
        .delete()
        .eq("id", commentId);

      if (error) {
        alert(error.message);
        return;
      }

      await loadPosts();
    } finally {
      setDeletingCommentId(null);
    }
  }

  function startEditPost(postId: string, currentContent: string, postAsUserId?: string | null) {
    setEditingPostId(postId);
    setEditingPostContent(currentContent);
    setEditingPostAsMode(
      resolvePostAsModeFromPost(postAsUserId, postAsAdminProfile?.userId ?? null),
    );
  }

  function cancelEditPost() {
    setEditingPostId(null);
    setEditingPostContent("");
    setEditingPostAsMode("self");
  }

  async function savePostEdit(postId: string) {
    if (!editingPostContent.trim()) return;
    if (blockMemberInteraction()) return;

    try {
      setSavingPostId(postId);

      const postAsUserId = resolvePostAsUserIdForSubmit(
        editingPostAsMode,
        postAsAdminProfile?.userId ?? null,
      );

      const { error } = await supabase
        .from("posts")
        .update({
          content: editingPostContent.trim(),
          post_as_user_id: postAsUserId,
        })
        .eq("id", postId);

      if (error) {
        alert(error.message);
        return;
      }

      setEditingPostId(null);
      setEditingPostContent("");
      setEditingPostAsMode("self");
      await loadPosts();
    } finally {
      setSavingPostId(null);
    }
  }

  function startEditComment(commentId: string, currentContent: string) {
    setEditingCommentId(commentId);
    setEditingCommentContent(currentContent);
  }

  function cancelEditComment() {
    setEditingCommentId(null);
    setEditingCommentContent("");
  }

  async function saveCommentEdit(commentId: string) {
    if (!editingCommentContent.trim()) return;
    if (blockMemberInteraction()) return;

    try {
      setSavingCommentId(commentId);

      const { error } = await supabase
        .from("post_comments")
        .update({ content: editingCommentContent.trim() })
        .eq("id", commentId);

      if (error) {
        alert(error.message);
        return;
      }

      setEditingCommentId(null);
      setEditingCommentContent("");
      await loadPosts();
    } finally {
      setSavingCommentId(null);
    }
  }

  function openFlagModal(contentType: "post" | "comment", contentId: string) {
    if (!userId) return;
    if (blockMemberInteraction()) return;
    setFlagCategoryChoice("general");
    setFlagModal({ contentType, contentId });
  }

  async function submitFlagFromModal() {
    if (!flagModal || !userId) return;
    if (blockMemberInteraction()) return;
    setFlaggingId(flagModal.contentId);
    try {
      const { data: { session } } = await getSupabaseSession({ source: "HomePage" });
      const res = await fetch("/api/flag-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          contentType: flagModal.contentType,
          contentId: flagModal.contentId,
          category: flagCategoryChoice,
        }),
      });
      let json: { error?: string } = {};
      try {
        json = await res.json();
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        alert(json.error ?? "Could not submit flag");
        return;
      }
      alert("Flagged for review. Thank you.");
      setFlagModal(null);
      await loadPosts();
    } finally {
      setFlaggingId(null);
    }
  }

  function toggleComments(postId: string) {
    setExpandedComments((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  }

  async function loadMoreFeedPosts(nextLimit?: number) {
    const limit = nextLimit ?? feedPostLimitRef.current + FEED_LOAD_MORE_INCREMENT;
    setFeedLoadingMore(true);
    setFeedPostLimit(limit);
    feedPostLimitRef.current = limit;
    try {
      await loadPosts(userId, { forceFullHydration: true, limit });
    } finally {
      setFeedLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!postsLoaded || !feedHasMore || feedAutoLoadTriggeredRef.current) return;
    if (feedPostLimitRef.current >= FEED_AUTO_LOAD_LIMIT) return;

    function onScroll() {
      const doc = document.documentElement;
      const distanceFromBottom = doc.scrollHeight - (window.scrollY + window.innerHeight);
      if (distanceFromBottom > 900) return;
      feedAutoLoadTriggeredRef.current = true;
      void loadMoreFeedPosts(FEED_AUTO_LOAD_LIMIT);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [postsLoaded, feedHasMore, feedPostLimit]);

  useEffect(() => {
    if (authLoading) return;

    let isMounted = true;
    let feedRefreshTimer: number | null = null;
    let feedRefreshInFlight = false;
    let feedRefreshQueued = false;

    const scheduleFeedRefresh = () => {
      if (!isMounted) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        feedDirtyWhileHiddenRef.current = true;
        return;
      }
      if (feedRefreshTimer) {
        window.clearTimeout(feedRefreshTimer);
      }
      // Coalesce bursty realtime events (likes/comments/image rows) into one feed refresh.
      feedRefreshTimer = window.setTimeout(async () => {
        feedRefreshTimer = null;
        if (feedRefreshInFlight) {
          feedRefreshQueued = true;
          return;
        }
        feedRefreshInFlight = true;
        try {
          await loadPosts(undefined, { forceFullHydration: true });
        } finally {
          feedRefreshInFlight = false;
          if (feedRefreshQueued) {
            feedRefreshQueued = false;
            scheduleFeedRefresh();
          }
        }
      }, FEED_REALTIME_DEBOUNCE_MS);
    };

    const scheduleFeedRefreshForPostId = (postId: string | null | undefined) => {
      if (!postId) return;
      if (!postsRef.current.some((post) => post.id === postId)) return;
      scheduleFeedRefresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !feedDirtyWhileHiddenRef.current) return;
      feedDirtyWhileHiddenRef.current = false;
      scheduleFeedRefresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    function resetActiveProfileState() {
      setCurrentUserName(null);
      setCurrentUserPhotoUrl(null);
      setCurrentUserEmail(null);
      setCurrentUserAccountType(null);
      setPostAsAdminProfile(null);
      setPostAsMode(loadStoredPostAsMode());
      setCurrentUserReferralCode(null);
      setBlockedUserIds(new Set());
      setRecruiterCount(0);
      setPlankHolderChallenge(null);
      plankHolderChallengeRef.current = null;
      plankHolderInitializedRef.current = false;
      plankHolderViewedRef.current = false;
      setPlankHolderCardHidden(false);
      setIsAdmin(false);
      setCanViewFullJobs(true);
      setCanUseJobFilters(true);
      queryClient.removeQueries({ queryKey: ["profiles", "discover"] });
      setDiscoverPageIndex(0);
      setPendingMembers([]);
      setFeedAboveFoldExtrasReady(false);
      setPosts([]);
      postsLoadedRef.current = false;
      setPostsLoaded(false);
      setFeedPostLimit(INITIAL_FEED_POST_LIMIT);
      feedPostLimitRef.current = INITIAL_FEED_POST_LIMIT;
      setFeedHasMore(false);
      setFeedLoadingMore(false);
      feedDirtyWhileHiddenRef.current = false;
      feedAutoLoadTriggeredRef.current = false;
      if (feedHydrationTimerRef.current) {
        window.clearTimeout(feedHydrationTimerRef.current);
        feedHydrationTimerRef.current = null;
      }
      memberInteractionAllowedRef.current = false;
    }

    async function init() {
      const loadSeq = ++activeProfileLoadSeqRef.current;
      try {
        const currentUserId = authUser?.id ?? null;

        if (!isMounted || activeProfileLoadSeqRef.current !== loadSeq) return;

        if (!authUser || !currentUserId) return;

        // Check verification status ΓÇö unverified users go to /pending
        const profileCheck = await fetchViewerProfileCached(queryClient, supabase, authUser);
        if (!isMounted || activeProfileLoadSeqRef.current !== loadSeq) return;

        const isPureAdminProfile = !!(profileCheck as { is_pure_admin?: boolean | null } | null)?.is_pure_admin;

        // Sync Google OAuth name to profile if first_name is missing
        // (skip for pure admins — they intentionally have no public name)
        const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
        if (!isPureAdminProfile && profileCheck && !profileCheck.first_name && googleName) {
          const parts = (googleName as string).trim().split(/\s+/);
          const fn = parts[0] || "";
          const ln = parts.slice(1).join(" ") || "";
          await supabase.from("profiles").update({ first_name: fn, last_name: ln }).eq("user_id", currentUserId);
          invalidateViewerProfile(queryClient, currentUserId);
        }

        if (!profileCheck || shouldRedirectToOnboarding(profileCheck) || !hasFullPlatformAccess(profileCheck)) {
          setLoading(false);
          return;
        }

        ensureWelcomeSidebarOnce(supabase);

        if (
          isMounted &&
          activeProfileLoadSeqRef.current === loadSeq &&
          (profileCheck as { nav_helper_seen?: boolean | null }).nav_helper_seen !== true
        ) {
          setShowNavHelper(true);
        }

        const featureAccess = getFeatureAccess({
          accountType: profileCheck.account_type,
          subscriptionStatus: profileCheck.subscription_status ?? null,
          authUserCreatedAtIso: authUser.created_at ?? null,
          isAdmin: profileCheck.is_admin,
        });
        memberInteractionAllowedRef.current = featureAccess.hasFullAccess;
        setCanViewFullJobs(featureAccess.canViewFullJobs);
        setCanUseJobFilters(featureAccess.canUseJobFilters);

        setUserId(currentUserId);
        setPlankHolderCardHidden(readPlankHolderCardHidden(currentUserId));
        setRecruiterNudgeHidden(readRecruiterNudgeHidden(currentUserId));

        const nd = profileCheck as { first_name: string | null; last_name: string | null; photo_url: string | null; referral_code: string | null; is_admin: boolean | null } | null;

        if (isMounted && activeProfileLoadSeqRef.current === loadSeq) {
          setCurrentUserName(`${nd?.first_name || ""} ${nd?.last_name || ""}`.trim() || "Someone");
          setCurrentUserPhotoUrl(nd?.photo_url ?? null);
          const viewerEmail =
            (profileCheck as { email?: string | null }).email?.trim().toLowerCase() ??
            authUser.email?.trim().toLowerCase() ??
            null;
          setCurrentUserEmail(viewerEmail);
          setCurrentUserAccountType(profileCheck.account_type ?? null);
          if (canUsePostAsSelector(viewerEmail)) {
            const { data: adminProfile } = await supabase
              .from("profiles")
              .select("user_id, display_name, first_name, last_name, photo_url")
              .eq("email", "hello@eod-hub.com")
              .maybeSingle();
            if (isMounted && activeProfileLoadSeqRef.current === loadSeq && adminProfile) {
              setPostAsAdminProfile({
                userId: adminProfile.user_id,
                displayName: adminPostDisplayName(adminProfile),
                photoUrl: adminProfile.photo_url ?? null,
              });
            }
          } else if (isMounted && activeProfileLoadSeqRef.current === loadSeq) {
            setPostAsAdminProfile(null);
          }
          setCurrentUserReferralCode(nd?.referral_code ?? null);
          setIsAdmin(!!nd?.is_admin);
          setShowMemorialFeedCards(
            (profileCheck as { show_memorial_feed_cards?: boolean | null } | null)?.show_memorial_feed_cards !== false
          );
        }

        if (nd?.referral_code) {
          void supabase
            .from("profiles")
            .select("user_id", { count: "exact", head: true })
            .eq("referred_by", nd.referral_code)
            .then(({ count, error }) => {
              if (error) {
                console.error("recruiter count load failed:", error);
                return;
              }
              if (isMounted && activeProfileLoadSeqRef.current === loadSeq) {
                setRecruiterCount(count ?? 0);
              }
            });
        } else {
          setRecruiterCount(0);
        }

        void refreshPlankHolderChallenge().catch((err) => console.error("refreshPlankHolderChallenge failed:", err));

        const loadedBlockedUserIds = await fetchBlockedUserIds(supabase, currentUserId);
        if (isMounted && activeProfileLoadSeqRef.current === loadSeq) {
          setBlockedUserIds(loadedBlockedUserIds);
        }

        const feedReady = loadPosts(currentUserId, { blockedUserIds: loadedBlockedUserIds }).catch((err) => console.error("loadPosts failed:", err));
        await feedReady;
        if (isMounted && activeProfileLoadSeqRef.current === loadSeq) {
          setLoading(false);
          clearNativeOAuthCompleting();
        }

        const isDesktopViewport = typeof window !== "undefined" && window.innerWidth > 900;
        const inDesktopShell = isDesktopShell || isDesktopViewport;

        // Desktop shell already has dedicated left/right column loaders; avoid duplicate heavy fetches here.
        if (!inDesktopShell && isMounted && activeProfileLoadSeqRef.current === loadSeq) {
          window.setTimeout(() => {
            if (!isMounted || activeProfileLoadSeqRef.current !== loadSeq) return;
            void Promise.all([
              loadJobs(featureAccess.canViewFullJobs ? 10 : 5).catch((err) => console.error("loadJobs failed:", err)),
              loadBusinessListings().catch((err) => console.error("loadBusinessListings failed:", err)),
            ]);
          }, HOME_WIDGET_LOAD_DELAY_MS);
        }
      } catch (error) {
        console.error("Homepage init error:", error);
        if (isMounted) {
          setLoading(false);
        }
      } finally {
        // no-op: loading is now set right after feed load to improve perceived speed
      }
    }

    if (!authUser) {
      resetActiveProfileState();
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }

    setUserId(authUser.id);
    resetActiveProfileState();
    setPlankHolderCardHidden(readPlankHolderCardHidden(authUser.id));
    setRecruiterNudgeHidden(readRecruiterNudgeHidden(authUser.id));
    setHiddenPendingMemberIds(new Set());
    setLoading(true);
    void init();

    const channel = supabase
      .channel("feed-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: "wall_user_id=is.null" },
        () => scheduleFeedRefresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_images" },
        (payload) => {
          const row = (payload.new as { post_id?: string } | null) ?? (payload.old as { post_id?: string } | null);
          scheduleFeedRefreshForPostId(row?.post_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_comments" },
        (payload) => {
          const row = (payload.new as { post_id?: string } | null) ?? (payload.old as { post_id?: string } | null);
          scheduleFeedRefreshForPostId(row?.post_id);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_reactions" },
        (payload) => {
          const row =
            (payload.new as { subject_kind?: string; subject_id?: string } | null) ??
            (payload.old as { subject_kind?: string; subject_id?: string } | null);
          if (row?.subject_kind === "post") {
            scheduleFeedRefreshForPostId(row.subject_id);
            return;
          }
          if (row?.subject_kind === "post_comment") {
            const hasComment = postsRef.current.some((post) =>
              post.comments.some((comment) =>
                comment.id === row.subject_id ||
                comment.replies.some((reply) => reply.id === row.subject_id)
              )
            );
            if (hasComment) scheduleFeedRefresh();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      if (feedRefreshTimer) {
        window.clearTimeout(feedRefreshTimer);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);

      selectedPostImagesRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });

      Object.values(selectedCommentImagesRef.current).forEach((item) => {
        if (item) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [authLoading, authUserId]);

  useEffect(() => {
    return () => {
      if (discoverKnowToastTimerRef.current) {
        clearTimeout(discoverKnowToastTimerRef.current);
        discoverKnowToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setDiscoverPageIndex(0);
  }, [discoverProfilesQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!postsLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const postId = params.get("postId");
    const commentId = params.get("commentId");
    if (!postId) return;

    const stripDeepLinkParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("postId");
      url.searchParams.delete("commentId");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    };

    // Post was fetched individually and confirmed unavailable (deleted, hidden, or
    // wall-only). Nothing to highlight ΓÇö clean up the URL and stop.
    if (deepLinkPostUnavailable === postId) {
      stripDeepLinkParams();
      return;
    }

    setExpandedComments((prev) => ({ ...prev, [postId]: true }));

    // If the deep link targets a reply, expand its parent thread so it renders.
    if (commentId) {
      const deepLinkPost = posts.find((p) => p.id === postId);
      const parentComment = deepLinkPost?.comments.find((c) =>
        (c.replies ?? []).some((r) => r.id === commentId),
      );
      if (parentComment) {
        setExpandedReplies((prev) => ({ ...prev, [parentComment.id]: true }));
      }
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempt = 0;
    const maxAttempts = 28;

    const tryScroll = () => {
      if (cancelled) return;
      const deepLinkPost = posts.find((p) => p.id === postId);
      if (deepLinkPost?.isInteractionHydrating) {
        attempt += 1;
        if (attempt < maxAttempts) {
          timeoutId = window.setTimeout(tryScroll, 80);
        }
        return;
      }
      const commentEl = commentId ? document.getElementById(`feed-comment-${commentId}`) : null;
      const postEl = document.getElementById(`feed-post-${postId}`);
      const target = commentId ? commentEl : postEl;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("feed-notification-highlight");
        window.setTimeout(() => target.classList.remove("feed-notification-highlight"), 4000);
        stripDeepLinkParams();
        return;
      }
      attempt += 1;
      if (attempt < maxAttempts) {
        timeoutId = window.setTimeout(tryScroll, 80);
      }
      // Don't strip URL params on exhaustion ΓÇö avoids killing the params before
      // the target element renders, which would prevent any re-attempt.
    };

    timeoutId = window.setTimeout(tryScroll, commentId ? 180 : 120);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [postsLoaded, posts, deepLinkPostUnavailable]);

  const discoverMaxPageIndex = useMemo(
    () => Math.max(0, Math.ceil(visibleDiscoverProfiles.length / DISCOVER_PAGE_SIZE) - 1),
    [visibleDiscoverProfiles.length],
  );

  /** Desktop: one page of avatars. Mobile: full pool in a horizontal scroll strip. */
  const discoverVisible = useMemo(() => {
    if (isMobile) return visibleDiscoverProfiles;
    const start = discoverPageIndex * DISCOVER_PAGE_SIZE;
    return visibleDiscoverProfiles.slice(start, start + DISCOVER_PAGE_SIZE);
  }, [visibleDiscoverProfiles, discoverPageIndex, isMobile]);

  useEffect(() => {
    setDiscoverPageIndex((i) => Math.min(i, discoverMaxPageIndex));
  }, [discoverMaxPageIndex]);

  const sortedJobs = useMemo(() => {
    if (jobs.length === 0) return jobs;
    const copy = [...jobs];
    const displayTitle = (j: Job) => (j.title || j.og_title || "Untitled Job").trim();
    if (jobSort === "recent") {
      copy.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      return copy;
    }
    if (jobSort === "az") {
      copy.sort((a, b) =>
        displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: "base" })
      );
      return copy;
    }
    copy.sort((a, b) =>
      displayTitle(b).localeCompare(displayTitle(a), undefined, { sensitivity: "base" })
    );
    return copy;
  }, [jobs, jobSort]);

  const jobLocationOptions = useMemo(() => uniqueJobRegionOptions(sortedJobs), [sortedJobs]);

  const mobileVisibleJobs = useMemo(() => {
    if (!canViewFullJobs) return sortedJobs.slice(0, 5);
    if (!canUseJobFilters) return sortedJobs;
    return applyJobFilters(sortedJobs, jobFilters) as Job[];
  }, [sortedJobs, canViewFullJobs, canUseJobFilters, jobFilters]);

  const jobsForPane = isMobile ? mobileVisibleJobs : sortedJobs.slice(0, 5);
  const showJobLeaderboard = false;

  const featuredBizPool = useMemo(
    () =>
      [...businessListings]
        .filter((b) => normalizeBizListingTypeForListing(b) !== "resource")
        .filter((b) => b.is_featured || isPermanentlyFeaturedListing(b))
        .sort((a, b) => {
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
        }),
    [businessListings]
  );
  void featuredBizPool; // Keep the featured pool available for a future paid spotlight.

  const businessOrgListingsPool = useMemo(
    () =>
      [...businessListings]
        .filter((b) => normalizeBizListingTypeForListing(b) !== "resource")
        .sort((a, b) => {
          const typeDiff = getBizTypePriority(a) - getBizTypePriority(b);
          if (typeDiff !== 0) return typeDiff;
          const aName = (a.business_name || a.og_title || a.og_site_name || "").trim();
          const bName = (b.business_name || b.og_title || b.og_site_name || "").trim();
          return aName.localeCompare(bName, undefined, { sensitivity: "base" });
        }),
    [businessListings]
  );

  const desktopBillboardListing = businessOrgListingsPool.length > 0
    ? businessOrgListingsPool[featuredBizBillboardIndex % businessOrgListingsPool.length]
    : null;

  const businessListingsForPane = isMobile
    ? (bizMobileFilter === "all"
        ? businessListings.filter((b) => normalizeBizListingTypeForListing(b) !== "resource")
        : businessListings.filter((b) => normalizeBizListingTypeForListing(b) === bizMobileFilter))
    : [];

  const mobileBizPaneListingIdsKey = useMemo(
    () => businessListingsForPane.map((l) => l.id).join("|"),
    [businessListingsForPane]
  );

  const loadBizListingEngagement = React.useCallback(
    async (listingIds: string[]) => {
      if (listingIds.length === 0) {
        setListingCommentsById({});
        return;
      }
      const { data: commentRows } = await supabase
        .from("resource_comments")
        .select("id, resource_id, user_id, content, rating, created_at")
        .in("resource_id", listingIds)
        .order("created_at", { ascending: true });

      const comments = (commentRows ?? []) as BizListingCommentRow[];

      const uniqueUserIds = Array.from(new Set(comments.map((c) => c.user_id)));
      let profileMap = new Map<string, BizListingCommentProfile>();
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name, photo_url")
          .in("user_id", uniqueUserIds);
        const profileRows = (profiles ?? []) as BizListingCommentProfile[];
        profileMap = new Map(profileRows.map((p) => [p.user_id, p]));
      }

      function profileNameForBizListingComment(p: BizListingCommentProfile | undefined, fallbackUserId: string): string {
        if (!p) return "Member";
        const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        return (
          p.display_name?.trim() ||
          composed ||
          (fallbackUserId === userId ? (currentUserName ?? "You") : "Member")
        );
      }

      const commentByListing: Record<string, BizListingComment[]> = {};
      for (const c of comments) {
        const row: BizListingComment = {
          ...c,
          rating: c.rating === null ? null : Number(c.rating),
          authorName: profileNameForBizListingComment(profileMap.get(c.user_id), c.user_id),
          authorPhotoUrl: profileMap.get(c.user_id)?.photo_url ?? null,
        };
        if (!commentByListing[c.resource_id]) commentByListing[c.resource_id] = [];
        commentByListing[c.resource_id].push(row);
      }

      setListingCommentsById(commentByListing);
    },
    [userId, currentUserName]
  );

  function getBizRatingSummary(listingId: string): {
    average: number | null;
    averageRounded: number | null;
    ratedCount: number;
  } {
    const comments = listingCommentsById[listingId] ?? [];
    const rated = comments.filter((c) => typeof c.rating === "number") as Array<BizListingComment & { rating: number }>;
    if (rated.length === 0) return { average: null, averageRounded: null, ratedCount: 0 };
    const average = rated.reduce((sum, row) => sum + row.rating, 0) / rated.length;
    return {
      average,
      averageRounded: roundToNearestHalf(average),
      ratedCount: rated.length,
    };
  }

  async function handleSubmitMobileBizListingComment(listingId: string) {
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
      await loadBizListingEngagement(businessListingsForPane.map((l) => l.id));
    } finally {
      setSubmittingListingCommentFor(null);
    }
  }

  useEffect(() => {
    if (!isMobile) return;
    const ids = mobileBizPaneListingIdsKey ? mobileBizPaneListingIdsKey.split("|") : [];
    void loadBizListingEngagement(ids);
  }, [isMobile, userId, mobileBizPaneListingIdsKey, loadBizListingEngagement]);

  useEffect(() => {
    if (!mobileBizDetailListing) return;
    const next = businessListings.find((r) => r.id === mobileBizDetailListing.id);
    if (!next) setMobileBizDetailListing(null);
    else setMobileBizDetailListing(next);
  }, [businessListings, mobileBizDetailListing?.id]);

  useEffect(() => {
    if (!mobileBizDetailListing) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileBizDetailListing(null);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [mobileBizDetailListing]);

  useEffect(() => {
    if (isMobile) return;
    if (businessOrgListingsPool.length <= 1) return;
    const id = window.setInterval(() => {
      setFeaturedBizBillboardIndex((prev) => {
        const next = Math.floor(Math.random() * businessOrgListingsPool.length);
        return next === prev ? (next + 1) % businessOrgListingsPool.length : next;
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, [businessOrgListingsPool.length, isMobile]);

  function openAllJobs() {
    if (canViewFullJobs) {
      window.location.href = "/jobs";
      return;
    }
    setShowJobsUpgradePrompt(true);
  }

  function handleJobDeleted(jobId: string) {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    if (jobDetailsModal?.id === jobId) setJobDetailsModal(null);
  }

  function handleApplicationsUnderReviewChanged(jobId: string, underReview: boolean) {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, applications_under_review: underReview } : j)),
    );
    setJobDetailsModal((current) =>
      current?.id === jobId ? { ...current, applications_under_review: underReview } : current,
    );
  }

  const skeletonStyle: React.CSSProperties = {
    background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  function SkeletonBlock({ width = "100%", height = 14 }: { width?: string | number; height?: number }) {
    return <div style={{ ...skeletonStyle, width, height, marginBottom: 8 }} />;
  }

  function SkeletonCard() {
    return (
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width="75%" height={11} />
        <SkeletonBlock width="40%" height={11} />
      </div>
    );
  }

  function SkeletonPost() {
    return (
      <div style={feedPostCardStyle(t)}>
        <div style={{ display: "flex", gap: 8, marginBottom: FEED_SECTION_GAP }}>
          <div style={{ ...skeletonStyle, width: FEED_POST_AVATAR_SIZE, height: FEED_POST_AVATAR_SIZE, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <SkeletonBlock width="35%" height={14} />
            <SkeletonBlock width="20%" height={11} />
          </div>
        </div>
        <SkeletonBlock width="100%" height={13} />
        <SkeletonBlock width="85%" height={13} />
        <SkeletonBlock width="60%" height={13} />
        <div
          style={{
            ...skeletonStyle,
            width: "100%",
            aspectRatio: "16 / 9",
            marginTop: FEED_SECTION_GAP,
            marginBottom: 0,
            background: FEED_MEDIA_FRAME_BG,
          }}
        />
      </div>
    );
  }

  // Renders a single comment card (used for both top-level comments and their
  // one-level replies). `replyTargetId` is the top-level comment the Reply
  // button should attach to (a reply attaches to its parent, keeping depth at 1).
  function renderCommentNode(
    comment: FeedComment,
    opts: { isReply: boolean; replyTargetId: string },
  ) {
    const isOwnComment = userId === comment.user_id;
    const isEditingComment = editingCommentId === comment.id;
    const avatarSize = opts.isReply ? 20 : 24;

    return (
      <div
        id={`feed-comment-${comment.id}`}
        key={comment.id}
        style={{
          background: t.bg,
          borderRadius: 10,
          padding: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "clamp(8px, 2.2vw, 12px)",
            alignItems: "flex-start",
            flexWrap: "wrap",
            minWidth: 0,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "clamp(6px, 2vw, 10px)",
              alignItems: "center",
              flex: 1,
              minWidth: 0,
              flexWrap: "wrap",
            }}
          >
            <Link
              href={`/profile/${comment.user_id}`}
              style={{ textDecoration: "none", flexShrink: 0, lineHeight: 0 }}
            >
              <Avatar
                photoUrl={comment.authorPhotoUrl}
                name={comment.authorName}
                size={avatarSize}
                service={comment.authorService}
                isEmployer={comment.authorIsEmployer}
              />
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/profile/${comment.user_id}`}
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: t.text,
                  textDecoration: "none",
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {comment.authorName}
              </Link>
            </div>
            <span
              style={{
                fontSize: FEED_COMMENT_META_SIZE,
                color: t.textMuted,
                flexShrink: 0,
                alignSelf: "center",
              }}
            >
              {formatDate(comment.created_at)}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "clamp(6px, 1.8vw, 10px)",
              alignItems: "center",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {!isOwnComment && (
              <>
                <HideBlockUserButton
                  targetUserId={comment.user_id}
                  currentUserId={userId}
                  t={t}
                  compact
                  onBlocked={handleUserBlocked}
                />
                <button type="button" onClick={() => openFlagModal("comment", comment.id)} disabled={flaggingId === comment.id} title="Flag for review" style={{ background: "transparent", border: "none", padding: "0 2px", cursor: flaggingId === comment.id ? "not-allowed" : "pointer", color: t.textFaint, fontSize: 13, lineHeight: 1 }}>
                  Report Comment
                </button>
              </>
            )}
            {isOwnComment && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {!isEditingComment && (
                <button
                  type="button"
                  onClick={() =>
                    startEditComment(comment.id, comment.content)
                  }
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: t.textMuted,
                    fontWeight: 700,
                  }}
                >
                  Edit
                </button>
              )}

              <button
                type="button"
                onClick={() => deleteComment(comment.id)}
                disabled={deletingCommentId === comment.id}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor:
                    deletingCommentId === comment.id
                      ? "not-allowed"
                      : "pointer",
                  color: t.textMuted,
                  fontWeight: 700,
                  opacity: deletingCommentId === comment.id ? 0.6 : 1,
                }}
              >
                {deletingCommentId === comment.id
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          )}
        </div>
      </div>

        {isEditingComment ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={editingCommentContent}
              onChange={(e) => setEditingCommentContent(e.target.value)}
              style={{
                width: "100%",
                minHeight: 70,
                border: `1px solid ${t.inputBorder}`,
                borderRadius: 10,
                padding: 10,
                resize: "vertical",
                fontSize: 14,
                boxSizing: "border-box",
                background: t.input,
                color: t.text,
              }}
            />

            <div
              style={{
                marginTop: 10,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={cancelEditComment}
                style={{
                  background: "transparent",
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: "8px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  color: t.text,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => saveCommentEdit(comment.id)}
                disabled={savingCommentId === comment.id}
                style={{
                  background: "#111",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 14px",
                  fontWeight: 700,
                  cursor:
                    savingCommentId === comment.id
                      ? "not-allowed"
                      : "pointer",
                  opacity: savingCommentId === comment.id ? 0.7 : 1,
                }}
              >
                {savingCommentId === comment.id ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {comment.content && (
              <ExpandableText
                textLength={comment.content.length}
                maxLines={2}
                minCharsToToggle={99999}
                style={{ fontSize: FEED_COMMENT_TEXT_SIZE }}
                wrapperStyle={{ marginTop: 3 }}
                toggleColor={t.textMuted}
                expandLabel="Show more"
                collapseLabel="Show less"
              >
                {renderContent(comment.content)}
              </ExpandableText>
            )}

            {comment.content && (() => {
              const youtubeUrl = firstYouTubeUrlFromText(comment.content);
              return youtubeUrl ? (
                <YouTubeEmbed
                  url={youtubeUrl}
                  title="Comment YouTube video"
                  maxWidth="min(360px, 100%)"
                  marginTop={8}
                />
              ) : null;
            })()}

            {comment.image_url && (
              <button
                type="button"
                onClick={() => openGallery([comment.image_url!], 0)}
                aria-label="View comment image full size"
                style={{
                  marginTop: 10,
                  width: "100%",
                  maxWidth: "min(180px, 100%)",
                  height: 180,
                  borderRadius: 10,
                  overflow: "hidden",
                  border: `1px solid ${t.border}`,
                  background: FEED_MEDIA_FRAME_BG,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <img
                  src={comment.image_url}
                  alt="Comment image"
                  style={feedContainedImageStyle}
                />
              </button>
            )}

            {comment.gif_url && (
              <div
                style={{
                  marginTop: 8,
                  width: "100%",
                  maxWidth: "min(180px, 100%)",
                  boxSizing: "border-box",
                }}
              >
                <img
                  src={comment.gif_url}
                  alt="GIF"
                  style={{
                    width: "100%",
                    height: "auto",
                    maxWidth: 180,
                    borderRadius: 10,
                    display: "block",
                  }}
                />
              </div>
            )}
          </>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 4,
            flexWrap: "wrap",
          }}
        >
          <ReactionPickerTrigger
            t={t}
            disabled={!userId}
            viewerReaction={comment.myReaction}
            totalCount={comment.likeCount}
            busy={togglingCommentLikeFor === comment.id}
            showTriggerCount={false}
            onPick={(type) =>
              void handleFeedCommentReaction(comment.id, type)
            }
          />
          <button
            type="button"
            onClick={() =>
              openReplyComposer(opts.replyTargetId, {
                userId: comment.user_id,
                name: comment.authorName,
              })
            }
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: t.textMuted,
              fontWeight: 700,
              fontSize: FEED_COMMENT_META_SIZE,
            }}
          >
            Reply
          </button>
          <div style={{ flex: "1 1 12px", minWidth: 0 }} />
          <ReactionLeaderboard
            t={t}
            countsByType={comment.reactionCountsByType}
            reactorNamesByType={comment.reactorNamesByType}
          />
        </div>
      </div>
    );
  }

  // Compact composer shown inline when replying to a comment thread.
  function renderReplyComposer(post: FeedPost, targetCommentId: string) {
    if (replyingToCommentId !== targetCommentId) return null;
    const placeholder = replyTargetAuthor
      ? `Reply to ${replyTargetAuthor.name}...`
      : "Write a reply...";
    return (
      <div style={{ marginTop: 8 }}>
        <MentionTextarea
          placeholder={placeholder}
          value={replyInputs[targetCommentId] || ""}
          onChange={(val) =>
            setReplyInputs((prev) => ({ ...prev, [targetCommentId]: val }))
          }
          onChangeRaw={(raw) => {
            replyRawsRef.current[targetCommentId] = raw;
          }}
          style={{
            width: "100%",
            minHeight: 56,
            border: `1px solid ${t.inputBorder}`,
            borderRadius: 10,
            padding: 10,
            resize: "vertical",
            fontSize: 14,
            boxSizing: "border-box",
            background: t.input,
            color: t.text,
          }}
        />
        <div
          style={{
            marginTop: 8,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setReplyingToCommentId(null);
              setReplyTargetAuthor(null);
            }}
            style={{
              background: "transparent",
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: "6px 12px",
              fontWeight: 700,
              cursor: "pointer",
              color: t.text,
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submitReply(post.id, targetCommentId)}
            disabled={submittingReplyFor === targetCommentId}
            style={{
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 10,
              padding: "6px 14px",
              fontWeight: 700,
              cursor:
                submittingReplyFor === targetCommentId
                  ? "not-allowed"
                  : "pointer",
              opacity: submittingReplyFor === targetCommentId ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
            }}
          >
            {submittingReplyFor === targetCommentId && (
              <span className="btn-spinner" />
            )}
            Reply
          </button>
        </div>
      </div>
    );
  }

  const renderFeedCenter = () => (
        <main
          style={{
            minWidth: 0,
            width: "100%",
            maxWidth: "100%",
            overflowX: "clip",
            boxSizing: "border-box",
          }}
        >
            <>
          {/* Pending Members ΓÇö community vouching (deferred until after first feed paint) */}
          {feedAboveFoldExtrasReady && userId && pendingMembers.some((m) => !hiddenPendingMemberIds.has(m.user_id)) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {pendingMembers.filter((m) => !hiddenPendingMemberIds.has(m.user_id)).map((m) => {
                const name = m.display_name || `${m.first_name || ""} ${m.last_name || ""}`.trim() || "New Member";
                const initial = (name[0] || "?").toUpperCase();
                const vouchPopoverOpen = openVouchPopoverFor === m.user_id;
                return (
                  <div key={m.user_id} style={{ position: "relative", border: `1px solid ${isDark ? "#2a2a00" : "#fef08a"}`, borderRadius: 14, padding: 16, background: isDark ? "#1a1a00" : "#fefce8", display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <button
                      type="button"
                      onClick={() => void hidePendingMember(m.user_id)}
                      aria-label={`I don't know ${name}`}
                      title="I don't know this person"
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "transparent",
                        border: "none",
                        color: t.textMuted,
                        fontSize: 22,
                        lineHeight: 1,
                        cursor: "pointer",
                        padding: "2px 6px",
                      }}
                    >
                      ×
                    </button>
                    <div style={{ flexShrink: 0 }} aria-hidden>
                      {m.photo_url
                        ? <img src={m.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", display: "block" }} />
                        : <div style={{ width: 42, height: 42, borderRadius: "50%", background: t.badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: t.textMuted }}>{initial}</div>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{name} is requesting to join</div>
                      {m.service && <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{m.service}</div>}
                      <div style={{ fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 1.5 }}>
                        Once 3 members vouch, they&apos;re verified automatically. An admin can approve them directly.
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          aria-label={m.vouch_count > 0 ? `Show ${m.vouch_count} voucher${m.vouch_count === 1 ? "" : "s"}` : "No vouches yet"}
                          aria-expanded={vouchPopoverOpen}
                          onClick={() => {
                            if (!isMobile || m.vouch_count === 0) return;
                            setOpenVouchPopoverFor((prev) => (prev === m.user_id ? null : m.user_id));
                          }}
                          onMouseEnter={() => {
                            if (isMobile || m.vouch_count === 0) return;
                            setOpenVouchPopoverFor(m.user_id);
                          }}
                          onMouseLeave={() => {
                            if (isMobile) return;
                            setOpenVouchPopoverFor((prev) => (prev === m.user_id ? null : prev));
                          }}
                          style={{
                            position: "relative",
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: m.vouch_count > 0 ? "pointer" : "default",
                            color: "inherit",
                          }}
                        >
                          {[0, 1, 2].map((i) => (
                            <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < m.vouch_count ? "#22c55e" : (isDark ? "#2e2e2e" : "#e5e7eb") }} />
                          ))}
                          <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 4, fontWeight: 600 }}>{m.vouch_count}/3 approved</span>
                          {vouchPopoverOpen && (
                            <div
                              style={{
                                position: "absolute",
                                left: 0,
                                top: "calc(100% + 8px)",
                                zIndex: 20,
                                minWidth: 190,
                                maxWidth: 260,
                                border: `1px solid ${t.border}`,
                                borderRadius: 12,
                                padding: 10,
                                background: t.surface,
                                boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
                                color: t.text,
                              }}
                            >
                              <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                                Vouched by
                              </div>
                              {m.vouchers.length > 0 ? (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {m.vouchers.slice(0, 3).map((voucher) => (
                                    <div key={voucher.user_id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                      {voucher.photo_url ? (
                                        <img src={voucher.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                                      ) : (
                                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: t.badgeBg, color: t.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                                          {(voucher.name[0] || "?").toUpperCase()}
                                        </div>
                                      )}
                                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 700 }}>
                                        {voucher.name}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: t.textMuted }}>No vouches yet.</div>
                              )}
                            </div>
                          )}
                        </button>
                        {!m.user_vouched ? (
                          <button
                            onClick={() => vouchForMember(m.user_id)}
                            disabled={vouchingFor === m.user_id}
                            style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: vouchingFor === m.user_id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                          >
                            {vouchingFor === m.user_id && <span className="btn-spinner" />}
                            Vouch
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>Vouched</span>
                        )}
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => approveUser(m.user_id)}
                              disabled={actingOnUser === m.user_id}
                              style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: actingOnUser === m.user_id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                            >
                              {actingOnUser === m.user_id && <span className="btn-spinner" />}
                              Approve
                            </button>
                            <button
                              onClick={() => denyUser(m.user_id)}
                              disabled={actingOnUser === m.user_id}
                              style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: actingOnUser === m.user_id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                            >
                              {actingOnUser === m.user_id && <span className="btn-spinner" />}
                              Deny
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {feedAboveFoldExtrasReady && showNavHelper && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                border: `1px solid ${isDark ? "#ca8a04" : "#b45309"}`,
                borderLeft: `4px solid ${isDark ? "#facc15" : "#d97706"}`,
                borderRadius: 12,
                background: isDark ? "#4a3f0f" : "#ca8a04",
                padding: "14px 16px",
                marginBottom: 14,
                boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.35)" : "0 2px 8px rgba(180, 83, 9, 0.25)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: isDark ? "#fef9c3" : "#422006", marginBottom: 4 }}>
                  Welcome to EOD-HUB
                </div>
                <div style={{ fontSize: 14, color: isDark ? "#fde68a" : "#451a03", lineHeight: 1.5 }}>
                  Use the <strong style={{ color: isDark ? "#fffbeb" : "#292524" }}>EOD Hub</strong> button at the top of the page to navigate the site.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { void dismissNavHelper(); }}
                style={{
                  flexShrink: 0,
                  background: isDark ? "#292524" : "#422006",
                  color: "#fef9c3",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          )}

          {feedAboveFoldExtrasReady && (
            <PlankHolderFeedBanner
              challenge={plankHolderChallenge}
              onViewChallenge={handlePlankHolderBannerClick}
              profileHref={userId ? `/profile/${userId}` : "/profile"}
              earnedBannerDismissed={plankHolderBannerDismissed}
              onDismissEarnedBanner={dismissPlankHolderEarnedBanner}
            />
          )}

          {feedAboveFoldExtrasReady && (
            <PlankHolderChallengeCard
              challenge={plankHolderChallenge}
              userId={userId}
              onCtaClick={handlePlankHolderCta}
              hidden={plankHolderCardHidden}
              onHide={hidePlankHolderCard}
            />
          )}

          {feedAboveFoldExtrasReady && currentUserReferralCode && !recruiterNudgeHidden && (
            <div className="referral-nudge" style={{
              marginBottom: 12,
              border: `1px solid #6366f1`,
              borderRadius: 14,
              padding: "14px 16px",
              background: isDark ? "#1e1b4b" : "#eef2ff",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Award size={22} color={isDark ? "#a5b4fc" : "#4338ca"} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: isDark ? "#a5b4fc" : "#4338ca" }}>
                    {recruiterCount >= 25
                      ? "Gold Recruiter unlocked: free hat coupon"
                      : recruiterCount >= 10
                        ? `${recruiterCount} / 25 recruits toward Gold Recruiter`
                        : recruiterCount >= 5
                          ? `${recruiterCount} / 10 recruits toward Silver Recruiter`
                          : `${recruiterCount} / 5 recruits toward Bronze Recruiter`}
                  </div>
                  <div style={{ fontSize: 13, color: isDark ? "#818cf8" : "#6366f1", marginTop: 2 }}>
                    {recruiterCount >= 25
                      ? <>Use code <strong>Master Recruiter</strong> for one free hat at brandedapparelcompany.com.</>
                      : <>Share your referral link to grow EOD HUB and climb the recruiter tiers. Hit <strong>25 recruits</strong> to unlock a one-free-hat coupon for brandedapparelcompany.com.</>}
                  </div>
                </div>
              </div>
              <div className="referral-nudge-btns" style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    void shareOrCopyUrl({
                      title: "Join EOD HUB",
                      text: "Use my referral link to join EOD HUB.",
                      url: `https://eod-hub.com/login?ref=${currentUserReferralCode}`,
                      dialogTitle: "Share referral link",
                    }).then(() => {
                      setReferralCopied(true);
                      setTimeout(() => setReferralCopied(false), 1500);
                      void recordPlankHolderInvite()
                        .then(applyPlankHolderResponse)
                        .catch((error) => console.error("plank holder invite tracking failed:", error));
                    });
                  }}
                  style={{ padding: "7px 14px", borderRadius: 10, background: referralCopied ? "#16a34a" : "#6366f1", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none", transition: "background 0.2s" }}
                >
                  {referralCopied ? "Copied!" : "Copy Link"}
                </button>
                {recruiterCount >= 25 && (
                  <a
                    href="https://www.brandedapparelcompany.com"
                    target="_blank"
                    rel="noreferrer"
                    style={{ padding: "7px 12px", borderRadius: 10, background: "#111", border: "none", color: "white", fontWeight: 800, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    Redeem Hat
                  </a>
                )}
                <button type="button" onClick={hideRecruiterNudge} style={{ padding: "7px 10px", borderRadius: 10, background: "transparent", border: `1px solid #6366f1`, color: isDark ? "#a5b4fc" : "#4338ca", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <OnlineNowStrip currentUserId={userId} />

          <div
            style={{
              marginTop: 0,
              border: `1px solid ${t.border}`,
              borderRadius: 14,
              padding: 16,
              background: t.surface,
            }}
          >
            {canUsePostAsSelector(currentUserEmail) && postAsAdminProfile ? (
              <PostAsSelector
                mode={postAsMode}
                onChange={(mode) => {
                  setPostAsMode(mode);
                  storePostAsMode(mode);
                }}
                selfLabel={currentUserName?.trim() || "Michael Twigg"}
                selfPhotoUrl={currentUserPhotoUrl}
                adminLabel="EOD HUB Admin"
                adminPhotoUrl={postAsAdminProfile.photoUrl}
                disabled={submittingPost}
              />
            ) : null}
            <MentionTextarea
              ref={postTextareaRef}
              placeholder="What's happening in the EOD world?"
              value={content}
              onChange={handleContentChange}
              onChangeRaw={(raw) => { contentRawRef.current = raw; }}
              onPaste={handlePostImagePaste}
              style={{
                width: "100%",
                minHeight: 90,
                border: "none",
                outline: "none",
                resize: "vertical",
                fontSize: 16,
                boxSizing: "border-box",
                background: t.input,
                color: t.text,
              }}
            />

            {selectedPostGif && (
              <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
                <img src={selectedPostGif} alt="Selected GIF" style={{ maxWidth: 200, borderRadius: 10, display: "block" }} />
                <button type="button" onClick={() => setSelectedPostGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
              </div>
            )}

            {fetchingOg && <div style={{ fontSize: 12, color: t.textFaint, marginTop: 4 }}>Fetching link preview...</div>}
            {ogPreview && (
              <div style={{ position: "relative" }}>
                <OgCard og={ogPreview} />
                <button type="button" onClick={() => setOgPreview(null)} style={{ position: "absolute", top: 20, right: 8, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
              </div>
            )}

            <input
              ref={postImageInputRef}
              type="file"
              accept={FEED_ATTACHMENT_ACCEPT}
              multiple
              onChange={handlePostImageChange}
              style={{ display: "none" }}
            />
            <input
              ref={postVideoPdfInputRef}
              type="file"
              accept={FEED_VIDEO_PDF_ACCEPT}
              multiple
              onChange={handlePostImageChange}
              style={{ display: "none" }}
            />
            <input
              ref={postCadPreviewInputRef}
              type="file"
              accept={CAD_PREVIEW_IMAGE_ACCEPT}
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) addCadPreviewImagesFromFiles(files);
                if (postCadPreviewInputRef.current) postCadPreviewInputRef.current.value = "";
              }}
              style={{ display: "none" }}
            />

            {selectedPostImages.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted }}>
                {selectedPostImages.length} of 10 attachments selected
              </div>
            )}

            {selectedPostImages.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 10,
                }}
              >
                {selectedPostImages.map((item, index) => (
                  <div
                    key={`${item.previewUrl || item.file.name}-${index}`}
                    style={{
                      position: "relative",
                      borderRadius: 12,
                      overflow: "hidden",
                      border: `1px solid ${t.border}`,
                      background: FEED_MEDIA_FRAME_BG,
                      aspectRatio: "1 / 1",
                    }}
                  >
                    {isVideoFile(item.file) ? (
                      <video src={item.previewUrl} style={feedContainedImageStyle} muted playsInline />
                    ) : item.kind === "pdf" ? (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: t.textMuted, padding: 8, textAlign: "center", wordBreak: "break-all" }}>
                        {item.file.name}
                      </div>
                    ) : item.kind === "cad3d" && item.cadRole === "file" ? (
                      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 11, color: t.textMuted, padding: 8, textAlign: "center", gap: 6 }}>
                        <div style={{ fontWeight: 800 }}>CAD / 3D</div>
                        <div style={{ wordBreak: "break-all" }}>{item.file.name}</div>
                        {item.cadToken && missingCadPreviewTokens(selectedPostImages).includes(item.cadToken) && (
                          <div style={{ color: "#f59e0b", fontWeight: 700 }}>Preview required</div>
                        )}
                      </div>
                    ) : (
                      <img
                        src={item.previewUrl}
                        alt={`Selected post attachment ${index + 1}`}
                        style={feedContainedImageStyle}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => removeSelectedPostImage(index)}
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "rgba(0,0,0,0.75)",
                        color: "white",
                        border: "none",
                        borderRadius: 999,
                        width: 28,
                        height: 28,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: 11, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>
              Photos up to {formatUploadBytes(UPLOAD_LIMITS.image)} (large photos are compressed automatically).
              Short videos up to {formatUploadBytes(currentFeedUploadLimits.video)} ({currentFeedUploadLimits.videoDurationHint}).
              PDFs and CAD/3D files up to {formatUploadBytes(UPLOAD_LIMITS.document)} are supported.
              CAD/3D files require a JPG/PNG/WEBP preview image.
            </p>

            {kcComposerPhase === "confirm" && (
              <div
                style={{
                  marginTop: 14,
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  padding: 14,
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                  maxWidth: 400,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{KC_CONFIRM_TITLE}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12 }}>{KC_CONFIRM_SUBTITLE}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setKcComposerPhase("builder");
                    }}
                    style={{
                      background: "#111",
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "8px 16px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Start Court
                  </button>
                  <button
                    type="button"
                    onClick={() => resetKcComposer()}
                    style={{
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      padding: "8px 16px",
                      fontWeight: 700,
                      background: t.surface,
                      color: t.text,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {kcComposerPhase === "builder" && (
              <div
                style={{
                  marginTop: 14,
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  padding: 14,
                  background: t.surface,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Kangaroo Court</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>
                  Add 2-4 options and a duration, then press Post. Your text and photos will publish with the poll.
                </div>
                <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 1</label>
                <input
                  value={kcOpt1}
                  onChange={(e) => setKcOpt1(e.target.value)}
                  placeholder="Option A"
                  style={{
                    width: "100%",
                    marginTop: 4,
                    marginBottom: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${t.inputBorder}`,
                    background: t.input,
                    color: t.text,
                    boxSizing: "border-box",
                  }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 2</label>
                <input
                  value={kcOpt2}
                  onChange={(e) => setKcOpt2(e.target.value)}
                  placeholder="Option B"
                  style={{
                    width: "100%",
                    marginTop: 4,
                    marginBottom: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${t.inputBorder}`,
                    background: t.input,
                    color: t.text,
                    boxSizing: "border-box",
                  }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 3 (optional)</label>
                <input
                  value={kcOpt3}
                  onChange={(e) => setKcOpt3(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    marginBottom: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${t.inputBorder}`,
                    background: t.input,
                    color: t.text,
                    boxSizing: "border-box",
                  }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Option 4 (optional)</label>
                <input
                  value={kcOpt4}
                  onChange={(e) => setKcOpt4(e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    marginBottom: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${t.inputBorder}`,
                    background: t.input,
                    color: t.text,
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: t.textMuted }}>Duration</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {KC_DURATION_HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setKcComposerDuration(h)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border:
                          kcComposerDuration === h ? `2px solid ${t.text}` : `1px solid ${t.border}`,
                        background: kcComposerDuration === h ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)") : t.surface,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                        color: t.text,
                      }}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => resetKcComposer()}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontWeight: 700,
                    background: t.bg,
                    color: t.textMuted,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Exit Kangaroo Court
                </button>
              </div>
            )}

            <div
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                {selectedPostImages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelectedPostImages}
                    style={{
                      background: "transparent",
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      padding: "8px 12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      color: t.text,
                    }}
                  >
                    Remove All Attachments
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={openPostImagePicker}
                  style={{
                    background: t.surface,
                    color: t.text,
                    border: `1px solid ${t.border}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {selectedPostImages.length > 0 ? "Add More" : "Add Photo / Video / File"}
                </button>
                {missingCadPreviewTokens(selectedPostImages).length > 0 && (
                  <button
                    type="button"
                    onClick={() => postCadPreviewInputRef.current?.click()}
                    style={{
                      background: t.surface,
                      color: t.text,
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Add Preview Image ({missingCadPreviewTokens(selectedPostImages).length})
                  </button>
                )}

                <EmojiPickerButton
                  value={content}
                  onChange={handleContentChange}
                  inputRef={postTextareaRef}
                  theme={isDark ? "dark" : "light"}
                />

                <GifPickerButton
                  onSelect={(url) => setSelectedPostGif(url)}
                  theme={isDark ? "dark" : "light"}
                />

                <button
                  type="button"
                  title={kcComposerPhase ? "Exit Kangaroo Court" : "Kangaroo Court — add a poll to this post"}
                  onClick={() => {
                    if (kcComposerPhase) resetKcComposer();
                    else setKcComposerPhase("confirm");
                  }}
                  style={{
                    width: 40,
                    height: 40,
                    padding: 0,
                    borderRadius: 999,
                    border: `2px solid ${kcComposerPhase ? "#7c3aed" : t.border}`,
                    background: t.surface,
                    cursor: "pointer",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <Image src={judgeAvatarSrc()} alt="" width={40} height={40} style={{ objectFit: "cover", display: "block" }} unoptimized />
                </button>

                <button
                  onClick={submitPost}
                  disabled={submittingPost}
                  style={{
                    background: "#111",
                    color: "white",
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontWeight: 700,
                    cursor: submittingPost ? "not-allowed" : "pointer",
                    opacity: submittingPost ? 0.7 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {submittingPost && <span className="btn-spinner" />}
                  {kcComposerPhase === "builder" ? "Post with court" : "Post"}
                </button>
              </div>
            </div>
          </div>

          {/* People You May Know ΓÇö verified members only; below composer so vouch cards stay above */}
          {feedAboveFoldExtrasReady && visibleDiscoverProfiles.length > 0 && (
            <div style={{ marginTop: 16, marginBottom: 16, border: `1px solid ${t.border}`, borderRadius: 14, padding: "14px 16px", background: t.surface }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, minHeight: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  People You May Know
                </div>
                {discoverKnowToast && (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: t.text,
                      background: t.badgeBg,
                      border: `1px solid ${t.border}`,
                      borderRadius: 999,
                      padding: "3px 10px",
                      whiteSpace: "nowrap",
                      maxWidth: "60%",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {discoverKnowToast}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => setDiscoverPageIndex((i) => Math.max(0, i - 1))}
                    disabled={discoverPageIndex <= 0}
                    title="Previous"
                    aria-label="Previous suggestions"
                    style={{
                      flexShrink: 0,
                      background: "none",
                      border: `1px solid ${t.border}`,
                      borderRadius: "50%",
                      width: 28,
                      height: 28,
                      cursor: discoverPageIndex <= 0 ? "default" : "pointer",
                      color: t.textMuted,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      opacity: discoverPageIndex <= 0 ? 0.35 : 1,
                    }}
                  >{"<"}</button>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    overflowX: isMobile ? "auto" : "hidden",
                    WebkitOverflowScrolling: "touch",
                    paddingBottom: 4,
                    flex: 1,
                    scrollSnapType: isMobile ? "x mandatory" : undefined,
                  }}
                >
                {discoverVisible.map((p) => {
                  const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Member";
                  const ringColor = getServiceRingColor(p.service);
                  const isPendingKnow = p.knowStatus === "pending_outgoing";
                  const isIncomingKnow = p.knowStatus === "pending_incoming";
                  const affinityHint = p.affinityReasons[0] || (p.service ? `Service: ${p.service}` : "Community member");
                  return (
                    <div
                      key={p.user_id}
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 6,
                        width: DISCOVER_CARD_WIDTH,
                        scrollSnapAlign: isMobile ? "start" : undefined,
                      }}
                    >
                      <a
                        href={`/profile/${p.user_id}`}
                        style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                      >
                        <div style={{ width: DISCOVER_AVATAR_SIZE, height: DISCOVER_AVATAR_SIZE, borderRadius: "50%", overflow: "hidden", background: t.badgeBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, fontSize: 20, boxSizing: "border-box", border: ringColor ? `3px solid ${ringColor}` : `2px solid ${t.border}` }}>
                          {p.photo_url
                            ? <img src={p.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            : (fullName[0] || "U").toUpperCase()
                          }
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: t.text, textAlign: "center", lineHeight: 1.3, wordBreak: "break-word" }}>{fullName}</div>
                        <div
                          title={affinityHint}
                          style={{
                            fontSize: 9,
                            color: t.textFaint,
                            textAlign: "center",
                            lineHeight: 1.2,
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {affinityHint}
                        </div>
                      </a>
                      {userId && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
                          <button
                            onClick={() => toggleDiscoverConnection(p.user_id)}
                            disabled={isPendingKnow}
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              padding: "3px 5px",
                              borderRadius: 6,
                              border: "none",
                              cursor: isPendingKnow ? "default" : "pointer",
                              background: isPendingKnow ? t.text : isIncomingKnow ? "#1d4ed8" : t.badgeBg,
                              color: isPendingKnow || isIncomingKnow ? "#fff" : t.textMuted,
                              opacity: isPendingKnow ? 0.75 : 1,
                              width: "100%",
                            }}
                          >
                            {isPendingKnow ? "Request Sent" : isIncomingKnow ? "Know Back" : "Know"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => setDiscoverPageIndex((i) => Math.min(discoverMaxPageIndex, i + 1))}
                    disabled={discoverPageIndex >= discoverMaxPageIndex}
                    title="Next"
                    aria-label="Next suggestions"
                    style={{
                      flexShrink: 0,
                      background: "none",
                      border: `1px solid ${t.border}`,
                      borderRadius: "50%",
                      width: 28,
                      height: 28,
                      cursor: discoverPageIndex >= discoverMaxPageIndex ? "default" : "pointer",
                      color: t.textMuted,
                      fontSize: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      opacity: discoverPageIndex >= discoverMaxPageIndex ? 0.35 : 1,
                    }}
                  >{">"}</button>
                )}
              </div>
            </div>
          )}

          {feedAboveFoldExtrasReady && unitFeedHighlights.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              {unitFeedHighlights.map((p) => (
                <div key={`unit-highlight-${p.id}`} style={{ border: `1px solid ${t.border}`, borderRadius: 14, overflow: "hidden", background: t.surface }}>
                  <div style={{ padding: "9px 12px", background: t.badgeBg, borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <Link href={`/units/${p.unit_slug}`} style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
                      <Avatar photoUrl={p.unit_cover_image_url} name={p.unit_name} size={26} />
                      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
                        From {p.unit_name}
                      </div>
                    </Link>
                    <div style={{ marginLeft: "auto", fontSize: 11, color: t.textMuted }}>
                      {formatDate(p.created_at)}
                    </div>
                  </div>
                  <div style={{ padding: 14 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <Link href={`/profile/${p.user_id}`} style={{ textDecoration: "none" }}>
                        <Avatar photoUrl={p.author_photo} name={p.author_name} size={38} />
                      </Link>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{p.author_name}</div>
                        {p.content && (
                          <div style={{ marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {renderContent(p.content)}
                          </div>
                        )}
                        {p.photo_url && (
                          <div
                            style={{
                              marginTop: 10,
                              width: "100%",
                              maxWidth: 420,
                              aspectRatio: "1 / 1",
                              borderRadius: 10,
                              overflow: "hidden",
                              border: `1px solid ${t.border}`,
                              background: FEED_MEDIA_FRAME_BG,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <img
                              src={httpsAssetUrl(p.photo_url)}
                              alt="Group post"
                              style={feedContainedImageStyle}
                            />
                          </div>
                        )}
                        <div style={{ marginTop: 9, fontSize: 12, color: t.textMuted }}>
                          {p.like_count} likes · {p.comment_count} comments
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12, display: "grid", gap: 0, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
            {!postsLoaded && [0, 1, 2].map((i) => <SkeletonPost key={i} />)}
            {/* Memorial anniversary cards - auto-injected on anniversary date (opt-out in My Account) */}
            {feedAboveFoldExtrasReady && showMemorialFeedCards &&
              todayMemorials.filter(m => !dismissedMemorialIds.has(m.id)).map((m) => {
              const isExpanded = !!expandedMemorialCards[m.id];
              const memorialCommentList = memorialComments[m.id] ?? [];
              const memorialCommentsOpenForCard = !!memorialCommentsOpen[m.id];
              const engagement = memorialEngagement[m.id] ?? {
                myReaction: null,
                totalReactionCount: 0,
                reactionCountsByType: {},
                reactorNamesByType: {},
              };
              const theme = memorialTheme(m.category, m.service);
              return (
                <div key={`memorial-${m.id}`} style={{ border: `2px solid ${theme.outlineColor}`, borderRadius: 14, overflow: "hidden" }}>
                  {/* Header banner */}
                  <div
                    style={{
                      background: theme.color,
                      padding: isMobile ? "18px 48px 16px" : "11px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: isMobile ? "center" : "flex-start",
                      flexDirection: isMobile ? "column" : "row",
                      gap: isMobile ? 6 : 10,
                      position: "relative",
                      textAlign: "center",
                    }}
                  >
                    <span style={{ color: "white", fontWeight: 900, fontSize: isMobile ? 20 : 15, letterSpacing: isMobile ? 3 : 1.5, textTransform: "uppercase" }}>{theme.label}</span>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.82)",
                        fontSize: isMobile ? 14 : 12,
                        fontWeight: 700,
                        marginLeft: isMobile ? 0 : "auto",
                        marginRight: isMobile ? 0 : 12,
                        lineHeight: 1.15,
                      }}
                    >
                      {isMobile ? (
                        <>
                          <span style={{ display: "block" }}>{new Date().toLocaleDateString("en-US", { month: "long" })}</span>
                          <span style={{ display: "block" }}>{new Date().toLocaleDateString("en-US", { day: "numeric" })}</span>
                        </>
                      ) : (
                        new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => dismissMemorial(m.id)}
                      title="Dismiss"
                      style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "white", fontWeight: 900, fontSize: 16, lineHeight: 1, cursor: "pointer", padding: "2px 7px", flexShrink: 0, position: isMobile ? "absolute" : "static", top: isMobile ? 14 : undefined, right: isMobile ? 14 : undefined }}
                    >x</button>
                  </div>
                  {/* Card body: compact by default, full memorial view on expand.
                      A thin attribution footer sits below this body in both
                      states so source context is always visible. */}
                  <div style={{ padding: isMobile ? 22 : 20, background: isDark ? theme.darkBg : theme.lightBg, display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 16, alignItems: isMobile ? "center" : "flex-start" }}>
                    {m.photo_url && (
                      <div style={{ width: isMobile ? 112 : 72, height: isMobile ? 112 : 72, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `3px solid ${theme.outlineColor}` }}>
                        <img src={m.photo_url} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, width: "100%", textAlign: isMobile ? "center" : "left" }}>
                      <div style={{ fontSize: isMobile ? 22 : 20, fontWeight: 900, color: isDark ? "#fce8d9" : "#1a1a1a", lineHeight: 1.2 }}>{m.name}</div>
                      <div style={{ fontSize: 13, color: theme.color, marginTop: 2 }}>
                        {new Date(m.death_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                        {" - "}
                        {new Date().getFullYear() - parseInt(m.death_date.split("-")[0])} years ago
                      </div>
                      {!isExpanded && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => setExpandedMemorialCards((prev) => ({ ...prev, [m.id]: true }))}
                            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: theme.color, fontSize: 13, fontWeight: 700 }}
                          >
                            Show full bio
                          </button>
                          <MemorialScrapbookPreview
                            memorialId={m.id}
                            t={t}
                            accentColor={theme.color}
                            variant="full"
                            isMobile={isMobile}
                            panelBackground={isDark ? theme.darkCommentBg : theme.lightCommentBg}
                            scrapbookActorUserId={userId}
                            scrapbookActorIsAdmin={isAdmin}
                          />
                        </div>
                      )}
                      {isExpanded && (
                        <>
                          {m.bio && (
                            <div style={{ marginTop: isMobile ? 18 : 10, lineHeight: 1.65, color: t.textMuted, textAlign: "left", width: "100%", fontSize: isMobile ? 16 : undefined }}>
                              {m.bio}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedMemorialCards((prev) => ({ ...prev, [m.id]: false }))}
                            style={{ marginTop: 6, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: theme.color, fontSize: 13, fontWeight: 700 }}
                          >
                            See less
                          </button>
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${isDark ? theme.darkBorder : theme.lightBorder}` }}>
                            <button type="button" onClick={() => setDonateModal(memorialDonationConfig(m.category, m.service))} style={{ background: theme.color, border: "none", borderRadius: 8, color: "white", fontWeight: 700, fontSize: 13, padding: "7px 18px", cursor: "pointer", width: "100%" }}>
                              {memorialDonationConfig(m.category, m.service).title}
                            </button>
                          </div>
                          <div style={{ textAlign: "left", width: "100%" }}>
                            <MemorialScrapbookPreview
                              memorialId={m.id}
                              t={t}
                              accentColor={theme.color}
                              variant="full"
                              isMobile={isMobile}
                              panelBackground={isDark ? theme.darkCommentBg : theme.lightCommentBg}
                              scrapbookActorUserId={userId}
                              scrapbookActorIsAdmin={isAdmin}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: isMobile ? "0 22px 16px" : "0 20px 16px",
                      background: isDark ? theme.darkBg : theme.lightBg,
                      borderTop: `1px solid ${isDark ? theme.darkBorder : theme.lightBorder}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-start",
                        gap: FEED_ACTION_ROW_GAP,
                        alignItems: "center",
                        marginTop: FEED_SECTION_GAP,
                        padding: FEED_ACTION_ROW_PADDING,
                        flexWrap: "wrap",
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <ReactionPickerTrigger
                        t={t}
                        disabled={!userId}
                        viewerReaction={engagement.myReaction}
                        totalCount={engagement.totalReactionCount}
                        busy={togglingMemorialReactionFor === m.id}
                        showTriggerCount={false}
                        onPick={(type) => void handleMemorialReaction(m.id, type)}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMemorialCommentsOpen((prev) => ({ ...prev, [m.id]: !memorialCommentsOpenForCard }))
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          minWidth: 70,
                          cursor: "pointer",
                          fontWeight: 700,
                          color: t.textMuted,
                        }}
                      >
                        {memorialCommentsOpenForCard ? "Hide Comments" : "Comment"}
                      </button>
                      <div style={{ flex: "1 1 24px", minWidth: 0 }} />
                      <ReactionLeaderboard
                        t={t}
                        countsByType={engagement.reactionCountsByType}
                        reactorNamesByType={engagement.reactorNamesByType}
                      />
                      <div style={{ fontSize: 14, color: t.textMuted, minWidth: 86 }}>
                        {memorialCommentList.length}{" "}
                        {memorialCommentList.length === 1 ? "comment" : "comments"}
                      </div>
                    </div>

                    {(memorialCommentList.length > 0 || memorialCommentsOpenForCard) && (
                      <div
                        style={{
                          marginTop: FEED_SECTION_GAP,
                          paddingTop: FEED_SECTION_GAP,
                          borderTop: `1px solid ${isDark ? theme.darkBorder : theme.lightBorder}`,
                        }}
                      >
                        {memorialCommentList.length > 0 && (
                          <div style={{ display: "grid", gap: 8 }}>
                            {(memorialCommentsOpenForCard
                              ? memorialCommentList
                              : memorialCommentList.slice(0, 2)
                            ).map((c) => (
                              <div key={c.id} style={{ display: "flex", gap: 8 }}>
                                <div
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: "50%",
                                    background: t.border,
                                    flexShrink: 0,
                                    overflow: "hidden",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: t.text,
                                  }}
                                >
                                  {c.authorPhotoUrl ? (
                                    <img
                                      src={c.authorPhotoUrl}
                                      alt={c.authorName}
                                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                    />
                                  ) : (
                                    c.authorName[0]?.toUpperCase()
                                  )}
                                </div>
                                <div
                                  style={{
                                    background: isDark ? theme.darkCommentBg : theme.lightCommentBg,
                                    borderRadius: 10,
                                    padding: "6px 10px",
                                    flex: 1,
                                    minWidth: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      fontSize: 12,
                                      color: theme.color,
                                      marginBottom: 2,
                                    }}
                                  >
                                    {c.authorName}
                                  </div>
                                  {editingMemorialCommentId === c.id ? (
                                    <div>
                                      <textarea
                                        value={editingMemorialCommentContent}
                                        onChange={(e) => setEditingMemorialCommentContent(e.target.value)}
                                        rows={3}
                                        style={{
                                          width: "100%",
                                          border: `1px solid ${isDark ? theme.darkBorder : theme.lightBorder}`,
                                          borderRadius: 8,
                                          padding: 8,
                                          fontSize: 13,
                                          boxSizing: "border-box",
                                          background: isDark ? theme.darkBg : theme.lightBg,
                                          color: t.text,
                                          resize: "vertical",
                                        }}
                                      />
                                      <div
                                        style={{
                                          marginTop: 6,
                                          display: "flex",
                                          gap: 8,
                                          justifyContent: "flex-end",
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setEditingMemorialCommentId(null)}
                                          style={{
                                            background: "transparent",
                                            border: `1px solid ${t.border}`,
                                            borderRadius: 8,
                                            padding: "4px 10px",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: t.text,
                                            cursor: "pointer",
                                          }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => saveMemorialCommentEdit(m.id, c.id)}
                                          disabled={
                                            savingMemorialCommentId === c.id ||
                                            !editingMemorialCommentContent.trim()
                                          }
                                          style={{
                                            background: theme.color,
                                            border: "none",
                                            borderRadius: 8,
                                            padding: "4px 10px",
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: "white",
                                            cursor:
                                              savingMemorialCommentId === c.id ? "not-allowed" : "pointer",
                                            opacity: savingMemorialCommentId === c.id ? 0.7 : 1,
                                          }}
                                        >
                                          {savingMemorialCommentId === c.id ? "Saving..." : "Save"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div style={{ fontSize: 13, lineHeight: 1.45, color: t.text }}>
                                        {renderContent(c.content)}
                                      </div>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 10,
                                          alignItems: "center",
                                          marginTop: 6,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <ReactionPickerTrigger
                                          t={t}
                                          disabled={!userId}
                                          viewerReaction={c.myReaction}
                                          totalCount={c.likeCount}
                                          busy={togglingMemorialCommentReactionFor === c.id}
                                          showTriggerCount={false}
                                          onPick={(type) =>
                                            void handleMemorialCommentReaction(c.id, m.id, type)
                                          }
                                        />
                                        {c.user_id === userId && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingMemorialCommentId(c.id);
                                                setEditingMemorialCommentContent(c.content);
                                              }}
                                              style={{
                                                background: "transparent",
                                                border: "none",
                                                padding: 0,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: theme.color,
                                                cursor: "pointer",
                                              }}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => deleteMemorialComment(m.id, c.id)}
                                              disabled={deletingMemorialCommentId === c.id}
                                              style={{
                                                background: "transparent",
                                                border: "none",
                                                padding: 0,
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: "#ef4444",
                                                cursor:
                                                  deletingMemorialCommentId === c.id
                                                    ? "not-allowed"
                                                    : "pointer",
                                                opacity: deletingMemorialCommentId === c.id ? 0.7 : 1,
                                              }}
                                            >
                                              {deletingMemorialCommentId === c.id
                                                ? "Deleting..."
                                                : "Delete"}
                                            </button>
                                          </>
                                        )}
                                        <div style={{ flex: "1 1 12px", minWidth: 0 }} />
                                        <ReactionLeaderboard
                                          t={t}
                                          countsByType={c.reactionCountsByType}
                                          reactorNamesByType={c.reactorNamesByType}
                                        />
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {!memorialCommentsOpenForCard && memorialCommentList.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setMemorialCommentsOpen((prev) => ({ ...prev, [m.id]: true }))
                            }
                            style={{
                              marginTop: 8,
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              color: theme.color,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            See all comments
                          </button>
                        )}
                        {memorialCommentsOpenForCard && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                            <MentionTextarea
                              value={memorialCommentInputs[m.id] || ""}
                              onChange={(val) =>
                                setMemorialCommentInputs((p) => ({ ...p, [m.id]: val }))
                              }
                              onChangeRaw={(raw) => {
                                memorialCommentRawsRef.current[m.id] = raw;
                              }}
                              placeholder="Leave a tribute..."
                              style={{
                                width: "100%",
                                minHeight: 70,
                                border: `1px solid ${isDark ? theme.darkBorder : theme.lightBorder}`,
                                borderRadius: 10,
                                padding: 10,
                                resize: "vertical",
                                fontSize: 14,
                                boxSizing: "border-box",
                                background: isDark ? theme.darkBg : theme.lightBg,
                                color: t.text,
                                outline: "none",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => submitMemorialComment(m.id)}
                              disabled={submittingMemorialComment === m.id}
                              style={{
                                alignSelf: "flex-end",
                                background: theme.color,
                                color: "white",
                                border: "none",
                                borderRadius: 10,
                                padding: "8px 16px",
                                fontWeight: 700,
                                cursor:
                                  submittingMemorialComment === m.id ? "not-allowed" : "pointer",
                                opacity: submittingMemorialComment === m.id ? 0.7 : 1,
                                fontSize: 13,
                              }}
                            >
                              {submittingMemorialComment === m.id ? "..." : "Reply"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      padding: "8px 20px 12px",
                      background: isDark ? theme.darkBg : theme.lightBg,
                      borderTop: `1px solid ${isDark ? theme.darkBorder : theme.lightBorder}`,
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: t.textFaint,
                      fontStyle: "italic",
                    }}
                  >
                    <MemorialDisclaimer category={m.category} sourceUrl={m.source_url} linkColor={theme.color} />
                  </div>
                </div>
              );
            })}

            {posts.map((post, postIndex) => {
              const commentsOpen = expandedComments[post.id] || false;
              const eagerFeedAvatar = postIndex < EAGER_FEED_AVATAR_COUNT;
              const isOwnPost = userId === post.user_id;
              const isRumintPost = post.user_id === RUMINT_USER_ID;
              const isPureAdminPost = Boolean(post.authorIsPureAdmin);
              const isInternalPureAdminPost =
                isPureAdminPost && !post.authorHasPublicMemberProfile;
              const canEditPost = isOwnPost;
              const canDeletePost = isOwnPost || isAdmin;
              const isEditingPost = editingPostId === post.id;
              const selectedCommentImage = selectedCommentImages[post.id] || null;

              return (
                <React.Fragment key={post.id}>
                <div
                  id={`feed-post-${post.id}`}
                  style={feedPostCardStyle(t)}
                >
                  <FeedPostHeader
                    profileHref={`/profile/${post.authorUserId}`}
                    avatar={
                      <Avatar
                        photoUrl={post.authorPhotoUrl}
                        name={post.authorName}
                        size={FEED_POST_AVATAR_SIZE}
                        service={post.authorService}
                        isEmployer={post.authorIsEmployer}
                        isPureAdmin={isInternalPureAdminPost}
                        imageLoading={eagerFeedAvatar ? "eager" : "lazy"}
                      />
                    }
                    authorName={post.authorName}
                    createdAtLabel={formatDate(post.created_at)}
                    t={t}
                    disableProfileLink={isRumintPost || isInternalPureAdminPost}
                    hideAvatar={isRumintPost}
                    isOwnPost={isOwnPost}
                    canEdit={canEditPost}
                    canDelete={canDeletePost}
                    isEditingPost={isEditingPost}
                    isMobile={isMobile}
                    isDeleting={deletingPostId === post.id}
                    isFlagging={flaggingId === post.id}
                    authorUserId={post.authorUserId}
                    currentUserId={userId}
                    onEdit={() => startEditPost(post.id, post.content, post.post_as_user_id)}
                    onDelete={() => deletePost(post.id)}
                    onFlag={() => openFlagModal("post", post.id)}
                    onBlockedUser={handleUserBlocked}
                  />

                  {isEditingPost ? (
                    <div style={{ marginTop: 10 }}>
                      {canUsePostAsSelector(currentUserEmail) && postAsAdminProfile ? (
                        <PostAsSelector
                          mode={editingPostAsMode}
                          onChange={setEditingPostAsMode}
                          selfLabel={currentUserName?.trim() || "You"}
                          selfPhotoUrl={currentUserPhotoUrl}
                          adminLabel="EOD HUB Admin"
                          adminPhotoUrl={postAsAdminProfile.photoUrl}
                          disabled={savingPostId === post.id}
                        />
                      ) : null}
                      <textarea
                        value={editingPostContent}
                        onChange={(e) => setEditingPostContent(e.target.value)}
                        style={{
                          width: "100%",
                          minHeight: 90,
                          border: `1px solid ${t.inputBorder}`,
                          borderRadius: 10,
                          padding: 10,
                          resize: "vertical",
                          fontSize: 15,
                          boxSizing: "border-box",
                          background: t.input,
                          color: t.text,
                        }}
                      />

                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 10,
                        }}
                      >
                        <button
                          type="button"
                          onClick={cancelEditPost}
                          style={{
                            background: "transparent",
                            border: `1px solid ${t.border}`,
                            borderRadius: 10,
                            padding: "8px 14px",
                            fontWeight: 700,
                            cursor: "pointer",
                            color: t.text,
                          }}
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={() => savePostEdit(post.id)}
                          disabled={savingPostId === post.id}
                          style={{
                            background: "#111",
                            color: "white",
                            border: "none",
                            borderRadius: 10,
                            padding: "8px 14px",
                            fontWeight: 700,
                            cursor: savingPostId === post.id ? "not-allowed" : "pointer",
                            opacity: savingPostId === post.id ? 0.7 : 1,
                          }}
                        >
                          {savingPostId === post.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {post.rabbithole_contribution_id && (
                        <div style={{ marginTop: 8, fontSize: 11, color: t.textFaint }}>
                          Shared from{" "}
                          <Link
                            href={`/rabbithole/contribution/${encodeURIComponent(post.rabbithole_contribution_id)}`}
                            style={{ color: t.textMuted, textDecoration: "underline" }}
                          >
                            RabbitHole
                          </Link>
                        </div>
                      )}
                      {(post.content_type === "news" || post.user_id === RUMINT_USER_ID) && (
                        <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                          <span
                            style={{
                              border: `1px solid ${t.border}`,
                              borderRadius: 999,
                              padding: "2px 8px",
                              background: t.surface,
                              color: t.textMuted,
                              fontWeight: 700,
                              letterSpacing: 0.2,
                            }}
                          >
                            RUMINT NEWS
                          </span>
                          {post.og_site_name && (
                            <span style={{ color: t.textFaint }}>
                              Source: {post.og_site_name}
                            </span>
                          )}
                        </div>
                      )}
                      {post.content &&
                        !isOnlyPreviewUrl(post.content, post.og_url) &&
                        !(post.event_id && post.feed_event) &&
                        !(
                          (post.content_type === "news" || post.user_id === RUMINT_USER_ID) &&
                          post.og_url &&
                          (post.og_title || post.admin_manual_image_url || post.og_image)
                        ) && (
                        <ExpandableText
                          textLength={post.content.length}
                          wrapperStyle={{ marginTop: FEED_SECTION_GAP }}
                          toggleColor={t.textMuted}
                        >
                          {renderContent(post.content)}
                        </ExpandableText>
                      )}

                      {post.content && (() => {
                        const youtubeUrl = firstYouTubeUrlFromText(post.content);
                        if (!youtubeUrl || sameYouTubeVideo(youtubeUrl, post.og_url)) return null;
                        return <YouTubeEmbed url={youtubeUrl} title="Post YouTube video" />;
                      })()}

                      {post.og_url && (() => {
                        const ytId = getYouTubeVideoId(post.og_url);
                        if (ytId) return <YouTubeEmbed videoId={ytId} title="Post YouTube video" />;
                        if (post.og_title || post.admin_manual_image_url || post.og_image) {
                          const rumintStyle = post.content_type === "news" || post.user_id === RUMINT_USER_ID;
                          return (
                            <OgCard
                              og={{
                                url: post.og_url,
                                title: post.og_title,
                                description: rumintStyle
                                  ? sanitizeRumintOgDescription(post.og_description)
                                  : post.og_description,
                                image: post.admin_manual_image_url || post.og_image,
                                siteName: post.og_site_name,
                              }}
                            />
                          );
                        }
                        return null;
                      })()}

                      {post.image_urls.length > 0 &&
                        (() => {
                          const attachments = attachmentsFromUrls(post.image_urls);
                          const visibleImages = attachments.slice(0, 3);
                          const remainingCount = attachments.length - 3;
                          const galleryUrls = attachments
                            .filter((item) => item.kind === "image" || item.kind === "video")
                            .map((item) => item.renderUrl);

                          return (
                            <div
                              style={{
                                marginTop: FEED_SECTION_GAP,
                                display: "grid",
                                gridTemplateColumns:
                                  visibleImages.length === 1
                                    ? "1fr"
                                    : visibleImages.length === 2
                                    ? "repeat(2, minmax(0, 1fr))"
                                    : "repeat(3, minmax(0, 1fr))",
                                gap: FEED_MEDIA_GRID_GAP,
                                width: "100%",
                                maxWidth: FEED_POST_IMAGES_MAX_WIDTH,
                                boxSizing: "border-box",
                              }}
                            >
                              {visibleImages.map((attachment, index) => {
                                const showOverlay = index === 2 && remainingCount > 0;
                                const isSingleImage = visibleImages.length === 1;
                                const galleryIndex = galleryUrls.findIndex((url) => url === attachment.renderUrl);

                                return (
                                  <button
                                    key={`${attachment.url}-${index}`}
                                    type="button"
                                    onClick={() => {
                                      if (galleryIndex >= 0) {
                                        openGallery(galleryUrls, galleryIndex);
                                        return;
                                      }
                                      window.open(attachment.url, "_blank", "noopener,noreferrer");
                                    }}
                                    style={{
                                      ...(isSingleImage
                                        ? feedSingleMediaFrameStyle
                                        : {
                                            position: "relative" as const,
                                            borderRadius: FEED_MEDIA_RADIUS,
                                            overflow: "hidden",
                                            background: FEED_MEDIA_FRAME_BG,
                                            aspectRatio: "1 / 1",
                                          }),
                                      border: isSingleImage ? "none" : `1px solid ${t.borderLight}`,
                                      padding: 0,
                                      cursor: "pointer",
                                      width: "100%",
                                    }}
                                  >
                                    <FeedMediaAttachment
                                      attachment={attachment}
                                      alt={`Post image ${index + 1}`}
                                      style={isSingleImage ? feedSingleImageStyle : feedContainedImageStyle}
                                      loading={postIndex === 0 ? "eager" : "lazy"}
                                      fetchPriority={postIndex === 0 && index === 0 ? "high" : "auto"}
                                    />

                                    {showOverlay && (
                                      <div
                                        style={{
                                          position: "absolute",
                                          inset: 0,
                                          background: "rgba(0, 0, 0, 0.45)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          color: "white",
                                          fontSize: 24,
                                          fontWeight: 800,
                                        }}
                                      >
                                        +{remainingCount}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                    </>
                  )}

                  {post.gif_url && (
                    <div
                      style={{
                        marginTop: FEED_SECTION_GAP,
                        width: "100%",
                        maxWidth: FEED_POST_EMBED_MAX_WIDTH,
                        boxSizing: "border-box",
                      }}
                    >
                      <div style={{ ...feedSingleMediaFrameStyle, maxHeight: 360 }}>
                        <img src={post.gif_url} alt="GIF" style={feedSingleImageStyle} />
                      </div>
                    </div>
                  )}

                  {post.event_id && (
                    <>
                      {post.feed_event && post.content_type !== "event_scrapbook" && (
                        <EventPostCard
                          event={post.feed_event}
                          onOpen={(eventId) => void openFeedEventModal(eventId)}
                          maxWidth={FEED_POST_EMBED_MAX_WIDTH}
                        />
                      )}
                      {post.feed_event && post.content_type === "event_scrapbook" && (
                        <EventScrapbookFeedCard
                          event={post.feed_event}
                          onOpen={(eventId) => void openFeedEventModal(eventId)}
                          maxWidth={FEED_POST_EMBED_MAX_WIDTH}
                          t={t}
                          isMobile={isMobile}
                          isDark={isDark}
                          scrapbookActorUserId={userId}
                          scrapbookActorIsAdmin={isAdmin}
                        />
                      )}
                      {post.content_type !== "event_scrapbook" && (
                        <EventFeedActions
                          eventId={post.event_id}
                          signupUrl={post.feed_event?.signup_url ?? null}
                          initialInterested={post.event_interested_count}
                          initialGoing={post.event_going_count}
                          initialMyAttendance={post.event_my_attendance}
                          initialSaved={post.event_saved}
                          userId={userId}
                        />
                      )}
                    </>
                  )}

                  {!isEditingPost &&
                    post.kangaroo?.court?.status === "closed" &&
                    post.kangaroo?.verdict && (
                      <KangarooCourtVerdictBanner verdict={post.kangaroo.verdict} />
                    )}

                  {!isEditingPost && post.rabbithole_thread_id && (
                    <MurphyRabbitholeBanner />
                  )}

                  {/* KC poll card: order is original post → verdict → poll → toolbar → comments */}
                  {post.kangaroo?.court && (
                    <KangarooCourtFeedSection
                      postId={post.id}
                      userId={userId}
                      bundle={post.kangaroo ?? null}
                      onAfterChange={() => {
                        void loadPosts();
                        void refreshPlankHolderChallenge();
                      }}
                      mode="card-only"
                      suppressVerdictFooter={
                        post.kangaroo?.court?.status === "closed" && Boolean(post.kangaroo?.verdict)
                      }
                    />
                  )}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: post.event_id ? "center" : "flex-start",
                      gap: FEED_ACTION_ROW_GAP,
                      alignItems: "center",
                      marginTop: FEED_SECTION_GAP,
                      padding: FEED_ACTION_ROW_PADDING,
                      borderTop: `1px solid ${t.borderLight}`,
                      flexWrap: "wrap",
                      width: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                    }}
                  >
                    {/* Feature icon cluster — KC + Rabbithole grouped tightly, distinct from user avatars */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      {userId && (
                        <KangarooCourtFeedSection
                          postId={post.id}
                          userId={userId}
                          bundle={post.kangaroo ?? null}
                          onAfterChange={() => {
                            void loadPosts();
                            void refreshPlankHolderChallenge();
                          }}
                          mode="trigger-inline"
                        />
                      )}

                      {userId && (RABBITHOLE_THRESHOLD_BYPASS || post.likeCount >= 3 || post.commentCount >= 2) && (
                        post.rabbithole_thread_id ? (
                          <div
                            title="Filed to Rabbithole — locked"
                            style={{ position: "relative", flexShrink: 0 }}
                          >
                            <div
                              aria-hidden
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: "50%",
                                overflow: "hidden",
                                border: "2px solid #7c3aed",
                                opacity: 0.45,
                                filter: "grayscale(50%)",
                                boxSizing: "border-box",
                                cursor: "not-allowed",
                              }}
                            >
                              <img
                                src="/rabbithole-btn.png"
                                alt=""
                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            title="Add to Rabbithole"
                            style={{ position: "relative", flexShrink: 0 }}
                          >
                            <button
                              type="button"
                              onClick={() => setRabbitholeModalPost({ id: post.id, content: post.content, og_title: post.og_title })}
                              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "block" }}
                            >
                              <div
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: "50%",
                                  overflow: "hidden",
                                  border: `2px solid ${t.border}`,
                                  opacity: 0.88,
                                  boxSizing: "border-box",
                                }}
                              >
                                <img
                                  src="/rabbithole-btn.png"
                                  alt="Add to Rabbithole"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                              </div>
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    <ReactionPickerTrigger
                      t={t}
                      disabled={!userId}
                      viewerReaction={post.myReaction}
                      totalCount={post.likeCount}
                      busy={togglingLikeFor === post.id}
                      showTriggerCount={false}
                      onPick={(type) => void handleFeedPostReaction(post.id, type)}
                    />

                    <button
                      type="button"
                      onClick={() => toggleComments(post.id)}
                      disabled={post.isInteractionHydrating}
                      aria-busy={post.isInteractionHydrating}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        minWidth: 70,
                        cursor: post.isInteractionHydrating ? "default" : "pointer",
                        fontWeight: 700,
                        color: t.textMuted,
                        opacity: post.isInteractionHydrating ? 0.45 : 1,
                      }}
                    >
                      {commentsOpen ? "Hide Comments" : "Comment"}
                    </button>

                    {post.likeCount > 0 && <PostLikersStack likers={post.likers} />}

                    <div style={{ flex: "1 1 24px", minWidth: 0 }} />

                    <ReactionLeaderboard
                      t={t}
                      countsByType={post.reactionCountsByType}
                      reactorNamesByType={post.reactorNamesByType}
                    />

                    <div
                      style={{
                        fontSize: 14,
                        color: t.textMuted,
                        minWidth: 86,
                        opacity: post.isInteractionHydrating ? 0.45 : 1,
                      }}
                      aria-busy={post.isInteractionHydrating}
                    >
                      {post.commentCount}{" "}
                      {post.commentCount === 1 ? "comment" : "comments"}
                    </div>
                  </div>

                  {(post.comments.length > 0 || commentsOpen) && (
                    <div
                      style={{
                        marginTop: FEED_SECTION_GAP,
                        paddingTop: FEED_SECTION_GAP,
                        borderTop: `1px solid ${t.borderLight}`,
                      }}
                    >
                      {post.comments.length > 0 && (
                      <div style={{ display: "grid", gap: 4 }}>
                        {(commentsOpen ? post.comments : post.comments.slice(0, 2)).map((comment) => {
                          const replies = comment.replies ?? [];
                          const repliesOpen = expandedReplies[comment.id] || false;
                          const visibleReplies = repliesOpen ? replies : replies.slice(0, 1);
                          const hiddenReplyCount = replies.length - visibleReplies.length;

                          return (
                            <div key={comment.id} style={{ display: "grid", gap: 4 }}>
                              {renderCommentNode(comment, { isReply: false, replyTargetId: comment.id })}

                              {visibleReplies.length > 0 && (
                                <div
                                  style={{
                                    marginLeft: 24,
                                    paddingLeft: 10,
                                    borderLeft: `2px solid ${t.border}`,
                                    display: "grid",
                                    gap: 4,
                                  }}
                                >
                                  {visibleReplies.map((reply) =>
                                    renderCommentNode(reply, {
                                      isReply: true,
                                      replyTargetId: comment.id,
                                    }),
                                  )}
                                </div>
                              )}

                              {hiddenReplyCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedReplies((prev) => ({
                                      ...prev,
                                      [comment.id]: true,
                                    }))
                                  }
                                  style={{
                                    marginLeft: 30,
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: t.textMuted,
                                    fontSize: FEED_COMMENT_META_SIZE,
                                    fontWeight: 700,
                                    textAlign: "left",
                                  }}
                                >
                                  View all {replies.length} {replies.length === 1 ? "reply" : "replies"}
                                </button>
                              )}

                              {repliesOpen && replies.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedReplies((prev) => ({
                                      ...prev,
                                      [comment.id]: false,
                                    }))
                                  }
                                  style={{
                                    marginLeft: 30,
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                    cursor: "pointer",
                                    color: t.textMuted,
                                    fontSize: FEED_COMMENT_META_SIZE,
                                    fontWeight: 700,
                                    textAlign: "left",
                                  }}
                                >
                                  Hide replies
                                </button>
                              )}

                              {renderReplyComposer(post, comment.id)}
                            </div>
                          );
                        })}

                      </div>
                      )}
                      {userId &&
                        (() => {
                          const nudge = getSidebarNudgePeer(post.comments, userId);
                          if (!nudge || isCommentSidebarNudgeDismissed(post.id, nudge.peerUserId)) return null;
                          return (
                            <div
                              style={{
                                marginTop: 12,
                                padding: "10px 12px",
                                borderRadius: 10,
                                border: `1px dashed ${t.border}`,
                                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 8 }}>
                                Take this to Sidebar?
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isDesktopShell) openSidebarPeer(nudge.peerUserId);
                                    else setSidebarDrawer({ open: true, peerId: nudge.peerUserId });
                                  }}
                                  style={{
                                    border: "none",
                                    borderRadius: 8,
                                    padding: "8px 14px",
                                    fontWeight: 800,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    background: "#111",
                                    color: "#fff",
                                  }}
                                >
                                  Open Sidebar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    localStorage.setItem(
                                      sidebarNudgeDismissStorageKey(post.id, userId, nudge.peerUserId),
                                      "1",
                                    );
                                    setSidebarNudgeBump((b) => b + 1);
                                  }}
                                  style={{
                                    border: `1px solid ${t.border}`,
                                    borderRadius: 8,
                                    padding: "8px 14px",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    background: t.surface,
                                    color: t.textMuted,
                                  }}
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      {!commentsOpen && post.comments.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: true }))}
                          style={{ marginTop: 8, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: t.textMuted, fontSize: 13, fontWeight: 700 }}
                        >
                          View all {post.comments.length} comments
                        </button>
                      )}
                      {commentsOpen && (
                      <div style={{ marginTop: 14 }}>
                        <MentionTextarea
                          ref={(el) => { commentTextareaRefs.current[post.id] = el; }}
                          placeholder="Write a comment..."
                          value={commentInputs[post.id] || ""}
                          onChange={(val) => setCommentInputs((prev) => ({ ...prev, [post.id]: val }))}
                          onChangeRaw={(raw) => { commentRawsRef.current[post.id] = raw; }}
                          onPaste={(e) => handleCommentImagePaste(post.id, e)}
                          style={{
                            width: "100%",
                            minHeight: 70,
                            border: `1px solid ${t.inputBorder}`,
                            borderRadius: 10,
                            padding: 10,
                            resize: "vertical",
                            fontSize: 14,
                            boxSizing: "border-box",
                            background: t.input,
                            color: t.text,
                          }}
                        />

                        <input
                          ref={(el) => {
                            commentImageInputRefs.current[post.id] = el;
                          }}
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleCommentImageChange(post.id, e)}
                          style={{ display: "none" }}
                        />

                        {selectedCommentGifs[post.id] && (
                          <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
                            <img src={selectedCommentGifs[post.id]!} alt="GIF" style={{ maxWidth: 180, borderRadius: 10, display: "block" }} />
                            <button type="button" onClick={() => setSelectedCommentGifs((prev) => ({ ...prev, [post.id]: null }))} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
                          </div>
                        )}

                        {selectedCommentImage && (
                          <div style={{ marginTop: 10 }}>
                            <div
                              style={{
                                position: "relative",
                                width: 120,
                                height: 120,
                                maxWidth: "100%",
                                borderRadius: 10,
                                overflow: "hidden",
                                border: `1px solid ${t.border}`,
                                background: FEED_MEDIA_FRAME_BG,
                              }}
                            >
                              <img
                                src={selectedCommentImage.previewUrl}
                                alt="Selected comment image"
                                style={feedContainedImageStyle}
                              />

                              <button
                                type="button"
                                onClick={() => clearSelectedCommentImage(post.id)}
                                style={{
                                  position: "absolute",
                                  top: 6,
                                  right: 6,
                                  background: "rgba(0,0,0,0.75)",
                                  color: "white",
                                  border: "none",
                                  borderRadius: 999,
                                  width: 24,
                                  height: 24,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                x
                              </button>
                            </div>
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => openCommentImagePicker(post.id)}
                            style={{
                              background: t.surface,
                              color: t.text,
                              border: `1px solid ${t.border}`,
                              borderRadius: 10,
                              padding: "8px 12px",
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {selectedCommentImage ? "Change Photo" : "Add Photo"}
                          </button>

                          <EmojiPickerButton
                            value={commentInputs[post.id] || ""}
                            onChange={(val) => setCommentInputs((prev) => ({ ...prev, [post.id]: val }))}
                            inputRef={{ current: commentTextareaRefs.current[post.id] ?? null } as { current: HTMLTextAreaElement | null }}
                            theme={isDark ? "dark" : "light"}
                          />

                          <GifPickerButton
                            onSelect={(url) => setSelectedCommentGifs((prev) => ({ ...prev, [post.id]: url }))}
                            theme={isDark ? "dark" : "light"}
                          />

                          <button
                            type="button"
                            onClick={() => submitComment(post.id)}
                            disabled={submittingCommentFor === post.id}
                            style={{
                              background: "#111",
                              color: "white",
                              border: "none",
                              borderRadius: 10,
                              padding: "8px 14px",
                              fontWeight: 700,
                              cursor: submittingCommentFor === post.id ? "not-allowed" : "pointer",
                              opacity: submittingCommentFor === post.id ? 0.7 : 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            {submittingCommentFor === post.id && <span className="btn-spinner" />}
                            Add Comment
                          </button>
                        </div>
                      </div>
                      )}
                    </div>
                  )}
                </div>
                </React.Fragment>
              );
            })}
            {postsLoaded && feedHasMore && feedPostLimit >= FEED_AUTO_LOAD_LIMIT && (
              <div style={{ display: "flex", justifyContent: "center", padding: "18px 0 6px" }}>
                <button
                  type="button"
                  onClick={() => void loadMoreFeedPosts()}
                  disabled={feedLoadingMore}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 999,
                    padding: "10px 18px",
                    background: t.surface,
                    color: t.text,
                    fontWeight: 800,
                    cursor: feedLoadingMore ? "not-allowed" : "pointer",
                    opacity: feedLoadingMore ? 0.7 : 1,
                  }}
                >
                  {feedLoadingMore ? "Loading..." : "Load more posts"}
                </button>
              </div>
            )}
          </div>
            </>
        </main>
  );

  return (
    <>
      {!isDesktopShell ? (
    <div
      className="feed-page-shell"
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
      <DesktopLayout
        isMobile={isMobile}
        mobileStyle={{ marginTop: 12, width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "clip", boxSizing: "border-box" }}
        desktopColumns="272px minmax(0, 1.08fr) 372px"
        desktopGap={20}
        left={
        <aside
          style={{
            display: isMobile ? "none" : "block",
            position: isMobile ? "static" : "sticky",
            top: 20,
            height: isMobile ? undefined : "calc(100vh - 80px)",
            maxHeight: isMobile ? undefined : "calc(100vh - 80px)",
            overflowY: isMobile ? undefined : "auto",
            overflowX: "hidden",
            scrollbarGutter: isMobile ? undefined : "stable",
          }}
        >
          <div style={{ marginBottom: 10 }}>
            <Link
              href="/jobs"
              onClick={(e) => {
                if (!canViewFullJobs) {
                  e.preventDefault();
                  setShowJobsUpgradePrompt(true);
                }
              }}
              {...sectionTitleLinkZoom}
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: t.text,
                textDecoration: "none",
                display: "inline-block",
                transform: "scale(1)",
                transition: "transform 0.15s ease",
                cursor: "pointer",
              }}
            >
              Jobs
            </Link>
          </div>
          {jobsLoaded && (
            <>
              <div style={{ marginBottom: 10, fontSize: 13, color: t.textMuted, fontWeight: 600, lineHeight: 1.45 }}>
                <div>
                  ({jobsTotalApprovedCount !== null ? jobsTotalApprovedCount.toLocaleString() : "—"}) jobs as of{" "}
                  {new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
                </div>
                <div style={{ marginTop: 4 }}>
                  ({jobsNewTodayCount !== null ? jobsNewTodayCount.toLocaleString() : "—"}) new jobs today!
                </div>
                {!isMobile && (
                  <div style={{ marginTop: 6 }}>
                    <a
                      href="/jobs"
                      style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}
                    >
                      See all jobs ΓåÆ
                    </a>
                  </div>
                )}
              </div>
              {isMobile && canUseJobFilters && (
                <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: t.textFaint, fontWeight: 600, flexShrink: 0 }}>Sort</span>
                    <select
                      id="job-sort"
                      value={jobSort}
                      onChange={(e) => setJobSort(e.target.value as "recent" | "az" | "za")}
                      aria-label="Sort jobs"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        padding: "5px 8px",
                        borderRadius: 8,
                        border: `1px solid ${t.inputBorder}`,
                        background: t.input,
                        color: t.text,
                      }}
                    >
                      <option value="recent">Most recently listed</option>
                      <option value="az">Alphabetical A-Z</option>
                      <option value="za">Alphabetical Z-A</option>
                    </select>
                  </div>
                  <select
                    value={jobFilters.locationRegion}
                    onChange={(e) => setJobFilters((prev) => ({ ...prev, locationRegion: e.target.value }))}
                    aria-label="Filter jobs by location"
                    style={{ width: "100%", fontSize: 13, padding: "6px 8px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text }}
                  >
                    <option value="">All locations</option>
                    {jobLocationOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={jobFilters.keyword}
                    onChange={(e) => setJobFilters((prev) => ({ ...prev, keyword: e.target.value }))}
                    placeholder="Keyword/tag (UXO, TSS-E, Safety)"
                    style={{ width: "100%", fontSize: 13, padding: "6px 8px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, boxSizing: "border-box" }}
                  />
                </div>
              )}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            {jobsLastUpdated ? (
              <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 600 }}>
                Updated {new Date(jobsLastUpdated).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}{" "}
                {new Date(jobsLastUpdated).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              </div>
            ) : <div />}
            <Link
              href="/post-job"
              onClick={(e) => {
                if (blockMemberInteraction()) e.preventDefault();
              }}
              style={{ background: "#111", color: "white", borderRadius: 10, padding: "6px 14px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
            >
              Post Job
            </Link>
          </div>

          {/* Community leaderboard */}
          {showJobLeaderboard && isMobile && canViewFullJobs && jobLeaderboard.length > 0 && (
            <div style={{ marginTop: 14, border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, padding: "12px 16px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                Top Community Contributors
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {jobLeaderboard.map((entry, i) => {
                  const medalColor = i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : null;
                  return (
                    <a
                      key={entry.user_id}
                      href={`/profile/${entry.user_id}`}
                      style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", padding: "5px 10px", borderRadius: 20, border: `1px solid ${t.border}`, background: t.bg }}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: t.border, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: t.text }}>
                        {entry.photo_url
                          ? <img src={entry.photo_url} alt={entry.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : entry.name[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{entry.name}</span>
                      {medalColor && <Medal size={14} color={medalColor} />}
                      <span style={{ fontSize: 11, color: t.textFaint, fontWeight: 600 }}>{entry.count}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {!jobsLoaded && [0,1,2].map((i) => <SkeletonCard key={i} />)}
            {jobsLoaded && jobsForPane.length === 0 && (
              <div style={{ fontSize: 14, color: t.textMuted }}>
                No approved jobs yet.
              </div>
            )}

            {jobsLoaded && jobsForPane.map((job) => (
              <JobFeedCard
                key={job.id}
                job={job}
                onOpenDetails={setJobDetailsModal}
                saved={savedJobIds.has(job.id)}
                canSave={!!userId}
                isTogglingSave={togglingJobSaveFor === job.id}
                onToggleSave={(j) => toggleSaveJob(j.id)}
                posterName={jobSubmitters.get(job.user_id ?? "") ?? null}
                canAdminDelete={isAdmin}
                onJobDeleted={handleJobDeleted}
                onApplicationsUnderReviewChanged={handleApplicationsUnderReviewChanged}
              />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={openAllJobs}
              style={{
                width: "100%",
                background: "#111",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "9px 12px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              See All Jobs
            </button>
          </div>
        </aside>
      }
      center={renderFeedCenter()}
      right={
        <aside
          style={{
            display: isMobile ? "none" : undefined,
            position: isMobile ? "static" : "sticky",
            top: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
              <Link
                href="/businesses"
                {...sectionTitleLinkZoom}
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: t.text,
                  textDecoration: "none",
                  display: "inline-block",
                  transform: "scale(1)",
                  transition: "transform 0.15s ease",
                  cursor: "pointer",
                }}
              >
                Businesses/Orgs
              </Link>
              <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
                {isMobile ? "Approved listings" : "Featured listings"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowBizForm((p) => !p); setBizSubmitSuccess(false); }}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "6px 14px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              {showBizForm ? "Cancel" : "Submit Business/Org"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, marginBottom: 12 }}>
            {!isMobile && (
              <a
                href="/businesses"
                style={{ color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
              >
                See all Businesses/Orgs -&gt;
              </a>
            )}
            {isMobile && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {([
                  { id: "all", label: "All" },
                  { id: "business", label: "Businesses" },
                  { id: "organization", label: "Organizations" },
                ] as { id: BizMobileFilter; label: string }[]).map((opt) => {
                  const active = bizMobileFilter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setBizMobileFilter(opt.id)}
                      style={{
                        borderRadius: 999,
                        border: `1px solid ${active ? "#111" : t.border}`,
                        background: active ? "#111" : t.surface,
                        color: active ? "white" : t.text,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "5px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submission form */}
          {showBizForm && (
            <div style={{ marginTop: 14, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
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
                      onBlur={(e) => { if (e.target.value.trim()) { const n = normalizeUrl(e.target.value); setBizUrl(n); handleBizUrlChange(n); } }}
                      placeholder="yourbusiness.com"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                    />
                    {fetchingBizOg && <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>Fetching preview...</div>}
                    {bizOgPreview && <OgCard og={bizOgPreview} />}
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
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Business / Org Name *</label>
                    <input
                      type="text"
                      value={bizName}
                      onChange={(e) => setBizName(e.target.value)}
                      placeholder="Branded Apparel Company"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, boxSizing: "border-box", background: t.input, color: t.text }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>Description</label>
                    <textarea
                      value={bizBlurb}
                      onChange={(e) => setBizBlurb(e.target.value)}
                      placeholder="Brief description of your business or org..."
                      rows={3}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.inputBorder}`, fontSize: 13, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", background: t.input, color: t.text }}
                    />
                  </div>

                  <BizListingTagsField value={bizTags} onChange={setBizTags} />

                  <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 10 }}>
                    Submissions are reviewed by our team before going live.
                  </div>

                  <button
                    type="button"
                    onClick={submitBizListing}
                    disabled={submittingBiz || !bizUrl.trim() || !bizName.trim()}
                    style={{ width: "100%", background: "#111", color: "white", border: "none", borderRadius: 10, padding: "10px 0", fontWeight: 700, fontSize: 14, cursor: submittingBiz || !bizUrl.trim() || !bizName.trim() ? "not-allowed" : "pointer", opacity: submittingBiz || !bizUrl.trim() || !bizName.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                  >
                    {submittingBiz && <span className="btn-spinner" />}
                    Submit for Review
                  </button>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {!isMobile && desktopBillboardListing && (
              (() => {
                const listing = desktopBillboardListing;
                const displayTitle =
                  listing.og_title ||
                  listing.business_name ||
                  listing.og_site_name ||
                  "Business Listing";
                const displayDescription =
                  listing.custom_blurb || listing.og_description || "Visit website";
                const isLiked = likedBizIds.has(listing.id);
                return (
                  <div
                    key={`billboard-${listing.id}`}
                    style={{
                      border: `2px solid ${t.border}`,
                      borderRadius: 16,
                      overflow: "hidden",
                      background: t.surface,
                      boxSizing: "border-box",
                    }}
                  >
                    <a
                      href={listing.website_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: "block", textDecoration: "none", color: "inherit" }}
                    >
                      {listing.og_image ? (
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "2 / 1",
                            background: "#111827",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={httpsAssetUrl(listing.og_image)}
                            alt={displayTitle}
                            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                          />
                        </div>
                      ) : null}
                      <div style={{ padding: 16, paddingBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#111", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>
                            Business/Org Spotlight
                          </span>
                          
                        </div>
                        <div style={{ fontWeight: 800, lineHeight: 1.25, fontSize: 20 }}>
                          {displayTitle}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>
                          {displayDescription}
                        </div>
                      </div>
                    </a>
                    <div style={{ padding: "0 16px 8px" }}>
                      <BizListingTagChips tags={coerceTagsFromDb(listing.tags)} />
                    </div>
                    <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>
                        {normalizeBizListingTypeForListing(listing) === "organization" ? "Organization" : "Business"}
                      </span>
                      <button
                        onClick={(e) => handleBizLike(e, listing.id)}
                        disabled={togglingBizLikeFor === listing.id || !userId}
                        style={{ background: "none", border: "none", cursor: userId ? "pointer" : "default", display: "flex", alignItems: "center", gap: 5, padding: "4px 0", opacity: togglingBizLikeFor === listing.id ? 0.5 : 1 }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? t.text : "none"} stroke={t.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{listing.like_count ?? 0}</span>
                      </button>
                    </div>
                  </div>
                );
              })()
            )}
            {!bizLoaded && (!isMobile ? <SkeletonCard /> : [0,1,2].map((i) => <SkeletonCard key={i} />))}
            {bizLoaded && (isMobile ? businessListingsForPane.length === 0 : !desktopBillboardListing) && (
              <div style={{ fontSize: 14, color: t.textMuted }}>
                No approved listings yet.
              </div>
            )}

            {bizLoaded && isMobile && businessListingsForPane.map((listing) => {
              const displayTitle =
                listing.og_title ||
                listing.business_name ||
                listing.og_site_name ||
                "Business Listing";

              const displayDescription =
                listing.custom_blurb || listing.og_description || "Visit website";

              const comments = listingCommentsById[listing.id] ?? [];
              const { averageRounded, ratedCount } = getBizRatingSummary(listing.id);

              return (
                <article
                  key={listing.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setMobileBizDetailListing(listing)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setMobileBizDetailListing(listing);
                    }
                  }}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: t.surface,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                    {listing.og_image ? (
                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "2 / 1",
                          background: "#111827",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={httpsAssetUrl(listing.og_image)}
                          alt={displayTitle}
                          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                        />
                      </div>
                    ) : null}

                    <div style={{ padding: 14, paddingBottom: 10 }}>
                      <div style={{ fontWeight: 800, lineHeight: 1.3, fontSize: 18 }}>
                        {displayTitle}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>
                        {displayDescription}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "0 14px 8px" }}>
                    <BizListingTagChips tags={coerceTagsFromDb(listing.tags)} />
                  </div>

                  <div
                    style={{
                      padding: "0 14px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
                      {(listing.is_featured || isPermanentlyFeaturedListing(listing)) ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#111", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>
                          Featured
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMobileBizDetailListing(listing);
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
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
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
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      }
      />
    </div>
      ) : (
        renderFeedCenter()
      )}

      {/* Donate modal - in-app iframe over the appropriate memorial fund donation form. */}
      {donateModal && (
        <div
          onClick={() => setDonateModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 640, height: "88vh", background: "#fff", borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            {/* Modal header */}
            <div style={{ background: donateModal.color, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <span style={{ color: "white", fontSize: 15, fontWeight: 800, flex: 1 }}>{donateModal.title}</span>
              <button
                type="button"
                onClick={() => setDonateModal(null)}
                style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 6, color: "white", fontWeight: 900, fontSize: 18, lineHeight: 1, cursor: "pointer", padding: "2px 8px" }}
              >x</button>
            </div>
            {/* Iframe */}
            <iframe
              src={donateModal.url}
              title={donateModal.title}
              style={{ flex: 1, border: "none", width: "100%" }}
              allow="payment"
            />
          </div>
        </div>
      )}

      {isGalleryOpen && (
        <FeedImageGalleryModal
          open
          images={galleryImages}
          index={galleryIndex}
          onClose={closeGallery}
          onPrev={showPrevGalleryImage}
          onNext={showNextGalleryImage}
        />
      )}

      {flagModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flag-modal-title"
          onClick={() => !flaggingId && setFlagModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              background: t.surface,
              borderRadius: 16,
              border: `1px solid ${t.border}`,
              padding: "20px 22px",
              boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.12)",
            }}
          >
            <h2 id="flag-modal-title" style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800, color: t.text }}>
              Flag this {flagModal.contentType}
            </h2>
            <label htmlFor="flag-reason" style={{ display: "block", fontSize: 13, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
              Reason
            </label>
            <select
              id="flag-reason"
              value={flagCategoryChoice}
              onChange={(e) => setFlagCategoryChoice(e.target.value as FlagCategory)}
              disabled={!!flaggingId}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.inputBorder}`,
                background: t.input,
                color: t.text,
                fontSize: 14,
                marginBottom: 18,
                boxSizing: "border-box",
              }}
            >
              {FLAG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FLAG_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => !flaggingId && setFlagModal(null)}
                disabled={!!flaggingId}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  background: t.surfaceHover,
                  color: t.text,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: flaggingId ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitFlagFromModal()}
                disabled={!!flaggingId}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "none",
                  background: "#b91c1c",
                  color: "white",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: flaggingId ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {flaggingId && <span className="btn-spinner" />}
                Submit flag
              </button>
            </div>
          </div>
        </div>
      )}

      {showJobsUpgradePrompt && (
        <UpgradePromptModal open onClose={() => setShowJobsUpgradePrompt(false)} />
      )}
      {memberPaywallOpen && (
        <MemberPaywallModal open onClose={() => setMemberPaywallOpen(false)} />
      )}
      {jobDetailsModal && (
        <JobDetailsModal
          job={jobDetailsModal}
          open
          onClose={() => setJobDetailsModal(null)}
          saved={savedJobIds.has(jobDetailsModal.id)}
          canSave={!!userId}
          isTogglingSave={togglingJobSaveFor === jobDetailsModal.id}
          onToggleSave={(j) => toggleSaveJob(j.id)}
          canAdminDelete={isAdmin}
          onJobDeleted={handleJobDeleted}
          onApplicationsUnderReviewChanged={handleApplicationsUnderReviewChanged}
        />
      )}

      {mobileBizDetailListing && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileBizDetailListing(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1250,
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
              color: t.text,
            }}
          >
            <div style={{ padding: 16, borderBottom: `1px solid ${t.border}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>
                  {mobileBizDetailListing.og_title ||
                    mobileBizDetailListing.business_name ||
                    mobileBizDetailListing.og_site_name ||
                    "Listing"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: t.textMuted }}>
                  {(listingCommentsById[mobileBizDetailListing.id] ?? []).length} comments
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileBizDetailListing(null)}
                style={{ background: "none", border: "none", color: t.text, fontSize: 24, fontWeight: 800, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
              >
                x
              </button>
            </div>
            {mobileBizDetailListing.og_image ? (
              <div
                style={{
                  width: "100%",
                  aspectRatio: "2 / 1",
                  maxHeight: 320,
                  background: "#111827",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={httpsAssetUrl(mobileBizDetailListing.og_image)}
                  alt={mobileBizDetailListing.business_name || "Listing"}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                />
              </div>
            ) : null}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 15, color: t.textMuted, lineHeight: 1.55 }}>
                {mobileBizDetailListing.custom_blurb || mobileBizDetailListing.og_description || "Visit website"}
              </div>
              {(mobileBizDetailListing.poc_name ||
                mobileBizDetailListing.phone_number ||
                mobileBizDetailListing.contact_email ||
                mobileBizDetailListing.city_state) && (
                <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
                  {mobileBizDetailListing.poc_name && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>POC:</span> {mobileBizDetailListing.poc_name}
                    </div>
                  )}
                  {mobileBizDetailListing.phone_number && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Phone:</span> {mobileBizDetailListing.phone_number}
                    </div>
                  )}
                  {mobileBizDetailListing.contact_email && (
                    <div style={{ fontSize: 13, color: t.textMuted, wordBreak: "break-word" }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Email:</span> {mobileBizDetailListing.contact_email}
                    </div>
                  )}
                  {mobileBizDetailListing.city_state && (
                    <div style={{ fontSize: 13, color: t.textMuted }}>
                      <span style={{ color: t.text, fontWeight: 700 }}>Location:</span> {mobileBizDetailListing.city_state}
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <BizListingTagChips
                  tags={coerceTagsFromDb(mobileBizDetailListing.tags)}
                  maxVisible={coerceTagsFromDb(mobileBizDetailListing.tags).length}
                />
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                {(() => {
                  const { averageRounded, ratedCount } = getBizRatingSummary(mobileBizDetailListing.id);
                  if (averageRounded === null) {
                    return <span style={{ fontSize: 13, color: t.textMuted }}>No ratings yet</span>;
                  }
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
                    href={mobileBizDetailListing.website_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "#2563eb",
                      color: "white",
                      borderRadius: 8,
                      padding: "7px 12px",
                      fontWeight: 700,
                      fontSize: 13,
                      textDecoration: "none",
                    }}
                  >
                    Visit Website
                  </a>
                </div>
              </div>
              <div style={{ marginTop: 18, borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Leave a comment</div>
                <div style={{ marginBottom: 8 }}>
                  <StarRatingInput
                    value={listingCommentRatings[mobileBizDetailListing.id] ?? null}
                    onChange={(next) =>
                      setListingCommentRatings((prev) => ({ ...prev, [mobileBizDetailListing.id]: next }))
                    }
                  />
                  <div style={{ marginTop: 4, fontSize: 12, color: t.textMuted }}>Optional rating</div>
                </div>
                <textarea
                  value={listingCommentInputs[mobileBizDetailListing.id] ?? ""}
                  onChange={(e) =>
                    setListingCommentInputs((prev) => ({ ...prev, [mobileBizDetailListing.id]: e.target.value }))
                  }
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
                    onClick={() => void handleSubmitMobileBizListingComment(mobileBizDetailListing.id)}
                    disabled={
                      !userId ||
                      submittingListingCommentFor === mobileBizDetailListing.id ||
                      !(listingCommentInputs[mobileBizDetailListing.id] ?? "").trim()
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
                        submittingListingCommentFor === mobileBizDetailListing.id ||
                        !(listingCommentInputs[mobileBizDetailListing.id] ?? "").trim()
                          ? 0.6
                          : 1,
                    }}
                  >
                    {submittingListingCommentFor === mobileBizDetailListing.id ? "Posting..." : "Post Comment"}
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {(listingCommentsById[mobileBizDetailListing.id] ?? []).length === 0 ? (
                  <div style={{ fontSize: 13, color: t.textMuted }}>No comments yet.</div>
                ) : (
                  (listingCommentsById[mobileBizDetailListing.id] ?? []).map((comment) => (
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
                            <img
                              src={comment.authorPhotoUrl}
                              alt={comment.authorName}
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
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

      {selectedFeedEvent && typeof document !== "undefined" &&
        createPortal(
          <div
            onClick={() => setSelectedFeedEvent(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 2000,
              display: "grid",
              placeItems: "center",
              padding: isMobile ? 10 : 16,
              boxSizing: "border-box",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: isMobile ? "100%" : "min(720px, 94vw)",
                maxWidth: "100%",
                maxHeight: isMobile ? "92dvh" : "86vh",
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                borderRadius: isMobile ? 12 : 14,
                border: `1px solid ${t.border}`,
                background: t.bg,
                color: t.text,
                boxShadow: "0 18px 46px rgba(0,0,0,0.34)",
                padding: isMobile ? 14 : 16,
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Event Details</div>
                <button
                  type="button"
                  onClick={() => setSelectedFeedEvent(null)}
                  style={{
                    border: `1px solid ${t.border}`,
                    background: t.surface,
                    color: t.text,
                    borderRadius: 8,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.3 }}>
                {selectedFeedEvent.title || "Untitled event"}
              </div>
              {selectedFeedEvent.organization && (
                <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>
                  {selectedFeedEvent.organization}
                </div>
              )}

              {selectedFeedEvent.image_url && (
                <div
                  style={{
                    marginTop: 12,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: `1px solid ${t.border}`,
                  }}
                >
                  <img
                    src={httpsAssetUrl(selectedFeedEvent.image_url)}
                    alt={selectedFeedEvent.title ?? ""}
                    style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
                  />
                </div>
              )}

              {selectedFeedEvent.date && (
                <div style={{ marginTop: 12, fontSize: 14 }}>
                  <strong>Date:</strong> {formatEventDisplayDate(selectedFeedEvent.date) ?? selectedFeedEvent.date}
                </div>
              )}
              {selectedFeedEvent.event_time && (
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  <strong>Time:</strong> {selectedFeedEvent.event_time}
                </div>
              )}
              {selectedFeedEvent.location && (
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  <strong>Location:</strong> {selectedFeedEvent.location}
                </div>
              )}
              {(selectedFeedEvent.poc_name || selectedFeedEvent.poc_phone) && (
                <div style={{ marginTop: 6, fontSize: 14 }}>
                  <strong>POC:</strong> {selectedFeedEvent.poc_name ?? ""}
                  {selectedFeedEvent.poc_name && selectedFeedEvent.poc_phone ? " — " : ""}
                  {selectedFeedEvent.poc_phone ?? ""}
                </div>
              )}
              {selectedFeedEvent.description && (
                <div style={{ marginTop: 10, fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>
                  {selectedFeedEvent.description}
                </div>
              )}

              <div style={{ marginTop: 16, minWidth: 0 }}>
                <EventScrapbookPreview
                  eventId={selectedFeedEvent.id}
                  t={t}
                  accentColor={isDark ? "#a78bfa" : "#7c3aed"}
                  isMobile={isMobile}
                  panelBackground={t.surface}
                  scrapbookActorUserId={userId}
                  scrapbookActorIsAdmin={isAdmin}
                />
              </div>

              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 0, width: "100%" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => void toggleSelectedFeedEventRsvp("interested")}
                    disabled={selectedFeedEventBusy}
                    style={{
                      background: selectedFeedEventMyStatus === "interested" ? t.text : t.surface,
                      color: selectedFeedEventMyStatus === "interested" ? t.surface : t.textMuted,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontWeight: 700,
                      cursor: selectedFeedEventBusy ? "wait" : "pointer",
                    }}
                  >
                    {selectedFeedEventMyStatus === "interested" ? "Interested ✓" : "Interested"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleSelectedFeedEventRsvp("going")}
                    disabled={selectedFeedEventBusy}
                    style={{
                      background: selectedFeedEventMyStatus === "going" ? t.text : t.surface,
                      color: selectedFeedEventMyStatus === "going" ? t.surface : t.textMuted,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontWeight: 700,
                      cursor: selectedFeedEventBusy ? "wait" : "pointer",
                    }}
                  >
                    {selectedFeedEventMyStatus === "going" ? "Going ✓" : "Going"}
                  </button>
                  {selectedFeedEvent.signup_url && (
                    <ExternalSiteLink
                      href={httpsAssetUrl(selectedFeedEvent.signup_url)}
                      style={{
                        marginLeft: "auto",
                        alignSelf: "center",
                        fontSize: 13,
                        fontWeight: 800,
                        color: t.textMuted,
                        textDecoration: "none",
                      }}
                    >
                      Open Event Link
                    </ExternalSiteLink>
                  )}
                </div>
                {selectedFeedEvent.id && (
                  <EventAttendeeAvatarRows
                    interested={selectedFeedEventAttendeePreviews.interested}
                    going={selectedFeedEventAttendeePreviews.going}
                    onOpenInterested={() => setFeedEventAttendeesListModal("interested")}
                    onOpenGoing={() => setFeedEventAttendeesListModal("going")}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {feedEventAttendeesListModal !== null && selectedFeedEvent?.id && (
        <EventAttendeesListModal
          open
          eventId={selectedFeedEvent.id}
          status={feedEventAttendeesListModal}
          onClose={() => setFeedEventAttendeesListModal(null)}
        />
      )}
      {rabbitholeModalPost && (
        <AddToRabbitholeModal
          open={true}
          post={rabbitholeModalPost}
          onClose={() => setRabbitholeModalPost(null)}
          onSuccess={(threadId) => {
            setPosts((prev) =>
              prev.map((p) =>
                p.id === rabbitholeModalPost.id ? { ...p, rabbithole_thread_id: threadId } : p
              )
            );
            setRabbitholeModalPost(null);
          }}
        />
      )}
      {userId && !isDesktopShell && sidebarDrawer.open && (
        <SidebarThreadDrawer
          open
          onClose={() => setSidebarDrawer({ open: false, peerId: null })}
          currentUserId={userId}
          peerUserId={sidebarDrawer.peerId}
        />
      )}
      {plankHolderModalOpen && (
        <PlankHolderEarnedModal
          open
          number={plankHolderChallenge?.plankHolderNumber}
          profileHref={userId ? `/profile/${userId}` : "/profile"}
          onClose={closePlankHolderModal}
        />
      )}
      {plankHolderToast && <PlankHolderChallengeToast toast={plankHolderToast} />}
    </>
  );
}
