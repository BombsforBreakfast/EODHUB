"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/lib/supabaseClient";
import NavBar from "../../../components/NavBar";
import DesktopLayout from "../../../components/DesktopLayout";
import ImageCropDialog from "../../../components/ImageCropDialog";
import { useTheme } from "../../../lib/ThemeContext";
import { ASPECT_AVATAR, ASPECT_EMPLOYER_LOGO } from "../../../lib/imageCropTargets";
import MentionTextarea, { extractMentionIds } from "../../../components/MentionTextarea";
import GifPickerButton from "../../../components/GifPickerButton";
import { PostLikersStack, type PostLikerBrief } from "../../../components/PostLikersStack";
import SidebarThreadDrawer from "../../../components/SidebarThreadDrawer";
import { useMasterShell } from "../../../components/master/masterShellContext";
import { getSidebarNudgePeer, sidebarNudgeDismissStorageKey } from "../../../lib/commentSidebarEligibility";
import { cancelDelayedLikeNotify, scheduleDelayedLikeNotify } from "../../../lib/likeNotifyDelay";
import { postNotifyJson } from "../../../lib/postNotifyClient";
import KangarooCourtFeedSection from "../../../components/KangarooCourtFeedSection";
import { KangarooCourtVerdictBanner } from "../../../components/KangarooCourtVerdictBanner";
import { Gem, Medal, Camera, FileText, Play, Check, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type {
  FeedKangarooBundle,
  KangarooCourtOptionRow,
  KangarooCourtRow,
  KangarooCourtVerdictRow,
} from "../../../lib/kangarooCourt";

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
  is_employer: boolean | null;
  employer_verified: boolean | null;
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
  likedByCurrentUser: boolean;
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

type DesktopCalendarEvent = {
  id: string;
  title: string;
  organization: string | null;
  date: string;
  signup_url: string | null;
};

type DesktopMemorial = {
  id: string;
  name: string;
  death_date: string;
  source_url: string | null;
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
  content: string;
  created_at: string;
  image_url: string | null;
  gif_url: string | null;
  image_urls: string[];
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
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
  /** Same feed bundles as home ΓÇö courts attach via `feed_post_id` */
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
const STATUS_OPTIONS = ["Active Duty", "Former", "Retired", "Civil Service"];
const SKILL_BADGE_OPTIONS = ["Basic", "Senior", "Master", "Civil Service"];
const YEARS_OPTIONS = [...Array.from({ length: 39 }, (_, i) => String(i + 1)), "40+"];
const WORK_TAG_PREVIEW_LIMIT = 3;
const WORK_TAG_MAX = 30;
const AVAILABILITY_TYPES = ["ETS", "Retirement", "Available From", "Contract End"];
const WORK_PREFERENCES = ["Remote", "Hybrid", "Onsite", "Flexible"];
const CLEARANCE_LEVELS = ["None", "Secret", "TS", "TS-SCI"];
const CLEARANCE_STATUSES = ["Active", "Expired"];

type KnowStatus = "none" | "pending_outgoing" | "pending_incoming" | "accepted";

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url);
}

function getYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1).split("?")[0];
    if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

const BARE_DOMAIN_RE = /\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/;
const URL_PATTERN_SRC = /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/.source;

function extractFirstUrl(text: string): string | null {
  const explicit = text.match(/https?:\/\/[^\s]+/);
  if (explicit) return explicit[0].replace(/[.,)>]+$/, "");
  const bare = text.match(BARE_DOMAIN_RE);
  if (bare) return `https://${bare[0].replace(/[.,)>]+$/, "")}`;
  return null;
}

const MENTION_RE_SRC = /@\[([^\]]+)\]\(([^)]+)\)/;

function renderContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const combined = new RegExp(`(${MENTION_RE_SRC.source})|${URL_PATTERN_SRC}`, "g");
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

