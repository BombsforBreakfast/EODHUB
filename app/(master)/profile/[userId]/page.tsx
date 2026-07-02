"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/lib/supabaseClient";
import DesktopLayout from "../../../components/DesktopLayout";
import ImageCropDialog from "../../../components/ImageCropDialog";
import { useTheme } from "../../../lib/ThemeContext";
import { ASPECT_AVATAR, ASPECT_EMPLOYER_LOGO } from "../../../lib/imageCropTargets";
import MentionTextarea, { extractMentionIds } from "../../../components/MentionTextarea";
import GifPickerButton from "../../../components/GifPickerButton";
import { PostLikersStack, type PostLikerBrief } from "../../../components/PostLikersStack";
import SidebarThreadDrawer from "../../../components/SidebarThreadDrawer";
import { useMasterShell } from "../../../components/master/masterShellContext";
import EventFeedActions from "../../../components/EventFeedActions";
import { ExternalSiteLink } from "../../../components/ExternalSiteEmbedModal";
import FeedPostHeader from "../../../components/FeedPostHeader";
import HideBlockUserButton from "../../../components/HideBlockUserButton";
import PostAsSelector from "../../../components/PostAsSelector";
import {
  adminPostDisplayName,
  canUsePostAsSelector,
  loadStoredPostAsMode,
  resolvePostAsModeFromPost,
  resolvePostAsUserIdForSubmit,
  storePostAsMode,
  type PostAsAdminProfile,
  type PostAsMode,
} from "../../../lib/postAsIdentity";
import { extractFirstUrl, isEmailDomainMatch, URL_PATTERN_G } from "../../../lib/urlPreview";
import ExpandableText from "../../../components/ExpandableText";
import { getSidebarNudgePeer, sidebarNudgeDismissStorageKey } from "../../../lib/commentSidebarEligibility";
import { fetchBlockedUserIds, filterBlockedRows } from "../../../lib/userBlocks";
import { prepareCroppedImageBlob, prepareFeedUploadFile, prepareEmployerDocumentUpload, prepareImageUploadFile } from "../../../lib/prepareUploadFile";
import { FeedMediaAttachment } from "../../../components/FeedMediaAttachment";
import OptimizedAvatarImg from "../../../components/OptimizedAvatarImg";
import { galleryImageDisplayUrl } from "../../../lib/storageImageUrl";
import { handlePasteImageFromClipboard } from "../../../lib/pasteImageFromClipboard";
import { FEED_VIDEO_PDF_ACCEPT, openFeedMediaPicker } from "../../../lib/native/pickFeedMedia";
import {
  EMPLOYER_DOCUMENT_ACCEPT,
  FEED_ATTACHMENT_ACCEPT,
  inferEmployerDocumentContentType,
} from "../../../lib/uploadLimits";
import {
  attachmentRenderKindFromFile,
  CAD_PREVIEW_IMAGE_ACCEPT,
  validateFeedAttachmentPick,
  validateImagePick,
  UPLOAD_LIMITS,
  feedUploadLimitsForAccount,
  formatUploadBytes,
  isImageFile,
  isVideoFile,
  isVideoUrl,
} from "../../../lib/uploadLimits";
import {
  CAD_FILE_PREFIX,
  CAD_PREVIEW_PREFIX,
  attachmentsFromUrls,
  buildCadStorageFileName,
  createCadAttachmentToken,
  isPreviewImageForCad,
} from "../../../lib/postAttachments";
import YouTubeEmbed, { firstYouTubeUrlFromText, getYouTubeVideoId, sameYouTubeVideo } from "../../../components/YouTubeEmbed";
import { cancelDelayedLikeNotify, scheduleDelayedLikeNotify } from "../../../lib/likeNotifyDelay";
import { postNotifyJson } from "../../../lib/postNotifyClient";
import KangarooCourtFeedSection from "../../../components/KangarooCourtFeedSection";
import { KangarooCourtVerdictBanner } from "../../../components/KangarooCourtVerdictBanner";
import { Gem, Medal, Camera, FileText, Play, Check, ArrowRight, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { FEED_MEDIA_FRAME_BG, feedContainedImageStyle } from "../../../lib/feedLayout";
import { SkillBadgeValue } from "../../../lib/skillBadges";
import type {
  FeedKangarooBundle,
  KangarooCourtOptionRow,
  KangarooCourtRow,
  KangarooCourtVerdictRow,
  KangarooCourtVoteTotalRow,
} from "../../../lib/kangarooCourt";
import { voteCountsByCourtFromTotals } from "../../../lib/kangarooCourt";
import { sanitizeRumintOgDescription } from "../../../lib/sanitizeRumintOgDescription";
import { ReactionLeaderboard, ReactionPickerTrigger } from "../../../components/ReactionBar";
import {
  aggregatesBySubjectId,
  applyContentReaction,
  buildReactorDisplayNamesByTypeForSubject,
  emptyAggregate,
  fetchContentReactionsForSubjects,
  type ReactionType,
} from "../../../lib/reactions";
import { ServiceSealValue } from "../../../lib/serviceSeals";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../../../lib/flagCategories";
import { isInternalOnlyPureAdmin, STAFF_DEFAULT_PROFILE_PHOTO_PATH } from "../../../lib/pureAdminAllowlist";
import { getServiceRingColor } from "../../../lib/serviceBranchVisual";
import { buildLoginReferralUrl } from "../../../lib/referralLink";
import { shareOrCopyUrl } from "../../../lib/native/nativeShare";
import { ReferralQrModal } from "../../../components/profile/ReferralQrModal";
import { usePageTracking } from "../../../hooks/usePageTracking";
import { PAGE_TRACKING } from "../../../lib/pageTrackingPaths";
import { PlankHolderBadge } from "../../../components/challenges/PlankHolderBadge";
import { PlankHolderEarnedModal } from "../../../components/challenges/PlankHolderEarnedModal";
import { PlankHolderChallengeToast } from "../../../components/challenges/PlankHolderChallengeToast";
import BusinessCommerceManager from "../../../components/commerce/BusinessCommerceManager";
import BusinessCommerceSection from "../../../components/commerce/BusinessCommerceSection";
import BusinessProfileCard from "../../../components/commerce/BusinessProfileCard";
import {
  dismissPlankHolderModal,
  fetchPlankHolderProgress,
  newlyCompletedTasks,
  PLANK_HOLDER_TASK_LABELS,
  recordPlankHolderInvite,
  trackPlankHolderEvent,
  type PlankHolderResponse,
  type PlankHolderToastState,
} from "../../../lib/plankHolderChallengeClient";
import { isEmployerAccount, MEMBER_STATUS_OPTIONS } from "../../../lib/profileCompleteness";
import EmployerAccountCardDetails from "../../../components/profile/EmployerAccountCardDetails";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "../../../lib/businessOrgPages";
import {
  fetchFeedPostEnrichment,
  type FeedPostEnrichmentProfile,
} from "../../../lib/queries/feedPostEnrichment";

type Profile = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  photo_url: string | null;
  role: string | null;
  resume_text: string | null;
  tech_types: string[] | string | null;
  verification_status: string | null;
  service: string | null;
  status: string | null;
  years_experience: string | null;
  skill_badge: string | null;
  referral_code: string | null;
  plank_holder_awarded: boolean | null;
  plank_holder_number: number | null;
  plank_holder_seen_modal: boolean | null;
  is_employer: boolean | null;
  employer_verified: boolean | null;
  company_name: string | null;
  account_type: string | null;
  company_website: string | null;
  professional_tags: string[] | null;
  unit_history_tags: string[] | null;
  open_to_opportunities: boolean | null;
  employer_summary: string | null;
  resume_url: string | null;
  education_url: string | null;
  specialized_training: string[] | null;
  specialized_training_docs: Record<string, string> | null;
  availability_type: string | null;
  availability_date: string | null;
  current_city: string | null;
  current_state: string | null;
  willing_to_relocate: boolean | null;
  willing_to_travel: string | null;
  work_preference: string | null;
  clearance_level: string | null;
  clearance_status: string | null;
  clearance_expiration_date: string | null;
  has_oconus_experience: boolean | null;
  has_contract_experience: boolean | null;
  has_federal_le_military_crossover: boolean | null;
  is_pure_admin: boolean | null;
  email: string | null;
  business_profile_intro_seen?: boolean | null;
};

type RawComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url: string | null;
};

type WallComment = RawComment & {
  authorName: string;
  authorPhotoUrl: string | null;
  authorService: string | null;
  likeCount: number;
  myReaction: ReactionType | null;
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

type SavedEventRow = {
  id: string;
  title: string | null;
  organization: string | null;
  date: string | null;
  signup_url: string | null;
  unit_id?: string | null;
  visibility?: string | null;
};

type SavedJobRow = {
  id: string;
  job_id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  category: string | null;
  apply_url: string | null;
  created_at: string | null;
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

type DesktopCalendarEvent = {
  id: string;
  title: string;
  organization: string | null;
  date: string;
  signup_url: string | null;
  unit_id?: string | null;
  visibility?: string | null;
};

type DesktopMemorial = {
  id: string;
  name: string;
  death_date: string;
  source_url: string | null;
  photo_url?: string | null;
  bio?: string | null;
  category?: "military" | "leo_fed" | null;
  service?: string | null;
};

type DesktopConversation = {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string;
  other_user_id: string;
  other_user_name: string;
  other_user_photo: string | null;
  unread_count: number;
  last_message_preview: string | null;
};

type Post = {
  id: string;
  user_id: string;
  post_as_user_id?: string | null;
  content: string;
  created_at: string;
  image_url: string | null;
  gif_url: string | null;
  image_urls: string[];
  likeCount: number;
  commentCount: number;
  myReaction: ReactionType | null;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
  likers: PostLikerBrief[];
  comments: WallComment[];
  og_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  wall_user_id: string | null;
  author_name: string | null;
  authorPhotoUrl: string | null;
  authorService: string | null;
  rabbithole_contribution_id: string | null;
  event_id: string | null;
  feed_event: FeedEventSnapshot | null;
  event_interested_count: number;
  event_going_count: number;
  event_my_attendance: "interested" | "going" | null;
  event_saved: boolean;
  /** Same feed bundles as home G�� courts attach via `feed_post_id` */
  kangaroo?: FeedKangarooBundle | null;
};

type ProfilePhoto = {
  id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  is_pinned: boolean;
  created_at: string;
};

type BusinessWallMediaItem = {
  url: string;
  postId: string;
  createdAt: string;
};

type PhotoComment = {
  id: string;
  photo_id: string;
  user_id: string;
  content: string;
  created_at: string;
  authorName: string;
  authorPhotoUrl: string | null;
};

const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

type GroupTile = {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
};

const SERVICE_OPTIONS = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal", "Civilian Bomb Tech"];
const STATUS_OPTIONS = [...MEMBER_STATUS_OPTIONS];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "LEO/FED", "Civil Service"];
const YEARS_OPTIONS = [...Array.from({ length: 39 }, (_, i) => String(i + 1)), "40+"];
const WORK_TAG_PREVIEW_LIMIT = 3;
const PROFILE_INITIAL_POST_LIMIT = 5;
const PROFILE_AUTO_LOAD_LIMIT = 10;
const PROFILE_LOAD_MORE_INCREMENT = 5;
const WORK_TAG_MAX = 30;
const PROFILE_PHOTO_PREVIEW_LIMIT = 12;
const AVAILABILITY_TYPES = ["ETS", "Retirement", "Available From", "Contract End"];
const WORK_PREFERENCES = ["Remote", "Hybrid", "Onsite", "Flexible"];
const CLEARANCE_LEVELS = ["None", "Secret", "TS", "TS-SCI"];
const CLEARANCE_STATUSES = ["Active", "Expired"];

type KnowStatus = "none" | "pending_outgoing" | "pending_incoming" | "accepted";

type KnownPreviewUser = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  worked_with: boolean;
  viewer_worked_with?: boolean;
};

type ProfileConnectionsResponse = {
  knowCount: number;
  knownPreviewUsers: KnownPreviewUser[];
  relation: {
    id: string;
    status: "pending" | "accepted" | "denied";
    knowStatus: KnowStatus;
    workedWith: boolean;
    viewerWorkedWith: boolean;
  } | null;
};

type ConnectionActionResponse = {
  ok: boolean;
  state?: KnowStatus | "denied";
  connectionId?: string;
  workedWith?: boolean;
  error?: string;
};

function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
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

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  const haystack = `${String(maybe.message ?? "")} ${String(maybe.details ?? "")} ${String(maybe.hint ?? "")}`.toLowerCase();
  return haystack.includes(columnName.toLowerCase()) && (haystack.includes("column") || maybe.code === "42703");
}

function extractLegacyEventTitle(content: string | null | undefined): string | null {
  if (!content) return null;
  const line = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /new event:/i.test(l));
  if (!line) return null;
  const afterLabel = line.replace(/^.*?\bnew event:\s*/i, "").trim();
  if (!afterLabel) return null;
  const titleOnly = afterLabel.replace(/\s+[????????].*$/u, "").trim();
  return titleOnly || null;
}

function normalizeEventTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MENTION_RE_SRC = /@\[([^\]]+)\]\(([^)]+)\)/;

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

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const combined = new RegExp(`(${MENTION_RE_SRC.source})|${URL_PATTERN_G.source}`, "g");
  let lastIndex = 0;
  let match;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[0].startsWith("@[")) {
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
      const raw = match[0].replace(/[.,)>]+$/, "");
      const href = raw.startsWith("http") ? raw : `https://${raw}`;
      parts.push(
        <a key={`url-${match.index}`} href={href} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}>
          {raw}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function OgCard({ og }: { og: OgPreview }) {
  const { t: ogT } = useTheme();
  return (
    <a href={og.url} target="_blank" rel="noreferrer" style={{ display: "block", marginTop: 12, border: `1px solid ${ogT.border}`, borderRadius: 12, overflow: "hidden", background: ogT.bg, textDecoration: "none", color: "inherit" }}>
      {og.image && (
        <img src={og.image} alt={og.title || ""} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
      )}
      <div style={{ padding: "10px 14px" }}>
        {og.siteName && <div style={{ fontSize: 11, color: ogT.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{og.siteName}</div>}
        {og.title && <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3 }}>{og.title}</div>}
        {og.description && <div style={{ fontSize: 13, color: ogT.textMuted, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{og.description}</div>}
        <div style={{ marginTop: 6, fontSize: 12, color: ogT.textFaint, wordBreak: "break-all" }}>{og.url}</div>
      </div>
    </a>
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function normalizeTagInput(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function normalizeTagArray(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of rawValues) {
    if (typeof item !== "string") continue;
    const normalized = normalizeTagInput(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(normalized);
    if (cleaned.length >= WORK_TAG_MAX) break;
  }
  return cleaned;
}

function normalizeTrainingDocs(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== "string" || typeof v !== "string") continue;
    const key = normalizeTagInput(k);
    const url = v.trim();
    if (!key || !url) continue;
    out[key] = url;
  }
  return out;
}

function addUniqueTag(tags: string[], rawValue: string): string[] {
  const nextValue = normalizeTagInput(rawValue);
  if (!nextValue) return tags;
  if (tags.some((tag) => tag.toLowerCase() === nextValue.toLowerCase())) return tags;
  if (tags.length >= WORK_TAG_MAX) return tags;
  return [...tags, nextValue];
}

const CALENDAR_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function anniversaryDate(deathDate: string, year: number) {
  const parts = deathDate.split("-");
  return `${year}-${parts[1]}-${parts[2]}`;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgoShort(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateString).toLocaleDateString();
}

export default function PublicProfilePage() {
  usePageTracking(PAGE_TRACKING.profile);
  const params = useParams();
  const searchParams = useSearchParams();

  const rawUserId = params?.userId;
  const userId =
    typeof rawUserId === "string"
      ? rawUserId
      : Array.isArray(rawUserId)
      ? rawUserId[0]
      : null;

  const { t, isDark } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [businessOrgPage, setBusinessOrgPage] = useState<BusinessOrgPageRow | null>(null);
  const [commerceRefreshKey, setCommerceRefreshKey] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [profileWallHasMorePosts, setProfileWallHasMorePosts] = useState(false);
  const [profileWallLoadingMore, setProfileWallLoadingMore] = useState(false);
  const profilePostLimitRef = useRef(PROFILE_INITIAL_POST_LIMIT);
  const profileAutoLoadTriggeredRef = useRef(false);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [myGroups, setMyGroups] = useState<GroupTile[]>([]);
  const [showAllModal, setShowAllModal] = useState<
    "photos" | "groups" | "business-wall-photos" | "business-wall-videos" | null
  >(null);
  const [loading, setLoading] = useState(true);

  /** Own-wall only: saved events (saved jobs live under My Account) */
  const [wallSavedEvents, setWallSavedEvents] = useState<
    SavedEventRow[]
  >([]);
  const [desktopSavedEvents, setDesktopSavedEvents] = useState<SavedEventRow[]>([]);
  const [desktopSavedJobs, setDesktopSavedJobs] = useState<SavedJobRow[]>([]);
  const [unsavingWallEvent, setUnsavingWallEvent] = useState<string | null>(null);
  const [unsavingDesktopJobId, setUnsavingDesktopJobId] = useState<string | null>(null);
  const [desktopCalendarDate, setDesktopCalendarDate] = useState(() => new Date());
  const [desktopCalendarEvents, setDesktopCalendarEvents] = useState<DesktopCalendarEvent[]>([]);
  const [desktopMemorials, setDesktopMemorials] = useState<DesktopMemorial[]>([]);
  const [desktopSelectedDay, setDesktopSelectedDay] = useState<string | null>(null);
  const [desktopConversations, setDesktopConversations] = useState<DesktopConversation[]>([]);

  const [postContent, setPostContent] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [submittingPost, setSubmittingPost] = useState(false);
  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const ogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPostImages, setSelectedPostImages] = useState<Array<{
    file: File;
    previewUrl: string;
    kind: "image" | "video" | "pdf" | "cad3d" | "other";
    cadToken?: string;
    cadRole?: "file" | "preview";
  }>>([]);
  const [selectedPostGif, setSelectedPostGif] = useState<string | null>(null);
  const postImageInputRef = useRef<HTMLInputElement | null>(null);
  const postVideoPdfInputRef = useRef<HTMLInputElement | null>(null);
  const postCadPreviewInputRef = useRef<HTMLInputElement | null>(null);
  const postWallPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const postWallVideoInputRef = useRef<HTMLInputElement | null>(null);
  const [lightboxVideoUrl, setLightboxVideoUrl] = useState<string | null>(null);
  const postContentRawRef = useRef("");
  const commentRawsRef = useRef<Record<string, string>>({});

  const [knowCount, setKnowCount] = useState(0);
  const [knownPreviewUsers, setKnownPreviewUsers] = useState<KnownPreviewUser[]>([]);
  const [currentUserWorkedWith, setCurrentUserWorkedWith] = useState(false);
  const [currentUserKnowStatus, setCurrentUserKnowStatus] = useState<KnowStatus>("none");
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [isMutualConnection, setIsMutualConnection] = useState(false);
  const [togglingConnection, setTogglingConnection] = useState<"know" | "worked_with" | "confirm" | "deny" | null>(null);

  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [togglingPinnedId, setTogglingPinnedId] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [sidebarDrawer, setSidebarDrawer] = useState<{ open: boolean; peerId: string | null }>({
    open: false,
    peerId: null,
  });
  const [sidebarNudgeBump, setSidebarNudgeBump] = useState(0);

  const { isDesktopShell, openSidebarPeer } = useMasterShell();

  function openThreadSidebar(peerId: string) {
    if (isDesktopShell) openSidebarPeer(peerId);
    else setSidebarDrawer({ open: true, peerId });
  }

  const [editingProfile, setEditingProfile] = useState(false);
  const [editRole, setEditRole] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editService, setEditService] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editYearsExp, setEditYearsExp] = useState("");
  const [editSkillBadge, setEditSkillBadge] = useState("");
  const [editCompanyWebsite, setEditCompanyWebsite] = useState("");
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editBusinessEmail, setEditBusinessEmail] = useState("");
  const [editBusinessWebsite, setEditBusinessWebsite] = useState("");
  const [editBusinessLocation, setEditBusinessLocation] = useState("");
  const [editBusinessAddress, setEditBusinessAddress] = useState("");
  const [editBusinessPhone, setEditBusinessPhone] = useState("");
  const [editBusinessOwnerInfo, setEditBusinessOwnerInfo] = useState("");
  const [editBusinessPageType, setEditBusinessPageType] = useState<"business" | "organization">("business");
  const [editOpenToOpportunities, setEditOpenToOpportunities] = useState(false);
  const [editEmployerSummary, setEditEmployerSummary] = useState("");
  const [editResumeUrl, setEditResumeUrl] = useState("");
  const [editEducationUrl, setEditEducationUrl] = useState("");
  const [editSpecializedTraining, setEditSpecializedTraining] = useState<string[]>([]);
  const [editSpecializedTrainingDocs, setEditSpecializedTrainingDocs] = useState<Record<string, string>>({});
  const [draftSpecializedTraining, setDraftSpecializedTraining] = useState("");
  const [editAvailabilityType, setEditAvailabilityType] = useState("");
  const [editAvailabilityDate, setEditAvailabilityDate] = useState("");
  const [editCurrentCity, setEditCurrentCity] = useState("");
  const [editCurrentState, setEditCurrentState] = useState("");
  const [editWillingToRelocate, setEditWillingToRelocate] = useState(false);
  const [editWillingToTravel, setEditWillingToTravel] = useState("");
  const [editWorkPreference, setEditWorkPreference] = useState("");
  const [editClearanceLevel, setEditClearanceLevel] = useState("");
  const [editClearanceStatus, setEditClearanceStatus] = useState("");
  const [editClearanceExpirationDate, setEditClearanceExpirationDate] = useState("");
  const [editHasOconusExperience, setEditHasOconusExperience] = useState(false);
  const [editHasContractExperience, setEditHasContractExperience] = useState(false);
  const [editHasFederalLeMilitaryCrossover, setEditHasFederalLeMilitaryCrossover] = useState(false);
  const [editProfessionalTags, setEditProfessionalTags] = useState<string[]>([]);
  const [editUnitHistoryTags, setEditUnitHistoryTags] = useState<string[]>([]);
  const [draftProfessionalTag, setDraftProfessionalTag] = useState("");
  const [draftUnitHistoryTag, setDraftUnitHistoryTag] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [lightboxPhoto, setLightboxPhoto] = useState<ProfilePhoto | null>(null);
  const [expandedCommentImageUrl, setExpandedCommentImageUrl] = useState<string | null>(null);
  const [expandedProfilePhotoUrl, setExpandedProfilePhotoUrl] = useState<string | null>(null);
  const [photoLikes, setPhotoLikes] = useState<Record<string, { count: number; likedByMe: boolean }>>({});
  const postsRef = useRef<Post[]>([]);
  const photoLikesRef = useRef<Record<string, { count: number; likedByMe: boolean }>>({});
  const [photoComments, setPhotoComments] = useState<Record<string, PhotoComment[]>>({});
  const [photoCommentInput, setPhotoCommentInput] = useState("");
  const [togglingPhotoLikeFor, setTogglingPhotoLikeFor] = useState<string | null>(null);
  const [submittingPhotoComment, setSubmittingPhotoComment] = useState(false);

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserPhotoUrl, setCurrentUserPhotoUrl] = useState<string | null>(null);
  const [postAsMode, setPostAsMode] = useState<PostAsMode>(() => loadStoredPostAsMode());
  const [postAsAdminProfile, setPostAsAdminProfile] = useState<PostAsAdminProfile | null>(null);
  const [viewerIsEmployer, setViewerIsEmployer] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  type ConnListType = "know" | "recruited";
  const [connListOpen, setConnListOpen] = useState<ConnListType | null>(null);
  const [connListUsers, setConnListUsers] = useState<(KnownPreviewUser & { service?: string | null })[]>([]);
  const [connListLoading, setConnListLoading] = useState(false);

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [expandedCommentTexts, setExpandedCommentTexts] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [togglingLikeFor, setTogglingLikeFor] = useState<string | null>(null);
  const [submittingCommentFor, setSubmittingCommentFor] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [editingPostAsMode, setEditingPostAsMode] = useState<PostAsMode>("self");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagModal, setFlagModal] = useState<{ contentType: "post"; contentId: string } | null>(null);
  const [flagCategoryChoice, setFlagCategoryChoice] = useState<FlagCategory>("general");
  const [togglingCommentLikeFor, setTogglingCommentLikeFor] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [wallAvatarCropOpen, setWallAvatarCropOpen] = useState(false);
  const [wallAvatarCropSrc, setWallAvatarCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const bioTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);
  const educationFileInputRef = useRef<HTMLInputElement | null>(null);
  const trainingFileInputRef = useRef<HTMLInputElement | null>(null);
  const [referralActionState, setReferralActionState] = useState<"idle" | "copied" | "shared">("idle");
  const [referralQrOpen, setReferralQrOpen] = useState(false);
  const [plankHolderChallenge, setPlankHolderChallenge] = useState<PlankHolderResponse | null>(null);
  const plankHolderChallengeRef = useRef<PlankHolderResponse | null>(null);
  const plankHolderInitializedRef = useRef(false);
  const handledChallengeParamRef = useRef<string | null>(null);
  const plankHolderToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [plankHolderToast, setPlankHolderToast] = useState<PlankHolderToastState>(null);
  const [plankHolderModalOpen, setPlankHolderModalOpen] = useState(false);
  const [showDesktopProfileBack, setShowDesktopProfileBack] = useState(false);
  const [showAllWorkHistoryTags, setShowAllWorkHistoryTags] = useState(false);
  const canViewEmployerBackNow = (currentUserId === profile?.user_id) || viewerIsAdmin || (viewerIsEmployer && !!profile?.open_to_opportunities);
  const [uploadingResumeDoc, setUploadingResumeDoc] = useState(false);
  const [uploadingEducationDoc, setUploadingEducationDoc] = useState(false);
  const [uploadingTrainingTag, setUploadingTrainingTag] = useState<string | null>(null);
  const [trainingUploadTargetTag, setTrainingUploadTargetTag] = useState<string | null>(null);
  const [businessProfileIntroDismissed, setBusinessProfileIntroDismissed] = useState<boolean | null>(null);
  const [businessProfileVisitorPreview, setBusinessProfileVisitorPreview] = useState(false);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    photoLikesRef.current = photoLikes;
  }, [photoLikes]);

  useEffect(() => {
    if (isMobile) setShowDesktopProfileBack(false);
  }, [isMobile, userId]);

  useEffect(() => {
    if (!canViewEmployerBackNow) setShowDesktopProfileBack(false);
  }, [canViewEmployerBackNow]);

  useEffect(() => {
    setBusinessProfileVisitorPreview(false);
  }, [userId]);

  useEffect(() => {
    if (!businessProfileVisitorPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBusinessProfileVisitorPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [businessProfileVisitorPreview]);

  useEffect(() => {
    setShowAllWorkHistoryTags(false);
    profilePostLimitRef.current = PROFILE_INITIAL_POST_LIMIT;
    setProfileWallHasMorePosts(false);
    setProfileWallLoadingMore(false);
    profileAutoLoadTriggeredRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.account_type !== "business_org" || currentUserId !== profile.user_id) {
      setBusinessProfileIntroDismissed(null);
      return;
    }
    const seen =
      profile.business_profile_intro_seen === true ||
      (typeof window !== "undefined" &&
        !!currentUserId &&
        window.localStorage.getItem(`business-profile-intro-dismissed:${currentUserId}`) === "1");
    setBusinessProfileIntroDismissed(seen);
  }, [loading, profile, currentUserId]);

  async function dismissBusinessProfileIntro() {
    setBusinessProfileIntroDismissed(true);
    if (!currentUserId) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`business-profile-intro-dismissed:${currentUserId}`, "1");
    }
    setProfile((prev) => (prev ? { ...prev, business_profile_intro_seen: true } : prev));
    const { error } = await supabase
      .from("profiles")
      .update({ business_profile_intro_seen: true })
      .eq("user_id", currentUserId);
    if (error) console.error("Business profile intro dismiss error:", error);
  }

  useEffect(() => {
    if (!editingProfile) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditingProfile(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [editingProfile]);

  useEffect(() => {
    if (!currentUserId) return;
    const onSavedJobsChanged = () => {
      void loadDesktopSavedJobs(currentUserId);
    };
    window.addEventListener("eod:saved-jobs-changed", onSavedJobsChanged as EventListener);
    return () => {
      window.removeEventListener("eod:saved-jobs-changed", onSavedJobsChanged as EventListener);
    };
  }, [currentUserId]);

  const applyPlankHolderResponse = useCallback((next: PlankHolderResponse | null) => {
    if (!next) return;
    const previous = plankHolderChallengeRef.current;
    const completed = newlyCompletedTasks(previous?.progress, next.progress);

    plankHolderChallengeRef.current = next;
    setPlankHolderChallenge(next);

    if (plankHolderInitializedRef.current && completed.length > 0) {
      const task = completed[0];
      setPlankHolderToast({
        title: "? Challenge Updated",
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

  const recordInviteForPlankHolder = useCallback(() => {
    void recordPlankHolderInvite()
      .then(applyPlankHolderResponse)
      .catch((error) => console.error("plank holder invite tracking failed:", error));
  }, [applyPlankHolderResponse]);

  const handleCopyReferralLink = useCallback(() => {
    const referralCode = profile?.referral_code;
    if (!referralCode) return;
    const referralUrl = buildLoginReferralUrl(referralCode);
    void shareOrCopyUrl({
      title: "Join EOD HUB",
      text: "Use my referral link to join EOD HUB.",
      url: referralUrl,
      dialogTitle: "Share referral link",
    }).then((result) => {
      setReferralActionState(result);
      window.setTimeout(() => setReferralActionState("idle"), 2000);
      recordInviteForPlankHolder();
    });
  }, [profile?.referral_code, recordInviteForPlankHolder]);

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
    return () => {
      if (plankHolderToastTimerRef.current) clearTimeout(plankHolderToastTimerRef.current);
    };
  }, []);

  function closeWallAvatarCrop() {
    if (wallAvatarCropSrc) URL.revokeObjectURL(wallAvatarCropSrc);
    setWallAvatarCropSrc(null);
    setWallAvatarCropOpen(false);
  }

  async function finalizeWallAvatarUpload(blob: Blob) {
    if (!currentUserId || currentUserId !== userId) return;
    try {
      setUploadingAvatar(true);
      const prepared = await prepareCroppedImageBlob(blob, "avatar.jpg");
      if (!prepared.ok) {
        alert(prepared.error);
        return;
      }
      const file = prepared.file;
      const safeName = `${Date.now()}-avatar.jpg`;
      const filePath = `${currentUserId}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
      const { error: updateError } = await supabase.from("profiles").update({ photo_url: data.publicUrl }).eq("user_id", currentUserId);
      if (updateError) throw updateError;
      await loadProfile(userId);
      void refreshPlankHolderChallenge();
    } catch (err) {
      console.error(err);
      alert(`Photo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingAvatar(false);
    }
  }

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!currentUserId || currentUserId !== userId) return;
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const pickError = validateImagePick(file);
    if (pickError) {
      alert(pickError);
      return;
    }
    if (wallAvatarCropSrc) URL.revokeObjectURL(wallAvatarCropSrc);
    setWallAvatarCropSrc(URL.createObjectURL(file));
    setWallAvatarCropOpen(true);
  }

  async function uploadEmployerDocument(file: File, folder: string): Promise<string> {
    if (!currentUserId || currentUserId !== userId) throw new Error("Not authorized");
    const prepared = await prepareEmployerDocumentUpload(file);
    if (!prepared.ok) throw new Error(prepared.error);
    file = prepared.file;
    const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "bin";
    const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
    const filePath = `${currentUserId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const contentType = inferEmployerDocumentContentType(file);
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, {
      upsert: true,
      contentType,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("feed-images").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function handleResumeFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploadingResumeDoc(true);
      const url = await uploadEmployerDocument(file, "resume");
      setEditResumeUrl(url);
    } catch (err) {
      alert(`Resume upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingResumeDoc(false);
    }
  }

  async function handleEducationFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setUploadingEducationDoc(true);
      const url = await uploadEmployerDocument(file, "education");
      setEditEducationUrl(url);
    } catch (err) {
      alert(`Education upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingEducationDoc(false);
    }
  }

  async function handleTrainingFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !trainingUploadTargetTag) return;
    try {
      setUploadingTrainingTag(trainingUploadTargetTag);
      const url = await uploadEmployerDocument(file, "training");
      setEditSpecializedTrainingDocs((prev) => ({ ...prev, [trainingUploadTargetTag]: url }));
    } catch (err) {
      alert(`Training document upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingTrainingTag(null);
      setTrainingUploadTargetTag(null);
    }
  }

  function openWallEditProfile() {
    if (!profile || currentUserId !== profile.user_id) return;
    if (profile.account_type === "business_org") {
      setEditBusinessName(businessOrgPage?.business_name ?? profileHeadlineName);
      setEditBusinessEmail(businessOrgPage?.business_email ?? profile.email ?? "");
      setEditBusinessWebsite(businessOrgPage?.website_url ?? "");
      setEditBusinessLocation(businessOrgPage?.location ?? "");
      setEditBusinessAddress(businessOrgPage?.address ?? "");
      setEditBusinessPhone(businessOrgPage?.phone ?? "");
      setEditBusinessOwnerInfo(businessOrgPage?.owner_info ?? "");
      setEditBusinessPageType(businessOrgPage?.page_type === "organization" ? "organization" : "business");
      setEditBio(businessOrgPage?.description ?? profile.bio ?? "");
      setEditingProfile(true);
      return;
    }
    setEditCompanyName(profile.company_name ?? "");
    setEditFirstName(profile.first_name ?? "");
    setEditLastName(profile.last_name ?? "");
    setEditRole(profile.role ?? "");
    setEditBio(profile.bio ?? "");
    setEditService(profile.service ?? "");
    setEditStatus(profile.status === "Active" ? "Active Duty" : (profile.status ?? ""));
    setEditYearsExp(profile.years_experience ?? "");
    setEditSkillBadge(profile.skill_badge ?? "");
    setEditCompanyWebsite(profile.company_website ?? "");
    setEditOpenToOpportunities(!!profile.open_to_opportunities);
    setEditEmployerSummary(profile.employer_summary ?? "");
    setEditResumeUrl(profile.resume_url ?? "");
    setEditEducationUrl(profile.education_url ?? "");
    setEditSpecializedTraining(normalizeTagArray(profile.specialized_training));
    setEditSpecializedTrainingDocs(normalizeTrainingDocs(profile.specialized_training_docs));
    setDraftSpecializedTraining("");
    setEditAvailabilityType(profile.availability_type ?? "");
    setEditAvailabilityDate(profile.availability_date ?? "");
    setEditCurrentCity(profile.current_city ?? "");
    setEditCurrentState(profile.current_state ?? "");
    setEditWillingToRelocate(!!profile.willing_to_relocate);
    setEditWillingToTravel(profile.willing_to_travel ?? "");
    setEditWorkPreference(profile.work_preference ?? "");
    setEditClearanceLevel(profile.clearance_level ?? "");
    setEditClearanceStatus(profile.clearance_status ?? "");
    setEditClearanceExpirationDate(profile.clearance_expiration_date ?? "");
    setEditHasOconusExperience(!!profile.has_oconus_experience);
    setEditHasContractExperience(!!profile.has_contract_experience);
    setEditHasFederalLeMilitaryCrossover(!!profile.has_federal_le_military_crossover);
    setEditProfessionalTags(normalizeTagArray(profile.professional_tags));
    setEditUnitHistoryTags(normalizeTagArray(profile.unit_history_tags));
    setDraftProfessionalTag("");
    setDraftUnitHistoryTag("");
    setEditingProfile(true);
  }

  async function handleSaveWallProfile() {
    if (!currentUserId || !profile || currentUserId !== profile.user_id || !userId) return;
    if (profile.account_type === "business_org") {
      if (!businessOrgPage) {
        alert("Business profile details are not available yet.");
        return;
      }
      try {
        setSavingProfile(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          alert("Please sign in again to save changes.");
          return;
        }
        const res = await fetch(`/api/business-org-pages/${encodeURIComponent(businessOrgPage.id)}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            business_name: editBusinessName,
            description: editBio,
            business_email: editBusinessEmail,
            linked_account_email: businessOrgPage.linked_account_email,
            logo_url: businessOrgPage.logo_url,
            website_url: editBusinessWebsite,
            location: editBusinessLocation,
            address: editBusinessAddress,
            phone: editBusinessPhone,
            owner_info: editBusinessOwnerInfo,
            page_type: editBusinessPageType,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { page?: BusinessOrgPageRow; error?: string };
        if (!res.ok || !data.page) {
          alert(data.error ?? "Could not save business profile.");
          return;
        }
        setBusinessOrgPage(data.page);
        await loadProfile(userId);
        setEditingProfile(false);
      } finally {
        setSavingProfile(false);
      }
      return;
    }
    const savingEmployerAccount = !!profile.is_employer || isEmployerAccount(profile);
    try {
      setSavingProfile(true);
      const payload = savingEmployerAccount
        ? {
            company_name: editCompanyName.trim() || null,
            first_name: editFirstName.trim() || null,
            last_name: editLastName.trim() || null,
            company_website: editCompanyWebsite.trim() || null,
            bio: editBio.trim() || null,
          }
        : {
            role: editRole || null,
            bio: editBio || null,
            service: editService || null,
            status: editStatus || null,
            years_experience: editYearsExp || null,
            skill_badge: editSkillBadge || null,
            company_website: editCompanyWebsite || null,
            open_to_opportunities: editOpenToOpportunities,
            employer_summary: editEmployerSummary || null,
            resume_url: editResumeUrl || null,
            education_url: editEducationUrl || null,
            specialized_training: editSpecializedTraining.length ? editSpecializedTraining : null,
            specialized_training_docs: Object.keys(editSpecializedTrainingDocs).length ? editSpecializedTrainingDocs : null,
            availability_type: editAvailabilityType || null,
            availability_date: editAvailabilityDate || null,
            current_city: editCurrentCity || null,
            current_state: editCurrentState || null,
            willing_to_relocate: editWillingToRelocate,
            willing_to_travel: editWillingToTravel || null,
            work_preference: editWorkPreference || null,
            clearance_level: editClearanceLevel || null,
            clearance_status: editClearanceStatus || null,
            clearance_expiration_date: editClearanceExpirationDate || null,
            has_oconus_experience: editHasOconusExperience,
            has_contract_experience: editHasContractExperience,
            has_federal_le_military_crossover: editHasFederalLeMilitaryCrossover,
            professional_tags: editProfessionalTags.length ? editProfessionalTags : null,
            unit_history_tags: editUnitHistoryTags.length ? editUnitHistoryTags : null,
          };
      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", currentUserId);
      if (error) {
        alert(error.message);
        return;
      }
      await loadProfile(userId);
      void refreshPlankHolderChallenge();
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  }

  async function loadProfile(targetUserId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (error) {
      console.error("Profile load error:", error);
      return;
    }

    const profileData = (data as Profile | null) ?? null;
    setProfile(profileData);
    setBusinessOrgPage(null);

    if (profileData?.account_type === "business_org") {
      let resolvedPage: BusinessOrgPageRow | null = null;
      const { data: directPageData, error: pageError } = await supabase
        .from("business_organization_pages")
        .select(BUSINESS_ORG_PAGE_SELECT)
        .eq("business_auth_user_id", targetUserId)
        .maybeSingle();

      if (pageError) {
        console.error("Business organization page load error:", pageError);
      } else {
        resolvedPage = (directPageData as BusinessOrgPageRow | null) ?? null;
        setBusinessOrgPage(resolvedPage);
      }

      if (!resolvedPage) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
        const res = await fetch(`/api/business-org-pages/by-auth-user/${encodeURIComponent(targetUserId)}`, { headers });
        if (res.ok) {
          const json = (await res.json()) as { page?: BusinessOrgPageRow | null };
          resolvedPage = json.page ?? null;
          setBusinessOrgPage(resolvedPage);
        }
      }
    }

    // Fetch referral count if they have a code
    if (profileData?.referral_code) {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("referred_by", profileData.referral_code)
        .eq("verification_status", "verified");
      setReferralCount(count ?? 0);
    }
  }

  async function openConnList(type: ConnListType) {
    setConnListOpen(type);
    setConnListLoading(true);
    setConnListUsers([]);
    try {
      if (type === "recruited") {
        if (!profile?.referral_code) { setConnListLoading(false); return; }
        const { data } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, photo_url, service")
          .eq("referred_by", profile.referral_code)
          .eq("verification_status", "verified");
        setConnListUsers(
          ((data ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; service: string | null }[])
            .map((u) => ({ ...u, worked_with: false })),
        );
      } else {
        const targetId = userId as string;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setConnListUsers([]);
          return;
        }
        const res = await fetch(`/api/profile-connections?targetUserId=${encodeURIComponent(targetId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          console.error("Connection list load error:", await res.text().catch(() => res.statusText));
          return;
        }
        const connectionData = (await res.json()) as ProfileConnectionsResponse & {
          connections?: (KnownPreviewUser & { service?: string | null })[];
        };
        setConnListUsers(connectionData.connections ?? connectionData.knownPreviewUsers ?? []);
      }
    } finally {
      setConnListLoading(false);
    }
  }

  async function loadPosts(
    targetUserId: string,
    options: { limit?: number; viewerUserId?: string | null; blockedUserIds?: Set<string> } = {},
  ) {
    const effectiveViewerId = options.viewerUserId ?? currentUserId ?? null;
    const effectiveBlockedUserIds = options.blockedUserIds ?? blockedUserIds;
    const visibleLimit = Math.max(
      PROFILE_INITIAL_POST_LIMIT,
      options.limit ?? profilePostLimitRef.current,
    );
    const fetchLimit = visibleLimit + 1;

    void supabase.rpc("close_expired_kangaroo_courts").then(({ error: closeKcErr }) => {
      if (closeKcErr) {
        console.warn("close_expired_kangaroo_courts (wall):", closeKcErr.message);
      }
    });

    const { data: rawData, error } = await supabase
      .from("posts")
      .select("id, user_id, wall_user_id, post_as_user_id, content, created_at, og_url, og_title, og_description, og_image, og_site_name, rabbithole_contribution_id")
      .or(`user_id.eq.${targetUserId},wall_user_id.eq.${targetUserId}`)
      .order("created_at", { ascending: false })
      .limit(fetchLimit);

    if (error) {
      console.error("Profile posts load error:", error);
      return;
    }

    const allMatchedPosts = filterBlockedRows((rawData ?? []) as {
      id: string;
      user_id: string;
      wall_user_id?: string | null;
      post_as_user_id?: string | null;
      content: string;
      created_at: string;
      og_url?: string | null;
      og_title?: string | null;
      og_description?: string | null;
      og_image?: string | null;
      og_site_name?: string | null;
      rabbithole_contribution_id?: string | null;
    }[], effectiveBlockedUserIds, (post) => post.post_as_user_id ?? post.user_id);
    const hasMorePosts = allMatchedPosts.length > visibleLimit;
    const visibleRawPosts = allMatchedPosts.slice(0, visibleLimit);
    setProfileWallHasMorePosts(hasMorePosts);
    if (visibleRawPosts.length === 0) {
      setPosts([]);
      return;
    }

    const postIds = visibleRawPosts.map((p) => p.id);

    // Legacy single image_url
    const legacyWithEvent = await supabase
      .from("posts")
      .select("id, image_url, gif_url, event_id")
      .in("id", postIds);
    let legacyImgData = legacyWithEvent.data as Array<{
      id: string;
      image_url: string | null;
      gif_url: string | null;
      event_id?: string | null;
    }> | null;
    if (legacyWithEvent.error && isMissingColumnError(legacyWithEvent.error, "event_id")) {
      const fallback = await supabase
        .from("posts")
        .select("id, image_url, gif_url")
        .in("id", postIds);
      if (fallback.error) {
        console.error("Legacy post media load error:", fallback.error);
      }
      legacyImgData = ((fallback.data ?? []) as Array<{
        id: string;
        image_url: string | null;
        gif_url: string | null;
      }>).map((row) => ({ ...row, event_id: null }));
    } else if (legacyWithEvent.error) {
      console.error("Legacy post media load error:", legacyWithEvent.error);
    }
    const legacyImageMap = new Map<string, string | null>();
    const gifUrlMap = new Map<string, string | null>();
    const eventIdByPostId = new Map<string, string | null>();
    ((legacyImgData ?? []) as { id: string; image_url: string | null; gif_url: string | null; event_id?: string | null }[]).forEach((r) => {
      legacyImageMap.set(r.id, r.image_url ?? null);
      gifUrlMap.set(r.id, r.gif_url ?? null);
      eventIdByPostId.set(r.id, r.event_id ?? null);
    });

    const missingEventCandidates = visibleRawPosts
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
        console.error("Profile legacy event inference load error:", candidateEventsErr);
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

    const enrichment = await fetchFeedPostEnrichment(supabase, postIds);

    const multiImageMap = enrichment?.multiPostImageMap ?? new Map<string, string[]>();
    if (!enrichment) {
      const { data: postImgData } = await supabase
        .from("post_images")
        .select("id, post_id, image_url, sort_order")
        .in("post_id", postIds)
        .order("sort_order", { ascending: true });
      ((postImgData ?? []) as { id: string; post_id: string; image_url: string; sort_order: number | null }[]).forEach((r) => {
        const arr = multiImageMap.get(r.post_id) || [];
        arr.push(r.image_url);
        multiImageMap.set(r.post_id, arr);
      });
    }

    let reactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
    if (enrichment) {
      reactionRows = enrichment.postReactionRows;
    } else {
      try {
        reactionRows = await fetchContentReactionsForSubjects(supabase, "post", postIds);
      } catch (reactionsErr) {
        console.error("Wall reactions load error:", reactionsErr);
      }
    }
    const aggregatesMap = aggregatesBySubjectId(reactionRows, effectiveViewerId);

    const rawComments: RawComment[] = enrichment
      ? enrichment.comments.map((c) => ({
          id: c.id,
          post_id: c.post_id,
          user_id: c.user_id,
          content: c.content,
          created_at: c.created_at,
          image_url: c.image_url,
        }))
      : ((
          await supabase
            .from("post_comments")
            .select("id, post_id, user_id, content, created_at, image_url")
            .in("post_id", postIds)
            .order("created_at", { ascending: true })
        ).data ?? []) as RawComment[];

    const commentIds = rawComments.map((c) => c.id);
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
        console.error("Wall comment reactions load error:", commentReactionsErr);
      }
    }
    const commentAggregatesMap = aggregatesBySubjectId(commentReactionRows, effectiveViewerId);

    const commentNameMap = new Map<string, string>();
    const commentPhotoMap = new Map<string, string | null>();
    const commentServiceMap = new Map<string, string | null>();
    const commentEmployerMap = new Map<string, boolean | null>();

    function applyEnrichmentProfileMaps(profiles: FeedPostEnrichmentProfile[]) {
      profiles.forEach((p) => {
        commentNameMap.set(
          p.user_id,
          (p.display_name?.trim() || null) ||
            `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
            "User",
        );
        commentPhotoMap.set(p.user_id, p.photo_url ?? null);
        commentServiceMap.set(p.user_id, p.service ?? null);
        commentEmployerMap.set(p.user_id, p.is_employer ?? null);
      });
    }

    if (enrichment) {
      applyEnrichmentProfileMaps(enrichment.profiles);
    } else {
      const postLikerUserIds = reactionRows.map((r) => r.user_id);
      const commentReactorUserIds = commentReactionRows.map((r) => r.user_id);
      const commentAuthorIds = [...new Set(rawComments.map((c) => c.user_id))];
      const commentAndLikerIds = [
        ...new Set([...commentAuthorIds, ...postLikerUserIds, ...commentReactorUserIds].filter(Boolean)),
      ];
      const { data: commentProfileData } = commentAndLikerIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, display_name, first_name, last_name, photo_url, service, is_employer")
            .in("user_id", commentAndLikerIds)
        : { data: [] };
      applyEnrichmentProfileMaps((commentProfileData ?? []) as FeedPostEnrichmentProfile[]);
    }

    // Build comment map
    const commentsByPost = new Map<string, WallComment[]>();
    rawComments.forEach((c) => {
      const arr = commentsByPost.get(c.post_id) || [];
      const agg = commentAggregatesMap.get(c.id) ?? emptyAggregate();
      arr.push({
        ...c,
        authorName: commentNameMap.get(c.user_id) || "User",
        authorPhotoUrl: commentPhotoMap.get(c.user_id) ?? null,
        authorService: commentServiceMap.get(c.user_id) ?? null,
        likeCount: agg.totalCount,
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          commentReactionRows,
          c.id,
          commentNameMap,
        ),
      });
      commentsByPost.set(c.post_id, arr);
    });

    // Wall post author identities (guest posters + post-as overrides).
    const displayAuthorIds = [
      ...new Set(
        visibleRawPosts
          .map((p) => {
            if (p.post_as_user_id) return p.post_as_user_id;
            if (p.wall_user_id === targetUserId && p.user_id !== targetUserId) return p.user_id;
            return null;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const authorNameMap = new Map<string, string>();
    const authorPhotoMap = new Map<string, string | null>();
    const authorServiceMap = new Map<string, string | null>();
    if (displayAuthorIds.length > 0) {
      const { data: authorProfiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, photo_url, service")
        .in("user_id", displayAuthorIds);
      ((authorProfiles ?? []) as { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; photo_url: string | null; service: string | null }[])
        .forEach((ap) => {
          authorNameMap.set(ap.user_id, ap.display_name || `${ap.first_name || ""} ${ap.last_name || ""}`.trim() || "Member");
          authorPhotoMap.set(ap.user_id, ap.photo_url ?? null);
          authorServiceMap.set(ap.user_id, ap.service ?? null);
        });
    }

    const uniqueFeedEventIds = [
      ...new Set(Array.from(eventIdByPostId.values()).filter((id): id is string => Boolean(id))),
    ];
    const visibleProfileUnitIds = await loadVisibleProfileUnitIds(targetUserId, effectiveViewerId);
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
          console.error("Profile feed events load error:", fallback.error);
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
            description: null,
            image_url: null,
            location: null,
            event_time: null,
            poc_name: null,
            poc_phone: null,
          }));
        }
      } else if (eventsResult.error) {
        console.error("Profile feed events load error:", eventsResult.error);
      } else {
        eventRows = (eventsResult.data ?? []) as FeedEventSnapshot[];
      }
      eventRows
        .filter((event) => !event.unit_id || visibleProfileUnitIds.has(event.unit_id))
        .forEach((event) => eventSnapshotById.set(event.id, event));

      const { data: attRows, error: attErr } = await supabase
        .from("event_attendance")
        .select("event_id, user_id, status")
        .in("event_id", uniqueFeedEventIds);
      if (attErr) {
        console.error("Profile feed event attendance load error:", attErr);
      } else {
        ((attRows ?? []) as { event_id: string; user_id: string; status: "interested" | "going" }[]).forEach((row) => {
          const cur = eventAttCounts.get(row.event_id) ?? { interested: 0, going: 0 };
          cur[row.status]++;
          eventAttCounts.set(row.event_id, cur);
          if (effectiveViewerId && row.user_id === effectiveViewerId) {
            eventMyAttendance.set(row.event_id, row.status);
          }
        });
      }

      if (effectiveViewerId) {
        const { data: savedRows, error: savedErr } = await supabase
          .from("saved_events")
          .select("event_id")
          .eq("user_id", effectiveViewerId)
          .in("event_id", uniqueFeedEventIds);
        if (savedErr) {
          console.error("Profile feed saved events load error:", savedErr);
        } else {
          ((savedRows ?? []) as { event_id: string }[]).forEach((row) => savedFeedEventIds.add(row.event_id));
        }
      }
    }

    const kcBundleByPostId = new Map<string, FeedKangarooBundle>();
    const { data: kcAuth } = await supabase.auth.getSession();
    const kcViewerId = kcAuth.session?.user?.id ?? null;

    if (postIds.length > 0) {
      const { data: courtsRaw, error: courtsErr } = await supabase
        .from("kangaroo_courts")
        .select(
          "id, feed_post_id, unit_post_id, unit_id, opened_by, status, duration_hours, expires_at, closed_at, winning_option_id, total_votes, source, created_at",
        )
        .in("feed_post_id", postIds);

      if (courtsErr) {
        console.error("[KC wall] kangaroo_courts:", courtsErr.message);
      } else {
        const courtsList = (courtsRaw ?? []) as KangarooCourtRow[];
        if (courtsList.length > 0) {
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

          if (!optsRes.error && !verdictsRes.error) {
            const optsByCourt = new Map<string, KangarooCourtOptionRow[]>();
            for (const o of (optsRes.data ?? []) as KangarooCourtOptionRow[]) {
              const arr = optsByCourt.get(o.court_id) ?? [];
              arr.push(o);
              optsByCourt.set(o.court_id, arr);
            }
            const verdictByCourt = new Map<string, KangarooCourtVerdictRow>();
            for (const v of (verdictsRes.data ?? []) as KangarooCourtVerdictRow[]) {
              verdictByCourt.set(v.court_id, v);
            }
            if (voteTotalsRes.error) {
              console.warn("[KC wall] kangaroo_court_vote_totals:", voteTotalsRes.error.message);
            }
            if (myVoteRes.error) {
              console.warn("[KC wall] kangaroo_court_votes (mine):", myVoteRes.error.message);
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
    }

    const merged: Post[] = visibleRawPosts.map((p) => {
      const agg = aggregatesMap.get(p.id) ?? emptyAggregate();
      const postLikes = agg.userIds;
      const seenLiker = new Set<string>();
      const orderedLikerIds = postLikes.filter((uid) => {
        if (seenLiker.has(uid)) return false;
        seenLiker.add(uid);
        return true;
      });
      const likers: PostLikerBrief[] = orderedLikerIds.map((uid) => ({
        userId: uid,
        name: commentNameMap.get(uid) || "User",
        photoUrl: commentPhotoMap.get(uid) ?? null,
        service: commentServiceMap.get(uid) ?? null,
        isEmployer: commentEmployerMap.get(uid) ?? null,
      }));
      const multiImages = multiImageMap.get(p.id) || [];
      const legacyImage = legacyImageMap.get(p.id) ?? null;
      const postComments = commentsByPost.get(p.id) || [];
      const eventId = eventIdByPostId.get(p.id) ?? null;
      const eventCounts = eventId ? eventAttCounts.get(eventId) ?? { interested: 0, going: 0 } : { interested: 0, going: 0 };
      const displayAuthorId =
        p.post_as_user_id ??
        (p.wall_user_id === targetUserId && p.user_id !== targetUserId ? p.user_id : null);
      return {
        ...p,
        post_as_user_id: p.post_as_user_id ?? null,
        image_url: legacyImage,
        gif_url: gifUrlMap.get(p.id) ?? null,
        image_urls: multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        likeCount: agg.totalCount,
        commentCount: postComments.length,
        myReaction: agg.myReaction,
        reactionCountsByType: agg.countsByType,
        reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(
          reactionRows,
          p.id,
          commentNameMap,
        ),
        likers,
        comments: postComments,
        og_url: p.og_url ?? null,
        og_title: p.og_title ?? null,
        og_description: p.og_description ?? null,
        og_image: p.og_image ?? null,
        og_site_name: p.og_site_name ?? null,
        wall_user_id: p.wall_user_id ?? null,
        rabbithole_contribution_id: p.rabbithole_contribution_id ?? null,
        author_name: displayAuthorId ? (authorNameMap.get(displayAuthorId) ?? null) : null,
        authorPhotoUrl: displayAuthorId ? (authorPhotoMap.get(displayAuthorId) ?? null) : null,
        authorService: displayAuthorId ? (authorServiceMap.get(displayAuthorId) ?? null) : null,
        event_id: eventId,
        feed_event: eventId ? eventSnapshotById.get(eventId) ?? null : null,
        event_interested_count: eventCounts.interested,
        event_going_count: eventCounts.going,
        event_my_attendance: eventId ? eventMyAttendance.get(eventId) ?? null : null,
        event_saved: Boolean(eventId && effectiveViewerId && savedFeedEventIds.has(eventId)),
        kangaroo: kcBundleByPostId.get(p.id) ?? null,
      };
    });

    setPosts(merged);
  }

  async function loadMoreProfileWallPosts() {
    if (!userId || profileWallLoadingMore || !profileWallHasMorePosts) return;
    const nextLimit = profilePostLimitRef.current + PROFILE_LOAD_MORE_INCREMENT;
    try {
      setProfileWallLoadingMore(true);
      profilePostLimitRef.current = nextLimit;
      await loadPosts(userId, { limit: nextLimit });
    } finally {
      setProfileWallLoadingMore(false);
    }
  }

  async function notify(
    recipientId: string,
    message: string,
    postOwnerIdForNav: string,
    extra?: { type?: string; post_id?: string | null },
  ) {
    if (!currentUserId || recipientId === currentUserId) return;
    const actorName = currentUserName?.trim() || "Someone";
    return postNotifyJson(supabase, {
      user_id: recipientId,
      actor_name: actorName,
      type: extra?.type ?? "wall_activity",
      category: "social",
      message,
      post_owner_id: postOwnerIdForNav,
      post_id: extra?.post_id ?? null,
      link: postOwnerIdForNav ? `/profile/${encodeURIComponent(postOwnerIdForNav)}` : null,
      group_key: extra?.post_id
        ? `post:${extra.post_id}:${extra?.type ?? "wall_activity"}`
        : `wall:${postOwnerIdForNav}:${extra?.type ?? "wall_activity"}`,
      dedupe_key: extra?.post_id
        ? `${extra?.type ?? "wall_activity"}:${extra.post_id}:${currentUserId}`
        : `${extra?.type ?? "wall_activity"}:${recipientId}:${currentUserId}`,
    });
  }

  function isConnV2MissingColumnError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const msg = String((error as { message?: unknown }).message ?? "").toLowerCase();
    return msg.includes("status") || msg.includes("worked_with");
  }

  async function loadConnectionsLegacy(targetUserId: string, effectiveCurrentUserId?: string | null) {
    const { data: outgoing, error } = await supabase
      .from("profile_connections")
      .select("requester_user_id, target_user_id, connection_type")
      .eq("requester_user_id", targetUserId);

    if (error) {
      console.error("Legacy profile connections load error:", error);
      return;
    }

    const rows = (outgoing ?? []) as {
      requester_user_id: string;
      target_user_id: string;
      connection_type: "know" | "worked_with";
    }[];

    const knowRows = rows.filter((r) => r.connection_type === "know" || r.connection_type === "worked_with");
    setKnowCount(knowRows.length);

    if (knowRows.length > 0) {
      const previewIds = knowRows.slice(0, 6).map((r) => r.target_user_id);
      const workedMap = new Map<string, boolean>();
      knowRows.forEach((r) => workedMap.set(r.target_user_id, r.connection_type === "worked_with"));
      const { data: previewProfiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, photo_url")
        .in("user_id", previewIds);
      setKnownPreviewUsers(
        ((previewProfiles ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null }[])
          .map((u) => ({ ...u, worked_with: workedMap.get(u.user_id) ?? false }))
      );
    } else {
      setKnownPreviewUsers([]);
    }

    if (!effectiveCurrentUserId || effectiveCurrentUserId === targetUserId) {
      setCurrentUserWorkedWith(false);
      setCurrentUserKnowStatus("none");
      setActiveConnectionId(null);
      setIsMutualConnection(false);
      return;
    }

    const { data: viewerConn } = await supabase
      .from("profile_connections")
      .select("connection_type")
      .eq("requester_user_id", effectiveCurrentUserId)
      .eq("target_user_id", targetUserId);

    const viewerRows = (viewerConn ?? []) as { connection_type: "know" | "worked_with" }[];
    const myWorkedWith = viewerRows.some((r) => r.connection_type === "worked_with");
    const myKnows = viewerRows.some((r) => r.connection_type === "know");
    setCurrentUserWorkedWith(myWorkedWith);
    setCurrentUserKnowStatus(myWorkedWith || myKnows ? "accepted" : "none");
    setActiveConnectionId(null);
    setIsMutualConnection(myWorkedWith || myKnows);
  }

  async function handleWallPostReaction(postId: string, picked: ReactionType) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    cancelDelayedLikeNotify(`wall:post:${postId}:${currentUserId}`);
    try {
      setTogglingLikeFor(postId);
      const priorReaction = postsRef.current.find((p) => p.id === postId)?.myReaction ?? null;

      await applyContentReaction(supabase, {
        subjectKind: "post",
        subjectId: postId,
        userId: currentUserId,
        picked,
      });

      if (picked === "like" && priorReaction !== "like") {
        let postRow = posts.find((p) => p.id === postId);
        if (!postRow) {
          const { data: row } = await supabase
            .from("posts")
            .select("user_id, wall_user_id")
            .eq("id", postId)
            .maybeSingle();
          if (row) {
            postRow = {
              id: postId,
              user_id: row.user_id,
              wall_user_id: row.wall_user_id ?? null,
            } as Post;
          }
        }
        if (postRow && profile && currentUserId !== postRow.user_id) {
          const navOwner = postRow.wall_user_id ?? postRow.user_id;
          const actorName = currentUserName?.trim() || "Someone";
          const recipientId = postRow.user_id;
          scheduleDelayedLikeNotify(`wall:post:${postId}:${currentUserId}`, () => {
            const p = postsRef.current.find((x) => x.id === postId);
            if (p?.myReaction !== "like") return;
            return notify(recipientId, `${actorName} liked your post`, navOwner, { type: "wall_like", post_id: postId });
          });
        }
      }

      if (userId) await loadPosts(userId);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingLikeFor(null);
    }
  }

  async function handleWallCommentReaction(commentId: string, picked: ReactionType) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    cancelDelayedLikeNotify(`wall:comment:${commentId}:${currentUserId}`);
    try {
      setTogglingCommentLikeFor(commentId);

      const priorReaction =
        postsRef.current.flatMap((p) => p.comments).find((c) => c.id === commentId)?.myReaction ?? null;

      await applyContentReaction(supabase, {
        subjectKind: "post_comment",
        subjectId: commentId,
        userId: currentUserId,
        picked,
      });

      if (picked === "like" && priorReaction !== "like") {
        const comment = posts.flatMap((p) => p.comments).find((c) => c.id === commentId);
        const ownerPost = comment ? posts.find((p) => p.id === comment.post_id) : undefined;
        if (comment && comment.user_id !== currentUserId && ownerPost) {
          const postIdForComment = comment.post_id;
          const ownerId = ownerPost.user_id;
          const recipientId = comment.user_id;
          const name = currentUserName?.trim() || "Someone";
          scheduleDelayedLikeNotify(`wall:comment:${commentId}:${currentUserId}`, () => {
            const p = postsRef.current.find((x) => x.id === postIdForComment);
            const c = p?.comments.find((x) => x.id === commentId);
            if (c?.myReaction !== "like") return;
            return notify(recipientId, `${name} liked your comment`, ownerId, {
              type: "wall_comment_like",
              post_id: postIdForComment,
            });
          });
        }
      }

      if (userId) await loadPosts(userId);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingCommentLikeFor(null);
    }
  }

  async function submitComment(postId: string) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    const text = (commentRawsRef.current[postId] || commentInputs[postId] || "").trim();
    if (!text) return;
    try {
      setSubmittingCommentFor(postId);
      await supabase.from("post_comments").insert([{ post_id: postId, user_id: currentUserId, content: text }]);
      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      commentRawsRef.current[postId] = "";
      setExpandedComments((prev) => ({ ...prev, [postId]: true }));
      if (profile && currentUserId !== profile.user_id) {
        await notify(profile.user_id, `${currentUserName} commented on your post`, profile.user_id, { type: "wall_comment", post_id: postId });
      }
      const mentionIds = extractMentionIds(text).filter(id => id !== currentUserId);
      if (mentionIds.length > 0) {
        await Promise.all(
          mentionIds.map((uid) =>
            postNotifyJson(supabase, {
              user_id: uid,
              actor_name: currentUserName,
              type: "mention_comment",
              category: "social",
              message: `${currentUserName} mentioned you in a comment`,
              post_owner_id: profile?.user_id ?? null,
              post_id: postId,
              link: `/profile/${encodeURIComponent(profile?.user_id ?? uid)}`,
              group_key: `post:${postId}:mentions`,
              dedupe_key: `mention_comment:${postId}:${uid}:${currentUserId}`,
              metadata: { wall: true, post_id: postId },
            }),
          ),
        );
      }
      const { data: td } = await supabase.from("post_comments").select("user_id").eq("post_id", postId).neq("user_id", currentUserId);
      const participants = [...new Set(((td ?? []) as { user_id: string }[]).map((c) => c.user_id))].filter((id) => id !== profile?.user_id);
      await Promise.all(
        participants.map((pid) =>
          notify(pid, `${currentUserName} also commented on a post you're following`, profile?.user_id ?? pid, { type: "wall_comment_thread", post_id: postId }),
        ),
      );
      if (userId) await loadPosts(userId);
    } finally { setSubmittingCommentFor(null); }
  }

  async function deleteWallPost(postId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Delete this post?")) return;
    try {
      setDeletingPostId(postId);
      await supabase.from("posts").delete().eq("id", postId);
      if (userId) await loadPosts(userId);
    } finally { setDeletingPostId(null); }
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
    if (!currentUserId || !editingPostContent.trim()) return;
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
      if (userId) await loadPosts(userId);
    } finally {
      setSavingPostId(null);
    }
  }

  function openFlagModal(contentId: string) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    setFlagCategoryChoice("general");
    setFlagModal({ contentType: "post", contentId });
  }

  async function submitFlagFromModal() {
    if (!flagModal || !currentUserId) return;
    setFlaggingId(flagModal.contentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(json.error ?? "Could not submit flag");
        return;
      }
      alert("Flagged for review. Thank you.");
      setFlagModal(null);
    } finally {
      setFlaggingId(null);
    }
  }

  async function deleteWallComment(commentId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Delete this comment?")) return;
    try {
      setDeletingCommentId(commentId);
      await supabase.from("post_comments").delete().eq("id", commentId);
      if (userId) await loadPosts(userId);
    } finally { setDeletingCommentId(null); }
  }

  async function loadPhotos(targetUserId: string): Promise<ProfilePhoto[]> {
    const { data, error } = await supabase
      .from("profile_photos")
      .select("*")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Profile photos load error:", error);
      return [];
    }

    const result = (data as ProfilePhoto[]) ?? [];
    setPhotos(result);
    return result;
  }

  async function loadMyGroups(targetUserId: string): Promise<GroupTile[]> {
    const { data: memberships, error: memError } = await supabase
      .from("unit_members")
      .select("unit_id")
      .eq("user_id", targetUserId)
      .eq("status", "approved");

    if (memError) {
      console.error("My groups membership load error:", memError);
      setMyGroups([]);
      return [];
    }

    const unitIds = ((memberships ?? []) as { unit_id: string }[]).map((m) => m.unit_id);
    if (unitIds.length === 0) {
      setMyGroups([]);
      return [];
    }

    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("id, name, slug, cover_photo_url")
      .in("id", unitIds);

    if (unitsError) {
      console.error("My groups units load error:", unitsError);
      setMyGroups([]);
      return [];
    }

    const result = ((units ?? []) as GroupTile[]).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
    );
    setMyGroups(result);
    return result;
  }

  async function loadVisibleProfileUnitIds(profileUserId: string, viewerUserId: string | null): Promise<Set<string>> {
    const { data: profileMemberships } = await supabase
      .from("unit_members")
      .select("unit_id")
      .eq("user_id", profileUserId)
      .eq("status", "approved");
    const profileUnitIds = ((profileMemberships ?? []) as { unit_id: string }[]).map((row) => row.unit_id);
    if (profileUnitIds.length === 0) return new Set();
    if (viewerUserId === profileUserId) return new Set(profileUnitIds);
    if (!viewerUserId) return new Set();

    const { data: viewerMemberships } = await supabase
      .from("unit_members")
      .select("unit_id")
      .eq("user_id", viewerUserId)
      .eq("status", "approved")
      .in("unit_id", profileUnitIds);
    return new Set(((viewerMemberships ?? []) as { unit_id: string }[]).map((row) => row.unit_id));
  }

  async function loadSavedEventsForUser(uid: string) {
    const visibleUnitIds = await loadVisibleProfileUnitIds(uid, currentUserId);
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, signup_url, unit_id, visibility)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Wall saved events load error:", error);
      setWallSavedEvents([]);
      return;
    }
    type RawRow = {
      id: string;
      event_id: string;
      events: { title: string | null; organization: string | null; date: string | null; signup_url: string | null; unit_id?: string | null; visibility?: string | null } | null | { title: string | null; organization: string | null; date: string | null; signup_url: string | null; unit_id?: string | null; visibility?: string | null }[];
    };
    const raw = (data ?? []) as unknown as RawRow[];
    const seenEid = new Set<string>();
    const uniqueRaw = raw.filter((r) => {
      if (seenEid.has(r.event_id)) return false;
      seenEid.add(r.event_id);
      return true;
    });
    const rows = uniqueRaw.map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
      return {
        id: r.id,
        title: ev?.title ?? null,
        organization: ev?.organization ?? null,
        date: ev?.date ?? null,
        signup_url: ev?.signup_url ?? null,
        unit_id: ev?.unit_id ?? null,
        visibility: ev?.visibility ?? null,
      };
    }).filter((row) => !row.unit_id || visibleUnitIds.has(row.unit_id));
    setWallSavedEvents(rows);
  }

  async function loadDesktopSavedEvents(uid: string) {
    const visibleUnitIds = await loadVisibleProfileUnitIds(uid, currentUserId);
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, signup_url, unit_id, visibility)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      setDesktopSavedEvents([]);
      return;
    }
    type RawRow = {
      id: string;
      event_id: string;
      events: { title: string | null; organization: string | null; date: string | null; signup_url: string | null; unit_id?: string | null; visibility?: string | null } | null | { title: string | null; organization: string | null; date: string | null; signup_url: string | null; unit_id?: string | null; visibility?: string | null }[];
    };
    const raw = (data ?? []) as unknown as RawRow[];
    const seenEid = new Set<string>();
    const uniqueRaw = raw.filter((r) => {
      if (seenEid.has(r.event_id)) return false;
      seenEid.add(r.event_id);
      return true;
    });
    const rows = uniqueRaw.map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
      return {
        id: r.id,
        title: ev?.title ?? null,
        organization: ev?.organization ?? null,
        date: ev?.date ?? null,
        signup_url: ev?.signup_url ?? null,
        unit_id: ev?.unit_id ?? null,
        visibility: ev?.visibility ?? null,
      };
    }).filter((row) => !row.unit_id || visibleUnitIds.has(row.unit_id));
    setDesktopSavedEvents(rows);
  }

  async function loadDesktopSavedJobs(uid: string) {
    const { data, error } = await supabase
      .from("saved_jobs")
      .select("id, job_id, jobs(title, company_name, location, category, apply_url, created_at)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      setDesktopSavedJobs([]);
      return;
    }
    type RawRow = {
      id: string;
      job_id: string;
      jobs: { title: string | null; company_name: string | null; location: string | null; category: string | null; apply_url: string | null; created_at: string | null } | { title: string | null; company_name: string | null; location: string | null; category: string | null; apply_url: string | null; created_at: string | null }[] | null;
    };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r) => {
      const job = Array.isArray(r.jobs) ? r.jobs[0] ?? null : r.jobs;
      return {
        id: r.id,
        job_id: r.job_id,
        title: job?.title ?? null,
        company_name: job?.company_name ?? null,
        location: job?.location ?? null,
        category: job?.category ?? null,
        apply_url: job?.apply_url ?? null,
        created_at: job?.created_at ?? null,
      };
    });
    setDesktopSavedJobs(rows);
  }

  async function unsaveWallEvent(rowId: string) {
    try {
      setUnsavingWallEvent(rowId);
      await supabase.from("saved_events").delete().eq("id", rowId);
      setWallSavedEvents((prev) => prev.filter((e) => e.id !== rowId));
      setDesktopSavedEvents((prev) => prev.filter((e) => e.id !== rowId));
    } finally {
      setUnsavingWallEvent(null);
    }
  }

  async function unsaveDesktopSavedJob(savedJobRowId: string) {
    try {
      setUnsavingDesktopJobId(savedJobRowId);
      const removed = desktopSavedJobs.find((j) => j.id === savedJobRowId);
      await supabase.from("saved_jobs").delete().eq("id", savedJobRowId);
      setDesktopSavedJobs((prev) => prev.filter((j) => j.id !== savedJobRowId));
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("eod:saved-jobs-changed", { detail: { jobId: removed?.job_id ?? null } })
        );
      }
    } finally {
      setUnsavingDesktopJobId(null);
    }
  }

  async function loadDesktopCalendarData(date: Date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startIso = toDateStr(start.getFullYear(), start.getMonth(), start.getDate());
    const endIso = toDateStr(end.getFullYear(), end.getMonth(), end.getDate());

    const [{ data: eventsData }, { data: memorialData }] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, organization, date, signup_url")
        .gte("date", startIso)
        .lte("date", endIso)
        .is("unit_id", null)
        .eq("visibility", "public")
        .order("date", { ascending: true }),
      supabase
        .from("memorials")
        .select("id, name, death_date, source_url, photo_url, bio, category, service"),
    ]);

    setDesktopCalendarEvents((eventsData ?? []) as DesktopCalendarEvent[]);
    setDesktopMemorials((memorialData ?? []) as DesktopMemorial[]);
  }

  async function loadDesktopConversations(uid: string): Promise<DesktopConversation[]> {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, participant_1, participant_2, last_message_at")
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
      .order("last_message_at", { ascending: false });

    if (error || !data) {
      setDesktopConversations([]);
      return [];
    }

    const otherIds = data.map((c) => (c.participant_1 === uid ? c.participant_2 : c.participant_1));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .in("user_id", otherIds);
    const profileMap = new Map((profiles ?? []).map((p: {
      user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; photo_url: string | null;
    }) => [p.user_id, p]));

    const allIds = data.map((c) => c.id);
    const unreadMap = new Map<string, number>();
    const previewMap = new Map<string, string>();
    if (allIds.length > 0) {
      const { data: msgData } = await supabase
        .from("messages")
        .select("conversation_id, content, is_read, sender_id, created_at")
        .in("conversation_id", allIds)
        .order("created_at", { ascending: false });
      (msgData ?? []).forEach((m: { conversation_id: string; content: string; is_read: boolean; sender_id: string }) => {
        if (!previewMap.has(m.conversation_id)) previewMap.set(m.conversation_id, m.content);
        if (m.sender_id !== uid && !m.is_read) unreadMap.set(m.conversation_id, (unreadMap.get(m.conversation_id) ?? 0) + 1);
      });
    }

    const convs: DesktopConversation[] = data.map((c) => {
      const otherId = c.participant_1 === uid ? c.participant_2 : c.participant_1;
      const profile = profileMap.get(otherId);
      const name = profile?.display_name || `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || "EOD Member";
      return {
        ...c,
        other_user_id: otherId,
        other_user_name: name,
        other_user_photo: profile?.photo_url ?? null,
        unread_count: unreadMap.get(c.id) ?? 0,
        last_message_preview: previewMap.get(c.id) ?? null,
      };
    });
    const sorted = [...convs].sort((a, b) => {
      const unreadDelta = (b.unread_count > 0 ? 1 : 0) - (a.unread_count > 0 ? 1 : 0);
      if (unreadDelta !== 0) return unreadDelta;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
    setDesktopConversations(sorted);
    return sorted;
  }

  async function loadPhotoInteractions(photoIds: string[], signedInUserId?: string | null) {
    if (photoIds.length === 0) return;
    const uid = signedInUserId ?? currentUserId;

    const [likesResult, commentsResult] = await Promise.all([
      supabase.from("profile_photo_likes").select("photo_id, user_id").in("photo_id", photoIds),
      supabase.from("profile_photo_comments").select("id, photo_id, user_id, content, created_at").in("photo_id", photoIds).order("created_at", { ascending: true }),
    ]);

    const likesByPhoto = new Map<string, string[]>();
    ((likesResult.data ?? []) as { photo_id: string; user_id: string }[]).forEach((r) => {
      const arr = likesByPhoto.get(r.photo_id) || [];
      arr.push(r.user_id);
      likesByPhoto.set(r.photo_id, arr);
    });

    const rawComments = (commentsResult.data ?? []) as { id: string; photo_id: string; user_id: string; content: string; created_at: string }[];
    const authorIds = [...new Set(rawComments.map((c) => c.user_id))];
    const { data: authorData } = authorIds.length > 0
      ? await supabase.from("profiles").select("user_id, first_name, last_name, photo_url").in("user_id", authorIds)
      : { data: [] };

    const nameMap = new Map<string, string>();
    const photoMap = new Map<string, string | null>();
    ((authorData ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null }[]).forEach((p) => {
      nameMap.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "User");
      photoMap.set(p.user_id, p.photo_url ?? null);
    });

    const newComments: Record<string, PhotoComment[]> = {};
    rawComments.forEach((c) => {
      if (!newComments[c.photo_id]) newComments[c.photo_id] = [];
      newComments[c.photo_id].push({ ...c, authorName: nameMap.get(c.user_id) || "User", authorPhotoUrl: photoMap.get(c.user_id) ?? null });
    });

    const newLikes: Record<string, { count: number; likedByMe: boolean }> = {};
    photoIds.forEach((id) => {
      const likers = likesByPhoto.get(id) || [];
      newLikes[id] = { count: likers.length, likedByMe: uid ? likers.includes(uid) : false };
    });

    setPhotoLikes(newLikes);
    setPhotoComments(newComments);
  }

  async function togglePhotoLike(photoId: string) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    cancelDelayedLikeNotify(`wall:photo:${photoId}:${currentUserId}`);
    const isLiked = photoLikes[photoId]?.likedByMe ?? false;
    try {
      setTogglingPhotoLikeFor(photoId);
      if (isLiked) {
        await supabase.from("profile_photo_likes").delete().eq("photo_id", photoId).eq("user_id", currentUserId);
      } else {
        await supabase.from("profile_photo_likes").insert([{ photo_id: photoId, user_id: currentUserId }]);
        if (profile && currentUserId !== profile.user_id) {
          const uid = profile.user_id;
          const name = currentUserName?.trim() || "Someone";
          scheduleDelayedLikeNotify(`wall:photo:${photoId}:${currentUserId}`, () => {
            if (!photoLikesRef.current[photoId]?.likedByMe) return;
            return notify(uid, `${name} liked your photo`, uid);
          });
        }
      }
      await loadPhotoInteractions(photos.map((p) => p.id));
    } finally { setTogglingPhotoLikeFor(null); }
  }

  async function submitPhotoComment(photoId: string) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    const text = photoCommentInput.trim();
    if (!text) return;
    try {
      setSubmittingPhotoComment(true);
      await supabase.from("profile_photo_comments").insert([{ photo_id: photoId, user_id: currentUserId, content: text }]);
      if (profile && currentUserId !== profile.user_id) {
        await notify(profile.user_id, `${currentUserName} commented on your photo`, profile.user_id);
      }
      setPhotoCommentInput("");
      await loadPhotoInteractions(photos.map((p) => p.id));
    } finally { setSubmittingPhotoComment(false); }
  }

  async function loadConnections(targetUserId: string, signedInUserId?: string | null) {
    const effectiveCurrentUserId = signedInUserId ?? currentUserId;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      await loadConnectionsLegacy(targetUserId, effectiveCurrentUserId);
      return;
    }

    const res = await fetch(`/api/profile-connections?targetUserId=${encodeURIComponent(targetUserId)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) {
      console.error("Profile connections load error:", await res.text().catch(() => res.statusText));
      return;
    }
    const data = (await res.json()) as ProfileConnectionsResponse;
    setKnowCount(data.knowCount);
    setKnownPreviewUsers(data.knownPreviewUsers ?? []);

    if (!effectiveCurrentUserId || effectiveCurrentUserId === targetUserId || !data.relation) {
      setCurrentUserWorkedWith(false);
      setCurrentUserKnowStatus("none");
      setActiveConnectionId(null);
      setIsMutualConnection(false);
      return;
    }

    if (data.relation.status === "denied") {
      setCurrentUserKnowStatus("none");
      setCurrentUserWorkedWith(false);
      setActiveConnectionId(null);
      setIsMutualConnection(false);
      return;
    }

    setActiveConnectionId(data.relation.id);
    setCurrentUserWorkedWith(data.relation.viewerWorkedWith);
    setCurrentUserKnowStatus(data.relation.knowStatus);
    setIsMutualConnection(data.relation.knowStatus === "accepted");
  }

  function handlePostContentChange(value: string) {
    setPostContent(value);
    const url = extractFirstUrl(value);
    if (!url) { setOgPreview(null); return; }
    if (ogPreview?.url === url) return;
    if (ogDebounceRef.current) clearTimeout(ogDebounceRef.current);
    ogDebounceRef.current = setTimeout(async () => {
      try {
        setFetchingOg(true);
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
          if (data.title || data.image) setOgPreview({ url, title: data.title ?? null, description: data.description ?? null, image: data.image ?? null, siteName: data.siteName ?? null });
          else setOgPreview(null);
        }
      } catch { /* ignore */ } finally { setFetchingOg(false); }
    }, 800);
  }

  async function uploadWallImage(file: File, postId: string, forcedFileName?: string): Promise<string> {
    const prepared = await prepareFeedUploadFile(file, { accountType: profile?.account_type });
    if (!prepared.ok) throw new Error(prepared.error);
    file = prepared.file;
    const safeName = forcedFileName ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = `${currentUserId}/posts/${postId}/${safeName}`;
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
  }

  function missingCadPreviewTokens(
    items: Array<{ kind: string; cadRole?: "file" | "preview"; cadToken?: string }>,
  ): string[] {
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

  function addWallPostImagesFromFiles(
    files: File[],
    options?: { photosOnly?: boolean; videosOnly?: boolean },
  ) {
    if (files.length === 0) return;
    const filtered = files.filter((file) => {
      if (options?.photosOnly) return isImageFile(file);
      if (options?.videosOnly) return isVideoFile(file);
      return true;
    });
    if (filtered.length === 0) {
      if (options?.videosOnly) alert("Please choose a video file.");
      else if (options?.photosOnly) alert("Please choose a photo.");
      return;
    }
    setSelectedPostImages((prev) => {
      const slots = 10 - prev.length;
      if (slots <= 0) {
        alert("You can attach up to 10 files per post.");
        return prev;
      }
      const toAddFiles = filtered.slice(0, slots);
      const pickError = validateFeedAttachmentPick(
        toAddFiles,
        feedUploadLimitsForAccount(profile?.account_type),
      );
      if (pickError) {
        alert(pickError);
        return prev;
      }
      if (filtered.length > slots) {
        alert("Only the first files were added. Max is 10 attachments per post.");
      }
      const toAdd: typeof prev = toAddFiles.map((f) => {
        const kind = attachmentRenderKindFromFile(f);
        if (kind === "cad3d") {
          return {
            file: f,
            previewUrl: "",
            kind: "cad3d" as const,
            cadRole: "file" as const,
            cadToken: createCadAttachmentToken(),
          };
        }
        const normalizedKind: "image" | "video" | "pdf" | "other" =
          kind === "pdf" ? "pdf" : kind === "video" ? "video" : kind === "image" ? "image" : "other";
        return {
          file: f,
          previewUrl: URL.createObjectURL(f),
          kind: normalizedKind,
        };
      });
      return [...prev, ...toAdd];
    });
  }

  function addWallCadPreviewImagesFromFiles(files: File[]) {
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
      return next;
    });
  }

  function handleWallPostImagePaste(e: React.ClipboardEvent) {
    handlePasteImageFromClipboard(e, addWallPostImagesFromFiles);
  }

  async function submitPost() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (!userId || (!postContent.trim() && selectedPostImages.length === 0 && !selectedPostGif)) return;

    try {
      setSubmittingPost(true);
      const missingCadTokens = missingCadPreviewTokens(selectedPostImages);
      if (missingCadTokens.length > 0) {
        alert("Each CAD/3D file needs a preview image (JPG, PNG, or WEBP) before posting.");
        setSubmittingPost(false);
        return;
      }
      const postAsUserId = resolvePostAsUserIdForSubmit(postAsMode, postAsAdminProfile?.userId ?? null);
      const actorName =
        postAsMode === "admin" && postAsAdminProfile
          ? postAsAdminProfile.displayName
          : (currentUserName ?? "Someone");
      const currentOg = ogPreview;
      const imagesToUpload = [...selectedPostImages];
      const gifToPost = selectedPostGif;

      const rawPostContent = (postContentRawRef.current || postContent).trim();
      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert([{
          user_id: currentUserId,
          wall_user_id: userId ?? null,
          post_as_user_id: postAsUserId,
          content: rawPostContent,
          image_url: null,
          gif_url: gifToPost ?? null,
          og_url: currentOg?.url ?? null,
          og_title: currentOg?.title ?? null,
          og_description: currentOg?.description ?? null,
          og_image: currentOg?.image ?? null,
          og_site_name: currentOg?.siteName ?? null,
        }])
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        alert(insertError?.message || "Failed to create post.");
        return;
      }

      const postId = inserted.id;

      // Mention notifications
      const mentionIds = extractMentionIds(rawPostContent).filter(id => id !== currentUserId);
      if (mentionIds.length > 0) {
        await Promise.all(
          mentionIds.map((uid) =>
            postNotifyJson(supabase, {
              user_id: uid,
              actor_name: actorName,
              type: "mention_post",
              category: "social",
              message: `${actorName} mentioned you in a post`,
              post_owner_id: userId ?? null,
              post_id: postId,
              link: `/profile/${encodeURIComponent(userId ?? uid)}`,
              group_key: `post:${postId}:mentions`,
              dedupe_key: `mention_post:${postId}:${uid}`,
              metadata: { wall: true, post_id: postId },
            }),
          ),
        );
      }

      if (imagesToUpload.length > 0) {
        const uploadedUrls: string[] = [];
        for (const item of imagesToUpload) {
          const forcedFileName =
            item.cadToken && item.cadRole
              ? buildCadStorageFileName(item.cadToken, item.cadRole, item.file.name)
              : undefined;
          const url = await uploadWallImage(item.file, postId, forcedFileName);
          uploadedUrls.push(url);
        }
        await supabase.from("post_images").insert(
          uploadedUrls.map((url, i) => ({
            post_id: postId,
            image_url: url,
            sort_order: i,
            file_type:
              imagesToUpload[i]?.kind === "video"
                ? "video"
                : imagesToUpload[i]?.kind === "pdf"
                  ? "pdf"
                  : imagesToUpload[i]?.kind === "cad3d"
                    ? "cad3d"
                    : "image",
          }))
        );
        await supabase.from("posts").update({ image_url: uploadedUrls[0] }).eq("id", postId);
      }

      // Notify wall owner when someone else posts on their wall
      if (userId && currentUserId !== userId) {
        await notify(userId, `${currentUserName} posted on your wall`, userId, { type: "wall_post", post_id: postId });
      }

      setPostContent("");
      postContentRawRef.current = "";
      setOgPreview(null);
      setSelectedPostGif(null);
      setSelectedPostImages((prev) => {
        prev.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        return [];
      });
      await loadPosts(userId);
    } catch (err) {
      console.error("Submit post error:", err);
      alert("Failed to create post");
    } finally {
      setSubmittingPost(false);
    }
  }

  async function requestKnow() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    if (!userId || currentUserId === userId) return;
    try {
      setTogglingConnection("know");
      const result = await postConnectionAction("know");
      if (!result.ok) {
        alert(result.error || "Failed to update connection");
        return;
      }
      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Request know error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function postConnectionAction(
    action: "know" | "confirm" | "deny" | "cancel" | "worked_with",
    workedWith?: boolean,
  ): Promise<ConnectionActionResponse> {
    if (!userId) return { ok: false, error: "Missing profile user" };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, error: "Please sign in again." };

    const res = await fetch("/api/profile-connections/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, targetUserId: userId, workedWith }),
    });
    const result = await res.json().catch(() => null) as ConnectionActionResponse | null;
    if (!res.ok || !result) {
      return { ok: false, error: result?.error || "Connection action failed" };
    }
    return result;
  }

  async function cancelKnowRequest() {
    if (!currentUserId || !userId || currentUserId === userId) return;
    try {
      setTogglingConnection("know");
      const result = await postConnectionAction("cancel");
      if (!result.ok) {
        alert(result.error || "Failed to update connection");
        return;
      }
      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Cancel know request error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function respondToKnowRequest(accept: boolean) {
    if (!currentUserId || !userId) return;
    try {
      setTogglingConnection(accept ? "confirm" : "deny");
      const result = await postConnectionAction(accept ? "confirm" : "deny");
      if (!result.ok) {
        alert(result.error || "Failed to update connection");
        return;
      }
      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Respond know request error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function toggleWorkedWith() {
    if (!currentUserId || !userId) return;
    if (currentUserKnowStatus !== "accepted") return;
    try {
      setTogglingConnection("worked_with");
      const turningOn = !currentUserWorkedWith;
      const result = await postConnectionAction("worked_with", turningOn);
      if (!result.ok) {
        alert(result.error || "Failed to update connection");
        return;
      }
      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Toggle worked_with error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!currentUserId || !userId || currentUserId !== userId) return;

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingGallery(true);

      const prepared = await prepareImageUploadFile(file);
      if (!prepared.ok) {
        alert(prepared.error);
        return;
      }

      const uploadFile = prepared.file;
      const filePath = `${currentUserId}/${Date.now()}-gallery.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("profile-gallery")
        .upload(filePath, uploadFile, {
          contentType: uploadFile.type || "image/jpeg",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("profile-gallery")
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;

      const { error: insertError } = await supabase.from("profile_photos").insert([
        {
          user_id: currentUserId,
          photo_url: publicUrl,
        },
      ]);

      if (insertError) throw insertError;

      await loadPhotos(currentUserId);
    } catch (err) {
      console.error("Gallery upload failed:", err);
      alert("Gallery upload failed");
    } finally {
      setUploadingGallery(false);
      e.target.value = "";
    }
  }

  async function togglePinned(photo: ProfilePhoto) {
    if (!currentUserId || currentUserId !== photo.user_id) return;

    try {
      setTogglingPinnedId(photo.id);

      if (!photo.is_pinned) {
        const pinnedCount = photos.filter((p) => p.is_pinned).length;

        if (pinnedCount >= 4) {
          alert("You can only pin up to 4 photos");
          return;
        }
      }

      const { error } = await supabase
        .from("profile_photos")
        .update({ is_pinned: !photo.is_pinned })
        .eq("id", photo.id);

      if (error) throw error;

      await loadPhotos(currentUserId);
    } catch (err) {
      console.error("Toggle pinned failed:", err);
      alert("Failed to update pinned photo");
    } finally {
      setTogglingPinnedId(null);
    }
  }

  async function deletePhoto(photo: ProfilePhoto) {
    if (!currentUserId || currentUserId !== photo.user_id) return;
    if (!window.confirm("Delete this photo?")) return;

    try {
      setDeletingPhotoId(photo.id);

      const { error } = await supabase
        .from("profile_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;

      await loadPhotos(currentUserId);
    } catch (err) {
      console.error("Delete photo failed:", err);
      alert("Failed to delete photo");
    } finally {
      setDeletingPhotoId(null);
    }
  }

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
    let cancelled = false;

    async function loadViewerExtras(signedInUserId: string) {
      const { data: nameData } = await supabase
        .from("profiles")
        .select("first_name, last_name, photo_url, email, is_employer, is_admin")
        .eq("user_id", signedInUserId)
        .maybeSingle();
      if (cancelled) return;
      const nd = nameData as {
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
        email: string | null;
        is_employer: boolean | null;
        is_admin?: boolean | null;
      } | null;
      setCurrentUserName(`${nd?.first_name || ""} ${nd?.last_name || ""}`.trim() || "Someone");
      setCurrentUserPhotoUrl(nd?.photo_url ?? null);
      const viewerEmail = nd?.email?.trim().toLowerCase() ?? null;
      setCurrentUserEmail(viewerEmail);
      setViewerIsEmployer(!!nd?.is_employer);
      setViewerIsAdmin(!!nd?.is_admin);

      if (canUsePostAsSelector(viewerEmail)) {
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name, photo_url")
          .eq("email", "hello@eod-hub.com")
          .maybeSingle();
        if (!cancelled && adminProfile) {
          setPostAsAdminProfile({
            userId: adminProfile.user_id,
            displayName: adminPostDisplayName(adminProfile),
            photoUrl: adminProfile.photo_url ?? null,
          });
        }
      } else if (!cancelled) {
        setPostAsAdminProfile(null);
      }

      const convs = await supabase
        .from("conversations")
        .select("id")
        .or(`participant_1.eq.${signedInUserId},participant_2.eq.${signedInUserId}`);
      if (cancelled) return;
      const convIds = (convs.data ?? []).map((c: { id: string }) => c.id);
      if (convIds.length > 0) {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("is_read", false)
          .neq("sender_id", signedInUserId)
          .in("conversation_id", convIds);
        if (!cancelled) setUnreadMessages(count ?? 0);
      } else if (!cancelled) {
        setUnreadMessages(0);
      }

      await Promise.all([
        loadDesktopSavedEvents(signedInUserId),
        loadDesktopSavedJobs(signedInUserId),
      ]);
    }

    async function loadDeferredWallData(targetUserId: string, signedInUserId: string | null) {
      await Promise.all([
        loadPhotos(targetUserId),
        loadConnections(targetUserId, signedInUserId),
        loadMyGroups(targetUserId),
        loadSavedEventsForUser(targetUserId),
      ]);
      if (signedInUserId) {
        await loadViewerExtras(signedInUserId);
        if (!cancelled && signedInUserId === targetUserId) {
          void refreshPlankHolderChallenge();
        }
      }
    }

    async function init() {
      if (!userId || userId === "undefined") {
        setLoading(false);
        return;
      }

      const targetUserId = userId;

      setLoading(true);
      setProfile(null);
      setPosts([]);

      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error("Auth error:", error);
      }

      const signedInUserId = data.user?.id ?? null;
      setCurrentUserId(signedInUserId);
      const loadedBlockedUserIds = await fetchBlockedUserIds(supabase, signedInUserId);
      if (cancelled) return;
      setBlockedUserIds(loadedBlockedUserIds);
      plankHolderChallengeRef.current = null;
      plankHolderInitializedRef.current = false;
      setPlankHolderChallenge(null);

      if (!signedInUserId) {
        setViewerIsEmployer(false);
        setViewerIsAdmin(false);
        setDesktopSavedEvents([]);
        setDesktopSavedJobs([]);
      }

      await Promise.all([
        loadProfile(targetUserId),
        loadPosts(targetUserId, { viewerUserId: signedInUserId, blockedUserIds: loadedBlockedUserIds }),
      ]);
      if (cancelled) return;
      setLoading(false);

      void loadDeferredWallData(targetUserId, signedInUserId).catch((err) => {
        console.error("Profile deferred wall load failed:", err);
      });
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!currentUserId || isMobile || isDesktopShell) {
      setDesktopConversations([]);
      return;
    }
    loadDesktopConversations(currentUserId).catch((err) => {
      console.error("Desktop conversations load failed:", err);
    });
  }, [currentUserId, isMobile, isDesktopShell]);

  useEffect(() => {
    if (isMobile || isDesktopShell) return;
    loadDesktopCalendarData(desktopCalendarDate).then(() => {
      setDesktopSelectedDay(
        toDateStr(
          desktopCalendarDate.getFullYear(),
          desktopCalendarDate.getMonth(),
          desktopCalendarDate.getDate()
        )
      );
    }).catch((err) => {
      console.error("Desktop calendar load failed:", err);
    });
  }, [desktopCalendarDate, isMobile, isDesktopShell]);

  // Auto-generate referral code for existing users who don't have one yet
  useEffect(() => {
    if (!currentUserId || !profile || currentUserId !== profile.user_id || profile.referral_code) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return;
      fetch("/api/generate-referral-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then((res) => res.json()).then(({ code }) => {
        if (code) setProfile((p) => p ? { ...p, referral_code: code } : p);
      });
    });
  }, [currentUserId, profile?.user_id, profile?.referral_code]);

  useEffect(() => {
    const challengeTarget = searchParams.get("challenge");
    if (!challengeTarget || !profile || !currentUserId || currentUserId !== profile.user_id) return;
    const marker = `${profile.user_id}:${challengeTarget}`;
    if (handledChallengeParamRef.current === marker) return;
    handledChallengeParamRef.current = marker;

    if (challengeTarget === "bio") {
      openWallEditProfile();
      window.setTimeout(() => bioTextareaRef.current?.focus(), 150);
      return;
    }

    if (challengeTarget === "invite") {
      setReferralQrOpen(true);
      recordInviteForPlankHolder();
      return;
    }

    if (challengeTarget === "photo") {
      document.getElementById("profile-wall-avatar")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentUserId, profile, recordInviteForPlankHolder, searchParams]);

  useEffect(() => {
    if (!userId || userId === "undefined") return;
    if (!profileWallHasMorePosts || profileAutoLoadTriggeredRef.current) return;
    if (profilePostLimitRef.current >= PROFILE_AUTO_LOAD_LIMIT) return;
    const targetUserId = userId;

    function onScroll() {
      const doc = document.documentElement;
      const distanceFromBottom = doc.scrollHeight - (window.scrollY + window.innerHeight);
      if (distanceFromBottom > 900) return;
      profileAutoLoadTriggeredRef.current = true;
      profilePostLimitRef.current = PROFILE_AUTO_LOAD_LIMIT;
      void loadPosts(targetUserId, { limit: PROFILE_AUTO_LOAD_LIMIT });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [profileWallHasMorePosts, userId]);

  useEffect(() => {
    if (!userId || userId === "undefined") return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePostsRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void loadPosts(userId, { limit: profilePostLimitRef.current });
      }, 350);
    };

    const postsChannel = supabase
      .channel(`profile-posts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `user_id=eq.${userId}` },
        schedulePostsRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `wall_user_id=eq.${userId}` },
        schedulePostsRefresh
      )
      .subscribe();

    const connectionsChannel = supabase
      .channel(`profile-connections-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_connections" },
        () => {
          loadConnections(userId);
        }
      )
      .subscribe();

    const photosChannel = supabase
      .channel(`profile-photos-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_photos", filter: `user_id=eq.${userId}` },
        () => {
          loadPhotos(userId);
        }
      )
      .subscribe();

    const commentsChannel = supabase
      .channel(`profile-comments-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_comments" },
        schedulePostsRefresh
      )
      .subscribe();

    const likesChannel = supabase
      .channel(`profile-likes-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_likes" },
        schedulePostsRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_reactions" },
        schedulePostsRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(connectionsChannel);
      supabase.removeChannel(photosChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(likesChannel);
    };
  }, [userId]);

  const businessWallMedia = useMemo(() => {
    const photoItems: BusinessWallMediaItem[] = [];
    const videoItems: BusinessWallMediaItem[] = [];
    const seenPhotos = new Set<string>();
    const seenVideos = new Set<string>();

    for (const post of posts) {
      for (const attachment of attachmentsFromUrls(post.image_urls)) {
        const url = attachment.kind === "cad3d" ? attachment.renderUrl : attachment.url;
        const item: BusinessWallMediaItem = {
          url,
          postId: post.id,
          createdAt: post.created_at,
        };
        if (isVideoUrl(url)) {
          if (seenVideos.has(url)) continue;
          seenVideos.add(url);
          videoItems.push(item);
        } else {
          if (seenPhotos.has(url)) continue;
          seenPhotos.add(url);
          photoItems.push(item);
        }
      }
    }
    const byNewest = (a: BusinessWallMediaItem, b: BusinessWallMediaItem) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    photoItems.sort(byNewest);
    videoItems.sort(byNewest);
    return { photos: photoItems, videos: videoItems };
  }, [posts]);

  if (!loading && profile?.user_id === RUMINT_USER_ID) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 22,
            background: t.surface,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 900, color: t.text }}>RUMINT</div>
          <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>Newswire System Profile</div>
          <div style={{ marginTop: 14, fontSize: 14, color: t.text }}>
            This is a non-interactive system account used to publish approved external news.
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: t.textFaint }}>
            Member interactions are disabled for this profile.
          </div>
        </div>
      </div>
    );
  }

  if (!loading && profile && isInternalOnlyPureAdmin(profile)) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 22,
            background: t.surface,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: "50%",
              border: `1px solid ${t.border}`,
              background: isDark ? "#000000" : "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              marginBottom: 16,
              boxSizing: "border-box",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static public branding asset */}
            <img
              src={profile.photo_url?.trim() || STAFF_DEFAULT_PROFILE_PHOTO_PATH}
              alt=""
              style={{
                width: "86%",
                height: "86%",
                objectFit: "contain",
                display: "block",
                mixBlendMode: isDark ? undefined : "multiply",
                filter: isDark ? "invert(1) contrast(1.08)" : undefined,
              }}
            />
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: t.text }}>EOD HUB</div>
          <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted }}>Staff Account</div>
          <div style={{ marginTop: 14, fontSize: 14, color: t.text }}>
            This is an internal EOD HUB staff account used for moderation and site administration.
          </div>
          <div style={{ marginTop: 8, fontSize: 13, color: t.textFaint }}>
            It has no public profile and cannot be messaged, followed, or connected with.
          </div>
        </div>
      </div>
    );
  }

  const skeletonBase: React.CSSProperties = {
    background: "linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%)",
    backgroundSize: "200% 100%",
    borderRadius: 8,
  };

  const fullName = profile
    ? profile.display_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "User"
    : "";

  const isEmployerProfile = profile ? !!profile.is_employer || isEmployerAccount(profile) : false;
  const employerCompanyName = profile?.company_name?.trim() ?? "";
  const employerContactName = profile
    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim()
    : "";
  const profileHeadlineName =
    isEmployerProfile && employerCompanyName ? employerCompanyName : fullName;
  const profileAvatarInitial = (profileHeadlineName[0] || fullName[0] || "?").toUpperCase();

  const techTypesText = profile
    ? Array.isArray(profile.tech_types) ? profile.tech_types.join(", ") : profile.tech_types || "Not added yet"
    : "";

  const isOwnWall = currentUserId === profile?.user_id;
  const isBusinessOrgProfile = profile?.account_type === "business_org";
  const wallAsOwner = isOwnWall && !(isBusinessOrgProfile && businessProfileVisitorPreview);
  const wallFeedUploadLimits = feedUploadLimitsForAccount(profile?.account_type);
  const showEmployerEmailOnCard = isEmployerProfile && (isOwnWall || viewerIsAdmin);
  const canViewEmployerBack =
    !isEmployerProfile &&
    !isBusinessOrgProfile &&
    (isOwnWall || viewerIsAdmin || (viewerIsEmployer && !!profile?.open_to_opportunities));
  const professionalTags = normalizeTagArray(profile?.professional_tags);
  const unitHistoryTags = normalizeTagArray(profile?.unit_history_tags);

  function handleAddWorkTag(kind: "professional" | "unit") {
    if (kind === "professional") {
      setEditProfessionalTags((prev) => addUniqueTag(prev, draftProfessionalTag));
      setDraftProfessionalTag("");
      return;
    }
    setEditUnitHistoryTags((prev) => addUniqueTag(prev, draftUnitHistoryTag));
    setDraftUnitHistoryTag("");
  }

  function handleRemoveWorkTag(kind: "professional" | "unit", index: number) {
    if (kind === "professional") {
      setEditProfessionalTags((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setEditUnitHistoryTags((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddSpecializedTrainingTag() {
    setEditSpecializedTraining((prev) => addUniqueTag(prev, draftSpecializedTraining));
    setDraftSpecializedTraining("");
  }

  function handleRemoveSpecializedTrainingTag(index: number) {
    setEditSpecializedTraining((prev) => {
      const removedTag = prev[index];
      if (removedTag) {
        setEditSpecializedTrainingDocs((docs) => {
          if (!(removedTag in docs)) return docs;
          const next = { ...docs };
          delete next[removedTag];
          return next;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function isWallSidebarNudgeDismissed(postId: string, peerId: string) {
    void sidebarNudgeBump;
    if (!currentUserId || typeof window === "undefined") return true;
    return localStorage.getItem(sidebarNudgeDismissStorageKey(postId, currentUserId, peerId)) === "1";
  }

  function BadgeIcon({ count, size = 16 }: { count: number; size?: number }): React.ReactElement | null {
    if (count >= 50) return <Gem size={size} color="#7c3aed" />;
    if (count >= 25) return <Medal size={size} color="#FFD700" />;
    if (count >= 10) return <Medal size={size} color="#C0C0C0" />;
    if (count >= 5)  return <Medal size={size} color="#CD7F32" />;
    return null;
  }

  function getReferralBadge(count: number): { label: string; color: string; bg: string } | null {
    if (count >= 50) return { label: "Platinum Recruiter", color: "#6b7280", bg: "#f3f4f6" };
    if (count >= 25) return { label: "Gold Recruiter", color: "#92400e", bg: "#fef3c7" };
    if (count >= 10) return { label: "Silver Recruiter", color: "#374151", bg: "#e5e7eb" };
    if (count >= 5)  return { label: "Bronze Recruiter", color: "#7c2d12", bg: "#fef3c7" };
    return null;
  }
  const referralBadge = getReferralBadge(referralCount);

  function displayMilitaryStatus(status: string | null | undefined): string {
    if (status === "Active") return "Active Duty";
    return status ?? "";
  }

  const wallEditInputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    boxSizing: "border-box",
    background: t.input,
    color: t.text,
  };
  const wallEditSelectStyle: React.CSSProperties = { ...wallEditInputStyle, cursor: "pointer" };

  const pinnedPhotos = photos.filter((photo) => photo.is_pinned).slice(0, 4);
  const galleryPhotos = photos.filter((photo) => !photo.is_pinned);
  const photoPreviewItems = isMobile ? pinnedPhotos : pinnedPhotos.slice(0, 4);
  const groupPreviewItems = isMobile ? myGroups : myGroups.slice(0, 4);

  const businessWallPhotoPreview = isMobile
    ? businessWallMedia.photos.slice(0, 4)
    : businessWallMedia.photos.slice(0, 6);
  const businessWallVideoPreview = isMobile
    ? businessWallMedia.videos.slice(0, 4)
    : businessWallMedia.videos.slice(0, 6);

  /** Desktop Photos + My Groups share this max width so all 8 thumbnails are the same cell size and line up. */
  const STRIP_THUMB_AREA_MAX = 320;
  const stripThumbGridStyleDesktop: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
    width: "100%",
    maxWidth: STRIP_THUMB_AREA_MAX,
  };
  const mobilePhotoGridCols = "repeat(auto-fill, minmax(96px, 1fr))";
  const mobileGroupsGridCols = "repeat(auto-fill, minmax(110px, 1fr))";

  const renderWorkUnitHistorySection = (compact: boolean) => {
    if (isBusinessOrgProfile) return null;

    const visibleProfessional = showAllWorkHistoryTags ? professionalTags : professionalTags.slice(0, WORK_TAG_PREVIEW_LIMIT);
    const visibleUnitHistory = showAllWorkHistoryTags ? unitHistoryTags : unitHistoryTags.slice(0, WORK_TAG_PREVIEW_LIMIT);
    const hasMore = professionalTags.length > WORK_TAG_PREVIEW_LIMIT || unitHistoryTags.length > WORK_TAG_PREVIEW_LIMIT;

    const chipStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      border: `1px solid ${t.border}`,
      background: t.bg,
      color: t.text,
      fontSize: compact ? 11 : 12,
      fontWeight: 700,
      padding: compact ? "3px 9px" : "4px 10px",
      lineHeight: 1.2,
      maxWidth: "100%",
      whiteSpace: "normal",
      overflowWrap: "anywhere",
      wordBreak: "break-word",
      overflow: "hidden",
      textOverflow: "ellipsis",
    };

    const categoryTitleStyle: React.CSSProperties = {
      fontSize: compact ? 11 : 12,
      fontWeight: 800,
      color: t.textMuted,
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    };

    return (
      <div style={{ width: "100%", marginTop: compact ? 10 : 12, borderTop: `1px solid ${t.borderLight}`, paddingTop: compact ? 10 : 12 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>
          Work / Unit History
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <div style={categoryTitleStyle}>Professional Background</div>
            {visibleProfessional.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: showAllWorkHistoryTags ? undefined : compact ? 54 : 60, overflow: "hidden" }}>
                {visibleProfessional.map((tag) => (
                  <span key={`prof-${tag}`} style={chipStyle} title={tag}>{tag}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: compact ? 11 : 12, color: t.textFaint }}>No professional background tags yet.</div>
            )}
          </div>

          <div>
            <div style={categoryTitleStyle}>Unit History</div>
            {visibleUnitHistory.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: showAllWorkHistoryTags ? undefined : compact ? 54 : 60, overflow: "hidden" }}>
                {visibleUnitHistory.map((tag) => (
                  <span key={`unit-${tag}`} style={chipStyle} title={tag}>{tag}</span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: compact ? 11 : 12, color: t.textFaint }}>No unit history tags yet.</div>
            )}
          </div>
        </div>

        {(hasMore || (wallAsOwner && professionalTags.length === 0 && unitHistoryTags.length === 0)) && (
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {hasMore && (
              <button
                type="button"
                onClick={() => setShowAllWorkHistoryTags((prev) => !prev)}
                style={{ background: "none", border: "none", color: "#2563eb", fontSize: compact ? 11 : 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
              >
                {showAllWorkHistoryTags ? "Show less" : "Show more"}
              </button>
            )}
            {wallAsOwner && professionalTags.length === 0 && unitHistoryTags.length === 0 && (
              <button
                type="button"
                onClick={openWallEditProfile}
                style={{ background: "none", border: "none", color: "#2563eb", fontSize: compact ? 11 : 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
              >
                Add tags
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderBusinessOrgProfileCard = () => {
    if (!profile) return null;

    const pageData = businessOrgPage
      ? {
          business_name: businessOrgPage.business_name,
          description: businessOrgPage.description,
          business_email: businessOrgPage.business_email,
          logo_url: businessOrgPage.logo_url ?? profile.photo_url ?? null,
          website_url: businessOrgPage.website_url,
          location: businessOrgPage.location,
          address: businessOrgPage.address,
          phone: businessOrgPage.phone,
          owner_info: businessOrgPage.owner_info,
          page_type: businessOrgPage.page_type,
        }
      : {
          business_name: profileHeadlineName,
          description: profile.bio ?? "",
          business_email: profile.email ?? "",
          logo_url: profile.photo_url ?? null,
          website_url: null,
          location: null,
          address: null,
          phone: null,
          owner_info: null,
          page_type: "business" as const,
        };

    return (
      <BusinessProfileCard
        page={pageData}
        subtitle={fullName}
        isMobile={isMobile}
        isOwnWall={wallAsOwner}
        embedded
        showExtendedDetails
        logoUploading={uploadingAvatar}
        onEditProfile={openWallEditProfile}
        onLogoClick={() => {
          if (profile.photo_url) {
            setExpandedProfilePhotoUrl(profile.photo_url);
          } else if (wallAsOwner && !uploadingAvatar) {
            photoInputRef.current?.click();
          }
        }}
      />
    );
  };

  const renderBusinessProfileMediaSections = () => {
    if (!isBusinessOrgProfile) return null;

    const wallPhotoGridCols = isMobile
      ? "repeat(auto-fill, minmax(96px, 1fr))"
      : "repeat(auto-fill, minmax(100px, 1fr))";
    const wallVideoGridCols = isMobile
      ? "repeat(auto-fill, minmax(140px, 1fr))"
      : "repeat(auto-fill, minmax(160px, 1fr))";

    const sectionShell: React.CSSProperties = {
      border: `1px solid ${t.border}`,
      borderRadius: 16,
      background: t.surface,
      overflow: "hidden",
      padding: 16,
      display: "grid",
      gap: 12,
    };

    const sectionTitle: React.CSSProperties = {
      fontSize: 15,
      fontWeight: 900,
      color: t.text,
    };

    const hasPhotosContent =
      pinnedPhotos.length > 0 ||
      businessWallMedia.photos.length > 0 ||
      galleryPhotos.length > 0;
    const hasVideosContent = businessWallMedia.videos.length > 0;
    const showPhotosSection = wallAsOwner || hasPhotosContent;
    const showVideosSection = wallAsOwner || hasVideosContent;

    if (!showPhotosSection && !showVideosSection) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {showPhotosSection && (
        <section style={sectionShell}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={sectionTitle}>Photos</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {galleryPhotos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setGalleryExpanded(!galleryExpanded)}
                  style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Gallery ({galleryPhotos.length}) {galleryExpanded ? "\u25B2" : "\u25BC"}
                </button>
              )}
              {wallAsOwner && (
                <label style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", background: t.surface, color: t.text, whiteSpace: "nowrap", display: "inline-block" }}>
                  + Add Photo
                  <input type="file" accept="image/*" onChange={handleGalleryUpload} style={{ display: "none" }} />
                </label>
              )}
              {uploadingGallery && <span style={{ fontSize: 12, color: t.textMuted }}>Uploading...</span>}
            </div>
          </div>

          <div style={!isMobile ? stripThumbGridStyleDesktop : { display: "grid", gridTemplateColumns: mobilePhotoGridCols, gap: 8 }}>
            {pinnedPhotos.length === 0 && businessWallMedia.photos.length === 0 && (
              <div style={{ color: t.textFaint, fontSize: 13, alignSelf: "center", gridColumn: "1 / -1" }}>
                {photos.length > 0
                  ? (wallAsOwner ? "Pin photos from the gallery to feature them here." : "No featured photos yet.")
                  : "No photos yet. Add gallery photos or post images to your feed."}
              </div>
            )}
            {photoPreviewItems.map((photo) => (
              <div key={photo.id} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div
                  onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                  style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                >
                  <img src={galleryImageDisplayUrl(photo.photo_url)} alt="Pinned" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                {wallAsOwner && (
                  <div style={{ display: "flex", flexDirection: "row", gap: 6, alignItems: "stretch" }}>
                    <button
                      type="button"
                      onClick={() => deletePhoto(photo)}
                      disabled={deletingPhotoId === photo.id}
                      style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 6, padding: "5px 4px", fontWeight: 700, fontSize: 10, cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer", opacity: deletingPhotoId === photo.id ? 0.7 : 1, color: t.text, minWidth: 0 }}
                    >
                      {deletingPhotoId === photo.id ? "..." : "Del"}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePinned(photo)}
                      disabled={togglingPinnedId === photo.id}
                      style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 6, padding: "5px 4px", fontWeight: 700, fontSize: 10, cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer", opacity: togglingPinnedId === photo.id ? 0.7 : 1, color: t.text, minWidth: 0 }}
                    >
                      {togglingPinnedId === photo.id ? "..." : "Unpin"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {galleryExpanded && galleryPhotos.length > 0 && (
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Gallery</div>
              <div style={{ display: "grid", gridTemplateColumns: wallPhotoGridCols, gap: 8 }}>
                {galleryPhotos.map((photo) => (
                  <div key={photo.id}>
                    <div
                      onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                      style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                    >
                      <img src={galleryImageDisplayUrl(photo.photo_url)} alt="Gallery" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                    {wallAsOwner && (
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <button
                          onClick={() => togglePinned(photo)}
                          disabled={togglingPinnedId === photo.id}
                          style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer", opacity: togglingPinnedId === photo.id ? 0.7 : 1 }}
                        >
                          {togglingPinnedId === photo.id ? "..." : "Pin"}
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer", opacity: deletingPhotoId === photo.id ? 0.7 : 1 }}
                        >
                          {deletingPhotoId === photo.id ? "..." : "Del"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {businessWallMedia.photos.length > 0 && (
            <div style={{ borderTop: pinnedPhotos.length > 0 || galleryExpanded ? `1px solid ${t.border}` : undefined, paddingTop: pinnedPhotos.length > 0 || galleryExpanded ? 12 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 1 }}>
                  From posts ({businessWallMedia.photos.length})
                </div>
                {businessWallMedia.photos.length > businessWallPhotoPreview.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllModal("business-wall-photos")}
                    style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
                  >
                    View all
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: wallPhotoGridCols, gap: 8 }}>
                {businessWallPhotoPreview.map((item, index) => (
                  <div
                    key={`${item.postId}-${item.url}`}
                    onClick={() => setExpandedProfilePhotoUrl(item.url)}
                    style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer", border: `1px solid ${t.border}` }}
                  >
                    <img src={item.url} alt={`Post photo ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        )}

        {showVideosSection && (
        <section style={sectionShell}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={sectionTitle}>Videos</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {businessWallMedia.videos.length > businessWallVideoPreview.length && (
                <button
                  type="button"
                  onClick={() => setShowAllModal("business-wall-videos")}
                  style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
                >
                  View all ({businessWallMedia.videos.length})
                </button>
              )}
              {wallAsOwner && (
                <>
                  <input
                    ref={postWallVideoInputRef}
                    type="file"
                    accept="video/*,.mp4,.mov,.webm,.m4v"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length === 0) return;
                      addWallPostImagesFromFiles(files, { videosOnly: true });
                      if (postWallVideoInputRef.current) postWallVideoInputRef.current.value = "";
                      document.getElementById("profile-wall-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    style={{ display: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => postWallVideoInputRef.current?.click()}
                    style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", background: t.surface, color: t.text, whiteSpace: "nowrap" }}
                  >
                    + Add Video
                  </button>
                </>
              )}
            </div>
          </div>

          {businessWallMedia.videos.length === 0 ? (
            <div style={{ color: t.textFaint, fontSize: 13, lineHeight: 1.45 }}>
              {wallAsOwner
                ? "No videos yet. Use Add Video above, then post from your feed composer."
                : "No videos yet. Post a video to your feed and it will appear here."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: wallVideoGridCols, gap: 8 }}>
              {businessWallVideoPreview.map((item, index) => (
                <div
                  key={`${item.postId}-${item.url}`}
                  onClick={() => setLightboxVideoUrl(item.url)}
                  style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 10, overflow: "hidden", background: FEED_MEDIA_FRAME_BG, cursor: "pointer", border: `1px solid ${t.border}` }}
                >
                  <video src={item.url} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                    <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Play size={18} color="white" fill="white" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}
      </div>
    );
  };

  const renderBusinessProductsSection = () => {
    if (!isBusinessOrgProfile || !businessOrgPage) return null;

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {wallAsOwner && businessProfileIntroDismissed === false && (
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
              boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.35)" : "0 2px 8px rgba(180, 83, 9, 0.25)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: isDark ? "#fef9c3" : "#422006", marginBottom: 4 }}>
                  Welcome to Your Business Profile
                </div>
                <div style={{ fontSize: 14, color: isDark ? "#fde68a" : "#451a03", lineHeight: 1.55 }}>
                  Your Business Profile is your hub for showcasing your company to the EOD community.
                </div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 14, color: isDark ? "#fef9c3" : "#422006" }}>
                Ways to get started:
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, color: isDark ? "#fde68a" : "#451a03", lineHeight: 1.55, display: "grid", gap: 6, fontSize: 14 }}>
                <li>
                  Connect Shopify to automatically display products from your store. Additional e-commerce integrations are planned for the future.
                </li>
                <li>
                  Add products manually and include links to your website, online store, or external marketplace.
                </li>
                <li>
                  Link your Business Directory listing to your Business Profile. When users discover your business in the directory,
                  they&apos;ll be able to click through directly to your full profile page for more information, products, services, and contact details.
                </li>
              </ul>
              <div style={{ fontSize: 14, color: isDark ? "#fde68a" : "#451a03", lineHeight: 1.55 }}>
                A complete profile helps community members learn more about your business and connect with what you offer.
              </div>
              <div style={{ fontSize: 14, color: isDark ? "#fde68a" : "#451a03", lineHeight: 1.55, fontStyle: "italic" }}>
                We will continue to add features to business profiles over time and are open to feedback on how to best serve your business.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0, alignItems: "stretch" }}>
              <button
                type="button"
                onClick={() => { void dismissBusinessProfileIntro(); }}
                style={{
                  background: isDark ? "#292524" : "#422006",
                  color: "#fef9c3",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Got it
              </button>
              <button
                type="button"
                aria-label="Close welcome banner"
                onClick={() => { void dismissBusinessProfileIntro(); }}
                style={{
                  background: "transparent",
                  color: "#fef9c3",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontWeight: 800,
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {wallAsOwner && (
          <BusinessCommerceManager
            businessId={businessOrgPage.id}
            onProductsChanged={async () => {
              setCommerceRefreshKey((value) => value + 1);
              const { data } = await supabase
                .from("business_organization_pages")
                .select(BUSINESS_ORG_PAGE_SELECT)
                .eq("id", businessOrgPage.id)
                .maybeSingle();
              if (data) setBusinessOrgPage(data as unknown as BusinessOrgPageRow);
            }}
            collapsible
          />
        )}
        <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, padding: 16 }}>
          <BusinessCommerceSection
            businessId={businessOrgPage.id}
            isOwnWall={wallAsOwner}
            isMobile={isMobile}
            refreshKey={commerceRefreshKey}
          />
        </div>
      </div>
    );
  };

  const renderBusinessProfilePreviewChrome = () => {
    if (!isBusinessOrgProfile || !isOwnWall) return null;

    if (businessProfileVisitorPreview) {
      return (
        <div
          role="status"
          style={{
            position: "sticky",
            top: isMobile ? 0 : 8,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            border: `1px solid ${isDark ? "#3b82f6" : "#2563eb"}`,
            borderLeft: `4px solid ${isDark ? "#60a5fa" : "#1d4ed8"}`,
            borderRadius: 12,
            background: isDark ? "rgba(30, 58, 138, 0.45)" : "#eff6ff",
            padding: "12px 14px",
            boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.35)" : "0 2px 8px rgba(37, 99, 235, 0.15)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: isDark ? "#dbeafe" : "#1e3a8a", marginBottom: 2 }}>
              Public preview
            </div>
            <div style={{ fontSize: 13, color: isDark ? "#bfdbfe" : "#1e40af", lineHeight: 1.45 }}>
              This is how other members see your business profile. Press Esc to exit preview.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBusinessProfileVisitorPreview(false)}
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: isDark ? "#1e3a8a" : "#1d4ed8",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <ChevronLeft size={16} aria-hidden />
            Back to editing
          </button>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => {
            setEditingProfile(false);
            setBusinessProfileVisitorPreview(true);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: `1px solid ${t.border}`,
            borderRadius: 999,
            padding: "8px 14px",
            background: t.surface,
            color: t.text,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <Eye size={16} aria-hidden />
          Preview public view
        </button>
      </div>
    );
  };

  const renderProfileCenter = () => {
    if (!profile) return null;
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: isMobile ? 20 : 0 }}>

        {renderBusinessProfilePreviewChrome()}

        {false && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Photos</div>
            {wallAsOwner && (
              <div>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: `1px solid ${t.border}`,
                    borderRadius: 8,
                    padding: "5px 10px",
                    background: t.surface,
                    color: t.text,
                  }}
                >
                  + Add
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleGalleryUpload}
                    style={{ display: "none" }}
                  />
                </label>
                {uploadingGallery && (
                  <div style={{ marginTop: 6, color: t.textMuted, fontSize: 12 }}>Uploading...</div>
                )}
              </div>
            )}
          </div>

          {/* Pinned Photos */}
          {pinnedPhotos.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Pinned
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {pinnedPhotos.map((photo) => (
                  <div key={photo.id}>
                    <div
                      onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                      style={{
                        aspectRatio: "1 / 1",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: t.bg,
                        cursor: "pointer",
                      }}
                    >
                      <img
                        src={galleryImageDisplayUrl(photo.photo_url)}
                        alt="Pinned photo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    {wallAsOwner && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                        <button
                          onClick={() => togglePinned(photo)}
                          disabled={togglingPinnedId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer",
                            opacity: togglingPinnedId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {togglingPinnedId === photo.id ? "..." : "Unpin"}
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer",
                            opacity: deletingPhotoId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {deletingPhotoId === photo.id ? "..." : "Del"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {pinnedPhotos.length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 16 }}>No pinned photos.</div>
          )}

          {/* Gallery Photos */}
          {galleryPhotos.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Gallery
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {galleryPhotos.map((photo) => (
                  <div key={photo.id}>
                    <div
                      onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                      style={{
                        aspectRatio: "1 / 1",
                        borderRadius: 10,
                        overflow: "hidden",
                        background: t.bg,
                        cursor: "pointer",
                      }}
                    >
                      <img
                        src={galleryImageDisplayUrl(photo.photo_url)}
                        alt="Gallery photo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    {wallAsOwner && (
                      <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                        <button
                          onClick={() => togglePinned(photo)}
                          disabled={togglingPinnedId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer",
                            opacity: togglingPinnedId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {togglingPinnedId === photo.id ? "..." : "Pin"}
                        </button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id}
                          style={{
                            flex: 1,
                            border: `1px solid ${t.border}`,
                            background: t.surface,
                            color: t.text,
                            borderRadius: 6,
                            padding: "5px 0",
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer",
                            opacity: deletingPhotoId === photo.id ? 0.7 : 1,
                          }}
                        >
                          {deletingPhotoId === photo.id ? "..." : "Del"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {galleryPhotos.length === 0 && pinnedPhotos.length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13 }}>No photos yet.</div>
          )}
        </div>}

        {/* G��G�� Content G��G�� */}

          {/* Profile / Contact Card */}
          <div
            style={{
              position: "relative",
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: isBusinessOrgProfile ? (isMobile ? "10px 16px" : "12px 24px") : 24,
              background: t.surface,
            }}
          >
            {wallAsOwner && (
              <>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} aria-hidden />
                {!isBusinessOrgProfile && (
                  <>
                    <input ref={resumeFileInputRef} type="file" accept={EMPLOYER_DOCUMENT_ACCEPT} onChange={handleResumeFilePick} style={{ display: "none" }} aria-hidden />
                    <input ref={educationFileInputRef} type="file" accept={EMPLOYER_DOCUMENT_ACCEPT} onChange={handleEducationFilePick} style={{ display: "none" }} aria-hidden />
                    <input ref={trainingFileInputRef} type="file" accept={EMPLOYER_DOCUMENT_ACCEPT} onChange={handleTrainingFilePick} style={{ display: "none" }} aria-hidden />
                  </>
                )}
              </>
            )}
            {isBusinessOrgProfile ? (
              renderBusinessOrgProfileCard()
            ) : isMobile ? (
              /* G��G�� Mobile profile card layout G��G�� */
              <div>
                {/* Top row: avatar + name + stats */}
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div
                    id="profile-wall-avatar"
                    onClick={() => {
                      if (profile.photo_url) {
                        setExpandedProfilePhotoUrl(profile.photo_url);
                      } else if (wallAsOwner && !uploadingAvatar) {
                        photoInputRef.current?.click();
                      }
                    }}
                    title={profile.photo_url ? "View full photo" : wallAsOwner ? (profile.is_employer ? "Add logo" : "Add photo") : undefined}
                    style={{ position: "relative", width: profile.is_employer ? 120 : 76, height: profile.is_employer ? 56 : 76, borderRadius: profile.is_employer ? 10 : "50%", overflow: "hidden", background: profile.is_employer ? "#f8f8f8" : t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, flexShrink: 0, boxSizing: "border-box", border: profile.is_employer ? "3px solid #d97706" : getServiceRingColor(profile.service) ? `3px solid ${getServiceRingColor(profile.service)}` : `1px solid ${t.border}`, padding: 0, cursor: profile.photo_url || wallAsOwner ? (uploadingAvatar ? "not-allowed" : "pointer") : undefined }}
                  >
                    {profile.photo_url
                      ? (
                        <OptimizedAvatarImg
                          photoUrl={profile.photo_url}
                          displayName={profileHeadlineName}
                          sizePx={profile.is_employer ? 160 : 76}
                          loading="eager"
                          fetchPriority="high"
                        />
                      )
                      : profileAvatarInitial}
                    {wallAsOwner && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!uploadingAvatar) photoInputRef.current?.click();
                        }}
                        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, opacity: uploadingAvatar ? 1 : 0, transition: "opacity 0.2s" }}
                        onMouseEnter={(e) => { if (!uploadingAvatar) e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={(e) => { if (!uploadingAvatar) e.currentTarget.style.opacity = "0"; }}
                      >
                        <Camera size={14} color="white" />
                        <span style={{ fontSize: 9, color: "white", fontWeight: 700 }}>{uploadingAvatar ? "..." : "Update"}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, lineHeight: 1.2 }}>{profileHeadlineName}</h1>
                    {isEmployerProfile && employerContactName && employerCompanyName && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{employerContactName}</div>
                    )}
                    <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {wallAsOwner ? "My Profile" : isEmployerProfile ? "Employer Profile" : "Member Profile"}
                      {profile.is_employer && (
                        <span style={{ background: profile.employer_verified ? "#1e40af" : "#6b7280", color: "white", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>
                          {profile.employer_verified ? "EOD Employer" : "Employer"}
                        </span>
                      )}
                    </div>
                    {referralBadge && (
                      <div style={{ display: "inline-block", marginTop: 4, background: referralBadge.bg, color: referralBadge.color, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20, border: `1px solid ${referralBadge.color}33` }}>
                        {referralBadge.label}
                      </div>
                    )}
                    {profile.plank_holder_awarded && (
                      <div style={{ marginTop: 4 }}>
                        <PlankHolderBadge number={profile.plank_holder_number} />
                      </div>
                    )}
                    {!isEmployerProfile && (
                    <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "flex-start" }}>
                      <div style={{ textAlign: "center" }}>
                        <button type="button" onClick={() => openConnList("know")}
                          style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 17 }}>{knowCount}</div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>Know</div>
                        </button>
                        {knowCount > 0 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6, marginTop: 8 }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              {knownPreviewUsers.slice(0, 5).map((u, idx) => {
                                const n = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Member";
                                return (
                                  <a
                                    key={u.user_id}
                                    href={`/profile/${u.user_id}`}
                                    title={n}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      marginLeft: idx === 0 ? 0 : -8,
                                      borderRadius: "50%",
                                      border: `2px solid ${t.surface}`,
                                      overflow: "hidden",
                                      background: t.badgeBg,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: t.textMuted,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      textDecoration: "none",
                                    }}
                                  >
                                    {u.photo_url ? <img src={u.photo_url} alt={n} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (n[0] || "U").toUpperCase()}
                                  </a>
                                );
                              })}
                            </div>
                            {knowCount > 5 && (
                              <button type="button" onClick={() => openConnList("know")} style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                                +{knowCount - 5} more
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <button type="button" onClick={() => openConnList("recruited")}
                          style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          <div style={{ fontWeight: 900, fontSize: 17, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <BadgeIcon count={referralCount} size={16} />
                            <span>{referralCount}</span>
                          </div>
                          <div style={{ fontSize: 10, color: t.textMuted }}>Recruited</div>
                        </button>
                      </div>
                    </div>
                    )}
                  </div>
                </div>

                {!isEmployerProfile && renderWorkUnitHistorySection(true)}

                {/* Connection buttons */}
                {!isBusinessOrgProfile && !wallAsOwner && currentUserId && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {!isEmployerProfile && currentUserKnowStatus === "none" && (
                      <button type="button" onClick={requestKnow} disabled={togglingConnection === "know"} style={{ flex: 1, background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                        Know
                      </button>
                    )}
                    {!isEmployerProfile && currentUserKnowStatus === "pending_outgoing" && (
                      <button type="button" onClick={cancelKnowRequest} disabled={togglingConnection === "know"} style={{ flex: 1, background: t.surface, color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                        Request Sent
                      </button>
                    )}
                    {!isEmployerProfile && currentUserKnowStatus === "pending_incoming" && (
                      <>
                        <button type="button" onClick={() => respondToKnowRequest(true)} disabled={togglingConnection === "confirm"} style={{ flex: 1, background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                          {togglingConnection === "confirm" && <span className="btn-spinner" />}
                          Confirm Know
                        </button>
                        <button type="button" onClick={() => respondToKnowRequest(false)} disabled={togglingConnection === "deny"} style={{ flex: 1, background: t.surface, color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                          {togglingConnection === "deny" && <span className="btn-spinner btn-spinner-dark" />}
                          Deny
                        </button>
                      </>
                    )}
                    {!isEmployerProfile && currentUserKnowStatus === "accepted" && (
                      <button type="button" onClick={toggleWorkedWith} disabled={togglingConnection === "worked_with"} style={{ flex: 1, background: currentUserWorkedWith ? "#111" : t.surface, color: currentUserWorkedWith ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {togglingConnection === "worked_with" && <span className={currentUserWorkedWith ? "btn-spinner" : "btn-spinner btn-spinner-dark"} />}
                        {currentUserWorkedWith ? "Worked With" : "Mark Worked With"}
                      </button>
                    )}
                    {userId && !blockedUserIds.has(userId) && (
                      <a href={`/sidebar?with=${userId}`} style={{ flex: 1, background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Message
                      </a>
                    )}
                    <HideBlockUserButton
                      targetUserId={userId}
                      currentUserId={currentUserId}
                      t={t}
                      onBlocked={(blockedUserId) => {
                        setBlockedUserIds((prev) => new Set([...prev, blockedUserId]));
                        setPosts((prev) =>
                          prev.filter((post) => (post.post_as_user_id ?? post.user_id) !== blockedUserId),
                        );
                      }}
                    />
                  </div>
                )}

                {/* Profile details G�� full width below */}
                <div style={{ marginTop: 14, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, color: t.textMuted, fontSize: 14, lineHeight: 1.7 }}>
                  {!showDesktopProfileBack ? (
                    isEmployerProfile ? (
                      <EmployerAccountCardDetails
                        companyName={profile.company_name}
                        firstName={profile.first_name}
                        lastName={profile.last_name}
                        email={profile.email}
                        companyWebsite={profile.company_website}
                        employerVerified={profile.employer_verified}
                        verificationStatus={profile.verification_status}
                        bio={profile.bio}
                        showEmail={showEmployerEmailOnCard}
                        compact
                        borderColor={t.borderLight}
                        textColor={t.text}
                        textMuted={t.textMuted}
                        textFaint={t.textFaint}
                        isOwnWall={wallAsOwner}
                        onCompleteBio={openWallEditProfile}
                      />
                    ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                        <div><strong>Current Position:</strong> {profile.role || "Not added yet"}</div>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px" }}>
                          <strong>Service:</strong> <ServiceSealValue service={profile.service} size={50} />
                        </div>
                        <div><strong>Status:</strong> {displayMilitaryStatus(profile.status) || "Not added yet"}</div>
                        <div><strong>Experience:</strong> {profile.years_experience || "Not added yet"}</div>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px" }}>
                          <strong>Badge:</strong> <SkillBadgeValue skillBadge={profile.skill_badge} width={52} />
                        </div>
                      </div>
                      {profile.bio?.trim() ? (
                        <div style={{ marginTop: 12, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, paddingInline: 8, color: t.textMuted, lineHeight: 1.6 }}>
                          {profile.bio}
                        </div>
                      ) : wallAsOwner ? (
                        <div style={{ marginTop: 12, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, lineHeight: 1.6 }}>
                          <div style={{ border: `1px dashed ${t.border}`, borderRadius: 10, padding: "12px 14px", background: t.bg, marginInline: 8 }}>
                            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8 }}>
                              Add a short bio so other members can quickly understand your background.
                            </div>
                            <button
                              type="button"
                              onClick={openWallEditProfile}
                              style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            >
                              Complete Bio
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                    )
                  ) : (
                    <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 12, background: t.bg }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4 }}>Employer View</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: t.text, marginTop: 2 }}>Candidate Snapshot</div>
                      <div style={{ marginTop: 8, fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                        {profile.employer_summary?.trim() || "No summary added yet."}
                      </div>
                      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                        <a href={profile.resume_url || "#"} target={profile.resume_url ? "_blank" : undefined} rel="noreferrer" style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 10px", textDecoration: "none", color: t.text, background: t.surface }}>
                          My Resume: <span style={{ color: t.textMuted }}>{profile.resume_url ? "Added" : "Not added"}</span>
                        </a>
                        <a href={profile.education_url || "#"} target={profile.education_url ? "_blank" : undefined} rel="noreferrer" style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 10px", textDecoration: "none", color: t.text, background: t.surface }}>
                          My Education: <span style={{ color: t.textMuted }}>{profile.education_url ? "Added" : "Not added"}</span>
                        </a>
                        <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "8px 10px", background: t.surface }}>
                          Specialized Training: <span style={{ color: t.textMuted }}>{normalizeTagArray(profile.specialized_training).length > 0 ? `${normalizeTagArray(profile.specialized_training).length} added` : "Not added"}</span>
                        </div>
                      </div>
                      <p style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.4, color: t.textFaint, textAlign: "center" }}>
                        use desktop for full view
                      </p>
                    </div>
                  )}
                  {!isBusinessOrgProfile && wallAsOwner && (profile.referral_code || !editingProfile) && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-start", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      {profile.referral_code && !showDesktopProfileBack && (
                        <>
                          <button
                            type="button"
                            onClick={handleCopyReferralLink}
                            style={{
                              background: referralActionState === "idle" ? "#111" : "#16a34a",
                              color: "white",
                              border: "none",
                              borderRadius: 999,
                              padding: "6px 12px",
                              minWidth: 112,
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: "pointer",
                              transition: "background 0.2s",
                            }}
                          >
                            {referralActionState === "shared"
                              ? "Shared"
                              : referralActionState === "copied"
                                ? "Copied"
                                : "Referral Link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReferralQrOpen(true)}
                            style={{
                              background: t.surface,
                              color: t.text,
                              border: `1px solid ${t.border}`,
                              borderRadius: 999,
                              padding: "6px 12px",
                              minWidth: 112,
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            Show QR Code
                          </button>
                        </>
                      )}
                      {!editingProfile && !showDesktopProfileBack && (
                        <button
                          type="button"
                          onClick={openWallEditProfile}
                          style={{
                            background: "#111",
                            color: "white",
                            border: "none",
                            borderRadius: 999,
                            padding: "6px 12px",
                            minWidth: 112,
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                        >
                          Edit Profile
                        </button>
                      )}
                      {canViewEmployerBack && (
                        <button
                          type="button"
                          onClick={() => setShowDesktopProfileBack((prev) => !prev)}
                          style={{
                            background: t.surface,
                            color: t.text,
                            border: `1px solid ${t.border}`,
                            borderRadius: 999,
                            padding: "6px 12px",
                            minWidth: 144,
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          {showDesktopProfileBack ? "See front of profile" : "Employment information"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* G��G�� Desktop profile card layout G��G�� */
              <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                {/* Identity: photo + name + stats + buttons */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0, width: 180 }}>
                  <div
                    id="profile-wall-avatar"
                    onClick={() => {
                      if (profile.photo_url) {
                        setExpandedProfilePhotoUrl(profile.photo_url);
                      } else if (wallAsOwner && !uploadingAvatar) {
                        photoInputRef.current?.click();
                      }
                    }}
                    title={profile.photo_url ? "View full photo" : wallAsOwner ? (profile.is_employer ? "Add logo" : "Add photo") : undefined}
                    style={{ position: "relative", width: profile.is_employer ? 160 : 120, height: profile.is_employer ? 72 : 120, borderRadius: profile.is_employer ? 12 : "50%", overflow: "hidden", background: profile.is_employer ? "#f8f8f8" : t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, boxSizing: "border-box", border: profile.is_employer ? "3px solid #d97706" : getServiceRingColor(profile.service) ? `4px solid ${getServiceRingColor(profile.service)}` : `1px solid ${t.border}`, padding: 0, cursor: profile.photo_url || wallAsOwner ? (uploadingAvatar ? "not-allowed" : "pointer") : undefined }}
                  >
                    {profile.photo_url ? (
                      <OptimizedAvatarImg
                        photoUrl={profile.photo_url}
                        displayName={profileHeadlineName}
                        sizePx={profile.is_employer ? 160 : 120}
                        loading="eager"
                        fetchPriority="high"
                      />
                    ) : ("Photo")}
                    {wallAsOwner && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!uploadingAvatar) photoInputRef.current?.click();
                        }}
                        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, opacity: uploadingAvatar ? 1 : 0, transition: "opacity 0.2s" }}
                        onMouseEnter={(e) => { if (!uploadingAvatar) e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={(e) => { if (!uploadingAvatar) e.currentTarget.style.opacity = "0"; }}
                      >
                        <Camera size={22} color="white" />
                        <span style={{ fontSize: 11, color: "white", fontWeight: 700 }}>{uploadingAvatar ? "Uploading..." : "Update"}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{profileHeadlineName}</h1>
                    {isEmployerProfile && employerContactName && employerCompanyName && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{employerContactName}</div>
                    )}
                    <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted, display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                      {wallAsOwner ? "My Profile" : isEmployerProfile ? "Employer Profile" : "Member Profile"}
                      {profile.is_employer && (
                        <span style={{ background: profile.employer_verified ? "#1e40af" : "#6b7280", color: "white", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>
                          {profile.employer_verified ? "EOD Employer" : "Employer"}
                        </span>
                      )}
                    </div>
                    {referralBadge && (
                      <div style={{ display: "inline-block", marginTop: 6, background: referralBadge.bg, color: referralBadge.color, fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20, border: `1px solid ${referralBadge.color}33` }}>
                        {referralBadge.label}
                      </div>
                    )}
                    {profile.plank_holder_awarded && (
                      <div style={{ marginTop: 6 }}>
                        <PlankHolderBadge number={profile.plank_holder_number} />
                      </div>
                    )}
                  </div>

                  {!isEmployerProfile && (
                  <div style={{ display: "flex", gap: 16, justifyContent: "center", width: "100%", alignItems: "flex-start" }}>
                    <div style={{ textAlign: "center" }}>
                      <button type="button" onClick={() => openConnList("know")}
                        style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 20 }}>{knowCount}</div>
                        <div style={{ fontSize: 12, color: t.textMuted }}>Know</div>
                      </button>
                      {knowCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6, marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center" }}>
                            {knownPreviewUsers.slice(0, 6).map((u, idx) => {
                              const n = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Member";
                              return (
                                <a
                                  key={u.user_id}
                                  href={`/profile/${u.user_id}`}
                                  title={n}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    marginLeft: idx === 0 ? 0 : -8,
                                    borderRadius: "50%",
                                    border: `2px solid ${t.surface}`,
                                    overflow: "hidden",
                                    background: t.badgeBg,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: t.textMuted,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    textDecoration: "none",
                                  }}
                                >
                                  {u.photo_url ? <img src={u.photo_url} alt={n} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (n[0] || "U").toUpperCase()}
                                </a>
                              );
                            })}
                          </div>
                          {knowCount > 6 && (
                            <button type="button" onClick={() => openConnList("know")} style={{ background: "none", border: "none", color: "#1d4ed8", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                              +{knowCount - 6} more
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <button type="button" onClick={() => openConnList("recruited")}
                        style={{ textAlign: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 20, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <BadgeIcon count={referralCount} size={18} />
                          <span>{referralCount}</span>
                        </div>
                        <div style={{ fontSize: 12, color: t.textMuted }}>Recruited</div>
                      </button>
                    </div>
                  </div>
                  )}

                {!isEmployerProfile && !isBusinessOrgProfile && renderWorkUnitHistorySection(false)}

                  {!isBusinessOrgProfile && !wallAsOwner && currentUserId && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                      {!isEmployerProfile && currentUserKnowStatus === "none" && (
                        <button type="button" onClick={requestKnow} disabled={togglingConnection === "know"} style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                          Know
                        </button>
                      )}
                      {!isEmployerProfile && currentUserKnowStatus === "pending_outgoing" && (
                        <button type="button" onClick={cancelKnowRequest} disabled={togglingConnection === "know"} style={{ background: t.surface, color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                          Request Sent
                        </button>
                      )}
                      {!isEmployerProfile && currentUserKnowStatus === "pending_incoming" && (
                        <>
                          <button type="button" onClick={() => respondToKnowRequest(true)} disabled={togglingConnection === "confirm"} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {togglingConnection === "confirm" && <span className="btn-spinner" />}
                            Confirm Know
                          </button>
                          <button type="button" onClick={() => respondToKnowRequest(false)} disabled={togglingConnection === "deny"} style={{ background: t.surface, color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                            {togglingConnection === "deny" && <span className="btn-spinner btn-spinner-dark" />}
                            Deny
                          </button>
                        </>
                      )}
                      {!isEmployerProfile && currentUserKnowStatus === "accepted" && (
                        <button type="button" onClick={toggleWorkedWith} disabled={togglingConnection === "worked_with"} style={{ background: currentUserWorkedWith ? "#111" : t.surface, color: currentUserWorkedWith ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {togglingConnection === "worked_with" && <span className={currentUserWorkedWith ? "btn-spinner" : "btn-spinner btn-spinner-dark"} />}
                        {currentUserWorkedWith ? "Worked With" : "Mark Worked With"}
                        </button>
                      )}
                      <a href={`/sidebar?with=${userId}`} style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "block", width: "100%", boxSizing: "border-box" }}>
                        Message
                      </a>
                    </div>
                  )}
                </div>

                {/* Profile details */}
                <div style={{ flex: 1, minWidth: 0, marginLeft: 20, color: t.textMuted, lineHeight: 1.8 }}>
                  {!showDesktopProfileBack ? (
                    isEmployerProfile ? (
                      <EmployerAccountCardDetails
                        companyName={profile.company_name}
                        firstName={profile.first_name}
                        lastName={profile.last_name}
                        email={profile.email}
                        companyWebsite={profile.company_website}
                        employerVerified={profile.employer_verified}
                        verificationStatus={profile.verification_status}
                        bio={profile.bio}
                        showEmail={showEmployerEmailOnCard}
                        borderColor={t.borderLight}
                        textColor={t.text}
                        textMuted={t.textMuted}
                        textFaint={t.textFaint}
                        isOwnWall={wallAsOwner}
                        onCompleteBio={openWallEditProfile}
                      />
                    ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                        <div><strong>Current Position:</strong> {profile.role || "Not added yet"}</div>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px" }}>
                          <strong>Service:</strong> <ServiceSealValue service={profile.service} size={60} />
                        </div>
                        <div><strong>Status:</strong> {displayMilitaryStatus(profile.status) || "Not added yet"}</div>
                        <div><strong>Years Experience:</strong> {profile.years_experience || "Not added yet"}</div>
                        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px" }}>
                          <strong>Skill Badge:</strong> <SkillBadgeValue skillBadge={profile.skill_badge} width={64} />
                        </div>
                      </div>
                      {profile.bio?.trim() ? (
                        <div style={{ marginTop: 14, color: t.textMuted, lineHeight: 1.6, borderTop: `1px solid ${t.borderLight}`, paddingTop: 14, paddingInline: 8 }}>
                          {profile.bio}
                        </div>
                      ) : wallAsOwner ? (
                        <div style={{ marginTop: 14, lineHeight: 1.6, borderTop: `1px solid ${t.borderLight}`, paddingTop: 14 }}>
                          <div style={{ border: `1px dashed ${t.border}`, borderRadius: 10, padding: "12px 14px", background: t.bg, maxWidth: 520, marginInline: 8 }}>
                            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8 }}>
                              Add a short bio so other members can quickly understand your background.
                            </div>
                            <button
                              type="button"
                              onClick={openWallEditProfile}
                              style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                            >
                              Complete Bio
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                    )
                  ) : (
                    <div style={{ minHeight: 290, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, background: t.bg }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>Employer View</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: t.text }}>Candidate Snapshot</div>
                        </div>
                        {!wallAsOwner && (viewerIsEmployer || viewerIsAdmin) && (
                          <a
                            href={`/sidebar?with=${userId}`}
                            style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "8px 14px", fontWeight: 800, fontSize: 12, textDecoration: "none" }}
                          >
                            Message Now
                          </a>
                        )}
                      </div>

                      <div style={{ border: `1px solid ${t.borderLight}`, borderRadius: 10, background: t.surface, padding: 12, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                          Top-line summary
                        </div>
                        <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                          {profile.employer_summary?.trim() || "No summary added yet."}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
                        <a href={profile.resume_url || "#"} target={profile.resume_url ? "_blank" : undefined} rel="noreferrer"
                          style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, textDecoration: "none", color: t.text, background: t.surface }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>My Resume</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>{profile.resume_url ? "Added" : "Not added"}</div>
                        </a>
                        <a href={profile.education_url || "#"} target={profile.education_url ? "_blank" : undefined} rel="noreferrer"
                          style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, textDecoration: "none", color: t.text, background: t.surface }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>My Education</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>{profile.education_url ? "Added" : "Not added"}</div>
                        </a>
                        <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, background: t.surface }}>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>Specialized Training</div>
                          <div style={{ fontSize: 11, color: t.textMuted }}>
                            {normalizeTagArray(profile.specialized_training).length > 0 ? `${normalizeTagArray(profile.specialized_training).length} added` : "Not added"}
                          </div>
                        </div>
                      </div>

                      {normalizeTagArray(profile.specialized_training).length > 0 && (
                        <div style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {normalizeTagArray(profile.specialized_training).map((tag) => {
                            const docUrl = normalizeTrainingDocs(profile.specialized_training_docs)[tag];
                            return (
                              <a
                                key={`back-training-${tag}`}
                                href={docUrl || "#"}
                                target={docUrl ? "_blank" : undefined}
                                rel="noreferrer"
                                style={{
                                  border: `1px solid ${t.border}`,
                                  borderRadius: 999,
                                  padding: "4px 10px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: t.text,
                                  textDecoration: "none",
                                  background: docUrl ? "#dcfce7" : t.surface,
                                  maxWidth: "100%",
                                  overflowWrap: "anywhere",
                                  wordBreak: "break-word",
                                }}
                              >
                                {tag}{docUrl ? " (file)" : ""}
                              </a>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        <div style={{ border: `1px solid ${t.borderLight}`, borderRadius: 10, padding: 10, background: t.surface }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                            Availability
                          </div>
                          <div style={{ fontSize: 13, color: t.text }}>
                            {(profile.availability_type || "Not set")} {profile.availability_date ? `- ${new Date(profile.availability_date).toLocaleDateString()}` : ""}
                          </div>
                        </div>
                        <div style={{ border: `1px solid ${t.borderLight}`, borderRadius: 10, padding: 10, background: t.surface }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                            Location + flexibility
                          </div>
                          <div style={{ fontSize: 13, color: t.text }}>
                            {[profile.current_city, profile.current_state].filter(Boolean).join(", ") || "Location not set"}
                            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                              Relocate: {profile.willing_to_relocate ? "Yes" : "No"} | Travel: {profile.willing_to_travel || "Not set"} | {profile.work_preference || "Preference not set"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ border: `1px solid ${t.borderLight}`, borderRadius: 10, padding: 10, background: t.surface, marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                          Security clearance
                        </div>
                        <div style={{ fontSize: 13, color: t.text }}>
                          {profile.clearance_level || "Not set"} | {profile.clearance_status || "Not set"}
                          {profile.clearance_expiration_date ? ` | Exp: ${new Date(profile.clearance_expiration_date).toLocaleDateString()}` : ""}
                        </div>
                      </div>

                      <div style={{ border: `1px solid ${t.borderLight}`, borderRadius: 10, padding: 10, background: t.surface }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                          Deployment / contract experience
                        </div>
                        {[
                          profile.has_oconus_experience ? "OCONUS Experience" : null,
                          profile.has_contract_experience ? "Contracting Experience" : null,
                          profile.has_federal_le_military_crossover ? "Federal/LE/Military crossover" : null,
                        ].filter(Boolean).length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {[
                              profile.has_oconus_experience ? "OCONUS Experience" : null,
                              profile.has_contract_experience ? "Contracting Experience" : null,
                              profile.has_federal_le_military_crossover ? "Federal/LE/Military crossover" : null,
                            ].filter((label): label is string => Boolean(label)).map((label) => (
                              <span
                                key={`exp-chip-${label}`}
                                style={{ border: `1px solid ${t.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700, background: t.bg, color: t.text }}
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: t.textMuted }}>No deployment/contract experience added yet.</div>
                        )}
                      </div>
                    </div>
                  )}
                  {!isBusinessOrgProfile && <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-start", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    {wallAsOwner && profile.referral_code && !showDesktopProfileBack && (
                      <>
                        <button
                          type="button"
                          onClick={handleCopyReferralLink}
                          style={{
                            background: referralActionState === "idle" ? "#111" : "#16a34a",
                            color: "white",
                            border: "none",
                            borderRadius: 999,
                            padding: "6px 12px",
                            minWidth: 112,
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                        >
                          {referralActionState === "shared"
                            ? "Shared"
                            : referralActionState === "copied"
                              ? "Copied"
                              : "Referral Link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReferralQrOpen(true)}
                          style={{
                            background: t.surface,
                            color: t.text,
                            border: `1px solid ${t.border}`,
                            borderRadius: 999,
                            padding: "6px 12px",
                            minWidth: 112,
                            fontWeight: 700,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Show QR Code
                        </button>
                      </>
                    )}
                    {wallAsOwner && !editingProfile && !showDesktopProfileBack && (
                      <button
                        type="button"
                        onClick={openWallEditProfile}
                        style={{
                          background: "#111",
                          color: "white",
                          border: "none",
                          borderRadius: 999,
                          padding: "6px 12px",
                          minWidth: 112,
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: "pointer",
                          transition: "background 0.2s",
                        }}
                      >
                        Edit Profile
                      </button>
                    )}
                    {canViewEmployerBack && (
                      <button
                        type="button"
                        onClick={() => setShowDesktopProfileBack(prev => !prev)}
                        style={{
                          background: t.surface,
                          color: t.text,
                          border: `1px solid ${t.border}`,
                          borderRadius: 999,
                          padding: "6px 12px",
                          minWidth: 144,
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        {showDesktopProfileBack ? "See front of profile" : "Employment information"}
                      </button>
                    )}
                  </div>}
                </div>
              </div>
            )}
          </div>

          {/* Edit profile (own wall) ΓÇö same fields as My Account */}
          {wallAsOwner && editingProfile && (
            <div
              onClick={(e) => { if (e.target === e.currentTarget) setEditingProfile(false); }}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1200, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", padding: isMobile ? 0 : 20 }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Edit Profile"
                style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: isMobile ? 0 : 16, width: "100%", maxWidth: 920, maxHeight: isMobile ? "100vh" : "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.35)" }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "14px 16px" : "18px 24px", borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Edit Profile</div>
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    aria-label="Close"
                    style={{ background: "none", border: "none", fontSize: 24, lineHeight: 1, cursor: "pointer", color: t.textMuted, padding: 4 }}
                  >
                    �
                  </button>
                </div>
                <div style={{ overflowY: "auto", flex: 1, padding: isMobile ? 16 : 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                {isBusinessOrgProfile ? (
                  <>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>
                        Display As
                      </label>
                      <select
                        value={editBusinessPageType}
                        onChange={(e) => setEditBusinessPageType(e.target.value === "organization" ? "organization" : "business")}
                        style={wallEditSelectStyle}
                      >
                        <option value="business">Business Profile</option>
                        <option value="organization">Organization Profile</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Business Name</label>
                      <input value={editBusinessName} onChange={(e) => setEditBusinessName(e.target.value)} placeholder="Business display name" style={wallEditInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Public Email</label>
                      <input type="email" value={editBusinessEmail} onChange={(e) => setEditBusinessEmail(e.target.value)} placeholder="public@email.com" style={wallEditInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Location</label>
                      <input value={editBusinessLocation} onChange={(e) => setEditBusinessLocation(e.target.value)} placeholder="City, State" style={wallEditInputStyle} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Website</label>
                      <input value={editBusinessWebsite} onChange={(e) => setEditBusinessWebsite(e.target.value)} placeholder="https://yourbusiness.com" style={wallEditInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Phone</label>
                      <input value={editBusinessPhone} onChange={(e) => setEditBusinessPhone(e.target.value)} placeholder="Optional public phone" style={wallEditInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Address</label>
                      <input value={editBusinessAddress} onChange={(e) => setEditBusinessAddress(e.target.value)} placeholder="Optional public address" style={wallEditInputStyle} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Owner Info</label>
                      <input value={editBusinessOwnerInfo} onChange={(e) => setEditBusinessOwnerInfo(e.target.value)} placeholder="Optional ownership / POC note" style={wallEditInputStyle} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Bio</label>
                      <textarea ref={bioTextareaRef} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Tell people about this business or organization..." rows={4} style={{ ...wallEditInputStyle, resize: "vertical", fontSize: 14, fontFamily: "inherit" }} />
                    </div>
                  </>
                ) : isEmployerProfile ? (
                  <>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Company / Organization Name</label>
                      <input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} placeholder="e.g. Acme Defense Group" style={wallEditInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Primary Contact � First Name</label>
                      <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} style={wallEditInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Primary Contact � Last Name</label>
                      <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} style={wallEditInputStyle} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Company Website</label>
                      <input value={editCompanyWebsite} onChange={(e) => setEditCompanyWebsite(e.target.value)} placeholder="https://yourcompany.com" style={wallEditInputStyle} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>About the Organization</label>
                      <textarea ref={bioTextareaRef} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Brief description of your organization for reviewers and candidates..." rows={4} style={{ ...wallEditInputStyle, resize: "vertical", fontSize: 14, fontFamily: "inherit" }} />
                    </div>
                  </>
                ) : (
                  <>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Current Position</label>
                  <input value={editRole} onChange={(e) => setEditRole(e.target.value)} placeholder="e.g. EOD Tech" style={wallEditInputStyle} />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Service Branch</label>
                  <select value={editService} onChange={(e) => setEditService(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select service...</option>
                    {SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Status</label>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select status...</option>
                    {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Skill Badge</label>
                  <select value={editSkillBadge} onChange={(e) => setEditSkillBadge(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select badge...</option>
                    {SKILL_BADGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Years of Experience</label>
                  <select value={editYearsExp} onChange={(e) => setEditYearsExp(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select years...</option>
                    {YEARS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1", border: `1px solid ${t.border}`, borderRadius: 12, padding: 12, background: t.bg }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    <div style={{ fontWeight: 900, color: t.text }}>Employer Side Visibility</div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: t.text, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={editOpenToOpportunities}
                        onChange={(e) => setEditOpenToOpportunities(e.target.checked)}
                      />
                      Open to opportunities
                    </label>
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    When enabled, employer accounts can view your employer-side back card.
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Top-line Summary (Employer Side)</label>
                  <textarea
                    value={editEmployerSummary}
                    onChange={(e) => setEditEmployerSummary(e.target.value)}
                    placeholder="Example: 12 years EOD experience including team leadership, range ops, and UXO clearance."
                    rows={3}
                    style={{ ...wallEditInputStyle, resize: "vertical", fontSize: 14, fontFamily: "inherit" }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>My Resume</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => resumeFileInputRef.current?.click()}
                      disabled={uploadingResumeDoc}
                      style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: uploadingResumeDoc ? "not-allowed" : "pointer" }}
                    >
                      {uploadingResumeDoc ? "Uploading..." : (editResumeUrl ? "Replace Resume File" : "Upload Resume File")}
                    </button>
                    {editResumeUrl && (
                      <>
                        <a href={editResumeUrl} target="_blank" rel="noreferrer" style={{ ...wallEditInputStyle, width: "auto", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          Open file
                        </a>
                        <button type="button" onClick={() => setEditResumeUrl("")} style={{ ...wallEditInputStyle, width: "auto", cursor: "pointer" }}>
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>My Education</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => educationFileInputRef.current?.click()}
                      disabled={uploadingEducationDoc}
                      style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: uploadingEducationDoc ? "not-allowed" : "pointer" }}
                    >
                      {uploadingEducationDoc ? "Uploading..." : (editEducationUrl ? "Replace Education File" : "Upload Education File")}
                    </button>
                    {editEducationUrl && (
                      <>
                        <a href={editEducationUrl} target="_blank" rel="noreferrer" style={{ ...wallEditInputStyle, width: "auto", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          Open file
                        </a>
                        <button type="button" onClick={() => setEditEducationUrl("")} style={{ ...wallEditInputStyle, width: "auto", cursor: "pointer" }}>
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Specialized Training</label>
                  <div style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 10, background: t.input, padding: 10 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {editSpecializedTraining.map((tag, idx) => (
                        <span key={`edit-training-${tag}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
                          {tag}
                          <button
                            type="button"
                            onClick={() => {
                              setTrainingUploadTargetTag(tag);
                              trainingFileInputRef.current?.click();
                            }}
                            style={{ border: "none", background: "transparent", color: "#2563eb", cursor: "pointer", fontSize: 11, fontWeight: 800, padding: 0 }}
                          >
                            {uploadingTrainingTag === tag ? "..." : (editSpecializedTrainingDocs[tag] ? "file" : "Upload Certificate")}
                          </button>
                          {editSpecializedTrainingDocs[tag] && (
                            <a
                              href={editSpecializedTrainingDocs[tag]}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#2563eb", textDecoration: "none", fontSize: 11, fontWeight: 800 }}
                            >
                              open
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveSpecializedTrainingTag(idx)}
                            style={{ border: "none", background: "transparent", color: t.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 800, padding: 0, lineHeight: 1 }}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={draftSpecializedTraining}
                        onChange={(e) => setDraftSpecializedTraining(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            handleAddSpecializedTrainingTag();
                          }
                        }}
                        placeholder="Type cert/training and press Enter"
                        style={{ ...wallEditInputStyle, flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        onClick={handleAddSpecializedTrainingTag}
                        style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "0 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Availability Type</label>
                  <select value={editAvailabilityType} onChange={(e) => setEditAvailabilityType(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select type...</option>
                    {AVAILABILITY_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Availability Date</label>
                  <input type="date" value={editAvailabilityDate} onChange={(e) => setEditAvailabilityDate(e.target.value)} style={wallEditInputStyle} />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Current City</label>
                  <input value={editCurrentCity} onChange={(e) => setEditCurrentCity(e.target.value)} placeholder="City" style={wallEditInputStyle} />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Current State</label>
                  <input value={editCurrentState} onChange={(e) => setEditCurrentState(e.target.value)} placeholder="State" style={wallEditInputStyle} />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Willing to Relocate</label>
                  <select value={editWillingToRelocate ? "yes" : "no"} onChange={(e) => setEditWillingToRelocate(e.target.value === "yes")} style={wallEditSelectStyle}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Willing to Travel</label>
                  <input value={editWillingToTravel} onChange={(e) => setEditWillingToTravel(e.target.value)} placeholder="Yes/No or %" style={wallEditInputStyle} />
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Work Preference</label>
                  <select value={editWorkPreference} onChange={(e) => setEditWorkPreference(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select preference...</option>
                    {WORK_PREFERENCES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Clearance Level</label>
                  <select value={editClearanceLevel} onChange={(e) => setEditClearanceLevel(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select level...</option>
                    {CLEARANCE_LEVELS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Clearance Status</label>
                  <select value={editClearanceStatus} onChange={(e) => setEditClearanceStatus(e.target.value)} style={wallEditSelectStyle}>
                    <option value="">Select status...</option>
                    {CLEARANCE_STATUSES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Clearance Expiration Date</label>
                  <input type="date" value={editClearanceExpirationDate} onChange={(e) => setEditClearanceExpirationDate(e.target.value)} style={wallEditInputStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: t.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={editHasOconusExperience} onChange={(e) => setEditHasOconusExperience(e.target.checked)} />
                    OCONUS Experience
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: t.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={editHasContractExperience} onChange={(e) => setEditHasContractExperience(e.target.checked)} />
                    Contracting Experience
                  </label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 700, color: t.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={editHasFederalLeMilitaryCrossover} onChange={(e) => setEditHasFederalLeMilitaryCrossover(e.target.checked)} />
                    Federal / LE / Military crossover
                  </label>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Professional Background</label>
                  <div style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 10, background: t.input, padding: 10 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {editProfessionalTags.map((tag, idx) => (
                        <span key={`edit-prof-${tag}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveWorkTag("professional", idx)}
                            style={{ border: "none", background: "transparent", color: t.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 800, padding: 0, lineHeight: 1 }}
                            aria-label={`Remove ${tag}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={draftProfessionalTag}
                        onChange={(e) => setDraftProfessionalTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            handleAddWorkTag("professional");
                          }
                        }}
                        placeholder="Type tag and press Enter"
                        style={{ ...wallEditInputStyle, flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddWorkTag("professional")}
                        style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "0 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: t.textFaint }}>
                      Example: ATF HME Instructor, UXO Contractor, Range Control
                    </div>
                  </div>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Unit History</label>
                  <div style={{ border: `1px solid ${t.inputBorder}`, borderRadius: 10, background: t.input, padding: 10 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {editUnitHistoryTags.map((tag, idx) => (
                        <span key={`edit-unit-${tag}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${t.border}`, background: t.bg, color: t.text, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 700 }}>
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveWorkTag("unit", idx)}
                            style={{ border: "none", background: "transparent", color: t.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 800, padding: 0, lineHeight: 1 }}
                            aria-label={`Remove ${tag}`}
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={draftUnitHistoryTag}
                        onChange={(e) => setDraftUnitHistoryTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            handleAddWorkTag("unit");
                          }
                        }}
                        placeholder="Type tag and press Enter"
                        style={{ ...wallEditInputStyle, flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddWorkTag("unit")}
                        style={{ background: "#111", color: "white", border: "none", borderRadius: 8, padding: "0 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Add
                      </button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: t.textFaint }}>
                      Example: 789th EOD Company, 28th EOD Company
                    </div>
                  </div>
                </div>
                {profile.is_employer && !isEmployerProfile && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Company Website</label>
                    <input value={editCompanyWebsite} onChange={(e) => setEditCompanyWebsite(e.target.value)} placeholder="https://yourcompany.com" style={wallEditInputStyle} />
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Bio</label>
                  <textarea ref={bioTextareaRef} value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Tell people about yourself..." rows={4} style={{ ...wallEditInputStyle, resize: "vertical", fontSize: 14, fontFamily: "inherit" }} />
                  <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: editBio.trim().length >= 50 ? "#16a34a" : t.textMuted }}>
                    {editBio.trim().length} / 50 characters
                  </div>
                </div>
                  </>
                )}
              </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: isMobile ? "12px 16px" : "16px 24px", borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
                  <button type="button" onClick={handleSaveWallProfile} disabled={savingProfile} style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: savingProfile ? "not-allowed" : "pointer", opacity: savingProfile ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                    {savingProfile && <span className="btn-spinner" />}
                    Save Changes
                  </button>
                  <button type="button" onClick={() => setEditingProfile(false)} style={{ background: t.surface, border: `1px solid ${t.inputBorder}`, color: t.text, borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isBusinessOrgProfile && (
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, overflow: "hidden" }}>
            <div
              style={{
                padding: 16,
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "minmax(0, 1fr) 1px minmax(0, max-content)",
                gap: 14,
                alignItems: "start",
              }}
            >
              {/* G��G�� Photo Strip G��G�� */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                {/* Title + gallery / add (matches common profile strip layout) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", minHeight: 56, alignContent: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>Photos</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {galleryPhotos.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setGalleryExpanded(!galleryExpanded)}
                        style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Gallery ({galleryPhotos.length}) {galleryExpanded ? "\u25B2" : "\u25BC"}
                      </button>
                    )}
                    {wallAsOwner && (
                      <label style={{ border: `1px solid ${t.border}`, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer", background: t.surface, color: t.text, whiteSpace: "nowrap", display: "inline-block" }}>
                        + Add Photo
                        <input type="file" accept="image/*" onChange={handleGalleryUpload} style={{ display: "none" }} />
                      </label>
                    )}
                    {uploadingGallery && <span style={{ fontSize: 12, color: t.textMuted }}>Uploading...</span>}
                    {!isMobile && pinnedPhotos.length > photoPreviewItems.length && (
                      <button
                        type="button"
                        onClick={() => setShowAllModal("photos")}
                        style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
                      >
                        Show all ({pinnedPhotos.length})
                      </button>
                    )}
                  </div>
                </div>

                <div style={!isMobile ? stripThumbGridStyleDesktop : { display: "grid", gridTemplateColumns: mobilePhotoGridCols, gap: 8 }}>
                  {pinnedPhotos.length === 0 && (
                    <div style={{ color: t.textFaint, fontSize: 13, alignSelf: "center", gridColumn: "1 / -1" }}>
                      {photos.length > 0
                        ? (wallAsOwner ? "Pin photos from the gallery to feature them here." : "No featured photos yet.")
                        : "No photos yet."}
                    </div>
                  )}
                  {photoPreviewItems.map((photo) => (
                    <div key={photo.id} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <div
                        onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                        style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                      >
                        <img src={galleryImageDisplayUrl(photo.photo_url)} alt="Pinned" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      {wallAsOwner && (
                        <div style={{ display: "flex", flexDirection: "row", gap: 6, alignItems: "stretch" }}>
                          <button
                            type="button"
                            onClick={() => deletePhoto(photo)}
                            disabled={deletingPhotoId === photo.id}
                            style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 6, padding: "5px 4px", fontWeight: 700, fontSize: 10, cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer", opacity: deletingPhotoId === photo.id ? 0.7 : 1, color: t.text, minWidth: 0 }}
                          >
                            {deletingPhotoId === photo.id ? "..." : "Del"}
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePinned(photo)}
                            disabled={togglingPinnedId === photo.id}
                            style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, borderRadius: 6, padding: "5px 4px", fontWeight: 700, fontSize: 10, cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer", opacity: togglingPinnedId === photo.id ? 0.7 : 1, color: t.text, minWidth: 0 }}
                          >
                            {togglingPinnedId === photo.id ? "..." : "Unpin"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {!isMobile && <div style={{ width: 1, alignSelf: "stretch", background: t.border }} />}

              {/* My Groups � desktop: right-aligned strip; mobile: full width below Photos */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minWidth: 0,
                  ...(!isMobile ? { alignItems: "flex-end" as const, width: "100%" } : {}),
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", minHeight: 56, alignContent: "center", width: "100%", maxWidth: !isMobile ? STRIP_THUMB_AREA_MAX : undefined }}>
                  <div style={{ fontSize: 15, fontWeight: 900 }}>My Groups</div>
                  {!isMobile && myGroups.length > groupPreviewItems.length && (
                    <button
                      type="button"
                      onClick={() => setShowAllModal("groups")}
                      style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 12, cursor: "pointer", padding: 0 }}
                    >
                      Show all ({myGroups.length})
                    </button>
                  )}
                </div>
                <div style={!isMobile ? stripThumbGridStyleDesktop : { display: "grid", gridTemplateColumns: mobileGroupsGridCols, gap: 8 }}>
                  {myGroups.length === 0 && (
                    <div style={{ color: t.textFaint, fontSize: 13, alignSelf: "center", gridColumn: "1 / -1" }}>
                      No groups yet.
                    </div>
                  )}
                  {groupPreviewItems.map((group) => (
                    <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <a
                        href={`/units/${group.slug}`}
                        style={{ textDecoration: "none", color: "inherit", display: "block", minWidth: 0, width: "100%" }}
                      >
                        <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, border: `1px solid ${t.border}` }}>
                          {group.cover_photo_url ? (
                            <img src={group.cover_photo_url} alt={group.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontWeight: 800, fontSize: 12 }}>
                              {group.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: t.text, textAlign: "left", minWidth: 0 }}>
                          <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {group.name}
                          </span>
                        </div>
                      </a>
                    </div>
                  ))}
                </div>
              </div>

              {isMobile && <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: t.text }}>Events</div>
                {wallSavedEvents.length === 0 ? (
                  <div style={{ color: t.textFaint, fontSize: 13, lineHeight: 1.45 }}>
                    No saved events
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {wallSavedEvents.map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          border: `1px solid ${t.border}`,
                          borderRadius: 12,
                          padding: "12px 14px",
                          background: t.bg,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 14, color: t.text, lineHeight: 1.25 }}>{ev.title || "Event"}</div>
                        {ev.organization ? (
                          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.3 }}>{ev.organization}</div>
                        ) : null}
                        {ev.date ? (
                          <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.3 }}>
                            {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                          {ev.signup_url ? (
                            <ExternalSiteLink
                              href={ev.signup_url}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 13, color: "#2563eb", textDecoration: "none" }}
                            >
                              Sign up <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
                            </ExternalSiteLink>
                          ) : (
                            <span />
                          )}
                          {wallAsOwner ? (
                            <button
                              type="button"
                              onClick={() => unsaveWallEvent(ev.id)}
                              disabled={unsavingWallEvent === ev.id}
                              style={{
                                background: "transparent",
                                border: `1px solid ${t.border}`,
                                color: t.textMuted,
                                borderRadius: 8,
                                padding: "4px 10px",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: unsavingWallEvent === ev.id ? "not-allowed" : "pointer",
                                opacity: unsavingWallEvent === ev.id ? 0.6 : 1,
                              }}
                            >
                              {unsavingWallEvent === ev.id ? "..." : "Remove"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>}
            </div>
            {/* Expanded gallery grid */}
            {galleryExpanded && galleryPhotos.length > 0 && (
              <div style={{ borderTop: `1px solid ${t.border}`, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Gallery</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                  {galleryPhotos.map((photo) => (
                    <div key={photo.id}>
                      <div
                        onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                        style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                      >
                        <img src={galleryImageDisplayUrl(photo.photo_url)} alt="Gallery" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      {wallAsOwner && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                          <button
                            onClick={() => togglePinned(photo)}
                            disabled={togglingPinnedId === photo.id}
                            style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: togglingPinnedId === photo.id ? "not-allowed" : "pointer", opacity: togglingPinnedId === photo.id ? 0.7 : 1 }}
                          >
                            {togglingPinnedId === photo.id ? "..." : "Pin"}
                          </button>
                          <button
                            onClick={() => deletePhoto(photo)}
                            disabled={deletingPhotoId === photo.id}
                            style={{ flex: 1, border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, padding: "4px 0", fontWeight: 700, fontSize: 10, cursor: deletingPhotoId === photo.id ? "not-allowed" : "pointer", opacity: deletingPhotoId === photo.id ? 0.7 : 1 }}
                          >
                            {deletingPhotoId === photo.id ? "..." : "Del"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {isBusinessOrgProfile && renderBusinessProfileMediaSections()}

          {renderBusinessProductsSection()}

          {showAllModal && (
            <div
              onClick={() => setShowAllModal(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: "100%", maxWidth: 920, maxHeight: "85vh", overflow: "auto", background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>
                    {showAllModal === "photos"
                      ? "All Pinned Photos"
                      : showAllModal === "groups"
                        ? "All My Groups"
                        : showAllModal === "business-wall-photos"
                          ? "All Post Photos"
                          : "All Post Videos"}
                  </div>
                  <button type="button" onClick={() => setShowAllModal(null)} style={{ border: "none", background: "none", fontSize: 20, lineHeight: 1, cursor: "pointer", color: t.textMuted }}>×</button>
                </div>
                {showAllModal === "business-wall-photos" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                    {businessWallMedia.photos.map((item) => (
                      <div
                        key={`${item.postId}-${item.url}`}
                        onClick={() => { setExpandedProfilePhotoUrl(item.url); setShowAllModal(null); }}
                        style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: t.bg }}
                      >
                        <img src={item.url} alt="Post photo" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                    ))}
                  </div>
                ) : showAllModal === "business-wall-videos" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                    {businessWallMedia.videos.map((item) => (
                      <div
                        key={`${item.postId}-${item.url}`}
                        onClick={() => { setLightboxVideoUrl(item.url); setShowAllModal(null); }}
                        style={{ position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: FEED_MEDIA_FRAME_BG }}
                      >
                        <video src={item.url} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                          <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Play size={18} color="white" fill="white" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : showAllModal === "photos" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                    {pinnedPhotos.map((photo) => (
                      <div key={photo.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); setShowAllModal(null); }} style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: t.bg }}>
                          <img src={galleryImageDisplayUrl(photo.photo_url)} alt="Pinned" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
                    {myGroups.map((group) => (
                      <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <a href={`/units/${group.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                          <div style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", background: t.bg, border: `1px solid ${t.border}` }}>
                            {group.cover_photo_url ? (
                              <img src={group.cover_photo_url} alt={group.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            ) : (
                              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontWeight: 800, fontSize: 14 }}>
                                {group.name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</div>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Wall */}
          <div style={{ paddingTop: 4 }}>

            {(wallAsOwner || isMutualConnection) && (
              <div id="profile-wall-composer" style={{ marginTop: 16, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                {wallAsOwner && canUsePostAsSelector(currentUserEmail) && postAsAdminProfile ? (
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
                  placeholder={wallAsOwner ? "Post to your profile..." : `Post on ${fullName}'s profile...`}
                  value={postContent}
                  onChange={handlePostContentChange}
                  onChangeRaw={(raw) => { postContentRawRef.current = raw; }}
                  onPaste={handleWallPostImagePaste}
                  style={{ width: "100%", minHeight: 80, border: "none", outline: "none", resize: "vertical", fontSize: 16, boxSizing: "border-box", background: t.input, color: t.text }}
                />

                {selectedPostGif && (
                  <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
                    <img src={selectedPostGif} alt="Selected GIF" style={{ maxWidth: 200, borderRadius: 10, display: "block" }} />
                    <button type="button" onClick={() => setSelectedPostGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>�</button>
                  </div>
                )}

                {fetchingOg && <div style={{ fontSize: 12, color: t.textFaint, marginTop: 4 }}>Fetching link preview...</div>}
                {ogPreview && (
                  <div style={{ position: "relative" }}>
                    <OgCard og={ogPreview} />
                    <button type="button" onClick={() => setOgPreview(null)} style={{ position: "absolute", top: 20, right: 8, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>�</button>
                  </div>
                )}

                {/* Hidden file inputs */}
                <input
                  ref={postImageInputRef}
                  type="file"
                  accept={FEED_ATTACHMENT_ACCEPT}
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    addWallPostImagesFromFiles(files);
                    if (postImageInputRef.current) postImageInputRef.current.value = "";
                  }}
                  style={{ display: "none" }}
                />
                <input
                  ref={postVideoPdfInputRef}
                  type="file"
                  accept={FEED_VIDEO_PDF_ACCEPT}
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    addWallPostImagesFromFiles(files);
                    if (postVideoPdfInputRef.current) postVideoPdfInputRef.current.value = "";
                  }}
                  style={{ display: "none" }}
                />
                <input
                  ref={postCadPreviewInputRef}
                  type="file"
                  accept={CAD_PREVIEW_IMAGE_ACCEPT}
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    addWallCadPreviewImagesFromFiles(files);
                    if (postCadPreviewInputRef.current) postCadPreviewInputRef.current.value = "";
                  }}
                  style={{ display: "none" }}
                />
                {isBusinessOrgProfile && (
                  <>
                    <input
                      ref={postWallPhotoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length === 0) return;
                        addWallPostImagesFromFiles(files, { photosOnly: true });
                        if (postWallPhotoInputRef.current) postWallPhotoInputRef.current.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                    {!wallAsOwner && (
                      <input
                        ref={postWallVideoInputRef}
                        type="file"
                        accept="video/*,.mp4,.mov,.webm,.m4v"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length === 0) return;
                          addWallPostImagesFromFiles(files, { videosOnly: true });
                          if (postWallVideoInputRef.current) postWallVideoInputRef.current.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    )}
                  </>
                )}

                {/* Image previews */}
                {selectedPostImages.length > 0 && (
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {selectedPostImages.map((item, i) => (
                      <div key={i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, background: FEED_MEDIA_FRAME_BG }}>
                        {isVideoFile(item.file) ? (
                          <video src={item.previewUrl} style={feedContainedImageStyle} muted playsInline />
                        ) : item.kind === "pdf" ? (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, fontSize: 11, color: t.textMuted }}>
                            <FileText size={28} color={t.textMuted} />
                            <span style={{ textAlign: "center", padding: "0 4px", wordBreak: "break-all" }}>{item.file.name}</span>
                          </div>
                        ) : item.kind === "cad3d" && item.cadRole === "file" ? (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, fontSize: 11, color: t.textMuted, padding: 6, textAlign: "center" }}>
                            <div style={{ fontWeight: 800 }}>CAD / 3D</div>
                            <span style={{ wordBreak: "break-all" }}>{item.file.name}</span>
                            {item.cadToken && missingCadPreviewTokens(selectedPostImages).includes(item.cadToken) && (
                              <span style={{ color: "#f59e0b", fontWeight: 700 }}>Preview required</span>
                            )}
                          </div>
                        ) : (
                          <img src={item.previewUrl} alt="" style={feedContainedImageStyle} />
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPostImages((prev) => {
                            const item = prev[i];
                            if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
                            if (item?.kind === "cad3d" && item.cadToken) {
                              return prev.filter((entry, idx) => {
                                if (idx === i) return false;
                                if (entry.cadToken === item.cadToken) {
                                  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
                                  return false;
                                }
                                return true;
                              });
                            }
                            return prev.filter((_, idx) => idx !== i);
                          })}
                          style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >�</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    {selectedPostImages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPostImages((prev) => {
                          prev.forEach((item) => {
                            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                          });
                          return [];
                        })}
                        style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 12px", fontWeight: 700, cursor: "pointer", color: t.text }}
                      >
                        Remove All Attachments
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>
                    Photos up to {formatUploadBytes(UPLOAD_LIMITS.image)} (large photos are compressed automatically).
                    {" "}
                    Short videos up to {formatUploadBytes(wallFeedUploadLimits.video)} (
                    {wallFeedUploadLimits.videoDurationHint}).
                    {isBusinessOrgProfile
                      ? " Photos and videos appear in separate sections above your feed."
                      : ` PDFs/CAD files up to ${formatUploadBytes(UPLOAD_LIMITS.document)} are supported; CAD files need preview images.`}
                  </p>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    {isBusinessOrgProfile ? (
                      <>
                        <button
                          type="button"
                          onClick={() => postWallPhotoInputRef.current?.click()}
                          style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Add Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => postWallVideoInputRef.current?.click()}
                          style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Add Video
                        </button>
                        <button
                          type="button"
                          onClick={() => postVideoPdfInputRef.current?.click()}
                          style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                        >
                          Add File
                        </button>
                        {missingCadPreviewTokens(selectedPostImages).length > 0 && (
                          <button
                            type="button"
                            onClick={() => postCadPreviewInputRef.current?.click()}
                            style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Add Preview Image ({missingCadPreviewTokens(selectedPostImages).length})
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            void openFeedMediaPicker({
                              mediaInputRef: postImageInputRef,
                              videoPdfInputRef: postVideoPdfInputRef,
                              onFiles: addWallPostImagesFromFiles,
                              remainingSlots: 10 - selectedPostImages.length,
                            });
                          }}
                          style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                        >
                          {selectedPostImages.length > 0 ? "Add More" : "Add Photo / Video / File"}
                        </button>
                        {missingCadPreviewTokens(selectedPostImages).length > 0 && (
                          <button
                            type="button"
                            onClick={() => postCadPreviewInputRef.current?.click()}
                            style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                          >
                            Add Preview Image ({missingCadPreviewTokens(selectedPostImages).length})
                          </button>
                        )}
                      </>
                    )}
                    <GifPickerButton
                      onSelect={(url) => setSelectedPostGif(url)}
                      theme={isDark ? "dark" : "light"}
                    />
                    <button
                      onClick={submitPost}
                      disabled={submittingPost}
                      style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: submittingPost ? "not-allowed" : "pointer", opacity: submittingPost ? 0.7 : 1 }}
                    >
                      {submittingPost ? "Posting..." : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
              {posts.length === 0 && <div style={{ color: t.textMuted }}>No wall posts yet.</div>}

              {posts.map((post, postIndex) => {
                const commentsOpen = expandedComments[post.id] || false;
                const eagerWallAvatar = postIndex === 0;
                const isAuthoredByCurrentUser = currentUserId === post.user_id;
                const canManagePost = wallAsOwner && currentUserId === userId && isAuthoredByCurrentUser;
                const isEditingPost = editingPostId === post.id;

                return (
                  <div key={post.id} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                    {/* Post header */}
                    {(() => {
                      const postAuthorPhoto = post.authorPhotoUrl ?? profile.photo_url;
                      const postAuthorService = post.authorService ?? profile.service;
                      const postAuthorName = post.author_name ?? fullName;
                      const postAuthorProfileId = post.post_as_user_id ?? post.user_id;
                      const avatar = (
                        <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", background: t.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, fontSize: 14, boxSizing: "border-box", border: getServiceRingColor(postAuthorService) ? `3px solid ${getServiceRingColor(postAuthorService)}` : undefined }}>
                          {postAuthorPhoto ? (
                            <OptimizedAvatarImg
                              photoUrl={postAuthorPhoto}
                              displayName={postAuthorName}
                              sizePx={42}
                              loading={eagerWallAvatar ? "eager" : "lazy"}
                            />
                          ) : postAuthorName[0]?.toUpperCase()}
                        </div>
                      );
                      return (
                        <FeedPostHeader
                          profileHref={`/profile/${postAuthorProfileId}`}
                          avatar={avatar}
                          authorName={postAuthorName}
                          createdAtLabel={formatDate(post.created_at)}
                          t={t}
                          isOwnPost={canManagePost}
                          canEdit={canManagePost}
                          canDelete={canManagePost}
                          isEditingPost={isEditingPost}
                          isMobile={isMobile}
                          isDeleting={deletingPostId === post.id}
                          isFlagging={flaggingId === post.id}
                          authorUserId={postAuthorProfileId}
                          currentUserId={currentUserId}
                          onEdit={() => startEditPost(post.id, post.content, post.post_as_user_id)}
                          onDelete={() => deleteWallPost(post.id)}
                          onFlag={() => openFlagModal(post.id)}
                          onBlockedUser={(blockedUserId) => {
                            setBlockedUserIds((prev) => new Set([...prev, blockedUserId]));
                            setPosts((prev) =>
                              prev.filter((row) => (row.post_as_user_id ?? row.user_id) !== blockedUserId),
                            );
                          }}
                        />
                      );
                    })()}

                    {/* Wall post attribution */}
                    {post.author_name && (
                      <div style={{ marginTop: 6, fontSize: 12, color: t.textMuted, fontStyle: "italic" }}>
                        Posted by {post.author_name}
                      </div>
                    )}

                    {isEditingPost ? (
                      <div style={{ marginTop: 10 }}>
                        {canManagePost && canUsePostAsSelector(currentUserEmail) && postAsAdminProfile ? (
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
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                          <button
                            type="button"
                            onClick={cancelEditPost}
                            style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", color: t.text }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => savePostEdit(post.id)}
                            disabled={savingPostId === post.id}
                            style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: savingPostId === post.id ? "not-allowed" : "pointer", opacity: savingPostId === post.id ? 0.7 : 1 }}
                          >
                            {savingPostId === post.id ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                    {/* Post content */}
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
                    {post.content &&
                      !isOnlyPreviewUrl(post.content, post.og_url) &&
                      !(post.event_id && post.feed_event) &&
                      !(
                        post.user_id === RUMINT_USER_ID &&
                        post.og_url &&
                        (post.og_title || post.og_image)
                      ) && (
                      <ExpandableText
                        textLength={post.content.length}
                        wrapperStyle={{ marginTop: 10 }}
                        toggleColor={t.textMuted}
                      >
                        {renderContent(post.content)}
                      </ExpandableText>
                    )}

                    {post.content && (() => {
                      const youtubeUrl = firstYouTubeUrlFromText(post.content);
                      if (!youtubeUrl || sameYouTubeVideo(youtubeUrl, post.og_url)) return null;
                      return <YouTubeEmbed url={youtubeUrl} title="Wall post YouTube video" marginTop={10} />;
                    })()}

                    {post.gif_url && (
                      <div style={{ marginTop: 10 }}>
                        <img src={post.gif_url} alt="GIF" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 12, display: "block" }} />
                      </div>
                    )}

                    {post.og_url && (() => {
                      const ytId = getYouTubeVideoId(post.og_url);
                      if (ytId) {
                        return <YouTubeEmbed videoId={ytId} title="Wall post YouTube video" marginTop={10} maxWidth={520} />;
                      }
                      if (post.og_title || post.og_image) {
                        const rumintStyle = post.user_id === RUMINT_USER_ID;
                        return (
                          <OgCard
                            og={{
                              url: post.og_url,
                              title: post.og_title,
                              description: rumintStyle
                                ? sanitizeRumintOgDescription(post.og_description)
                                : post.og_description,
                              image: post.og_image,
                              siteName: post.og_site_name,
                            }}
                          />
                        );
                      }
                      return null;
                    })()}

                    {/* Post images (member profiles show inline; business shows in Photos/Videos sections) */}
                    {post.image_urls.length > 0 && !isBusinessOrgProfile && (() => {
                      const attachments = attachmentsFromUrls(post.image_urls);
                      const visible = attachments.slice(0, 3);
                      const remaining = attachments.length - 3;
                      return (
                        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: visible.length === 1 ? "1fr" : visible.length === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 8, maxWidth: 420 }}>
                          {visible.map((attachment, i) => (
                            <button
                              key={`${attachment.url}-${i}`}
                              type="button"
                              onClick={() => {
                                if (attachment.kind === "pdf" || attachment.kind === "cad3d" || attachment.kind === "other") {
                                  window.open(attachment.url, "_blank", "noopener,noreferrer");
                                }
                              }}
                              style={{ position: "relative", aspectRatio: "1/1", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, background: FEED_MEDIA_FRAME_BG, padding: 0, cursor: attachment.kind === "pdf" || attachment.kind === "cad3d" || attachment.kind === "other" ? "pointer" : "default" }}
                            >
                              <FeedMediaAttachment
                                attachment={attachment}
                                alt={`Post image ${i + 1}`}
                                style={feedContainedImageStyle}
                                loading={postIndex === 0 ? "eager" : "lazy"}
                              />
                              {i === 2 && remaining > 0 && (
                                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 24, fontWeight: 800 }}>
                                  +{remaining}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })()}

                    {post.event_id && (
                      <>
                        {post.feed_event && (
                          <button
                            type="button"
                            onClick={() => { window.location.href = `/events?event=${encodeURIComponent(post.event_id!)}`; }}
                            style={{
                              marginTop: 12,
                              width: "100%",
                              maxWidth: 600,
                              marginLeft: "auto",
                              marginRight: "auto",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              borderRadius: 12,
                              border: `1px solid ${t.border}`,
                              background: t.bg,
                              color: "inherit",
                              textAlign: "center",
                              cursor: "pointer",
                              padding: 16,
                              boxSizing: "border-box",
                              boxShadow: "0 1px 0 rgba(0,0,0,0.12)",
                            }}
                            aria-label={`Open event details for ${post.feed_event.title}`}
                          >
                            <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.15, marginBottom: 8, color: t.text, width: "100%" }}>
                              New Event: {post.feed_event.title}
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 17, color: t.text, marginBottom: 10, width: "100%" }}>
                              {formatEventDisplayDate(post.feed_event.date) ?? post.feed_event.date}
                              {post.feed_event.event_time ? `  ${post.feed_event.event_time}` : ""}
                            </div>

                            {post.feed_event.image_url ? (
                              <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, background: t.surface, marginBottom: 10, boxSizing: "border-box" }}>
                                <img
                                  src={httpsAssetUrl(post.feed_event.image_url)}
                                  alt={post.feed_event.title}
                                  style={{ width: "100%", height: "auto", maxHeight: 420, objectFit: "contain", objectPosition: "center", display: "block", margin: "0 auto" }}
                                />
                              </div>
                            ) : null}

                            {(post.feed_event.location || post.feed_event.organization) && (
                              <div style={{ fontSize: 19, fontWeight: 700, color: t.text, marginBottom: 8, width: "100%" }}>
                                {post.feed_event.location ?? post.feed_event.organization}
                              </div>
                            )}
                            {post.feed_event.description && (
                              <div style={{ fontSize: 15, lineHeight: 1.45, color: t.textMuted, width: "100%" }}>
                                {post.feed_event.description}
                              </div>
                            )}
                          </button>
                        )}
                        <EventFeedActions
                          eventId={post.event_id}
                          signupUrl={post.feed_event?.signup_url ?? null}
                          initialInterested={post.event_interested_count}
                          initialGoing={post.event_going_count}
                          initialMyAttendance={post.event_my_attendance}
                          initialSaved={post.event_saved}
                          userId={currentUserId}
                        />
                      </>
                    )}

                    {/* Kangaroo Court G�� same order as home feed: post body above, then verdict, then poll */}
                    {post.kangaroo?.court?.status === "closed" && post.kangaroo?.verdict && (
                      <KangarooCourtVerdictBanner verdict={post.kangaroo.verdict} />
                    )}
                    <KangarooCourtFeedSection
                      postId={post.id}
                      userId={currentUserId}
                      bundle={post.kangaroo ?? null}
                      onAfterChange={() => {
                        if (userId) void loadPosts(userId);
                      }}
                      mode="card-only"
                      suppressVerdictFooter={
                        post.kangaroo?.court?.status === "closed" && Boolean(post.kangaroo?.verdict)
                      }
                    />
                      </>
                    )}

                    {/* Reactions / Comment bar G�� KC chip is display-only on wall (no Gǣstart courtGǥ) */}
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        alignItems: "center",
                        marginTop: 14,
                        flexWrap: "wrap",
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    >
                      <KangarooCourtFeedSection
                        postId={post.id}
                        userId={currentUserId}
                        bundle={post.kangaroo ?? null}
                        onAfterChange={() => {
                          if (userId) void loadPosts(userId);
                        }}
                        mode="trigger-inline"
                        wallStaticToolbar
                      />
                      <ReactionPickerTrigger
                        t={t}
                        disabled={!currentUserId}
                        viewerReaction={post.myReaction}
                        totalCount={post.likeCount}
                        busy={togglingLikeFor === post.id}
                        showTriggerCount={false}
                        onPick={(type) => void handleWallPostReaction(post.id, type)}
                      />
                      <button
                        type="button"
                        onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: !commentsOpen }))}
                        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: t.textMuted }}
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
                      <div style={{ fontSize: 14, color: t.textMuted }}>
                        {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                      </div>
                    </div>

                    {/* Comments section */}
                    {(post.comments.length > 0 || commentsOpen) && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                        {post.comments.length > 0 && (
                        <div style={{ display: "grid", gap: 4 }}>
                          {(commentsOpen ? post.comments : post.comments.slice(0, 2)).map((comment) => {
                            const textExpanded = expandedCommentTexts[comment.id] || false;
                            const isLong = (comment.content?.length ?? 0) > 100;
                            return (
                            <div key={comment.id} style={{ background: t.bg, borderRadius: 10, padding: 6 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
                                  <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", background: t.border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: t.textMuted, boxSizing: "border-box", border: getServiceRingColor(comment.authorService) ? `3px solid ${getServiceRingColor(comment.authorService)}` : undefined }}>
                                    {comment.authorPhotoUrl
                                      ? <img src={comment.authorPhotoUrl} alt={comment.authorName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                      : comment.authorName[0]?.toUpperCase()}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Link href={`/profile/${comment.user_id}`} style={{ fontWeight: 700, fontSize: 14, color: t.text, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {comment.authorName}
                                    </Link>
                                  </div>
                                  <span style={{ fontSize: 12, color: t.textMuted, flexShrink: 0, whiteSpace: "nowrap", alignSelf: "center" }}>
                                    {formatDate(comment.created_at)}
                                  </span>
                                </div>
                                {currentUserId === comment.user_id && (
                                  <button
                                    type="button"
                                    onClick={() => deleteWallComment(comment.id)}
                                    disabled={deletingCommentId === comment.id}
                                    style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: t.textMuted, fontWeight: 700, fontSize: 13, opacity: deletingCommentId === comment.id ? 0.6 : 1 }}
                                  >
                                    {deletingCommentId === comment.id ? "..." : "Delete"}
                                  </button>
                                )}
                              </div>
                              {comment.content && (
                                <div style={{ marginTop: 3 }}>
                                  <div style={{ fontSize: 13, lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: textExpanded ? undefined : 2 }}>
                                    {renderContent(comment.content)}
                                  </div>
                                  {isLong && (
                                    <button type="button" onClick={() => setExpandedCommentTexts((p) => ({ ...p, [comment.id]: !textExpanded }))} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: t.textMuted, fontSize: 12, fontWeight: 700, marginTop: 1 }}>
                                      {textExpanded ? "Show less" : "Show more"}
                                    </button>
                                  )}
                                </div>
                              )}
                              {comment.content && (() => {
                                const youtubeUrl = firstYouTubeUrlFromText(comment.content);
                                return youtubeUrl ? (
                                  <YouTubeEmbed
                                    url={youtubeUrl}
                                    title="Wall comment YouTube video"
                                    maxWidth="min(360px, 100%)"
                                    marginTop={8}
                                  />
                                ) : null;
                              })()}
                              {comment.image_url && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedCommentImageUrl(comment.image_url!)}
                                  aria-label="View comment image full size"
                                  style={{
                                    marginTop: 4,
                                    maxWidth: 180,
                                    height: 180,
                                    borderRadius: 10,
                                    overflow: "hidden",
                                    border: `1px solid ${t.border}`,
                                    background: FEED_MEDIA_FRAME_BG,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: 0,
                                    cursor: "pointer",
                                  }}
                                >
                                  <img src={comment.image_url} alt="Comment image" style={feedContainedImageStyle} />
                                </button>
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
                                  disabled={!currentUserId}
                                  viewerReaction={comment.myReaction}
                                  totalCount={comment.likeCount}
                                  busy={togglingCommentLikeFor === comment.id}
                                  showTriggerCount={false}
                                  onPick={(type) => void handleWallCommentReaction(comment.id, type)}
                                />
                                <div style={{ flex: "1 1 12px", minWidth: 0 }} />
                                <ReactionLeaderboard
                                  t={t}
                                  countsByType={comment.reactionCountsByType}
                                  reactorNamesByType={comment.reactorNamesByType}
                                />
                              </div>
                            </div>
                          ); })}
                        </div>
                        )}
                        {currentUserId &&
                          (() => {
                            const nudge = getSidebarNudgePeer(post.comments, currentUserId);
                            if (!nudge || isWallSidebarNudgeDismissed(post.id, nudge.peerUserId)) return null;
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
                                    onClick={() => openThreadSidebar(nudge.peerUserId)}
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
                                        sidebarNudgeDismissStorageKey(post.id, currentUserId, nudge.peerUserId),
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

                        {/* Add comment input */}
                        {commentsOpen && (
                        <div style={{ marginTop: 14 }}>
                          <MentionTextarea
                            placeholder="Write a comment..."
                            value={commentInputs[post.id] || ""}
                            onChange={(val) => setCommentInputs((prev) => ({ ...prev, [post.id]: val }))}
                            onChangeRaw={(raw) => { commentRawsRef.current[post.id] = raw; }}
                            style={{ width: "100%", minHeight: 60, border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: 10, resize: "vertical", fontSize: 14, boxSizing: "border-box", background: t.input, color: t.text }}
                          />
                          <div style={{ marginTop: 8, textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => submitComment(post.id)}
                              disabled={submittingCommentFor === post.id}
                              style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: submittingCommentFor === post.id ? "not-allowed" : "pointer", opacity: submittingCommentFor === post.id ? 0.7 : 1 }}
                            >
                              {submittingCommentFor === post.id ? "Posting..." : "Reply"}
                            </button>
                          </div>
                        </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
    </div>
    );
  };

  const renderProfileLoadingSkeleton = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: isMobile ? 20 : 0 }}>
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: 24, background: t.surface }}>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ ...skeletonBase, width: 100, height: 100, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...skeletonBase, height: 24, width: "40%", marginBottom: 10 }} />
            <div style={{ ...skeletonBase, height: 14, width: "30%", marginBottom: 8 }} />
            <div style={{ ...skeletonBase, height: 14, width: "60%" }} />
          </div>
        </div>
      </div>
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: 16, background: t.surface, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ ...skeletonBase, height: 14, width: 56, flexShrink: 0 }} />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ ...skeletonBase, width: 100, height: 100, borderRadius: 10, flexShrink: 0 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <div style={{ ...skeletonBase, width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...skeletonBase, height: 14, width: "30%", marginBottom: 6 }} />
              <div style={{ ...skeletonBase, height: 11, width: "20%" }} />
            </div>
          </div>
          <div style={{ ...skeletonBase, height: 13, marginBottom: 6 }} />
          <div style={{ ...skeletonBase, height: 13, width: "75%", marginBottom: 6 }} />
          <div style={{ ...skeletonBase, height: 13, width: "50%" }} />
        </div>
      ))}
    </div>
  );

  const renderProfileCenterContent = () => {
    if (loading) return renderProfileLoadingSkeleton();
    if (!profile) {
      return (
        <div style={{ marginTop: 20, fontSize: 15, color: t.textMuted }}>Profile not found.</div>
      );
    }
    return renderProfileCenter();
  };

  return (
    <>
      <ImageCropDialog
        open={wallAvatarCropOpen}
        imageSrc={wallAvatarCropSrc}
        aspect={profile?.is_employer ? ASPECT_EMPLOYER_LOGO : ASPECT_AVATAR}
        cropShape={profile?.is_employer ? "rect" : "round"}
        title={profile?.is_employer ? "Crop employer logo" : "Crop profile photo"}
        onCancel={closeWallAvatarCrop}
        onComplete={async (blob) => {
          await finalizeWallAvatarUpload(blob);
          closeWallAvatarCrop();
        }}
      />

      {!isDesktopShell ? (
    <div style={{ padding: "24px 16px", background: t.bg, minHeight: "100vh", color: t.text, width: "100%", maxWidth: "100%", boxSizing: "border-box", overflowX: "clip" }}>

      {/* Mobile unread messages banner ΓÇö own wall only */}
      {isMobile && wallAsOwner && (
        <a
          href="/sidebar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
            padding: "11px 16px",
            borderRadius: 10,
            border: `1px solid ${t.border}`,
            background: t.surface,
            textDecoration: "none",
            color: t.text,
            fontWeight: 700,
            fontSize: 14,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <span>Sidebars</span>
          <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 20, height: 20, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>
            {unreadMessages > 9 ? "9+" : unreadMessages}
          </span>
        </a>
      )}

      <DesktopLayout
        isMobile={isMobile}
        desktopColumns="320px minmax(0, 1fr) 360px"
        desktopGap={24}
        left={
          <aside
            style={{
              position: "sticky",
              top: 20,
              marginRight: isMobile ? undefined : -11,
              maxHeight: "calc(100vh - 80px)",
              overflowY: "auto",
              overflowX: "hidden",
              scrollbarGutter: "stable",
            }}
          >
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: t.text, marginBottom: 10 }}>Events</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.3 }}>
                  Add
                </span>
                <Link
                  href="/events?add=memorial"
                  style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}
                >
                  Memorial
                </Link>
                <span style={{ fontSize: 11, color: t.textFaint }}>|</span>
                <Link
                  href="/events?add=event"
                  style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}
                >
                  Event
                </Link>
              </div>
              <div style={{ marginBottom: 10 }}>
                <a href="/events" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                  See full events <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
                </a>
              </div>

              <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: 10, background: t.bg }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <button
                    type="button"
                    aria-label="Previous day"
                    onClick={() => setDesktopCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))}
                    style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.text }}>
                    {formatShortDate(desktopCalendarDate)}
                  </div>
                  <button
                    type="button"
                    aria-label="Next day"
                    onClick={() => setDesktopCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))}
                    style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 6, fontSize: 12, fontWeight: 700, padding: "3px 8px", cursor: "pointer" }}
                  >
                    <ChevronRight size={14} strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
                {(() => {
                  const d = desktopCalendarDate;
                  const iso = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
                  const eventCount = desktopCalendarEvents.filter((ev) => ev.date === iso).length;
                  const memorialCount = desktopMemorials.filter((m) => anniversaryDate(m.death_date, d.getFullYear()) === iso).length;
                  const hasItems = eventCount + memorialCount > 0;
                  return (
                    <div
                      style={{
                        border: `1px solid ${t.border}`,
                        borderRadius: 8,
                        minHeight: 50,
                        padding: "8px 10px",
                        background: t.surface,
                        position: "relative",
                      }}
                    >
                      <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700 }}>{CALENDAR_DAY_LABELS[d.getDay()]}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: t.text, lineHeight: 1.1 }}>{d.getDate()}</div>
                      {hasItems && (
                        <span style={{ position: "absolute", top: 8, right: 10, fontSize: 11, color: "#2563eb", fontWeight: 800 }}>
                          {eventCount + memorialCount} item{eventCount + memorialCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {desktopSelectedDay && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {[...desktopCalendarEvents
                    .filter((ev) => ev.date === desktopSelectedDay)
                    .map((ev) => ({ id: `ev-${ev.id}`, title: ev.title, sub: ev.organization || "Event", link: ev.signup_url || "/events" })),
                  ...desktopMemorials
                    .filter((m) => anniversaryDate(m.death_date, new Date(desktopSelectedDay + "T12:00:00").getFullYear()) === desktopSelectedDay)
                    .map((m) => ({ id: `mem-${m.id}`, title: m.name, sub: "EOD Memorial Foundation", link: m.source_url || "/events" }))].slice(0, 4).map((item) => (
                    <div key={item.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg, padding: "8px 10px" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{item.sub}</div>
                      {item.link.startsWith("http") ? (
                        <ExternalSiteLink href={item.link} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                          Open <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                        </ExternalSiteLink>
                      ) : (
                        <Link href={item.link} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                          Sign up <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12, borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>Saved events</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {desktopSavedEvents.length === 0 && (
                    <div style={{ color: t.textFaint, fontSize: 12 }}>No saved events.</div>
                  )}
                  {desktopSavedEvents.slice(0, 4).map((ev) => (
                    <div key={ev.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg, padding: "8px 10px" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, lineHeight: 1.25 }}>{ev.title || "Event"}</div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{ev.organization || "Saved item"}</div>
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        {ev.signup_url ? (
                          <ExternalSiteLink href={ev.signup_url} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                            Sign up <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                          </ExternalSiteLink>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() => unsaveWallEvent(ev.id)}
                          disabled={unsavingWallEvent === ev.id}
                          style={{ border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted, borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: unsavingWallEvent === ev.id ? "not-allowed" : "pointer" }}
                        >
                          {unsavingWallEvent === ev.id ? "..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: `1px solid ${t.border}`, paddingTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 8 }}>Saved jobs</div>
                <div style={{ marginTop: -4, marginBottom: 8, fontSize: 11, color: t.textFaint, fontWeight: 700 }}>
                  *not visible to other users
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {desktopSavedJobs.length === 0 && (
                    <div style={{ color: t.textFaint, fontSize: 12 }}>No saved jobs.</div>
                  )}
                  {desktopSavedJobs.slice(0, 4).map((job) => (
                    <div key={job.id} style={{ border: `1px solid ${t.border}`, borderRadius: 10, background: t.bg, padding: "8px 10px" }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: t.text, lineHeight: 1.25 }}>{job.title || "Job"}</div>
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{job.company_name || "Saved listing"}</div>
                      <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        {job.apply_url ? (
                          <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                            View job <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                          </a>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() => unsaveDesktopSavedJob(job.id)}
                          disabled={unsavingDesktopJobId === job.id}
                          style={{ border: `1px solid ${t.border}`, background: "transparent", color: t.textMuted, borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: unsavingDesktopJobId === job.id ? "not-allowed" : "pointer" }}
                        >
                          {unsavingDesktopJobId === job.id ? "..." : "Remove"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        }
        center={renderProfileCenterContent()}
        right={
          <aside
            style={{
              position: "sticky",
              top: 20,
            }}
          >
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: t.text, marginBottom: 10 }}>Messages</div>
              <div style={{ marginBottom: 10 }}>
                <a href="/sidebar" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                  See full messages <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
                </a>
              </div>
              <div style={{ display: "grid", gap: 8, maxHeight: 270, overflowY: "auto", paddingRight: 2 }}>
                {desktopConversations.length === 0 && (
                  <div style={{ color: t.textFaint, fontSize: 12 }}>No conversations yet.</div>
                )}
                {desktopConversations.map((conv) => {
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => openThreadSidebar(conv.other_user_id)}
                      style={{
                        border: `1px solid ${t.border}`,
                        background: t.bg,
                        borderRadius: 10,
                        padding: "8px 10px",
                        textAlign: "left",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {conv.other_user_name}
                        </div>
                        <div style={{ fontSize: 10, color: t.textFaint, flexShrink: 0 }}>{timeAgoShort(conv.last_message_at)}</div>
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11, color: t.textMuted, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {conv.last_message_preview || "Start a conversation"}
                      </div>
                      {conv.unread_count > 0 && (
                        <div style={{ marginTop: 4, fontSize: 10, color: "#b45309", fontWeight: 800 }}>
                          {conv.unread_count > 9 ? "9+" : conv.unread_count} new
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        }
      />
    </div>
      ) : (
        renderProfileCenterContent()
      )}

    {/* Photo Lightbox Modal */}
    {lightboxPhoto && (
      <div
        onClick={() => setLightboxPhoto(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ background: t.surface, borderRadius: 16, overflow: "hidden", maxWidth: 680, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        >
          {/* Full-size image */}
          <div style={{ position: "relative", background: "#000", flexShrink: 0 }}>
            <img
              src={lightboxPhoto.photo_url}
              alt="Photo"
              style={{ display: "block", width: "100%", maxHeight: 420, objectFit: "contain" }}
            />
            <button
              onClick={() => setLightboxPhoto(null)}
              style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "white", fontWeight: 900, fontSize: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
            >
              x
            </button>
          </div>

          {/* Interactions panel */}
          <div style={{ padding: 18, overflowY: "auto", flex: 1 }}>
            {/* Like bar */}
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => togglePhotoLike(lightboxPhoto.id)}
                disabled={togglingPhotoLikeFor === lightboxPhoto.id}
                style={{ background: "transparent", border: "none", padding: 0, cursor: togglingPhotoLikeFor === lightboxPhoto.id ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15, color: photoLikes[lightboxPhoto.id]?.likedByMe ? t.text : t.textMuted, opacity: togglingPhotoLikeFor === lightboxPhoto.id ? 0.6 : 1 }}
              >
                {photoLikes[lightboxPhoto.id]?.likedByMe ? "Unlike" : "Like"}
              </button>
              <div style={{ fontSize: 14, color: t.textMuted }}>
                {photoLikes[lightboxPhoto.id]?.count ?? 0} {(photoLikes[lightboxPhoto.id]?.count ?? 0) === 1 ? "like" : "likes"}
              </div>
            </div>

            {/* Comments */}
            <div style={{ borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 15 }}>Comments</div>
              <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                {(photoComments[lightboxPhoto.id] || []).length === 0 && (
                  <div style={{ color: t.textMuted, fontSize: 14 }}>No comments yet.</div>
                )}
                {(photoComments[lightboxPhoto.id] || []).map((c) => (
                  <div key={c.id} style={{ background: t.bg, borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: t.border, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: t.textMuted }}>
                        {c.authorPhotoUrl
                          ? <img src={c.authorPhotoUrl} alt={c.authorName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          : c.authorName[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{c.authorName}</div>
                        <div style={{ fontSize: 13, marginTop: 3, lineHeight: 1.4 }}>{c.content}</div>
                        <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>{formatDate(c.created_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add comment */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  placeholder="Write a comment..."
                  value={photoCommentInput}
                  onChange={(e) => setPhotoCommentInput(e.target.value)}
                  style={{ flex: 1, minHeight: 52, border: `1px solid ${t.inputBorder}`, borderRadius: 10, padding: 10, resize: "none", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit", background: t.input, color: t.text }}
                />
                <button
                  type="button"
                  onClick={() => submitPhotoComment(lightboxPhoto.id)}
                  disabled={submittingPhotoComment}
                  style={{ background: "black", color: "white", border: "none", borderRadius: 10, padding: "12px 16px", fontWeight: 700, cursor: submittingPhotoComment ? "not-allowed" : "pointer", opacity: submittingPhotoComment ? 0.7 : 1, flexShrink: 0 }}
                >
                  {submittingPhotoComment ? "..." : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    {expandedProfilePhotoUrl && (
      <div
        onClick={() => setExpandedProfilePhotoUrl(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.86)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(980px, 100%)", width: "100%" }}>
          <button
            type="button"
            onClick={() => setExpandedProfilePhotoUrl(null)}
            aria-label="Close photo"
            style={{
              position: "absolute",
              top: -10,
              right: 0,
              background: "rgba(255,255,255,0.14)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              width: 42,
              height: 42,
              fontSize: 24,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            x
          </button>
          <img
            src={expandedProfilePhotoUrl}
            alt={fullName}
            style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12, display: "block", margin: "0 auto" }}
          />
        </div>
      </div>
    )}
    {lightboxVideoUrl && (
      <div
        onClick={() => setLightboxVideoUrl(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.9)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(980px, 100%)", width: "100%" }}>
          <button
            type="button"
            onClick={() => setLightboxVideoUrl(null)}
            aria-label="Close video"
            style={{
              position: "absolute",
              top: -10,
              right: 0,
              background: "rgba(255,255,255,0.14)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              width: 42,
              height: 42,
              fontSize: 24,
              fontWeight: 700,
              cursor: "pointer",
              zIndex: 1,
            }}
          >
            x
          </button>
          <video
            src={lightboxVideoUrl}
            controls
            autoPlay
            playsInline
            style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 12, display: "block", margin: "0 auto", background: "#000" }}
          />
        </div>
      </div>
    )}
    {expandedCommentImageUrl && (
      <div
        onClick={() => setExpandedCommentImageUrl(null)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.86)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(980px, 100%)", width: "100%" }}>
          <button
            type="button"
            onClick={() => setExpandedCommentImageUrl(null)}
            aria-label="Close image"
            style={{
              position: "absolute",
              top: -10,
              right: 0,
              background: "rgba(255,255,255,0.14)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 999,
              width: 42,
              height: 42,
              fontSize: 24,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            x
          </button>
          <img
            src={expandedCommentImageUrl}
            alt="Comment image"
            style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 12, display: "block", margin: "0 auto" }}
          />
        </div>
      </div>
    )}
    {/* Connection list modal */}
    {connListOpen && (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) setConnListOpen(null); }}
        style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 16px" }}
      >
        <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.25)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 17 }}>
              {connListOpen === "know" ? "Know" : "Recruited"}
            </div>
            <button type="button" onClick={() => setConnListOpen(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: t.textMuted, lineHeight: 1 }}>�</button>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {connListLoading ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: t.textMuted, fontSize: 14 }}>Loading...</div>
            ) : connListUsers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: t.textMuted, fontSize: 14 }}>
                {connListOpen === "know" ? "No know connections yet." : "No recruits yet."}
              </div>
            ) : (
              connListUsers.map((u) => {
                const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || "Member";
                return (
                  <a key={u.user_id} href={`/profile/${u.user_id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${t.borderLight}`, textDecoration: "none", color: "inherit" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", background: t.badgeBg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, fontSize: 15 }}>
                      {u.photo_url
                        ? <img src={u.photo_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        : (name[0] || "U").toUpperCase()
                      }
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                      {u.worked_with && <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={12} color="#16a34a" /> Worked With</div>}
                      {u.service && <div style={{ fontSize: 12, color: t.textMuted }}>{u.service}</div>}
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>
      </div>
    )}
    {flagModal && (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-flag-modal-title"
        onClick={() => !flaggingId && setFlagModal(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 400, background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, padding: "20px 22px", boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.12)" }}
        >
          <h2 id="profile-flag-modal-title" style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800, color: t.text }}>
            Flag this post
          </h2>
          <label htmlFor="profile-flag-reason" style={{ display: "block", fontSize: 13, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
            Reason
          </label>
          <select
            id="profile-flag-reason"
            value={flagCategoryChoice}
            onChange={(e) => setFlagCategoryChoice(e.target.value as FlagCategory)}
            disabled={!!flaggingId}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, marginBottom: 18, boxSizing: "border-box" }}
          >
            {FLAG_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {FLAG_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => !flaggingId && setFlagModal(null)}
              disabled={!!flaggingId}
              style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${t.border}`, background: t.surfaceHover, color: t.text, fontWeight: 700, fontSize: 14, cursor: flaggingId ? "default" : "pointer" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitFlagFromModal()}
              disabled={!!flaggingId}
              style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#b91c1c", color: "white", fontWeight: 700, fontSize: 14, cursor: flaggingId ? "default" : "pointer" }}
            >
              {flaggingId ? "Submitting..." : "Submit Flag"}
            </button>
          </div>
        </div>
      </div>
    )}
    {currentUserId && !isDesktopShell && (
      <SidebarThreadDrawer
        open={sidebarDrawer.open}
        onClose={() => setSidebarDrawer({ open: false, peerId: null })}
        currentUserId={currentUserId}
        peerUserId={sidebarDrawer.peerId}
        modalOnDesktop
      />
    )}
    {!isBusinessOrgProfile && profile?.referral_code ? (
      <ReferralQrModal
        open={referralQrOpen}
        onClose={() => setReferralQrOpen(false)}
        referralUrl={buildLoginReferralUrl(profile.referral_code!)}
        onInviteAction={recordInviteForPlankHolder}
      />
    ) : null}
    {!isBusinessOrgProfile && (
      <>
        <PlankHolderEarnedModal
          open={plankHolderModalOpen}
          number={plankHolderChallenge?.plankHolderNumber}
          profileHref={currentUserId ? `/profile/${currentUserId}` : "/profile"}
          onClose={closePlankHolderModal}
        />
        <PlankHolderChallengeToast toast={plankHolderToast} />
      </>
    )}
    </>
  );
}