function getServiceRingColor(service: string | null | undefined): string | null {
  switch (service) {
    case "Army": return "#556b2f";
    case "Navy": return "#003087";
    case "Air Force": return "#00b0f0";
    case "Marines": return "#bf0a30";
    case "Civilian Bomb Tech": return "#000000";
    case "Civil Service": return "#d97706";
    case "Federal": return "#7c3aed";
    default: return null;
  }
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
  const params = useParams();

  const rawUserId = params?.userId;
  const userId =
    typeof rawUserId === "string"
      ? rawUserId
      : Array.isArray(rawUserId)
      ? rawUserId[0]
      : null;

  const { t, isDark } = useTheme();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [myGroups, setMyGroups] = useState<GroupTile[]>([]);
  const [showAllModal, setShowAllModal] = useState<"photos" | "groups" | null>(null);
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
  const [submittingPost, setSubmittingPost] = useState(false);
  const [ogPreview, setOgPreview] = useState<OgPreview | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const ogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPostImages, setSelectedPostImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const [selectedPostGif, setSelectedPostGif] = useState<string | null>(null);
  const postImageInputRef = useRef<HTMLInputElement | null>(null);
  const postContentRawRef = useRef("");
  const commentRawsRef = useRef<Record<string, string>>({});

  const [knowCount, setKnowCount] = useState(0);
  const [knownPreviewUsers, setKnownPreviewUsers] = useState<
    { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; worked_with: boolean }[]
  >([]);
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
  const [editBio, setEditBio] = useState("");
  const [editService, setEditService] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editYearsExp, setEditYearsExp] = useState("");
  const [editSkillBadge, setEditSkillBadge] = useState("");
  const [editCompanyWebsite, setEditCompanyWebsite] = useState("");
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
  const [photoLikes, setPhotoLikes] = useState<Record<string, { count: number; likedByMe: boolean }>>({});
  const postsRef = useRef<Post[]>([]);
  const photoLikesRef = useRef<Record<string, { count: number; likedByMe: boolean }>>({});
  const [photoComments, setPhotoComments] = useState<Record<string, PhotoComment[]>>({});
  const [photoCommentInput, setPhotoCommentInput] = useState("");
  const [togglingPhotoLikeFor, setTogglingPhotoLikeFor] = useState<string | null>(null);
  const [submittingPhotoComment, setSubmittingPhotoComment] = useState(false);

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [viewerIsEmployer, setViewerIsEmployer] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  type ConnListType = "know" | "recruited";
  const [connListOpen, setConnListOpen] = useState<ConnListType | null>(null);
  const [connListUsers, setConnListUsers] = useState<{ user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; service: string | null; worked_with?: boolean }[]>([]);
  const [connListLoading, setConnListLoading] = useState(false);

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [expandedCommentTexts, setExpandedCommentTexts] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [togglingLikeFor, setTogglingLikeFor] = useState<string | null>(null);
  const [submittingCommentFor, setSubmittingCommentFor] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [togglingCommentLikeFor, setTogglingCommentLikeFor] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [wallAvatarCropOpen, setWallAvatarCropOpen] = useState(false);
  const [wallAvatarCropSrc, setWallAvatarCropSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const resumeFileInputRef = useRef<HTMLInputElement | null>(null);
  const educationFileInputRef = useRef<HTMLInputElement | null>(null);
  const trainingFileInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [showDesktopProfileBack, setShowDesktopProfileBack] = useState(false);
  const [showAllWorkHistoryTags, setShowAllWorkHistoryTags] = useState(false);
  const canViewEmployerBackNow = (currentUserId === profile?.user_id) || viewerIsAdmin || (viewerIsEmployer && !!profile?.open_to_opportunities);
  const [uploadingResumeDoc, setUploadingResumeDoc] = useState(false);
  const [uploadingEducationDoc, setUploadingEducationDoc] = useState(false);
  const [uploadingTrainingTag, setUploadingTrainingTag] = useState<string | null>(null);
  const [trainingUploadTargetTag, setTrainingUploadTargetTag] = useState<string | null>(null);

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
    setShowAllWorkHistoryTags(false);
  }, [userId]);

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

  function closeWallAvatarCrop() {
    if (wallAvatarCropSrc) URL.revokeObjectURL(wallAvatarCropSrc);
    setWallAvatarCropSrc(null);
    setWallAvatarCropOpen(false);
  }

  async function finalizeWallAvatarUpload(blob: Blob) {
    if (!currentUserId || currentUserId !== userId) return;
    const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    try {
      setUploadingAvatar(true);
      const safeName = `${Date.now()}-avatar.jpg`;
      const filePath = `${currentUserId}/${safeName}`;
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
      const { error: updateError } = await supabase.from("profiles").update({ photo_url: data.publicUrl }).eq("user_id", currentUserId);
      if (updateError) throw updateError;
      await loadProfile(userId);
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
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Photo must be under 8 MB.");
      return;
    }
    if (wallAvatarCropSrc) URL.revokeObjectURL(wallAvatarCropSrc);
    setWallAvatarCropSrc(URL.createObjectURL(file));
    setWallAvatarCropOpen(true);
  }

  async function uploadEmployerDocument(file: File, folder: string): Promise<string> {
    if (!currentUserId || currentUserId !== userId) throw new Error("Not authorized");
    const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "bin";
    const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "bin";
    const filePath = `${currentUserId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, { upsert: true });
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
    try {
      setSavingProfile(true);
      const { error } = await supabase
        .from("profiles")
        .update({
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
        })
        .eq("user_id", currentUserId);
      if (error) {
        alert(error.message);
        return;
      }
      await loadProfile(userId);
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
        setConnListUsers(data ?? []);
      } else {
        const targetId = userId as string;
        const { data: rows, error: rowsErr } = await supabase
          .from("profile_connections")
          .select("requester_user_id, target_user_id, worked_with")
          .eq("status", "accepted")
          .or(`requester_user_id.eq.${targetId},target_user_id.eq.${targetId}`);

        if (rowsErr && isConnV2MissingColumnError(rowsErr)) {
          const { data: legacyRows } = await supabase
            .from("profile_connections")
            .select("target_user_id, connection_type")
            .eq("requester_user_id", targetId)
            .in("connection_type", ["know", "worked_with"]);
          const mappedLegacy = (legacyRows ?? []) as { target_user_id: string; connection_type: "know" | "worked_with" }[];
          const idsLegacy = mappedLegacy.map((r) => r.target_user_id);
          if (idsLegacy.length === 0) { setConnListLoading(false); return; }
          const { data: legacyProfiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, photo_url, service")
            .in("user_id", idsLegacy);
          const legacyWorked = new Map<string, boolean>();
          mappedLegacy.forEach((m) => legacyWorked.set(m.target_user_id, m.connection_type === "worked_with"));
          setConnListUsers(
            ((legacyProfiles ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; service: string | null }[])
              .map((u) => ({ ...u, worked_with: legacyWorked.get(u.user_id) ?? false }))
          );
          return;
        }

        const mapped = ((rows ?? []) as {
          requester_user_id: string;
          target_user_id: string;
          worked_with: boolean;
        }[]).map((r) => ({
          user_id: r.requester_user_id === targetId ? r.target_user_id : r.requester_user_id,
          worked_with: !!r.worked_with,
        }));

        const ids = mapped.map((r) => r.user_id);
        if (ids.length === 0) { setConnListLoading(false); return; }
        const { data } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, photo_url, service")
          .in("user_id", ids);

        const workedMap = new Map<string, boolean>();
        mapped.forEach((m) => workedMap.set(m.user_id, m.worked_with));
        setConnListUsers(
          ((data ?? []) as { user_id: string; first_name: string | null; last_name: string | null; photo_url: string | null; service: string | null }[])
            .map((u) => ({ ...u, worked_with: workedMap.get(u.user_id) ?? false }))
        );
      }
    } finally {
      setConnListLoading(false);
    }
  }

  async function loadPosts(targetUserId: string) {
    const { error: closeKcErr } = await supabase.rpc("close_expired_kangaroo_courts");
    if (closeKcErr) {
      console.warn("close_expired_kangaroo_courts (wall):", closeKcErr.message);
    }

    const { data: rawData, error } = await supabase
      .from("posts")
      .select("id, user_id, wall_user_id, content, created_at, og_url, og_title, og_description, og_image, og_site_name, rabbithole_contribution_id")
      .or(`user_id.eq.${targetUserId},wall_user_id.eq.${targetUserId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Profile posts load error:", error);
      return;
    }

    const allMatchedPosts = (rawData ?? []) as {
      id: string;
      user_id: string;
      wall_user_id?: string | null;
      content: string;
      created_at: string;
      og_url?: string | null;
      og_title?: string | null;
      og_description?: string | null;
      og_image?: string | null;
      og_site_name?: string | null;
      rabbithole_contribution_id?: string | null;
    }[];
    const rawPosts = allMatchedPosts.filter((p) => {
      // Keep posts that are explicitly addressed to this wall.
      if ((p.wall_user_id ?? null) === targetUserId) return true;
      // Keep self-authored profile history posts (legacy/global posts with null wall target).
      // Exclude posts authored by this user on someone else's wall.
      if (p.user_id === targetUserId) {
        return !p.wall_user_id || p.wall_user_id === targetUserId;
      }
      return false;
    });
    if (rawPosts.length === 0) { setPosts([]); return; }

    const postIds = rawPosts.map((p) => p.id);

    // Legacy single image_url
    const { data: legacyImgData } = await supabase
      .from("posts").select("id, image_url, gif_url").in("id", postIds);
    const legacyImageMap = new Map<string, string | null>();
    const gifUrlMap = new Map<string, string | null>();
    ((legacyImgData ?? []) as { id: string; image_url: string | null; gif_url: string | null }[]).forEach((r) => {
      legacyImageMap.set(r.id, r.image_url ?? null);
      gifUrlMap.set(r.id, r.gif_url ?? null);
    });

    // Multi-image post_images table
    const { data: postImgData } = await supabase
      .from("post_images").select("id, post_id, image_url, sort_order")
      .in("post_id", postIds).order("sort_order", { ascending: true });
    const multiImageMap = new Map<string, string[]>();
    ((postImgData ?? []) as { id: string; post_id: string; image_url: string; sort_order: number | null }[]).forEach((r) => {
      const arr = multiImageMap.get(r.post_id) || [];
      arr.push(r.image_url);
      multiImageMap.set(r.post_id, arr);
    });

    // Likes
    const { data: likesData } = await supabase
      .from("post_likes").select("post_id, user_id").in("post_id", postIds);
    const likesByPost = new Map<string, string[]>();
    ((likesData ?? []) as { post_id: string; user_id: string }[]).forEach((r) => {
      const arr = likesByPost.get(r.post_id) || [];
      arr.push(r.user_id);
      likesByPost.set(r.post_id, arr);
    });

    // Comments
    const { data: commentsData } = await supabase
      .from("post_comments").select("id, post_id, user_id, content, created_at, image_url")
      .in("post_id", postIds).order("created_at", { ascending: true });
    const rawComments = (commentsData ?? []) as RawComment[];

    // Comment likes
    const commentIds = rawComments.map((c) => c.id);
    const { data: commentLikesData } = commentIds.length > 0
      ? await supabase.from("post_comment_likes").select("comment_id, user_id").in("comment_id", commentIds)
      : { data: [] };
    const likesByComment = new Map<string, string[]>();
    ((commentLikesData ?? []) as { comment_id: string; user_id: string }[]).forEach((r) => {
      const arr = likesByComment.get(r.comment_id) || [];
      arr.push(r.user_id);
      likesByComment.set(r.comment_id, arr);
    });

    const postLikerUserIds = ((likesData ?? []) as { post_id: string; user_id: string }[]).map((r) => r.user_id);
    const commentLikerUserIds = ((commentLikesData ?? []) as { comment_id: string; user_id: string }[]).map((r) => r.user_id);

    // Comment authors + everyone who liked a post or comment (for avatars / names)
    const commentAuthorIds = [...new Set(rawComments.map((c) => c.user_id))];
    const commentAndLikerIds = [
      ...new Set([...commentAuthorIds, ...postLikerUserIds, ...commentLikerUserIds].filter(Boolean)),
    ];
    const { data: commentProfileData } = commentAndLikerIds.length > 0
      ? await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, photo_url, service, is_employer")
          .in("user_id", commentAndLikerIds)
      : { data: [] };
    const commentNameMap = new Map<string, string>();
    const commentPhotoMap = new Map<string, string | null>();
    const commentServiceMap = new Map<string, string | null>();
    const commentEmployerMap = new Map<string, boolean | null>();
    ((commentProfileData ?? []) as {
      user_id: string;
      first_name: string | null;
      last_name: string | null;
      photo_url: string | null;
      service: string | null;
      is_employer: boolean | null;
    }[]).forEach((p) => {
      commentNameMap.set(p.user_id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "User");
      commentPhotoMap.set(p.user_id, p.photo_url ?? null);
      commentServiceMap.set(p.user_id, p.service ?? null);
      commentEmployerMap.set(p.user_id, p.is_employer ?? null);
    });

    // Build comment map
    const commentsByPost = new Map<string, WallComment[]>();
    rawComments.forEach((c) => {
      const arr = commentsByPost.get(c.post_id) || [];
      const cLikes = likesByComment.get(c.id) || [];
      arr.push({
        ...c,
        authorName: commentNameMap.get(c.user_id) || "User",
        authorPhotoUrl: commentPhotoMap.get(c.user_id) ?? null,
        authorService: commentServiceMap.get(c.user_id) ?? null,
        likeCount: cLikes.length,
        likedByCurrentUser: currentUserId ? cLikes.includes(currentUserId) : false,
      });
      commentsByPost.set(c.post_id, arr);
    });

    // For wall posts from other users, fetch their names
    const wallPosterIds = [...new Set(rawPosts
      .filter((p) => p.wall_user_id === targetUserId && p.user_id !== targetUserId)
      .map((p) => p.user_id))];
    const authorNameMap = new Map<string, string>();
    const authorPhotoMap = new Map<string, string | null>();
    const authorServiceMap = new Map<string, string | null>();
    if (wallPosterIds.length > 0) {
      const { data: authorProfiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, display_name, photo_url, service")
        .in("user_id", wallPosterIds);
      ((authorProfiles ?? []) as { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; photo_url: string | null; service: string | null }[])
        .forEach((ap) => {
          authorNameMap.set(ap.user_id, ap.display_name || `${ap.first_name || ""} ${ap.last_name || ""}`.trim() || "Member");
          authorPhotoMap.set(ap.user_id, ap.photo_url ?? null);
          authorServiceMap.set(ap.user_id, ap.service ?? null);
        });
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
          const votesRes = await supabase
            .from("kangaroo_court_votes")
            .select("court_id, option_id, user_id")
            .in("court_id", courtIds);

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
            const voteRows = (votesRes.error ? [] : (votesRes.data ?? [])) as {
              court_id: string;
              option_id: string;
              user_id: string;
            }[];
            if (votesRes.error) {
              console.warn("[KC wall] kangaroo_court_votes:", votesRes.error.message);
            }

            for (const [, courtArr] of byPost) {
              courtArr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              const court = courtArr[0];
              const postKey = court.feed_post_id;
              if (!postKey) continue;
              const opts = optsByCourt.get(court.id) ?? [];
              const verdict = verdictByCourt.get(court.id) ?? null;
              const vForCourt = voteRows.filter((x) => x.court_id === court.id);
              const voteCounts: Record<string, number> = {};
              for (const v of vForCourt) {
                voteCounts[v.option_id] = (voteCounts[v.option_id] ?? 0) + 1;
              }
              const mine = vForCourt.find((v) => v.user_id === kcViewerId);
              const myVoteOptionId: string | null = mine?.option_id ?? null;
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

    const merged: Post[] = rawPosts.map((p) => {
      const postLikes = likesByPost.get(p.id) || [];
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
      return {
        ...p,
        image_url: legacyImage,
        gif_url: gifUrlMap.get(p.id) ?? null,
        image_urls: multiImages.length > 0 ? multiImages : legacyImage ? [legacyImage] : [],
        likeCount: postLikes.length,
        commentCount: postComments.length,
        likedByCurrentUser: currentUserId ? postLikes.includes(currentUserId) : false,
        likers,
        comments: postComments,
        og_url: p.og_url ?? null,
        og_title: p.og_title ?? null,
        og_description: p.og_description ?? null,
        og_image: p.og_image ?? null,
        og_site_name: p.og_site_name ?? null,
        wall_user_id: p.wall_user_id ?? null,
        rabbithole_contribution_id: p.rabbithole_contribution_id ?? null,
        author_name: p.wall_user_id === targetUserId && p.user_id !== targetUserId ? (authorNameMap.get(p.user_id) ?? null) : null,
        authorPhotoUrl: p.wall_user_id === targetUserId && p.user_id !== targetUserId ? (authorPhotoMap.get(p.user_id) ?? null) : null,
        authorService: p.wall_user_id === targetUserId && p.user_id !== targetUserId ? (authorServiceMap.get(p.user_id) ?? null) : null,
        kangaroo: kcBundleByPostId.get(p.id) ?? null,
      };
    });

    setPosts(merged);
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

  async function toggleLike(postId: string, isLiked: boolean) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    cancelDelayedLikeNotify(`wall:post:${postId}:${currentUserId}`);
    try {
      setTogglingLikeFor(postId);
      if (isLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId);
      } else {
        await supabase.from("post_likes").insert([{ post_id: postId, user_id: currentUserId }]);
        let post = posts.find((p) => p.id === postId);
        if (!post) {
          const { data: row } = await supabase
            .from("posts")
            .select("user_id, wall_user_id")
            .eq("id", postId)
            .maybeSingle();
          if (row) {
            post = {
              id: postId,
              user_id: row.user_id,
              wall_user_id: row.wall_user_id ?? null,
            } as Post;
          }
        }
        if (post && profile && currentUserId !== post.user_id) {
          const navOwner = post.wall_user_id ?? post.user_id;
          const actorName = currentUserName?.trim() || "Someone";
          const recipientId = post.user_id;
          scheduleDelayedLikeNotify(`wall:post:${postId}:${currentUserId}`, () => {
            const p = postsRef.current.find((x) => x.id === postId);
            if (!p?.likedByCurrentUser) return;
            return notify(recipientId, `${actorName} liked your post`, navOwner, { type: "wall_like", post_id: postId });
          });
        }
      }
      if (userId) await loadPosts(userId);
    } finally { setTogglingLikeFor(null); }
  }

  async function toggleCommentLike(commentId: string, isLiked: boolean) {
    if (!currentUserId) { window.location.href = "/login"; return; }
    cancelDelayedLikeNotify(`wall:comment:${commentId}:${currentUserId}`);
    try {
      setTogglingCommentLikeFor(commentId);
      if (isLiked) {
        await supabase.from("post_comment_likes").delete().eq("comment_id", commentId).eq("user_id", currentUserId);
      } else {
        await supabase.from("post_comment_likes").insert([{ comment_id: commentId, user_id: currentUserId }]);
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
            if (!c?.likedByCurrentUser) return;
            return notify(recipientId, `${name} liked your comment`, ownerId, { type: "wall_comment_like", post_id: postIdForComment });
          });
        }
      }
      if (userId) await loadPosts(userId);
    } finally { setTogglingCommentLikeFor(null); }
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

  async function loadSavedEventsForUser(uid: string) {
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, signup_url)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Wall saved events load error:", error);
      setWallSavedEvents([]);
      return;
    }
    type RawRow = {
      id: string;
      events: { title: string | null; organization: string | null; date: string | null; signup_url: string | null } | null | { title: string | null; organization: string | null; date: string | null; signup_url: string | null }[];
    };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
      return {
        id: r.id,
        title: ev?.title ?? null,
        organization: ev?.organization ?? null,
        date: ev?.date ?? null,
        signup_url: ev?.signup_url ?? null,
      };
    });
    setWallSavedEvents(rows);
  }

  async function loadDesktopSavedEvents(uid: string) {
    const { data, error } = await supabase
      .from("saved_events")
      .select("id, event_id, events(title, organization, date, signup_url)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (error) {
      setDesktopSavedEvents([]);
      return;
    }
    type RawRow = {
      id: string;
      events: { title: string | null; organization: string | null; date: string | null; signup_url: string | null } | null | { title: string | null; organization: string | null; date: string | null; signup_url: string | null }[];
    };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
      return {
        id: r.id,
        title: ev?.title ?? null,
        organization: ev?.organization ?? null,
        date: ev?.date ?? null,
        signup_url: ev?.signup_url ?? null,
      };
    });
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
        .order("date", { ascending: true }),
      supabase
        .from("memorials")
        .select("id, name, death_date, source_url"),
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
    const { data: acceptedRows, error } = await supabase
      .from("profile_connections")
      .select("requester_user_id, target_user_id, worked_with, updated_at")
      .eq("status", "accepted")
      .or(`requester_user_id.eq.${targetUserId},target_user_id.eq.${targetUserId}`)
      .order("updated_at", { ascending: false });

    if (error) {
      if (isConnV2MissingColumnError(error)) {
        await loadConnectionsLegacy(targetUserId, effectiveCurrentUserId);
        return;
      }
      console.error("Profile connections load error:", error);
      return;
    }

    const pairRows = (acceptedRows ?? []) as {
      requester_user_id: string;
      target_user_id: string;
      worked_with: boolean;
      updated_at?: string | null;
    }[];

    const knownIds = pairRows.map((r) => (r.requester_user_id === targetUserId ? r.target_user_id : r.requester_user_id));
    setKnowCount(knownIds.length);

    if (knownIds.length > 0) {
      const previewIds = knownIds.slice(0, 6);
      const { data: previewProfiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, photo_url")
        .in("user_id", previewIds);
      const workedMap = new Map<string, boolean>();
      pairRows.forEach((r) => {
        const otherId = r.requester_user_id === targetUserId ? r.target_user_id : r.requester_user_id;
        workedMap.set(otherId, !!r.worked_with);
      });
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

    const { data: relation } = await supabase
      .from("profile_connections")
      .select("id, status, worked_with, requester_user_id, target_user_id")
      .or(
        `and(requester_user_id.eq.${effectiveCurrentUserId},target_user_id.eq.${targetUserId}),` +
        `and(requester_user_id.eq.${targetUserId},target_user_id.eq.${effectiveCurrentUserId})`
      )
      .maybeSingle();

    const rel = relation as {
      id: string;
      status: "pending" | "accepted" | "denied";
      worked_with: boolean;
      requester_user_id: string;
      target_user_id: string;
    } | null;

    if (!rel || rel.status === "denied") {
      setCurrentUserKnowStatus("none");
      setCurrentUserWorkedWith(false);
      setActiveConnectionId(null);
      setIsMutualConnection(false);
      return;
    }

    setActiveConnectionId(rel.id);
    setCurrentUserWorkedWith(!!rel.worked_with && rel.status === "accepted");
    if (rel.status === "accepted") {
      setCurrentUserKnowStatus("accepted");
      setIsMutualConnection(true);
    } else if (rel.status === "pending" && rel.target_user_id === effectiveCurrentUserId) {
      setCurrentUserKnowStatus("pending_incoming");
      setIsMutualConnection(false);
    } else {
      setCurrentUserKnowStatus("pending_outgoing");
      setIsMutualConnection(false);
    }
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

  async function uploadWallImage(file: File, postId: string): Promise<string> {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      throw new Error("Only image or video files are allowed.");
    }
    if (file.size > 50 * 1024 * 1024) throw new Error("File must be under 50 MB.");
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = `${currentUserId}/posts/${postId}/${safeName}`;
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
  }

  async function submitPost() {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    if (!userId || (!postContent.trim() && selectedPostImages.length === 0 && !selectedPostGif)) return;

    try {
      setSubmittingPost(true);
      const currentOg = ogPreview;
      const imagesToUpload = [...selectedPostImages];
      const gifToPost = selectedPostGif;

      const rawPostContent = (postContentRawRef.current || postContent).trim();
      const { data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert([{
          user_id: currentUserId,
          wall_user_id: userId ?? null,
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
              actor_name: currentUserName,
              type: "mention_post",
              category: "social",
              message: `${currentUserName} mentioned you in a post`,
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
          const url = await uploadWallImage(item.file, postId);
          uploadedUrls.push(url);
        }
        await supabase.from("post_images").insert(
          uploadedUrls.map((url, i) => ({
            post_id: postId,
            image_url: url,
            sort_order: i,
            file_type: imagesToUpload[i]?.file.type.startsWith("video/") ? "video" : "image",
          }))
        );
        await supabase.from("posts").update({ image_url: uploadedUrls[0] }).eq("id", postId);
      }

      // Notify wall owner when someone else posts on their wall
      if (!isOwnWall && userId && currentUserId !== userId) {
        await notify(userId, `${currentUserName} posted on your wall`, userId, { type: "wall_post", post_id: postId });
      }

      setPostContent("");
      postContentRawRef.current = "";
      setOgPreview(null);
      setSelectedPostGif(null);
      setSelectedPostImages((prev) => { prev.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; });
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

      // Preflight: check the target's privacy_who_can_request so we can show
      // a friendly message instead of a raw RLS rejection. RLS is the
      // authoritative gate; this is just UX.
      const { data: targetPrivacy } = await supabase
        .from("profiles")
        .select("privacy_who_can_request")
        .eq("user_id", userId)
        .maybeSingle();
      const policy = targetPrivacy?.privacy_who_can_request ?? "everyone";
      if (policy === "nobody") {
        alert("This member isn't accepting new connection requests.");
        return;
      }
      if (policy === "connections") {
        const { data: shared } = await supabase.rpc(
          "users_share_accepted_connection",
          { a: currentUserId, b: userId }
        );
        if (shared !== true) {
          alert("This member only accepts requests from people they know in common with you.");
          return;
        }
      }

      const { error } = await supabase.from("profile_connections").insert([{
        requester_user_id: currentUserId,
        target_user_id: userId,
        status: "pending",
        worked_with: false,
      }]);
      if (error) {
        if (isConnV2MissingColumnError(error)) {
          const { error: legacyErr } = await supabase.from("profile_connections").insert([{
            requester_user_id: currentUserId,
            target_user_id: userId,
            connection_type: "know",
          }]);
          if (legacyErr) { alert(legacyErr.message); return; }
        } else {
          // Catch the case where privacy flipped to 'nobody' between preflight
          // and insert — RLS will reject and we surface a clean message.
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("row-level security") || msg.includes("violates")) {
            alert("This member isn't accepting new connection requests.");
            return;
          }
          alert(error.message);
          return;
        }
      }
      await notify(userId, `${currentUserName} wants to connect (Know)`, currentUserId, { type: "connection_request" });
      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Request know error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function cancelKnowRequest() {
    if (!currentUserId || !userId || currentUserId === userId) return;
    try {
      setTogglingConnection("know");
      const { error } = await supabase
        .from("profile_connections")
        .delete()
        .eq("requester_user_id", currentUserId)
        .eq("target_user_id", userId)
        .eq("status", "pending");
      if (error) { alert(error.message); return; }
      await loadConnections(userId, currentUserId);
    } catch (err) {
      console.error("Cancel know request error:", err);
      alert("Failed to update connection");
    } finally {
      setTogglingConnection(null);
    }
  }

  async function respondToKnowRequest(accept: boolean) {
    if (!currentUserId || !userId || !activeConnectionId) return;
    try {
      setTogglingConnection(accept ? "confirm" : "deny");
      const { data: relRow } = await supabase
        .from("profile_connections")
        .select("requester_user_id, target_user_id")
        .eq("id", activeConnectionId)
        .single();
      const { error } = await supabase
        .from("profile_connections")
        .update({
          status: accept ? "accepted" : "denied",
          worked_with: accept ? currentUserWorkedWith : false,
          responded_at: new Date().toISOString(),
          responded_by_user_id: currentUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeConnectionId);
      if (error) { alert(error.message); return; }
      const rel = relRow as { requester_user_id: string; target_user_id: string } | null;
      if (rel) {
        const requesterId = rel.requester_user_id;
        if (accept) {
          await notify(requesterId, `${currentUserName} accepted your Know request`, currentUserId, { type: "connection_accepted" });
        } else {
          await notify(requesterId, `${currentUserName} declined your Know request`, currentUserId, { type: "connection_denied" });
        }
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
    if (!activeConnectionId) {
      // Legacy fallback before status/worked_with migration is applied.
      try {
        setTogglingConnection("worked_with");
        if (currentUserWorkedWith) {
          await supabase
            .from("profile_connections")
            .delete()
            .eq("requester_user_id", currentUserId)
            .eq("target_user_id", userId)
            .eq("connection_type", "worked_with");
          await supabase.from("profile_connections").insert([{
            requester_user_id: currentUserId,
            target_user_id: userId,
            connection_type: "know",
          }]);
        } else {
          await supabase
            .from("profile_connections")
            .delete()
            .eq("requester_user_id", currentUserId)
            .eq("target_user_id", userId)
            .eq("connection_type", "know");
          await supabase.from("profile_connections").insert([{
            requester_user_id: currentUserId,
            target_user_id: userId,
            connection_type: "worked_with",
          }]);
        }
        await loadConnections(userId, currentUserId);
      } catch (err) {
        console.error("Legacy toggle worked_with error:", err);
        alert("Failed to update connection");
      } finally {
        setTogglingConnection(null);
      }
      return;
    }
    try {
      setTogglingConnection("worked_with");
      const turningOn = !currentUserWorkedWith;
      const { error } = await supabase
        .from("profile_connections")
        .update({
          worked_with: !currentUserWorkedWith,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeConnectionId)
        .eq("status", "accepted");
      if (error) { alert(error.message); return; }
      if (turningOn && userId) {
        await notify(userId, `${currentUserName} marked you as worked with`, currentUserId, { type: "worked_with" });
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

      const filePath = `${currentUserId}/${Date.now()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-gallery")
        .upload(filePath, file);

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

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth <= 900); }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    async function init() {
      if (!userId || userId === "undefined") {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error("Auth error:", error);
      }

      const signedInUserId = data.user?.id ?? null;
      setCurrentUserId(signedInUserId);

      if (signedInUserId) {
        const { data: nameData } = await supabase.from("profiles").select("first_name, last_name, is_employer, is_admin").eq("user_id", signedInUserId).maybeSingle();
        const nd = nameData as { first_name: string | null; last_name: string | null; is_employer: boolean | null; is_admin?: boolean | null } | null;
        setCurrentUserName(`${nd?.first_name || ""} ${nd?.last_name || ""}`.trim() || "Someone");
        setViewerIsEmployer(!!nd?.is_employer);
        setViewerIsAdmin(!!nd?.is_admin);

        const convs = await supabase.from("conversations").select("id").or(`participant_1.eq.${signedInUserId},participant_2.eq.${signedInUserId}`);
        const convIds = (convs.data ?? []).map((c: { id: string }) => c.id);
        if (convIds.length > 0) {
          const { count } = await supabase.from("messages").select("*", { count: "exact", head: true }).eq("is_read", false).neq("sender_id", signedInUserId).in("conversation_id", convIds);
          setUnreadMessages(count ?? 0);
        } else {
          setUnreadMessages(0);
        }
      }

      const [,, photoResults] = await Promise.all([
        loadProfile(userId),
        loadPosts(userId),
        loadPhotos(userId),
        loadConnections(userId, signedInUserId),
        loadMyGroups(userId),
        loadSavedEventsForUser(userId),
      ]);
      if (signedInUserId) {
        await Promise.all([
          loadDesktopSavedEvents(signedInUserId),
          loadDesktopSavedJobs(signedInUserId),
        ]);
      } else {
        setDesktopSavedEvents([]);
        setDesktopSavedJobs([]);
        setViewerIsEmployer(false);
        setViewerIsAdmin(false);
      }
      await loadPhotoInteractions((photoResults ?? []).map((p) => p.id), signedInUserId);

      setLoading(false);
    }

    init();
  }, [userId]);

  useEffect(() => {
    if (!currentUserId) {
      setDesktopConversations([]);
      return;
    }
    loadDesktopConversations(currentUserId).catch((err) => {
      console.error("Desktop conversations load failed:", err);
    });
  }, [currentUserId]);

  useEffect(() => {
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
  }, [desktopCalendarDate]);

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
    if (!userId || userId === "undefined") return;

    const postsChannel = supabase
      .channel(`profile-posts-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => {
          loadPosts(userId);
        }
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
        { event: "*", schema: "public", table: "profile_photos" },
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
        () => { loadPosts(userId); }
      )
      .subscribe();

    const likesChannel = supabase
      .channel(`profile-likes-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_likes" },
        () => { loadPosts(userId); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(connectionsChannel);
      supabase.removeChannel(photosChannel);
      supabase.removeChannel(commentsChannel);
      supabase.removeChannel(likesChannel);
    };
  }, [userId, currentUserId]);

  if (!loading && !profile) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {!isDesktopShell && <NavBar />}
        <div style={{ marginTop: 20 }}>Profile not found.</div>
      </div>
    );
  }

  if (!loading && profile?.user_id === RUMINT_USER_ID) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {!isDesktopShell && <NavBar />}
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

  if (!loading && profile?.is_pure_admin) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        {!isDesktopShell && <NavBar />}
        <div
          style={{
            marginTop: 20,
            border: `1px solid ${t.border}`,
            borderRadius: 16,
            padding: 22,
            background: t.surface,
          }}
        >
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

  const techTypesText = profile
    ? Array.isArray(profile.tech_types) ? profile.tech_types.join(", ") : profile.tech_types || "Not added yet"
    : "";

  const isOwnWall = currentUserId === profile?.user_id;
  const canViewEmployerBack = isOwnWall || viewerIsAdmin || (viewerIsEmployer && !!profile?.open_to_opportunities);
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

        {(hasMore || (isOwnWall && professionalTags.length === 0 && unitHistoryTags.length === 0)) && (
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
            {isOwnWall && professionalTags.length === 0 && unitHistoryTags.length === 0 && (
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

  const renderProfileCenter = () => {
    if (!profile) return null;
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: isMobile ? 20 : 0 }}>

        {false && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 900 }}>Photos</div>
            {isOwnWall && (
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
                        src={photo.photo_url}
                        alt="Pinned photo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    {isOwnWall && (
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
                        src={photo.photo_url}
                        alt="Gallery photo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                    {isOwnWall && (
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

        {/* ΓöÇΓöÇ Content ΓöÇΓöÇ */}

          {/* Profile / Contact Card */}
          <div
            style={{
              position: "relative",
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 24,
              background: t.surface,
            }}
          >
            {isOwnWall && (
              <>
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} aria-hidden />
                <input ref={resumeFileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.odt,image/*" onChange={handleResumeFilePick} style={{ display: "none" }} aria-hidden />
                <input ref={educationFileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.odt,image/*" onChange={handleEducationFilePick} style={{ display: "none" }} aria-hidden />
                <input ref={trainingFileInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.rtf,.odt,image/*" onChange={handleTrainingFilePick} style={{ display: "none" }} aria-hidden />
              </>
            )}
            {isMobile ? (
              /* ΓöÇΓöÇ Mobile profile card layout ΓöÇΓöÇ */
              <div>
                {/* Top row: avatar + name + stats */}
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div
                    onClick={() => isOwnWall && !uploadingAvatar && photoInputRef.current?.click()}
                    title={isOwnWall ? (profile.is_employer ? "Click to update logo" : "Click to update photo") : undefined}
                    style={{ position: "relative", width: profile.is_employer ? 120 : 76, height: profile.is_employer ? 56 : 76, borderRadius: profile.is_employer ? 10 : "50%", overflow: "hidden", background: profile.is_employer ? "#f8f8f8" : t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, flexShrink: 0, boxSizing: "border-box", border: profile.is_employer ? "3px solid #d97706" : getServiceRingColor(profile.service) ? `3px solid ${getServiceRingColor(profile.service)}` : undefined, padding: 0, cursor: isOwnWall ? (uploadingAvatar ? "not-allowed" : "pointer") : undefined }}
                  >
                    {profile.photo_url
                      ? <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : fullName[0]?.toUpperCase()}
                    {isOwnWall && (
                      <div
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
                    <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, lineHeight: 1.2 }}>{fullName}</h1>
                    <div style={{ fontSize: 12, color: t.textFaint, marginTop: 2, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {isOwnWall ? "My Profile" : "Member Profile"}
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
                  </div>
                </div>

                {renderWorkUnitHistorySection(true)}

                {/* Connection buttons */}
                {!isOwnWall && currentUserId && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {currentUserKnowStatus === "none" && (
                      <button type="button" onClick={requestKnow} disabled={togglingConnection === "know"} style={{ flex: 1, background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                        Know
                      </button>
                    )}
                    {currentUserKnowStatus === "pending_outgoing" && (
                      <button type="button" onClick={cancelKnowRequest} disabled={togglingConnection === "know"} style={{ flex: 1, background: t.surface, color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                        Request Sent
                      </button>
                    )}
                    {currentUserKnowStatus === "pending_incoming" && (
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
                    {currentUserKnowStatus === "accepted" && (
                      <button type="button" onClick={toggleWorkedWith} disabled={togglingConnection === "worked_with"} style={{ flex: 1, background: currentUserWorkedWith ? "#111" : t.surface, color: currentUserWorkedWith ? "white" : t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {togglingConnection === "worked_with" && <span className={currentUserWorkedWith ? "btn-spinner" : "btn-spinner btn-spinner-dark"} />}
                        {currentUserWorkedWith ? "Worked With" : "Mark Worked With"}
                      </button>
                    )}
                    <a href={`/sidebar?with=${userId}`} style={{ flex: 1, background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      Message
                    </a>
                  </div>
                )}

                {/* Profile details ΓÇö full width below */}
                <div style={{ marginTop: 14, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, color: t.textMuted, fontSize: 14, lineHeight: 1.7 }}>
                  {!showDesktopProfileBack ? (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                        <div><strong>Current Position:</strong> {profile.is_employer ? "Employer Account" : (profile.role || "Not added yet")}</div>
                        <div><strong>Service:</strong> {profile.service || "Not added yet"}</div>
                        <div><strong>Status:</strong> {displayMilitaryStatus(profile.status) || "Not added yet"}</div>
                        <div><strong>Experience:</strong> {profile.years_experience || "Not added yet"}</div>
                        <div><strong>Badge:</strong> {profile.skill_badge || "Not added yet"}</div>
                        {profile.is_employer && (
                          <div style={{ gridColumn: "1 / -1" }}><strong>Website:</strong>{" "}
                            {profile.company_website
                              ? <a href={profile.company_website} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-all" }}>{profile.company_website}</a>
                              : <span style={{ color: "#9ca3af" }}>Not added yet</span>}
                          </div>
                        )}
                      </div>
                      {profile.bio?.trim() ? (
                        <div style={{ marginTop: 12, borderTop: `1px solid ${t.borderLight}`, paddingTop: 12, paddingInline: 8, color: t.textMuted, lineHeight: 1.6 }}>
                          {profile.bio}
                        </div>
                      ) : isOwnWall ? (
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
                    </div>
                  )}
                  {isOwnWall && (profile.referral_code || !editingProfile) && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-start", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                      {profile.referral_code && !showDesktopProfileBack && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`https://eod-hub.com/login?ref=${profile.referral_code}`);
                            setCopiedReferral(true);
                            setTimeout(() => setCopiedReferral(false), 2000);
                          }}
                          style={{
                            background: copiedReferral ? "#16a34a" : "#111",
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
                          {copiedReferral ? "Copied" : "Referral Link"}
                        </button>
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
                          {showDesktopProfileBack ? "See front of profile" : "See back of profile"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ΓöÇΓöÇ Desktop profile card layout ΓöÇΓöÇ */
              <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                {/* Identity: photo + name + stats + buttons */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flexShrink: 0, width: 180 }}>
                  <div
                    onClick={() => isOwnWall && !uploadingAvatar && photoInputRef.current?.click()}
                    title={isOwnWall ? (profile.is_employer ? "Click to update logo" : "Click to update photo") : undefined}
                    style={{ position: "relative", width: profile.is_employer ? 160 : 120, height: profile.is_employer ? 72 : 120, borderRadius: profile.is_employer ? 12 : "50%", overflow: "hidden", background: profile.is_employer ? "#f8f8f8" : t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, boxSizing: "border-box", border: profile.is_employer ? "3px solid #d97706" : getServiceRingColor(profile.service) ? `4px solid ${getServiceRingColor(profile.service)}` : undefined, padding: 0, cursor: isOwnWall ? (uploadingAvatar ? "not-allowed" : "pointer") : undefined }}
                  >
                    {profile.photo_url ? (
                      <img src={profile.photo_url} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : ("Photo")}
                    {isOwnWall && (
                      <div
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
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{fullName}</h1>
                    <div style={{ marginTop: 4, fontSize: 13, color: t.textMuted, display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                      {isOwnWall ? "My Profile" : "Member Profile"}
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
                  </div>

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

                {renderWorkUnitHistorySection(false)}

                  {!isOwnWall && currentUserId && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                      {currentUserKnowStatus === "none" && (
                        <button type="button" onClick={requestKnow} disabled={togglingConnection === "know"} style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                          Know
                        </button>
                      )}
                      {currentUserKnowStatus === "pending_outgoing" && (
                        <button type="button" onClick={cancelKnowRequest} disabled={togglingConnection === "know"} style={{ background: t.surface, color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {togglingConnection === "know" && <span className="btn-spinner btn-spinner-dark" />}
                          Request Sent
                        </button>
                      )}
                      {currentUserKnowStatus === "pending_incoming" && (
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
                      {currentUserKnowStatus === "accepted" && (
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
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
                        <div><strong>Current Position:</strong> {profile.is_employer ? "Employer Account" : (profile.role || "Not added yet")}</div>
                        <div><strong>Service:</strong> {profile.service || "Not added yet"}</div>
                        <div><strong>Status:</strong> {displayMilitaryStatus(profile.status) || "Not added yet"}</div>
                        <div><strong>Years Experience:</strong> {profile.years_experience || "Not added yet"}</div>
                        <div><strong>Skill Badge:</strong> {profile.skill_badge || "Not added yet"}</div>
                        {profile.is_employer && (
                          <div style={{ gridColumn: "1 / -1" }}><strong>Website:</strong>{" "}
                            {profile.company_website
                              ? <a href={profile.company_website} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", wordBreak: "break-all" }}>{profile.company_website}</a>
                              : <span style={{ color: "#9ca3af" }}>Not added yet</span>}
                          </div>
                        )}
                      </div>
                      {profile.bio?.trim() ? (
                        <div style={{ marginTop: 14, color: t.textMuted, lineHeight: 1.6, borderTop: `1px solid ${t.borderLight}`, paddingTop: 14, paddingInline: 8 }}>
                          {profile.bio}
                        </div>
                      ) : isOwnWall ? (
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
                  ) : (
                    <div style={{ minHeight: 290, border: `1px solid ${t.border}`, borderRadius: 12, padding: 16, background: t.bg }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.5 }}>Employer View</div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: t.text }}>Candidate Snapshot</div>
                        </div>
                        {!isOwnWall && (viewerIsEmployer || viewerIsAdmin) && (
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
                  <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-start", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                    {isOwnWall && profile.referral_code && !showDesktopProfileBack && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(`https://eod-hub.com/login?ref=${profile.referral_code}`);
                          setCopiedReferral(true);
                          setTimeout(() => setCopiedReferral(false), 2000);
                        }}
                        style={{
                          background: copiedReferral ? "#16a34a" : "#111",
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
                        {copiedReferral ? "Copied" : "Referral Link"}
                      </button>
                    )}
                    {isOwnWall && !editingProfile && !showDesktopProfileBack && (
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
                        {showDesktopProfileBack ? "See front of profile" : "See back of profile"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Edit profile (own wall) ΓÇö same fields as My Account */}
          {isOwnWall && editingProfile && (
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
                    ×
                  </button>
                </div>
                <div style={{ overflowY: "auto", flex: 1, padding: isMobile ? 16 : 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
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
                {profile.is_employer && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Company Website</label>
                    <input value={editCompanyWebsite} onChange={(e) => setEditCompanyWebsite(e.target.value)} placeholder="https://yourcompany.com" style={wallEditInputStyle} />
                  </div>
                )}
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 5, color: t.text }}>Bio</label>
                  <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} placeholder="Tell people about yourself..." rows={4} style={{ ...wallEditInputStyle, resize: "vertical", fontSize: 14, fontFamily: "inherit" }} />
                </div>
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
              {/* ΓöÇΓöÇ Photo Strip ΓöÇΓöÇ */}
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
                    {isOwnWall && (
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
                        ? (isOwnWall ? "Pin photos from the gallery to feature them here." : "No featured photos yet.")
                        : "No photos yet."}
                    </div>
                  )}
                  {photoPreviewItems.map((photo) => (
                    <div key={photo.id} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <div
                        onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); }}
                        style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: t.bg, cursor: "pointer" }}
                      >
                        <img src={photo.photo_url} alt="Pinned" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      {isOwnWall && (
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

              {/* My Groups — desktop: right-aligned strip; mobile: full width below Photos */}
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
                            <a
                              href={ev.signup_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 13, color: "#2563eb", textDecoration: "none" }}
                            >
                              Sign up <ArrowRight size={13} strokeWidth={2.5} aria-hidden />
                            </a>
                          ) : (
                            <span />
                          )}
                          {isOwnWall ? (
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
                        <img src={photo.photo_url} alt="Gallery" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </div>
                      {isOwnWall && (
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
                  <div style={{ fontSize: 16, fontWeight: 900 }}>{showAllModal === "photos" ? "All Pinned Photos" : "All My Groups"}</div>
                  <button type="button" onClick={() => setShowAllModal(null)} style={{ border: "none", background: "none", fontSize: 20, lineHeight: 1, cursor: "pointer", color: t.textMuted }}>├ù</button>
                </div>
                {showAllModal === "photos" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                    {pinnedPhotos.map((photo) => (
                      <div key={photo.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div onClick={() => { setLightboxPhoto(photo); setPhotoCommentInput(""); setShowAllModal(null); }} style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: t.bg }}>
                          <img src={photo.photo_url} alt="Pinned" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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

            {(isOwnWall || isMutualConnection) && (
              <div style={{ marginTop: 16, border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                <MentionTextarea
                  placeholder={isOwnWall ? "Post to your wall..." : `Post on ${fullName}'s wall...`}
                  value={postContent}
                  onChange={handlePostContentChange}
                  onChangeRaw={(raw) => { postContentRawRef.current = raw; }}
                  style={{ width: "100%", minHeight: 80, border: "none", outline: "none", resize: "vertical", fontSize: 16, boxSizing: "border-box", background: t.input, color: t.text }}
                />

                {selectedPostGif && (
                  <div style={{ marginTop: 10, position: "relative", display: "inline-block" }}>
                    <img src={selectedPostGif} alt="Selected GIF" style={{ maxWidth: 200, borderRadius: 10, display: "block" }} />
                    <button type="button" onClick={() => setSelectedPostGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>├ù</button>
                  </div>
                )}

                {fetchingOg && <div style={{ fontSize: 12, color: t.textFaint, marginTop: 4 }}>Fetching link preview...</div>}
                {ogPreview && (
                  <div style={{ position: "relative" }}>
                    <OgCard og={ogPreview} />
                    <button type="button" onClick={() => setOgPreview(null)} style={{ position: "absolute", top: 20, right: 8, background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>├ù</button>
                  </div>
                )}

                {/* Hidden file input */}
                <input
                  ref={postImageInputRef}
                  type="file"
                  accept="image/*,video/*,.pdf"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
                    const oversized = files.filter((f) => f.type.startsWith("video/") && f.size > MAX_VIDEO_BYTES);
                    if (oversized.length > 0) {
                      alert(`Video files must be under 200 MB. "${oversized[0].name}" is too large.`);
                      if (postImageInputRef.current) postImageInputRef.current.value = "";
                      return;
                    }
                    setSelectedPostImages((prev) => {
                      const slots = 10 - prev.length;
                      const toAdd = files.slice(0, slots).map((f) => ({ file: f, previewUrl: URL.createObjectURL(f) }));
                      return [...prev, ...toAdd];
                    });
                    if (postImageInputRef.current) postImageInputRef.current.value = "";
                  }}
                  style={{ display: "none" }}
                />

                {/* Image previews */}
                {selectedPostImages.length > 0 && (
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
                    {selectedPostImages.map((item, i) => (
                      <div key={i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, background: t.bg }}>
                        {item.file.type.startsWith("video/") ? (
                          <video src={item.previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : item.file.type === "application/pdf" ? (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, fontSize: 11, color: t.textMuted }}>
                            <FileText size={28} color={t.textMuted} />
                            <span style={{ textAlign: "center", padding: "0 4px", wordBreak: "break-all" }}>{item.file.name}</span>
                          </div>
                        ) : (
                          <img src={item.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedPostImages((prev) => { URL.revokeObjectURL(prev[i].previewUrl); return prev.filter((_, idx) => idx !== i); })}
                          style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: 24, height: 24, color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >├ù</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    {selectedPostImages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPostImages((prev) => { prev.forEach((item) => URL.revokeObjectURL(item.previewUrl)); return []; })}
                        style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 12px", fontWeight: 700, cursor: "pointer", color: t.text }}
                      >
                        Remove All Photos
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => postImageInputRef.current?.click()}
                      style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {selectedPostImages.length > 0 ? "Add More Photos" : "Add Photo"}
                    </button>
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

              {posts.map((post) => {
                const commentsOpen = expandedComments[post.id] || false;
                const isOwnPost = currentUserId === post.user_id;

                return (
                  <div key={post.id} style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                    {/* Post header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        {(() => {
                          const postAuthorPhoto = post.authorPhotoUrl ?? profile.photo_url;
                          const postAuthorService = post.authorService ?? profile.service;
                          const postAuthorName = post.author_name ?? fullName;
                          const postAuthorId = post.user_id;
                          const avatar = (
                            <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", background: t.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: t.textMuted, fontSize: 14, boxSizing: "border-box", border: getServiceRingColor(postAuthorService) ? `3px solid ${getServiceRingColor(postAuthorService)}` : undefined }}>
                              {postAuthorPhoto
                                ? <img src={postAuthorPhoto} alt={postAuthorName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                : postAuthorName[0]?.toUpperCase()}
                            </div>
                          );
                          return (
                            <>
                              <a href={`/profile/${postAuthorId}`} style={{ textDecoration: "none", flexShrink: 0 }}>{avatar}</a>
                              <div>
                                <a href={`/profile/${postAuthorId}`} style={{ fontWeight: 800, textDecoration: "none", color: t.text }}>{postAuthorName}</a>
                                <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>{formatDate(post.created_at)}</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {isOwnPost && (
                        <button
                          type="button"
                          onClick={() => deleteWallPost(post.id)}
                          disabled={deletingPostId === post.id}
                          style={{ background: "transparent", border: "none", padding: 0, cursor: deletingPostId === post.id ? "not-allowed" : "pointer", color: t.textMuted, fontWeight: 700, opacity: deletingPostId === post.id ? 0.6 : 1 }}
                        >
                          {deletingPostId === post.id ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </div>

                    {/* Wall post attribution */}
                    {post.author_name && (
                      <div style={{ marginTop: 6, fontSize: 12, color: t.textMuted, fontStyle: "italic" }}>
                        Posted by {post.author_name}
                      </div>
                    )}

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
                    {post.content && <div style={{ marginTop: 10, lineHeight: 1.5 }}>{renderContent(post.content)}</div>}

                    {post.gif_url && (
                      <div style={{ marginTop: 10 }}>
                        <img src={post.gif_url} alt="GIF" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 12, display: "block" }} />
                      </div>
                    )}

                    {post.og_url && (() => {
                      const ytId = getYouTubeId(post.og_url);
                      if (ytId) {
                        return (
                          <div style={{ marginTop: 10, borderRadius: 12, overflow: "hidden", aspectRatio: "16/9", maxWidth: 520 }}>
                            <iframe
                              src={`https://www.youtube.com/embed/${ytId}`}
                              style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        );
                      }
                      if (post.og_title || post.og_image) {
                        return (
                          <OgCard og={{ url: post.og_url, title: post.og_title, description: post.og_description, image: post.og_image, siteName: post.og_site_name }} />
                        );
                      }
                      return null;
                    })()}

                    {/* Post images */}
                    {post.image_urls.length > 0 && (() => {
                      const visible = post.image_urls.slice(0, 3);
                      const remaining = post.image_urls.length - 3;
                      return (
                        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: visible.length === 1 ? "1fr" : visible.length === 2 ? "repeat(2, 1fr)" : "repeat(3, 1fr)", gap: 8, maxWidth: 420 }}>
                          {visible.map((url, i) => (
                            <div key={i} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, background: t.bg }}>
                              {isVideoUrl(url) ? (
                                <>
                                  <video src={url} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                  {!(i === 2 && remaining > 0) && (
                                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                                      <div style={{ background: "rgba(0,0,0,0.5)", borderRadius: "50%", width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Play size={16} color="white" fill="white" />
                                      </div>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <img src={url} alt={`Post image ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              )}
                              {i === 2 && remaining > 0 && (
                                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 24, fontWeight: 800 }}>
                                  +{remaining}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Kangaroo Court ΓÇö same order as home feed: post body above, then verdict, then poll */}
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

                    {/* Like / Comment bar ΓÇö KC chip is display-only on wall (no ΓÇ£start courtΓÇ¥) */}
                    <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
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
                      <button
                        type="button"
                        onClick={() => toggleLike(post.id, post.likedByCurrentUser)}
                        disabled={togglingLikeFor === post.id}
                        style={{ background: "transparent", border: "none", padding: 0, cursor: togglingLikeFor === post.id ? "not-allowed" : "pointer", fontWeight: 700, color: post.likedByCurrentUser ? t.text : t.textMuted, opacity: togglingLikeFor === post.id ? 0.6 : 1 }}
                      >
                        {post.likedByCurrentUser ? "Unlike" : "Like"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedComments((prev) => ({ ...prev, [post.id]: !commentsOpen }))}
                        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: t.textMuted }}
                      >
                        {commentsOpen ? "Hide Comments" : "Comment"}
                      </button>
                      {post.likeCount > 0 && <PostLikersStack likers={post.likers} />}
                      <div style={{ fontSize: 14, color: t.textMuted }}>{post.likeCount} {post.likeCount === 1 ? "like" : "likes"}</div>
                      <div style={{ fontSize: 14, color: t.textMuted }}>{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</div>
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
                              {comment.image_url && (
                                <div style={{ marginTop: 4, maxWidth: 180, borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}` }}>
                                  <img src={comment.image_url} alt="Comment image" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleCommentLike(comment.id, comment.likedByCurrentUser)}
                                  disabled={togglingCommentLikeFor === comment.id}
                                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, fontSize: 13, color: comment.likedByCurrentUser ? t.text : t.textMuted, opacity: togglingCommentLikeFor === comment.id ? 0.6 : 1 }}
                                >
                                  {comment.likedByCurrentUser ? "Unlike" : "Like"}
                                </button>
                                <div style={{ fontSize: 13, color: t.textMuted }}>{comment.likeCount} {comment.likeCount === 1 ? "like" : "likes"}</div>
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
      <NavBar />

      {/* Mobile unread messages banner ΓÇö own wall only */}
      {isMobile && isOwnWall && (
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

      {/* Skeleton while loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
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
            {[1,2,3,4].map((i) => <div key={i} style={{ ...skeletonBase, width: 100, height: 100, borderRadius: 10, flexShrink: 0 }} />)}
          </div>
          {[1,2,3].map((i) => (
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
      )}

      {/* Single-column mobile layout + three-column desktop layout */}
      {!loading && profile && <DesktopLayout
        isMobile={isMobile}
        desktopColumns="320px minmax(0, 1fr) 360px"
        desktopGap={24}
        left={
          <aside
            style={{
              display: isMobile ? "none" : "block",
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
                <a
                  href="/events"
                  style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}
                >
                  Memorial
                </a>
                <span style={{ fontSize: 11, color: t.textFaint }}>|</span>
                <a
                  href="/events"
                  style={{ color: "#2563eb", fontWeight: 700, fontSize: 12, textDecoration: "none", lineHeight: 1.2 }}
                >
                  Event
                </a>
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
                      <a href={item.link} target={item.link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={{ marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                        {item.link.startsWith("http") ? "Open" : "Sign up"} <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                      </a>
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
                          <a href={ev.signup_url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                            Sign up <ArrowRight size={12} strokeWidth={2.5} aria-hidden />
                          </a>
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
        center={renderProfileCenter()}
        right={
          <aside
            style={{
              display: isMobile ? "none" : "block",
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
      />}
    </div>
      ) : (
        <>
          {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
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
            {[1,2,3,4].map((i) => <div key={i} style={{ ...skeletonBase, width: 100, height: 100, borderRadius: 10, flexShrink: 0 }} />)}
          </div>
          {[1,2,3].map((i) => (
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
          )}
          {!loading && profile && renderProfileCenter()}
        </>
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
              ├ù
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
            <button type="button" onClick={() => setConnListOpen(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: t.textMuted, lineHeight: 1 }}>├ù</button>
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
    {currentUserId && !isDesktopShell && (
      <SidebarThreadDrawer
        open={sidebarDrawer.open}
        onClose={() => setSidebarDrawer({ open: false, peerId: null })}
        currentUserId={currentUserId}
        peerUserId={sidebarDrawer.peerId}
        modalOnDesktop
      />
    )}
    </>
  );
}
