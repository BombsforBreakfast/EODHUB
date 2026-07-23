"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cancelDelayedLikeNotify, scheduleDelayedLikeNotify } from "../../../lib/likeNotifyDelay";
import { postNotifyJson } from "../../../lib/postNotifyClient";
import { supabase } from "../../../lib/lib/supabaseClient";
import { useTheme } from "../../../lib/ThemeContext";
import GifPickerButton from "../../../components/GifPickerButton";
import EmojiPickerButton from "../../../components/EmojiPickerButton";
import { useMasterShell } from "../../../components/master/masterShellContext";
import AddToRabbitholeModal from "../../../rabbithole/components/AddToRabbitholeModal";
import { MurphyRabbitholeBanner } from "../../../components/MurphyRabbitholeBanner";
import FeedPostHeader from "../../../components/FeedPostHeader";
import OptimizedAvatarImg from "../../../components/OptimizedAvatarImg";
import ExpandableText from "../../../components/ExpandableText";
import YouTubeEmbed, { firstYouTubeUrlFromText, getYouTubeVideoId, sameYouTubeVideo } from "../../../components/YouTubeEmbed";
import { prepareFeedUploadFile, prepareImageUploadFile } from "../../../lib/prepareUploadFile";
import { cancelMuxVideosFromUrls, uploadMuxFeedVideo } from "../../../lib/muxFeedUpload";
import { handlePasteImageFromClipboard } from "../../../lib/pasteImageFromClipboard";
import {
  FEED_VIDEO_PDF_ACCEPT,
  feedPickedFilePreviewUrl,
  openFeedMediaPicker,
} from "../../../lib/native/pickFeedMedia";
import { FEED_ACTION_ROW_GAP, FEED_ACTION_ROW_PADDING, FEED_MEDIA_FRAME_BG, FEED_MEDIA_RADIUS, FEED_POST_AVATAR_SIZE, FEED_POST_IMAGES_MAX_WIDTH, FEED_SECTION_GAP, feedContainedImageStyle, feedPostCardStyle } from "../../../lib/feedLayout";
import FeedPostImageGrid from "../../../components/FeedPostImageGrid";
import { FeedMediaAttachment, SelectedVideoComposerPreview } from "../../../components/FeedMediaAttachment";
import FeedImageGalleryModal from "../../../components/FeedImageGalleryModal";
import { useFeedImageGallery } from "../../../hooks/useFeedImageGallery";
import {
  attachmentRenderKindFromFile,
  CAD_PREVIEW_IMAGE_ACCEPT,
  FEED_ATTACHMENT_ACCEPT,
  FILE_LIBRARY_ACCEPT,
  UPLOAD_LIMITS,
  formatUploadBytes,
  fileLibraryRequiresPreview,
  feedUploadLimitsForAccount,
  isVideoFile,
  validateFeedAttachmentPick,
  validateFileLibrarySourcePick,
  validateImagePick,
} from "../../../lib/uploadLimits";
import {
  attachmentsFromUrls,
  buildCadStorageFileName,
  createCadAttachmentToken,
  isPreviewImageForCad,
} from "../../../lib/postAttachments";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../../../lib/flagCategories";
import { ensureSavedEventForUser } from "../../../lib/ensureSavedEventForUser";
import type { Theme } from "../../../lib/theme";
import { ReactionLeaderboard, ReactionPickerTrigger } from "../../../components/ReactionBar";
import {
  aggregatesBySubjectId,
  applyContentReaction,
  buildReactorDisplayNamesByTypeForSubject,
  emptyAggregate,
  fetchContentReactionsForSubjects,
  type ReactionType,
} from "../../../lib/reactions";
import { ExternalSiteLink } from "../../../components/ExternalSiteEmbedModal";
import {
  canViewUnitWallClient,
  isEffectiveApprovedMember,
  isEffectiveUnitGod,
} from "../../../lib/unitAccess";
import { unitHasFileLibraryTab } from "../../../lib/unitFileLibraryGroups";

const RABBITHOLE_THRESHOLD_BYPASS = true;

type UnitTab = "wall" | "events" | "members" | "photos" | "files";

const UNIT_TAB_LABELS: Record<UnitTab, string> = {
  wall: "Wall",
  events: "Events",
  members: "Members",
  photos: "Photos",
  files: "File Library",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Unit = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_url: string | null;
  type: string;
  created_by: string;
  member_count: number;
  visibility?: "public" | "private";
};

type Membership = {
  role: "owner" | "admin" | "member";
  status: "pending" | "approved";
};

type UnitPost = {
  id: string;
  user_id: string;
  content: string | null;
  photo_url: string | null;
  image_urls?: string[];
  gif_url: string | null;
  post_type: "post" | "join_request" | "photo_album" | "file_library";
  meta: {
    requester_id?: string;
    requester_name?: string;
    avatar_url?: string | null;
    rabbithole_contribution_id?: string;
    og?: {
      url?: string | null;
      title?: string | null;
      description?: string | null;
      site_name?: string | null;
    };
  } | null;
  created_at: string;
  author_name: string;
  author_photo: string | null;
  like_count: number;
  comment_count: number;
  comment_preview?: {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    author_name: string;
    author_photo: string | null;
    image_url?: string | null;
    gif_url?: string | null;
  }[];
  user_liked: boolean;
  myReaction: ReactionType | null;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
  approval_count?: number;
  user_voted?: boolean;
  rabbithole_thread_id?: string | null;
  rabbithole_contribution_id?: string | null;
  hidden_for_review?: boolean | null;
};

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
  author_photo: string | null;
  image_url?: string | null;
  gif_url?: string | null;
  likeCount: number;
  myReaction: ReactionType | null;
  reactionCountsByType: Partial<Record<ReactionType, number>>;
  reactorNamesByType: Partial<Record<ReactionType, string[]>>;
};

type Member = {
  user_id: string;
  role: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
  job_title: string | null;
};

type InviteUser = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
};

type UnitEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  created_at: string;
  unit_id: string | null;
  visibility: "public" | "group" | string | null;
};

const BRANCHES = ["Army", "Navy", "Marines", "Air Force", "Civil Service", "Federal"];
const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

function isHiddenInviteAccount(user: Pick<InviteUser, "user_id" | "display_name" | "first_name" | "last_name">) {
  const name = `${user.display_name ?? ""} ${user.first_name ?? ""} ${user.last_name ?? ""}`
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const compactName = name.replace(/[^a-z0-9]/g, "");
  return (
    user.user_id === RUMINT_USER_ID ||
    compactName === "rumint" ||
    compactName === "eodhub" ||
    compactName === "eodhubadmin"
  );
}

const UNIT_URL_PATTERN_G =
  /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/g;

function renderUnitText(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(UNIT_URL_PATTERN_G)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const raw = match[0].replace(/[.,)>]+$/, "");
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    parts.push(
      <a
        key={`url-${match.index}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ color: "#1d4ed8", textDecoration: "underline", wordBreak: "break-all" }}
      >
        {raw}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function displayName(user: { display_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Member";
}

function formatEventDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type SelectedUnitPostImage = {
  file: File;
  previewUrl: string;
  kind: "image" | "video" | "pdf" | "cad3d" | "other";
  cadToken?: string;
  cadRole?: "file" | "preview";
};

export default function UnitPage() {
  const { t, isDark } = useTheme();
  const { isDesktopShell } = useMasterShell();
  const params = useParams();
  const slug = params.slug as string;

  const [unit, setUnit] = useState<Unit | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserAccountType, setCurrentUserAccountType] = useState<string | null>(null);
  const [currentUserAuthorName, setCurrentUserAuthorName] = useState("Member");
  const [currentUserAuthorPhoto, setCurrentUserAuthorPhoto] = useState<string | null>(null);
  const [isFounder, setIsFounder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<UnitTab>("wall");

  // Wall
  const [posts, setPosts] = useState<UnitPost[]>([]);
  const postsRef = useRef<UnitPost[]>([]);
  const [postInput, setPostInput] = useState("");
  const [postPhotoUrl, setPostPhotoUrl] = useState("");
  const [selectedPostImages, setSelectedPostImages] = useState<SelectedUnitPostImage[]>([]);
  const selectedPostImagesRef = useRef<SelectedUnitPostImage[]>([]);
  const postPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const postVideoPdfInputRef = useRef<HTMLInputElement | null>(null);
  const postCadPreviewInputRef = useRef<HTMLInputElement | null>(null);
  const [postGif, setPostGif] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const commentsRef = useRef<Record<string, Comment[]>>({});
  const [togglingPostReactionFor, setTogglingPostReactionFor] = useState<string | null>(null);
  const [togglingCommentReactionFor, setTogglingCommentReactionFor] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [isMobile, setIsMobile] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostContent, setEditingPostContent] = useState("");
  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagModal, setFlagModal] = useState<{
    contentType: "unit_post" | "unit_post_comment";
    contentId: string;
    postId?: string;
  } | null>(null);
  const [flagCategoryChoice, setFlagCategoryChoice] = useState<FlagCategory>("general");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Members
  const [members, setMembers] = useState<Member[]>([]);

  // Events
  const [unitEvents, setUnitEvents] = useState<UnitEvent[]>([]);
  const [unitEventsLoaded, setUnitEventsLoaded] = useState(false);
  const [unitEventsLoading, setUnitEventsLoading] = useState(false);
  const [unitEventFormOpen, setUnitEventFormOpen] = useState(false);
  const [unitEventSubmitting, setUnitEventSubmitting] = useState(false);
  const [unitEventForm, setUnitEventForm] = useState({
    title: "",
    date: "",
    event_time: "",
    location: "",
    organization: "",
    description: "",
    signup_url: "",
    poc_name: "",
    poc_phone: "",
  });
  const [unitEventAttendance, setUnitEventAttendance] = useState<Record<string, { interested: number; going: number }>>({});
  const [unitEventMyAttendance, setUnitEventMyAttendance] = useState<Record<string, "interested" | "going" | null>>({});
  const [unitSavedEventIds, setUnitSavedEventIds] = useState<Set<string>>(new Set());
  const [selectedUnitEvent, setSelectedUnitEvent] = useState<UnitEvent | null>(null);

  // Join
  const [joining, setJoining] = useState(false);

  // Rabbithole modal
  const [rabbitholeModalPost, setRabbitholeModalPost] = useState<{ id: string; content: string } | null>(null);

  // Photos tab submission
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoUploadFile, setPhotoUploadFile] = useState<File | null>(null);
  const [photoUploadPreview, setPhotoUploadPreview] = useState<string | null>(null);
  const [submittingPhoto, setSubmittingPhoto] = useState(false);
  const [photoSubmitMsg, setPhotoSubmitMsg] = useState<string | null>(null);
  const photoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [galleryPhotoIndex, setGalleryPhotoIndex] = useState<number | null>(null);

  // File library tab (selected maker groups)
  const [libraryDescription, setLibraryDescription] = useState("");
  const [librarySourceFile, setLibrarySourceFile] = useState<File | null>(null);
  const [libraryPreviewFile, setLibraryPreviewFile] = useState<File | null>(null);
  const [librarySourcePreviewUrl, setLibrarySourcePreviewUrl] = useState<string | null>(null);
  const [libraryPreviewUrl, setLibraryPreviewUrl] = useState<string | null>(null);
  const [submittingLibraryFile, setSubmittingLibraryFile] = useState(false);
  const [librarySubmitMsg, setLibrarySubmitMsg] = useState<string | null>(null);
  const librarySourceInputRef = useRef<HTMLInputElement | null>(null);
  const libraryPreviewInputRef = useRef<HTMLInputElement | null>(null);
  const {
    galleryImages: postGalleryImages,
    galleryIndex: postGalleryIndex,
    isGalleryOpen: isPostGalleryOpen,
    openGallery: openPostGallery,
    closeGallery: closePostGallery,
    showPrevGalleryImage: showPrevPostGalleryImage,
    showNextGalleryImage: showNextPostGalleryImage,
  } = useFeedImageGallery();

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsers, setInviteUsers] = useState<InviteUser[]>([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteBranches, setInviteBranches] = useState<Set<string>>(new Set());
  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const inviteLoadedRef = useRef(false);

  // ── Auth + initial load ──────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      const token = session?.access_token ?? null;
      setCurrentUserId(uid);
      if (uid) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("account_type, display_name, first_name, last_name, photo_url")
          .eq("user_id", uid)
          .maybeSingle();
        setCurrentUserAccountType(profileRow?.account_type ?? null);
        const name =
          profileRow?.display_name?.trim() ||
          `${profileRow?.first_name ?? ""} ${profileRow?.last_name ?? ""}`.trim() ||
          "Member";
        setCurrentUserAuthorName(name);
        setCurrentUserAuthorPhoto(profileRow?.photo_url ?? null);
      }

      let founder = false;
      if (token) {
        try {
          const res = await fetch("/api/me/is-founder", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { isFounder?: boolean };
            founder = data.isFounder === true;
          }
        } catch {
          founder = false;
        }
      }
      setIsFounder(founder);

      await loadUnit(uid, token, founder);
    }
    init();
  }, [slug]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  useEffect(() => {
    commentsRef.current = comments;
  }, [comments]);

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth <= 700);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  async function hydrateUnitPostCommentReactions(postId: string, list: Comment[]) {
    const ids = list.map((c) => c.id);
    let enriched: Comment[] = list.map((c) => ({
      ...c,
      likeCount: 0,
      myReaction: null,
      reactionCountsByType: {} as Partial<Record<ReactionType, number>>,
      reactorNamesByType: {} as Partial<Record<ReactionType, string[]>>,
    }));
    if (ids.length > 0) {
      try {
        const rows = await fetchContentReactionsForSubjects(supabase, "unit_post_comment", ids);
        const map = aggregatesBySubjectId(rows, currentUserId ?? null);
        const reactorIds = [...new Set(rows.map((r) => r.user_id))];
        const reactorNameMap = new Map<string, string>();
        if (reactorIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, display_name, first_name, last_name")
            .in("user_id", reactorIds);
          ((profs ?? []) as {
            user_id: string;
            display_name: string | null;
            first_name: string | null;
            last_name: string | null;
          }[]).forEach((p) => {
            reactorNameMap.set(
              p.user_id,
              (p.display_name?.trim() || null) ||
                `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
                "Member",
            );
          });
        }
        enriched = list.map((c) => {
          const agg = map.get(c.id) ?? emptyAggregate();
          return {
            ...c,
            likeCount: agg.totalCount,
            myReaction: agg.myReaction,
            reactionCountsByType: agg.countsByType,
            reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(rows, c.id, reactorNameMap),
          };
        });
      } catch (e) {
        console.error("Unit comment reactions load error:", e);
      }
    }
    setComments((prev) => ({ ...prev, [postId]: enriched }));
  }

  async function handleUnitCommentReaction(postId: string, commentId: string, picked: ReactionType) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    if (!isEffectiveApprovedMember(membership, isFounder)) return;

    try {
      setTogglingCommentReactionFor(commentId);
      await applyContentReaction(supabase, {
        subjectKind: "unit_post_comment",
        subjectId: commentId,
        userId: currentUserId,
        picked,
      });
      const ids = (commentsRef.current[postId] ?? []).map((c) => c.id);
      if (ids.length === 0) return;
      const rows = await fetchContentReactionsForSubjects(supabase, "unit_post_comment", ids);
      const map = aggregatesBySubjectId(rows, currentUserId);
      const reactorIds = [...new Set(rows.map((r) => r.user_id))];
      const reactorNameMap = new Map<string, string>();
      if (reactorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name")
          .in("user_id", reactorIds);
        ((profs ?? []) as {
          user_id: string;
          display_name: string | null;
          first_name: string | null;
          last_name: string | null;
        }[]).forEach((p) => {
          reactorNameMap.set(
            p.user_id,
            (p.display_name?.trim() || null) ||
              `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
              "Member",
          );
        });
      }
      setComments((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) => {
          const agg = map.get(c.id) ?? emptyAggregate();
          return {
            ...c,
            likeCount: agg.totalCount,
            myReaction: agg.myReaction,
            reactionCountsByType: agg.countsByType,
            reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(rows, c.id, reactorNameMap),
          };
        }),
      }));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingCommentReactionFor(null);
    }
  }

  async function loadUnit(uid: string | null, token: string | null, founder = isFounder) {
    setLoading(true);
    try {
      const t = token ?? (await getToken());
      const res = await fetch(`/api/units/${slug}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      const json = await res.json();
      setUnit(json.unit);

      if (uid && token) {
        const { data: mem } = await supabase
          .from("unit_members")
          .select("role, status")
          .eq("unit_id", json.unit.id)
          .eq("user_id", uid)
          .maybeSingle();
        setMembership(mem as Membership | null);

        const canBrowseWall =
          founder || mem?.status === "approved" || json.unit.visibility === "public";
        if (canBrowseWall) {
          await loadPosts(token);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadPosts(token?: string) {
    const t = token ?? (await getToken());
    const res = await fetch(`/api/units/${slug}/posts`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const json = await res.json();
      const rawPosts = (json.posts ?? []) as UnitPost[];
      const ids = rawPosts.map((p) => p.id);
      let reactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
      try {
        reactionRows =
          ids.length > 0
            ? await fetchContentReactionsForSubjects(supabase, "unit_post", ids)
            : [];
      } catch (err) {
        console.error("Unit post reactions load error:", err);
      }
      const reactionMap = aggregatesBySubjectId(reactionRows, currentUserId ?? null);
      const reactorIds = [...new Set(reactionRows.map((r) => r.user_id))];
      const reactorNameMap = new Map<string, string>();
      if (reactorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name")
          .in("user_id", reactorIds);
        ((profs ?? []) as {
          user_id: string;
          display_name: string | null;
          first_name: string | null;
          last_name: string | null;
        }[]).forEach((p) => {
          reactorNameMap.set(
            p.user_id,
            (p.display_name?.trim() || null) ||
              `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
              "Member",
          );
        });
      }
      setPosts(
        rawPosts.map((p) => {
          const agg = reactionMap.get(p.id) ?? emptyAggregate();
          return {
            ...p,
            like_count: agg.totalCount,
            user_liked: agg.myReaction === "like",
            myReaction: agg.myReaction,
            reactionCountsByType: agg.countsByType,
            reactorNamesByType: buildReactorDisplayNamesByTypeForSubject(reactionRows, p.id, reactorNameMap),
          };
        }),
      );
    }
  }

  async function handleUnitPostReaction(postId: string, picked: ReactionType) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }

    try {
      setTogglingPostReactionFor(postId);
      await applyContentReaction(supabase, {
        subjectKind: "unit_post",
        subjectId: postId,
        userId: currentUserId,
        picked,
      });
      await loadPosts();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not save reaction");
    } finally {
      setTogglingPostReactionFor(null);
    }
  }

  async function loadMembers() {
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/members`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      setMembers(json.members ?? []);
    }
  }

  async function loadUnitEvents() {
    setUnitEventsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as {
          events?: UnitEvent[];
          attendance?: Record<string, { interested: number; going: number }>;
          myAttendance?: Record<string, "interested" | "going" | null>;
          savedEventIds?: string[];
        };
        setUnitEvents(json.events ?? []);
        setUnitEventAttendance(json.attendance ?? {});
        setUnitEventMyAttendance(json.myAttendance ?? {});
        setUnitSavedEventIds(new Set(json.savedEventIds ?? []));
        setUnitEventsLoaded(true);
      }
    } finally {
      setUnitEventsLoading(false);
    }
  }

  async function createUnitEvent() {
    if (!unitEventForm.title.trim() || !unitEventForm.date || unitEventSubmitting) return;
    setUnitEventSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(unitEventForm),
      });
      const json = await res.json().catch(() => ({})) as { event?: UnitEvent; error?: string };
      if (!res.ok) {
        alert(json.error ?? "Could not create event.");
        return;
      }
      setUnitEventForm({ title: "", date: "", event_time: "", location: "", organization: "", description: "", signup_url: "", poc_name: "", poc_phone: "" });
      setUnitEventFormOpen(false);
      await loadUnitEvents();
    } finally {
      setUnitEventSubmitting(false);
    }
  }

  async function toggleUnitEventAttendance(eventId: string, status: "interested" | "going") {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    const current = unitEventMyAttendance[eventId] ?? null;
    try {
      if (current === status) {
        const { error } = await supabase
          .from("event_attendance")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", currentUserId);
        if (error) throw error;
        await supabase
          .from("saved_events")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", currentUserId);
        setUnitSavedEventIds((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("event_attendance")
          .upsert([{ event_id: eventId, user_id: currentUserId, status }], { onConflict: "event_id,user_id" });
        if (error) throw error;
        await ensureSavedEventForUser(supabase, currentUserId, eventId);
        setUnitSavedEventIds((prev) => new Set(prev).add(eventId));
      }
      await loadUnitEvents();
    } catch (err) {
      console.error("toggleUnitEventAttendance failed:", err);
      alert(err instanceof Error ? err.message : "Could not update RSVP.");
    }
  }

  useEffect(() => {
    if (activeTab === "members" && isEffectiveApprovedMember(membership, isFounder) && members.length === 0) {
      loadMembers();
    }
  }, [activeTab, membership]);

  useEffect(() => {
    if (activeTab === "events" && isEffectiveApprovedMember(membership, isFounder) && !unitEventsLoaded) {
      void loadUnitEvents();
    }
  }, [activeTab, membership?.status, unitEventsLoaded, isFounder]);

  // Deep-link from notifications: ?unitPostId=…&commentId=… (unit_post_comments id)
  useEffect(() => {
    if (loading) return;
    if (!isEffectiveApprovedMember(membership, isFounder)) return;
    const params = new URLSearchParams(window.location.search);
    const unitPostId = params.get("unitPostId");
    const commentId = params.get("commentId");
    if (!unitPostId) return;
    if (!posts.some((p) => p.id === unitPostId)) return;

    setActiveTab("wall");
    setExpandedComments((prev) => new Set(prev).add(unitPostId));

    if (!comments[unitPostId]) {
      void (async () => {
        const token = await getToken();
        const res = await fetch(`/api/units/${slug}/posts/${unitPostId}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          await hydrateUnitPostCommentReactions(unitPostId, json.comments ?? []);
        }
      })();
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempt = 0;
    const maxAttempts = 32;

    const stripDeepLinkParams = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("unitPostId");
      url.searchParams.delete("commentId");
      const qs = url.searchParams.toString();
      window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
    };

    const tryScroll = () => {
      if (cancelled) return;
      const commentEl = commentId ? document.getElementById(`unit-comment-${commentId}`) : null;
      const postEl = document.getElementById(`unit-post-${unitPostId}`);
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
      // Don't strip URL params on exhaustion — if a commentId was requested and
      // comments haven't loaded yet, this effect will re-run when `comments` state
      // updates and will find the element on the next pass.
    };

    timeoutId = window.setTimeout(tryScroll, 120);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [loading, membership?.status, posts, slug, comments, isFounder]);

  // ── Join ─────────────────────────────────────────────────────────────────

  async function requestJoin() {
    if (!currentUserId) { window.location.href = "/login"; return; }
    setJoining(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMembership({ role: "member", status: "pending" });
      }
    } finally {
      setJoining(false);
    }
  }

  async function leaveGroup() {
    if (!currentUserId || !unit) return;
    if (!window.confirm(`Leave ${unit.name}?`)) return;
    setJoining(true);
    try {
      const { error } = await supabase
        .from("unit_members")
        .delete()
        .eq("unit_id", unit.id)
        .eq("user_id", currentUserId);
      if (error) {
        alert(error.message);
        return;
      }
      setMembership(null);
      window.location.href = "/units";
    } finally {
      setJoining(false);
    }
  }

  // ── Approvals ────────────────────────────────────────────────────────────

  async function handleApproval(requesterUserId: string, action: "vote" | "approve" | "deny") {
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requester_user_id: requesterUserId, action }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.result === "approved" || json.result === "denied") {
        // Remove the join_request post from state
        setPosts((prev) => prev.filter((p) => !(p.post_type === "join_request" && p.user_id === requesterUserId)));
      } else if (json.result === "voted") {
        // Update the approval count in state
        setPosts((prev) =>
          prev.map((p) =>
            p.post_type === "join_request" && p.user_id === requesterUserId
              ? { ...p, approval_count: json.votes, user_voted: true }
              : p
          )
        );
      }
    }
  }

  // ── Wall posts ───────────────────────────────────────────────────────────

  async function uploadUnitMedia(file: File, forcedFileName?: string): Promise<string> {
    const prepared = await prepareFeedUploadFile(file, { accountType: currentUserAccountType });
    if (!prepared.ok) throw new Error(prepared.error);
    file = prepared.file;
    if (isVideoFile(file)) {
      return (await uploadMuxFeedVideo(file)).attachmentUrl;
    }
    const safeFileName = forcedFileName ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = `unit-posts/${safeFileName}`;
    const { error } = await supabase.storage.from("feed-images").upload(filePath, file, { upsert: false });
    if (error) throw new Error(error.message);
    return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
  }

  function missingCadPreviewTokens(items: SelectedUnitPostImage[]): string[] {
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

  function addUnitPostImagesFromFiles(files: File[]) {
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
        feedUploadLimitsForAccount(currentUserAccountType),
      );
      if (pickError) {
        alert(pickError);
        return prev;
      }

      const newItems: SelectedUnitPostImage[] = filesToAdd.map((file) => {
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
          previewUrl: feedPickedFilePreviewUrl(file),
          kind: kind === "pdf" ? "pdf" : kind === "video" ? "video" : kind === "image" ? "image" : "other",
        };
      });

      return [...prev, ...newItems];
    });
    setPostGif(null);
  }

  function attachUnitPostFile(file: File) {
    addUnitPostImagesFromFiles([file]);
    if (postPhotoInputRef.current) postPhotoInputRef.current.value = "";
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

      return next;
    });
  }

  function handleUnitPostImagePaste(e: ClipboardEvent) {
    handlePasteImageFromClipboard(e, addUnitPostImagesFromFiles);
  }

  function removeSelectedPostImage(indexToRemove: number) {
    setSelectedPostImages((prev) => {
      const itemToRemove = prev[indexToRemove];
      if (itemToRemove?.previewUrl) URL.revokeObjectURL(itemToRemove.previewUrl);
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
    if (postPhotoInputRef.current) postPhotoInputRef.current.value = "";
  }

  async function submitPost() {
    if (!postInput.trim() && selectedPostImages.length === 0 && !postPhotoUrl.trim() && !postGif) return;
    const missingCadTokens = missingCadPreviewTokens(selectedPostImages);
    if (missingCadTokens.length > 0) {
      alert("Each CAD/3D file needs a preview image (JPG, PNG, or WEBP) before posting.");
      return;
    }
    setSubmittingPost(true);
    const uploadedUrls: string[] = [];
    try {
      for (const item of selectedPostImages) {
        const forcedFileName =
          item.cadToken && item.cadRole
            ? buildCadStorageFileName(item.cadToken, item.cadRole, item.file.name)
            : undefined;
        uploadedUrls.push(await uploadUnitMedia(item.file, forcedFileName));
      }
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: postInput.trim() || null,
          photo_url: uploadedUrls[0] ?? (postPhotoUrl.trim() || null),
          image_urls: uploadedUrls,
          gif_url: postGif,
        }),
      });
      if (res.ok) {
        setPostInput("");
        clearSelectedPostImages();
        setPostPhotoUrl("");
        setPostGif(null);
        await loadPosts();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to create post.");
      }
    } catch (error) {
      await cancelMuxVideosFromUrls(uploadedUrls);
      alert(error instanceof Error ? error.message : "Failed to create post.");
    } finally {
      setSubmittingPost(false);
    }
  }

  async function submitGroupPhoto() {
    if (!photoUploadFile || submittingPhoto) return;
    setSubmittingPhoto(true);
    setPhotoSubmitMsg(null);
    try {
      const finalPhotoUrl = await uploadUnitMedia(photoUploadFile);
      const token = await getToken();
      const wallRes = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: photoCaption.trim() || null,
          photo_url: finalPhotoUrl,
          meta: { source: "photos_tab_wall" },
        }),
      });
      const wallJson = await wallRes.json().catch(() => ({})) as { error?: string };
      if (!wallRes.ok) {
        alert(wallJson.error ?? "Could not post photo to wall.");
        return;
      }

      const albumRes = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: photoCaption.trim() || null,
          photo_url: finalPhotoUrl,
          post_type: "photo_album",
          photo_submission_only: true,
          meta: { source: "photos_tab_album" },
        }),
      });
      const albumJson = await albumRes.json().catch(() => ({})) as { error?: string };
      if (!albumRes.ok) {
        alert(albumJson.error ?? "Photo posted to wall, but album submission failed.");
        return;
      }

      setPhotoCaption("");
      setPhotoUploadFile(null);
      if (photoUploadPreview) URL.revokeObjectURL(photoUploadPreview);
      setPhotoUploadPreview(null);
      if (photoUploadInputRef.current) photoUploadInputRef.current.value = "";
      setPhotoSubmitMsg(isGod ? "Photo posted and added to group album." : "Photo posted to wall and submitted to album for admin approval.");
      await loadPosts();
    } finally {
      setSubmittingPhoto(false);
    }
  }

  function clearLibraryForm() {
    if (librarySourcePreviewUrl) URL.revokeObjectURL(librarySourcePreviewUrl);
    if (libraryPreviewUrl) URL.revokeObjectURL(libraryPreviewUrl);
    setLibraryDescription("");
    setLibrarySourceFile(null);
    setLibraryPreviewFile(null);
    setLibrarySourcePreviewUrl(null);
    setLibraryPreviewUrl(null);
    if (librarySourceInputRef.current) librarySourceInputRef.current.value = "";
    if (libraryPreviewInputRef.current) libraryPreviewInputRef.current.value = "";
  }

  async function submitGroupFileLibraryEntry() {
    if (!librarySourceFile || submittingLibraryFile) return;
    if (fileLibraryRequiresPreview(librarySourceFile) && !libraryPreviewFile) {
      alert("Add a JPG, PNG, or WEBP preview image for this CAD / 3D file.");
      return;
    }

    setSubmittingLibraryFile(true);
    setLibrarySubmitMsg(null);
    try {
      const imageUrls: string[] = [];
      let photoUrl: string | null = null;

      if (fileLibraryRequiresPreview(librarySourceFile) && libraryPreviewFile) {
        const cadToken = createCadAttachmentToken();
        const previewUrl = await uploadUnitMedia(
          libraryPreviewFile,
          buildCadStorageFileName(cadToken, "preview", libraryPreviewFile.name),
        );
        const fileUrl = await uploadUnitMedia(
          librarySourceFile,
          buildCadStorageFileName(cadToken, "file", librarySourceFile.name),
        );
        imageUrls.push(previewUrl, fileUrl);
        photoUrl = previewUrl;
      } else {
        const fileUrl = await uploadUnitMedia(librarySourceFile);
        imageUrls.push(fileUrl);
        photoUrl = fileUrl;
      }

      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content: libraryDescription.trim() || librarySourceFile.name,
          photo_url: photoUrl,
          image_urls: imageUrls,
          post_type: "file_library",
          photo_submission_only: !isGod,
          meta: { source: "file_library_tab", file_name: librarySourceFile.name },
        }),
      });
      const json = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        alert(json.error ?? "Could not add file to the library.");
        return;
      }

      clearLibraryForm();
      setLibrarySubmitMsg(
        isGod
          ? "File added to the library."
          : "File submitted for admin approval.",
      );
      await loadPosts();
    } finally {
      setSubmittingLibraryFile(false);
    }
  }

  function startEditPost(postId: string, currentContent: string | null) {
    setEditingPostId(postId);
    setEditingPostContent(currentContent ?? "");
  }

  function cancelEditPost() {
    setEditingPostId(null);
    setEditingPostContent("");
  }

  async function savePostEdit(postId: string) {
    if (!currentUserId || !editingPostContent.trim()) return;
    setSavingPostId(postId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editingPostContent.trim() }),
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Could not update post.");
        return;
      }
      setEditingPostId(null);
      setEditingPostContent("");
      await loadPosts();
    } finally {
      setSavingPostId(null);
    }
  }

  async function deletePost(postId: string) {
    if (!currentUserId) return;
    if (!window.confirm("Delete this group post?")) return;
    setDeletingPostId(postId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Could not delete post.");
        return;
      }
      await loadPosts();
    } finally {
      setDeletingPostId(null);
    }
  }

  function openFlagModal(
    contentType: "unit_post" | "unit_post_comment",
    contentId: string,
    postId?: string,
  ) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    setFlagCategoryChoice("general");
    setFlagModal({ contentType, contentId, postId });
  }

  async function submitFlagFromModal() {
    if (!flagModal || !currentUserId) return;
    setFlaggingId(flagModal.contentId);
    try {
      const token = await getToken();
      const res = await fetch("/api/flag-content", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          contentType: flagModal.contentType,
          contentId: flagModal.contentId,
          category: flagCategoryChoice,
        }),
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Could not submit flag.");
        return;
      }
      alert("Flagged for review. Thank you.");
      const flaggedPostId = flagModal.postId;
      const flaggedContentType = flagModal.contentType;
      const flaggedContentId = flagModal.contentId;
      setFlagModal(null);
      if (flaggedContentType === "unit_post_comment" && flaggedPostId) {
        setComments((prev) => ({
          ...prev,
          [flaggedPostId]: (prev[flaggedPostId] ?? []).filter((c) => c.id !== flaggedContentId),
        }));
        setPosts((prev) =>
          prev.map((p) =>
            p.id === flaggedPostId
              ? { ...p, comment_count: Math.max(0, p.comment_count - 1) }
              : p,
          ),
        );
      } else {
        await loadPosts();
      }
    } finally {
      setFlaggingId(null);
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

  async function saveCommentEdit(postId: string, commentId: string) {
    if (!editingCommentContent.trim()) return;
    setSavingCommentId(commentId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editingCommentContent.trim() }),
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Failed to update comment.");
        return;
      }
      setComments((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).map((c) =>
          c.id === commentId ? { ...c, content: editingCommentContent.trim() } : c,
        ),
      }));
      setEditingCommentId(null);
      setEditingCommentContent("");
    } finally {
      setSavingCommentId(null);
    }
  }

  async function deleteComment(postId: string, commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    setDeletingCommentId(commentId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        alert(json.error ?? "Failed to delete comment.");
        return;
      }
      setComments((prev) => ({
        ...prev,
        [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p,
        ),
      );
      if (editingCommentId === commentId) cancelEditComment();
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function toggleLike(postId: string) {
    if (!currentUserId) {
      window.location.href = "/login";
      return;
    }
    cancelDelayedLikeNotify(`unit:post:${postId}:${currentUserId}`);
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json() as {
        liked: boolean;
        like_count: number;
        pending_like_notify: Record<string, unknown> | null;
      };
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, user_liked: json.liked, like_count: json.like_count } : p
        )
      );
      if (json.liked && json.pending_like_notify) {
        const payload = json.pending_like_notify as Record<string, unknown>;
        scheduleDelayedLikeNotify(`unit:post:${postId}:${currentUserId}`, async () => {
          const p = postsRef.current.find((x) => x.id === postId);
          if (!p?.user_liked) return;
          await postNotifyJson(supabase, payload);
        });
      }
    }
  }

  async function toggleComments(postId: string) {
    if (expandedComments.has(postId)) {
      setExpandedComments((prev) => { const s = new Set(prev); s.delete(postId); return s; });
      return;
    }
    setExpandedComments((prev) => new Set(prev).add(postId));
    if (!comments[postId]) {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        await hydrateUnitPostCommentReactions(postId, json.comments ?? []);
      }
    }
  }

  async function submitComment(postId: string, imageFile?: File | null, gifUrl?: string | null) {
    const content = commentInputs[postId]?.trim() ?? "";
    if (!content && !imageFile && !gifUrl) return;

    let uploadedImageUrl: string | null = null;
    if (imageFile && currentUserId) {
      const prepared = await prepareImageUploadFile(imageFile);
      if (prepared.ok) {
        const file = prepared.file;
        const path = `unit-comments/${currentUserId}/${postId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const { error: upErr } = await supabase.storage.from("feed-images").upload(path, file, { upsert: false });
        if (!upErr) {
          const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
          uploadedImageUrl = data.publicUrl;
        }
      }
    }

    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, image_url: uploadedImageUrl, gif_url: gifUrl ?? null }),
    });
    if (res.ok) {
      const json = await res.json();
      const jc = json.comment as {
        id: string;
        user_id?: string;
        content?: string;
        created_at: string;
        author_name?: string;
        author_photo?: string | null;
        image_url?: string | null;
        gif_url?: string | null;
      };
      const padded: Comment = {
        id: jc.id,
        user_id: jc.user_id ?? currentUserId ?? "",
        content: jc.content ?? "",
        created_at: jc.created_at,
        author_name: jc.author_name ?? currentUserAuthorName,
        author_photo: jc.author_photo ?? currentUserAuthorPhoto,
        image_url: jc.image_url,
        gif_url: jc.gif_url,
        likeCount: 0,
        myReaction: null,
        reactionCountsByType: {},
        reactorNamesByType: {},
      };
      setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), padded] }));
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p));
    }
  }

  // ── Invite ───────────────────────────────────────────────────────────────

  async function openInviteModal() {
    setShowInvite(true);
    setInviteMsg(null);
    if (!inviteLoadedRef.current) {
      inviteLoadedRef.current = true;
      // Load all users except existing members
      const [{ data: allProfiles }, { data: existingMembers }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, first_name, last_name, photo_url, service").order("first_name"),
        supabase.from("unit_members").select("user_id").eq("unit_id", unit!.id),
      ]);
      const memberIds = new Set((existingMembers ?? []).map((m: { user_id: string }) => m.user_id));
      setInviteUsers((allProfiles ?? []).filter((p: InviteUser) => !memberIds.has(p.user_id)) as InviteUser[]);
    }
  }

  async function sendInvites() {
    if (selectedInvites.size === 0) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/units/${slug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_ids: Array.from(selectedInvites) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send invites");
      setInviteMsg(`${json.invited} member${json.invited === 1 ? "" : "s"} added successfully.`);
      setSelectedInvites(new Set());
      inviteLoadedRef.current = false;
    } catch (err) {
      setInviteMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setInviting(false);
    }
  }

  const filteredInviteUsers = inviteUsers.filter((u) => {
    if (isHiddenInviteAccount(u)) return false;
    const name = displayName(u).toLowerCase();
    const matchesQuery = !inviteQuery.trim() || name.includes(inviteQuery.toLowerCase());
    const matchesBranch = inviteBranches.size === 0 || (u.service && inviteBranches.has(u.service));
    return matchesQuery && matchesBranch;
  });

  // ── Styles ───────────────────────────────────────────────────────────────

  const isApprovedMember = isEffectiveApprovedMember(membership, isFounder);
  const isPendingMember = !isFounder && membership?.status === "pending";
  const isPublicGroup = unit?.visibility === "public";
  const canViewWall = canViewUnitWallClient(unit?.visibility, membership, isFounder);

  const isGod = isEffectiveUnitGod(membership, isFounder);
  const showFileLibraryTab = unitHasFileLibraryTab(unit?.slug, unit?.name);
  const approvedMemberTabs: UnitTab[] = showFileLibraryTab
    ? ["wall", "events", "members", "photos", "files"]
    : ["wall", "events", "members", "photos"];
  const wallPosts = posts.filter((p) => {
    if (p.post_type === "photo_album" || p.post_type === "file_library") return false;
    if (!isApprovedMember && p.post_type === "join_request") return false;
    return true;
  });
  const photos = posts.filter((p) => p.photo_url && p.post_type === "photo_album");
  const fileLibraryEntries = posts.filter((p) => p.post_type === "file_library");
  const activeGalleryPhoto = galleryPhotoIndex !== null ? photos[galleryPhotoIndex] : null;

  async function openPhotoGallery(index: number) {
    setGalleryPhotoIndex(index);
    const postId = photos[index]?.id;
    if (!postId || comments[postId]) return;
    const token = await getToken();
    const res = await fetch(`/api/units/${slug}/posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      await hydrateUnitPostCommentReactions(postId, json.comments ?? []);
    }
  }

  function shiftGallery(delta: number) {
    if (galleryPhotoIndex === null || photos.length === 0) return;
    setGalleryPhotoIndex((galleryPhotoIndex + delta + photos.length) % photos.length);
  }

  useEffect(() => {
    if (galleryPhotoIndex === null) return;
    function handleGalleryKeys(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        shiftGallery(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        shiftGallery(1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setGalleryPhotoIndex(null);
      }
    }
    window.addEventListener("keydown", handleGalleryKeys);
    return () => window.removeEventListener("keydown", handleGalleryKeys);
  }, [galleryPhotoIndex, photos.length]);

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${t.inputBorder}`,
    background: t.input,
    color: t.text,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  };

  const padX = { paddingLeft: "max(20px, env(safe-area-inset-left))", paddingRight: "max(20px, env(safe-area-inset-right))" } as const;
  const bodyShell: CSSProperties = {
    maxWidth: 860,
    margin: "0 auto",
    boxSizing: "border-box",
    paddingTop: isDesktopShell ? 0 : 16,
    paddingBottom: 48,
    ...padX,
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={bodyShell}>
          <div style={{ color: t.textMuted, textAlign: "center", padding: 60 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (notFound || !unit) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={bodyShell}>
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>Unit not found</div>
            <Link href="/units" style={{ color: "#3b82f6", fontWeight: 700, fontSize: 14 }}>← Back to Groups</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <div style={bodyShell}>
        {/* Back */}
        <Link href="/units" style={{ color: t.textMuted, fontSize: 13, fontWeight: 700, textDecoration: "none", display: "inline-block", marginBottom: 16 }}>
          ← Groups
        </Link>

        {/* Cover + Header — vertical split: portrait cover | details */}
        <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${t.border}`, background: t.surface, marginBottom: 20 }}>
          <div className="unit-header-split">
            <div
              className="unit-header-cover-col"
              style={{ background: unit.cover_photo_url ? undefined : (isDark ? "#1a1a2e" : "#1e3a5f") }}
            >
              {unit.cover_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote unit cover URL
                <img src={unit.cover_photo_url} alt="" />
              ) : null}
            </div>
            <div className="unit-header-body" style={{ padding: "16px 20px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{unit.name}</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: isDark ? "#1a1a2e" : "#dbeafe", color: isDark ? "#93c5fd" : "#1d4ed8", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {unit.type.replace(/_/g, " ")}
                  </span>
                  <span style={{ background: isPublicGroup ? (isDark ? "#052e16" : "#dcfce7") : (isDark ? "#2a2a2a" : "#f3f4f6"), color: isPublicGroup ? (isDark ? "#86efac" : "#166534") : t.textMuted, fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {isPublicGroup ? "Public" : "Private"}
                  </span>
                  <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                    {unit.member_count} {unit.member_count === 1 ? "member" : "members"}
                  </span>
                </div>
                {unit.description && (
                  <div style={{ marginTop: 10, fontSize: 14, color: t.textMuted, lineHeight: 1.6, maxWidth: 540 }}>{unit.description}</div>
                )}
              </div>

              {/* Join / Status / Invite buttons */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                {!currentUserId && (
                  <a href="/login" style={{ background: "#111", color: "#fff", textDecoration: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13 }}>
                    Log in to join
                  </a>
                )}
                {currentUserId && !membership && !isFounder && (
                  <button onClick={requestJoin} disabled={joining} style={{ background: joining ? t.badgeBg : "#111", color: joining ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    {joining && <span className="btn-spinner btn-spinner-dark" />}
                    Request to Join
                  </button>
                )}
                {membership?.status === "pending" && !isFounder && (
                  <div style={{ background: isDark ? "#2a2a00" : "#fef9c3", color: "#854d0e", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700 }}>
                    Request pending
                  </div>
                )}
                {isGod && (
                  <>
                    <Link
                      href={`/units/${slug}/admin`}
                      style={{ background: "transparent", color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                    >
                      ⚙ Admin
                    </Link>
                    <button onClick={openInviteModal} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                      Invite Members
                    </button>
                    {membership?.status === "approved" && (
                      <button
                        onClick={leaveGroup}
                        disabled={joining}
                        style={{ background: "transparent", color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", opacity: joining ? 0.7 : 1 }}
                      >
                        {joining ? "Leaving..." : "Leave Group"}
                      </button>
                    )}
                  </>
                )}
                {isApprovedMember && !isGod && (
                  <>
                    <button onClick={openInviteModal} style={{ background: t.badgeBg, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      Invite
                    </button>
                    <button
                      onClick={leaveGroup}
                      disabled={joining}
                      style={{ background: "transparent", color: t.textMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: joining ? "not-allowed" : "pointer", opacity: joining ? 0.7 : 1 }}
                    >
                      {joining ? "Leaving..." : "Leave Group"}
                    </button>
                  </>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>

        {/* Non-member gate (private groups only) */}
        {isPendingMember && (
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 28, background: t.surface, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Your request is pending</div>
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6 }}>
              Once 3 members vouch for you, you&apos;ll be automatically approved. An admin can also approve you directly.
            </div>
          </div>
        )}

        {!isApprovedMember && !isPublicGroup && !isPendingMember && (
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 28, background: t.surface, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Members Only</div>
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6 }}>
              This is a private group. Request to join or accept an invite to see the wall, members, and photos.
            </div>
          </div>
        )}

        {canViewWall && (
          <>
            {isFounder && !membership && !isPublicGroup && (
              <div style={{ border: `1px solid ${isDark ? "#1e3a5f" : "#bfdbfe"}`, borderRadius: 12, padding: "12px 16px", background: isDark ? "rgba(30,58,95,0.2)" : "#eff6ff", marginBottom: 16, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                Staff access — you can browse and moderate this private group without joining.
              </div>
            )}
            {isPublicGroup && !isApprovedMember && (
              <div style={{ border: `1px solid ${isDark ? "#14532d" : "#bbf7d0"}`, borderRadius: 12, padding: "12px 16px", background: isDark ? "rgba(22,101,52,0.15)" : "#f0fdf4", marginBottom: 16, fontSize: 13, color: t.textMuted, lineHeight: 1.55 }}>
                You&apos;re browsing a public group. Request to join to post, comment, and see members and events.
              </div>
            )}

            {/* Tab bar */}
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 20,
                borderBottom: `1px solid ${t.border}`,
                paddingBottom: 0,
                overflowX: "auto",
                overflowY: "hidden",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "thin",
              }}
            >
              {(isApprovedMember ? approvedMemberTabs : (["wall"] as const)).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: activeTab === tab ? "3px solid #111" : "3px solid transparent",
                    color: activeTab === tab ? t.text : t.textMuted,
                    fontWeight: activeTab === tab ? 800 : 600,
                    fontSize: 14,
                    padding: "10px 16px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {UNIT_TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* WALL TAB */}
            {activeTab === "wall" && (
              <div style={{ display: "grid", gap: 16 }}>
                {isApprovedMember && (
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                  <textarea
                    value={postInput}
                    onChange={(e) => setPostInput(e.target.value)}
                    onPaste={handleUnitPostImagePaste}
                    placeholder="Post to the unit wall..."
                    rows={3}
                    style={{ width: "100%", border: "none", outline: "none", resize: "vertical", fontSize: 15, boxSizing: "border-box", background: t.surface, color: t.text, fontFamily: "inherit" }}
                  />

                  {postGif && (
                    <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                      <img src={postGif} alt="GIF" style={{ maxWidth: 200, borderRadius: 10, display: "block" }} />
                      <button type="button" onClick={() => setPostGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                  )}

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
                            <SelectedVideoComposerPreview file={item.file} previewUrl={item.previewUrl} />
                          ) : item.kind === "pdf" ? (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, padding: 8, textAlign: "center" }}>
                              PDF
                            </div>
                          ) : item.kind === "cad3d" && item.cadRole === "file" ? (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, padding: 8, textAlign: "center", flexDirection: "column", gap: 6 }}>
                              <div>CAD / 3D</div>
                              <div style={{ fontSize: 10, opacity: 0.85, wordBreak: "break-all" }}>{item.file.name}</div>
                              {item.cadToken && missingCadPreviewTokens(selectedPostImages).includes(item.cadToken) && (
                                <div style={{ color: "#f59e0b" }}>Preview required</div>
                              )}
                            </div>
                          ) : (
                            <img src={item.previewUrl} alt="" style={feedContainedImageStyle} />
                          )}
                          <button
                            type="button"
                            onClick={() => removeSelectedPostImage(index)}
                            style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.75)", color: "#fff", border: "none", borderRadius: "50%", width: 26, height: 26, fontWeight: 800, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    ref={postPhotoInputRef}
                    type="file"
                    accept={FEED_ATTACHMENT_ACCEPT}
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length === 0) return;
                      addUnitPostImagesFromFiles(files);
                      if (postPhotoInputRef.current) postPhotoInputRef.current.value = "";
                    }}
                  />
                  <input
                    ref={postVideoPdfInputRef}
                    type="file"
                    accept={FEED_VIDEO_PDF_ACCEPT}
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length === 0) return;
                      addUnitPostImagesFromFiles(files);
                      if (postVideoPdfInputRef.current) postVideoPdfInputRef.current.value = "";
                    }}
                  />
                  <input
                    ref={postCadPreviewInputRef}
                    type="file"
                    accept={CAD_PREVIEW_IMAGE_ACCEPT}
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length === 0) return;
                      addCadPreviewImagesFromFiles(files);
                      if (postCadPreviewInputRef.current) postCadPreviewInputRef.current.value = "";
                    }}
                  />

                  <p style={{ fontSize: 11, color: t.textMuted, margin: "8px 0 0", lineHeight: 1.45 }}>
                    Photos up to {formatUploadBytes(UPLOAD_LIMITS.image)} (large photos are compressed automatically).
                    Short videos up to {formatUploadBytes(UPLOAD_LIMITS.video)} (~3–4 min).
                    PDFs and CAD/3D files up to {formatUploadBytes(UPLOAD_LIMITS.document)} are supported.
                    CAD/3D files require a JPG/PNG/WEBP preview image.
                  </p>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        void openFeedMediaPicker({
                          mediaInputRef: postPhotoInputRef,
                          videoPdfInputRef: postVideoPdfInputRef,
                          onFiles: addUnitPostImagesFromFiles,
                          remainingSlots: 10 - selectedPostImages.length,
                        });
                      }}
                      style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                    >
                      {selectedPostImages.length > 0 ? "Add More" : "Add Photo / Video / File"}
                    </button>
                    {missingCadPreviewTokens(selectedPostImages).length > 0 && (
                      <button
                        type="button"
                        onClick={() => postCadPreviewInputRef.current?.click()}
                        style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                      >
                        Add Preview Image ({missingCadPreviewTokens(selectedPostImages).length})
                      </button>
                    )}

                    <EmojiPickerButton
                      value={postInput}
                      onChange={setPostInput}
                      inputRef={{ current: null }}
                      theme={isDark ? "dark" : "light"}
                    />

                    <GifPickerButton
                      onSelect={(url) => { setPostGif(url); clearSelectedPostImages(); }}
                      theme={isDark ? "dark" : "light"}
                    />

                    <button
                      onClick={submitPost}
                      disabled={submittingPost || (!postInput.trim() && selectedPostImages.length === 0 && !postGif)}
                      style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 13, cursor: submittingPost || (!postInput.trim() && selectedPostImages.length === 0 && !postGif) ? "not-allowed" : "pointer", opacity: submittingPost || (!postInput.trim() && selectedPostImages.length === 0 && !postGif) ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {submittingPost && <span className="btn-spinner" />}
                      Post
                    </button>
                  </div>
                </div>
                )}

                {/* Posts */}
                {posts.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40, fontSize: 14 }}>No posts yet. Be the first to post.</div>
                )}

                <div style={{ display: "grid", gap: 0 }}>
                {wallPosts.map((post) => {
                  if (post.post_type === "join_request") {
                    return (
                      <JoinRequestCard
                        key={post.id}
                        post={post}
                        isGod={isGod}
                        currentUserId={currentUserId!}
                        onVote={() => handleApproval(post.user_id, "vote")}
                        onApprove={() => handleApproval(post.user_id, "approve")}
                        onDeny={() => handleApproval(post.user_id, "deny")}
                        t={t}
                        isDark={isDark}
                      />
                    );
                  }
                  const canManagePost = currentUserId === post.user_id;
                  const isEditingPost = editingPostId === post.id;
                  return (
                    <PostCard
                      key={post.id}
                      post={post}
                      t={t}
                      isDark={isDark}
                      comments={comments[post.id]}
                      commentInput={commentInputs[post.id] ?? ""}
                      onCommentInputChange={(v) => setCommentInputs((prev) => ({ ...prev, [post.id]: v }))}
                      expanded={expandedComments.has(post.id)}
                      togglingPostReactionFor={togglingPostReactionFor}
                      onPostReaction={(picked) => void handleUnitPostReaction(post.id, picked)}
                      currentUserId={currentUserId}
                      togglingCommentReactionFor={togglingCommentReactionFor}
                      onCommentReaction={(commentId, picked) =>
                        void handleUnitCommentReaction(post.id, commentId, picked)
                      }
                      onToggleComments={() => toggleComments(post.id)}
                      onSubmitComment={(imageFile, gifUrl) => submitComment(post.id, imageFile, gifUrl)}
                      canManagePost={canManagePost}
                      isEditingPost={isEditingPost}
                      editingPostContent={editingPostContent}
                      savingPost={savingPostId === post.id}
                      deletingPost={deletingPostId === post.id}
                      flaggingPost={flaggingId === post.id}
                      isMobile={isMobile}
                      onEdit={() => startEditPost(post.id, post.content)}
                      onCancelEdit={cancelEditPost}
                      onEditContentChange={setEditingPostContent}
                      onSaveEdit={() => savePostEdit(post.id)}
                      onDelete={() => deletePost(post.id)}
                      onFlag={() => openFlagModal("unit_post", post.id)}
                      editingCommentId={editingCommentId}
                      editingCommentContent={editingCommentContent}
                      savingCommentId={savingCommentId}
                      deletingCommentId={deletingCommentId}
                      flaggingCommentId={flaggingId}
                      onEditComment={(commentId, content) => startEditComment(commentId, content)}
                      onCancelEditComment={cancelEditComment}
                      onEditCommentContentChange={setEditingCommentContent}
                      onSaveEditComment={(commentId) => void saveCommentEdit(post.id, commentId)}
                      onDeleteComment={(commentId) => void deleteComment(post.id, commentId)}
                      onFlagComment={(commentId) => openFlagModal("unit_post_comment", commentId, post.id)}
                      onAddToRabbithole={
                        currentUserId &&
                        (RABBITHOLE_THRESHOLD_BYPASS || post.like_count >= 3 || post.comment_count >= 2) &&
                        !post.rabbithole_thread_id
                          ? () => setRabbitholeModalPost({ id: post.id, content: post.content ?? "" })
                          : undefined
                      }
                      rabbitholeThreadId={post.rabbithole_thread_id ?? null}
                      onOpenGallery={(startIndex) => {
                        const urls = post.image_urls?.length
                          ? post.image_urls
                          : post.photo_url
                            ? [post.photo_url]
                            : [];
                        const galleryUrls = attachmentsFromUrls(urls)
                          .filter((item) => item.kind === "image" || item.kind === "video")
                          .map((item) => item.renderUrl);
                        openPostGallery(galleryUrls, startIndex);
                      }}
                      canInteract={isApprovedMember}
                    />
                  );
                })}
                </div>
              </div>
            )}

            {/* EVENTS TAB */}
            {activeTab === "events" && (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Group Events</div>
                      <div style={{ marginTop: 3, fontSize: 13, color: t.textMuted }}>Private calendar for {unit.name} members.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnitEventFormOpen((prev) => !prev)}
                      style={{ border: "none", borderRadius: 10, background: "#111", color: "#fff", padding: "9px 16px", fontWeight: 800, cursor: "pointer" }}
                    >
                      {unitEventFormOpen ? "Close" : "Create Event"}
                    </button>
                  </div>

                  {unitEventFormOpen && (
                    <div style={{ marginTop: 16, border: `1px solid ${t.border}`, borderRadius: 16, background: t.surface, padding: 16, display: "grid", gap: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Add Event</div>
                        <button
                          type="button"
                          onClick={() => setUnitEventFormOpen(false)}
                          style={{ border: "none", background: "transparent", color: t.textMuted, fontWeight: 800, fontSize: 18, cursor: "pointer", lineHeight: 1 }}
                          aria-label="Close add event form"
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Title *</label>
                        <input
                          value={unitEventForm.title}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, title: e.target.value }))}
                          placeholder="Event title"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Date *</label>
                        <input
                          type="date"
                          value={unitEventForm.date}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, date: e.target.value }))}
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Time</label>
                        <input
                          value={unitEventForm.event_time}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, event_time: e.target.value }))}
                          placeholder="e.g. '6:00 PM EST' or '0900 - 1100'"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Location / Address</label>
                        <input
                          value={unitEventForm.location}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, location: e.target.value }))}
                          placeholder="Venue or street address (or 'Online — Zoom')"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Organization</label>
                        <input
                          value={unitEventForm.organization}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, organization: e.target.value }))}
                          placeholder="Hosting organization"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Description</label>
                        <textarea
                          value={unitEventForm.description}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder="Event details..."
                          rows={4}
                          style={{ ...inputStyle, minHeight: 92, resize: "vertical", marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Point of Contact (POC) name</label>
                        <input
                          value={unitEventForm.poc_name}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, poc_name: e.target.value }))}
                          placeholder="Name of organizer / point of contact"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>POC phone number</label>
                        <input
                          value={unitEventForm.poc_phone}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, poc_phone: e.target.value }))}
                          placeholder="(555) 555-1234"
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "grid", gap: 6 }}>
                        <label style={{ fontSize: 13, fontWeight: 800, color: t.text }}>Sign-up / External URL</label>
                        <input
                          value={unitEventForm.signup_url}
                          onChange={(e) => setUnitEventForm((prev) => ({ ...prev, signup_url: e.target.value }))}
                          placeholder="https://..."
                          style={{ ...inputStyle, marginBottom: 0 }}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => setUnitEventFormOpen(false)}
                          style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: "10px 18px", fontWeight: 800, background: t.surface, color: t.text, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={createUnitEvent}
                          disabled={unitEventSubmitting || !unitEventForm.title.trim() || !unitEventForm.date}
                          style={{ border: "none", borderRadius: 12, padding: "10px 20px", fontWeight: 900, background: "#111", color: "#fff", cursor: unitEventSubmitting || !unitEventForm.title.trim() || !unitEventForm.date ? "not-allowed" : "pointer", opacity: unitEventSubmitting || !unitEventForm.title.trim() || !unitEventForm.date ? 0.65 : 1 }}
                        >
                          {unitEventSubmitting ? "Publishing..." : "Publish Event"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, background: t.surface, overflow: "hidden" }}>
                  <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 900, color: t.text }}>Upcoming Group Events</div>
                    <div style={{ color: t.textMuted, fontSize: 12, fontWeight: 700 }}>{unitEvents.length} event{unitEvents.length === 1 ? "" : "s"}</div>
                  </div>
                  {unitEventsLoading ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted }}>Loading events...</div>
                  ) : unitEvents.length === 0 ? (
                    <div style={{ padding: 32, textAlign: "center", color: t.textMuted }}>No group events yet.</div>
                  ) : (
                    <div style={{ display: "grid" }}>
                      {unitEvents.map((event, idx) => {
                        const counts = unitEventAttendance[event.id] ?? { interested: 0, going: 0 };
                        const myStatus = unitEventMyAttendance[event.id] ?? null;
                        return (
                          <div key={event.id} style={{ display: "flex", gap: 14, padding: 16, borderBottom: idx < unitEvents.length - 1 ? `1px solid ${t.borderLight}` : "none" }}>
                            <div style={{ width: 54, flexShrink: 0, borderRadius: 10, background: "#111", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px" }}>
                              <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", opacity: 0.8 }}>{new Date(`${event.date}T12:00:00`).toLocaleDateString("en-US", { month: "short" })}</div>
                              <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{new Date(`${event.date}T12:00:00`).getDate()}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <button type="button" onClick={() => setSelectedUnitEvent(event)} style={{ border: "none", background: "transparent", padding: 0, margin: 0, color: t.text, fontWeight: 900, fontSize: 16, cursor: "pointer", textAlign: "left" }}>
                                {event.title}
                              </button>
                              <div style={{ marginTop: 4, color: t.textMuted, fontSize: 13 }}>{formatEventDate(event.date)}</div>
                              <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>Group Event</span>
                                <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 8px", fontSize: 11, fontWeight: 800 }}>Private</span>
                                {event.location ? <span style={{ color: t.textMuted, fontSize: 12 }}>{event.location}</span> : null}
                              </div>
                              {event.description ? (
                                <div style={{ marginTop: 8, color: t.textMuted, fontSize: 13, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{event.description}</div>
                              ) : null}
                              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                                <button type="button" onClick={() => toggleUnitEventAttendance(event.id, "interested")} style={{ background: myStatus === "interested" ? t.text : t.surface, color: myStatus === "interested" ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                                  Interested{counts.interested > 0 ? ` · ${counts.interested}` : ""}
                                </button>
                                <button type="button" onClick={() => toggleUnitEventAttendance(event.id, "going")} style={{ background: myStatus === "going" ? t.text : t.surface, color: myStatus === "going" ? t.surface : t.textMuted, border: `1px solid ${t.border}`, borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
                                  Going{counts.going > 0 ? ` · ${counts.going}` : ""}
                                </button>
                                {unitSavedEventIds.has(event.id) ? <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>Saved</span> : null}
                                {event.signup_url ? <ExternalSiteLink href={event.signup_url} style={{ fontSize: 12, color: "#2563eb", fontWeight: 800, textDecoration: "none" }}>Website →</ExternalSiteLink> : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MEMBERS TAB */}
            {activeTab === "members" && (
              <div>
                {members.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40 }}>Loading members...</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {members.map((m) => {
                    const name = displayName(m);
                    const initial = (name[0] || "?").toUpperCase();
                    return (
                      <a
                        key={m.user_id}
                        href={`/profile/${m.user_id}`}
                        style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, border: `1px solid ${t.border}`, borderRadius: 12, background: t.surface, textDecoration: "none", color: t.text }}
                      >
                        {m.photo_url ? (
                          <img src={m.photo_url} alt={name} style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{initial}</div>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                          {m.service && <div style={{ fontSize: 12, color: t.textMuted }}>{m.service}</div>}
                          {m.role !== "member" && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 0.5 }}>{m.role}</div>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PHOTOS TAB */}
            {activeTab === "photos" && (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: t.text }}>Add a group photo</div>
                      <div style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                        {isGod
                          ? "Posts to the wall immediately and adds to the album immediately."
                          : "Posts to the wall immediately; album entry is submitted for admin approval."}
                      </div>
                    </div>
                    {photoSubmitMsg ? <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 800 }}>{photoSubmitMsg}</div> : null}
                  </div>

                  {photoUploadPreview ? (
                    <div style={{ width: 220, maxWidth: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, marginBottom: 12, position: "relative" }}>
                      <img src={photoUploadPreview} alt="Selected group photo" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                      <button
                        type="button"
                        onClick={() => {
                          if (photoUploadPreview) URL.revokeObjectURL(photoUploadPreview);
                          setPhotoUploadPreview(null);
                          setPhotoUploadFile(null);
                          if (photoUploadInputRef.current) photoUploadInputRef.current.value = "";
                        }}
                        style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}

                  <input
                    ref={photoUploadInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) return;
                      if (photoUploadPreview) URL.revokeObjectURL(photoUploadPreview);
                      setPhotoUploadFile(file);
                      setPhotoUploadPreview(URL.createObjectURL(file));
                      setPhotoSubmitMsg(null);
                    }}
                  />
                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="Optional caption"
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => photoUploadInputRef.current?.click()}
                        style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 800, cursor: "pointer" }}
                      >
                        {photoUploadFile ? "Change Photo" : "Choose Photo"}
                      </button>
                      <button
                        type="button"
                        onClick={submitGroupPhoto}
                        disabled={!photoUploadFile || submittingPhoto}
                        style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 900, cursor: !photoUploadFile || submittingPhoto ? "not-allowed" : "pointer", opacity: !photoUploadFile || submittingPhoto ? 0.65 : 1 }}
                      >
                        {submittingPhoto ? "Submitting..." : isGod ? "Add Photo" : "Submit for Approval"}
                      </button>
                    </div>
                  </div>
                </div>

                {photos.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40 }}>No photos shared yet.</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                  {photos.map((p, index) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { void openPhotoGallery(index); }}
                      style={{ aspectRatio: "1", borderRadius: 10, overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: "transparent" }}
                    >
                      <img src={p.photo_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* FILE LIBRARY TAB */}
            {activeTab === "files" && showFileLibraryTab && (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 16, color: t.text }}>Add to file library</div>
                      <div style={{ color: t.textMuted, fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>
                        Share STL, OBJ, STEP, DXF, SVG, PDF, and other maker files for 3D printing, laser engraving, and CAD.
                        CAD / 3D files need a JPG, PNG, or WEBP preview image.
                        {" "}
                        PDFs and documents up to {formatUploadBytes(UPLOAD_LIMITS.document)}.
                      </div>
                    </div>
                    {librarySubmitMsg ? <div style={{ color: "#16a34a", fontSize: 13, fontWeight: 800 }}>{librarySubmitMsg}</div> : null}
                  </div>

                  {librarySourceFile ? (
                    <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, border: `1px solid ${t.border}`, background: isDark ? "rgba(255,255,255,0.03)" : "#f9fafb" }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: t.text, wordBreak: "break-all" }}>{librarySourceFile.name}</div>
                      <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                        {formatUploadBytes(librarySourceFile.size)}
                        {fileLibraryRequiresPreview(librarySourceFile) && !libraryPreviewFile ? (
                          <span style={{ color: "#f59e0b", fontWeight: 700, marginLeft: 8 }}>Preview required</span>
                        ) : null}
                      </div>
                      {libraryPreviewUrl ? (
                        <div style={{ width: 220, maxWidth: "100%", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.border}`, marginTop: 10, position: "relative" }}>
                          <img src={libraryPreviewUrl} alt="File preview" style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                          <button
                            type="button"
                            onClick={() => {
                              if (libraryPreviewUrl) URL.revokeObjectURL(libraryPreviewUrl);
                              setLibraryPreviewUrl(null);
                              setLibraryPreviewFile(null);
                              if (libraryPreviewInputRef.current) libraryPreviewInputRef.current.value = "";
                            }}
                            style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontWeight: 900, cursor: "pointer" }}
                          >
                            ×
                          </button>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={clearLibraryForm}
                        style={{ marginTop: 10, background: "none", border: "none", color: t.textMuted, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
                      >
                        Remove file
                      </button>
                    </div>
                  ) : null}

                  <input
                    ref={librarySourceInputRef}
                    type="file"
                    accept={FILE_LIBRARY_ACCEPT}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) return;
                      const pickError = validateFileLibrarySourcePick(file);
                      if (pickError) {
                        alert(pickError);
                        e.target.value = "";
                        return;
                      }
                      if (librarySourcePreviewUrl) URL.revokeObjectURL(librarySourcePreviewUrl);
                      if (libraryPreviewUrl) URL.revokeObjectURL(libraryPreviewUrl);
                      setLibrarySourceFile(file);
                      setLibraryPreviewFile(null);
                      setLibraryPreviewUrl(null);
                      setLibrarySourcePreviewUrl(null);
                      setLibrarySubmitMsg(null);
                      if (libraryPreviewInputRef.current) libraryPreviewInputRef.current.value = "";
                    }}
                  />
                  <input
                    ref={libraryPreviewInputRef}
                    type="file"
                    accept={CAD_PREVIEW_IMAGE_ACCEPT}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (!file) return;
                      if (!isPreviewImageForCad(file)) {
                        alert("Preview must be a JPG, PNG, or WEBP image.");
                        e.target.value = "";
                        return;
                      }
                      const imageError = validateImagePick(file);
                      if (imageError) {
                        alert(imageError);
                        e.target.value = "";
                        return;
                      }
                      if (libraryPreviewUrl) URL.revokeObjectURL(libraryPreviewUrl);
                      setLibraryPreviewFile(file);
                      setLibraryPreviewUrl(URL.createObjectURL(file));
                      setLibrarySubmitMsg(null);
                    }}
                  />

                  <div style={{ display: "grid", gap: 10 }}>
                    <input
                      value={libraryDescription}
                      onChange={(e) => setLibraryDescription(e.target.value)}
                      placeholder="Title or description (optional)"
                      style={{ ...inputStyle, marginBottom: 0 }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => librarySourceInputRef.current?.click()}
                        style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 800, cursor: "pointer" }}
                      >
                        {librarySourceFile ? "Change File" : "Choose File"}
                      </button>
                      {librarySourceFile && fileLibraryRequiresPreview(librarySourceFile) ? (
                        <button
                          type="button"
                          onClick={() => libraryPreviewInputRef.current?.click()}
                          style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "9px 14px", fontWeight: 800, cursor: "pointer" }}
                        >
                          {libraryPreviewFile ? "Change Preview" : "Add Preview Image"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={submitGroupFileLibraryEntry}
                        disabled={
                          !librarySourceFile ||
                          submittingLibraryFile ||
                          Boolean(librarySourceFile && fileLibraryRequiresPreview(librarySourceFile) && !libraryPreviewFile)
                        }
                        style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 900, cursor: !librarySourceFile || submittingLibraryFile ? "not-allowed" : "pointer", opacity: !librarySourceFile || submittingLibraryFile ? 0.65 : 1 }}
                      >
                        {submittingLibraryFile ? "Submitting..." : isGod ? "Add to Library" : "Submit for Approval"}
                      </button>
                    </div>
                  </div>
                </div>

                {fileLibraryEntries.length === 0 && (
                  <div style={{ color: t.textMuted, textAlign: "center", padding: 40 }}>No maker files shared yet.</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {fileLibraryEntries.map((entry) => {
                    const entryUrls = entry.image_urls?.length
                      ? entry.image_urls
                      : entry.photo_url
                        ? [entry.photo_url]
                        : [];
                    const attachments = attachmentsFromUrls(entryUrls);
                    const displayAttachment = attachments[0];
                    const downloadUrl = attachments.find((a) => a.kind === "cad3d" || a.kind === "pdf" || a.kind === "other")?.url
                      ?? displayAttachment?.url;
                    const fileLabel = (entry.meta as { file_name?: string } | null)?.file_name
                      ?? displayAttachment?.fileName
                      ?? "Download file";

                    return (
                      <div
                        key={entry.id}
                        style={{ border: `1px solid ${t.border}`, borderRadius: 12, overflow: "hidden", background: t.surface }}
                      >
                        {displayAttachment ? (
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "block", background: FEED_MEDIA_FRAME_BG, aspectRatio: "4 / 3" }}
                          >
                            <FeedMediaAttachment
                              attachment={displayAttachment}
                              alt={fileLabel}
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                          </a>
                        ) : (
                          <div style={{ aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 13 }}>
                            File
                          </div>
                        )}
                        <div style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 800, fontSize: 14, color: t.text, lineHeight: 1.35 }}>
                            {entry.content?.trim() || fileLabel}
                          </div>
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                            {entry.author_name} · {new Date(entry.created_at).toLocaleDateString()}
                          </div>
                          {downloadUrl ? (
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 800, color: "#3b82f6", textDecoration: "none" }}
                            >
                              Download / open file
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Group photo gallery modal */}
      {activeGalleryPhoto && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setGalleryPhotoIndex(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 550, padding: isMobile ? 8 : 16 }}
        >
          <div style={{ width: "100%", maxWidth: 920, height: "calc(100vh - 16px)", borderRadius: 16, overflow: "hidden", border: `1px solid ${isDark ? "#222" : "#d1d5db"}`, background: isDark ? "#141414" : "#fff", display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", background: "#000", flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={activeGalleryPhoto.photo_url!} alt="" style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", display: "block" }} />
              <button onClick={() => setGalleryPhotoIndex(null)} style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer" }}>×</button>
              {photos.length > 1 && (
                <>
                  <button onClick={() => shiftGallery(-1)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 20, cursor: "pointer" }}>‹</button>
                  <button onClick={() => shiftGallery(1)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 20, cursor: "pointer" }}>›</button>
                </>
              )}
            </div>

            <div style={{ padding: 14, overflowY: "auto", maxHeight: isMobile ? "42vh" : "38vh" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => toggleLike(activeGalleryPhoto.id)}
                  style={{ border: "none", background: "transparent", color: activeGalleryPhoto.user_liked ? "#ef4444" : t.textMuted, fontWeight: 800, fontSize: 14, lineHeight: 1, cursor: "pointer" }}
                >
                  {activeGalleryPhoto.user_liked ? "Unlike" : "Like"}
                </button>
                <div style={{ fontSize: 14, color: t.textMuted }}>{activeGalleryPhoto.like_count} likes</div>
                <div style={{ marginLeft: "auto", fontSize: 12, color: t.textFaint }}>{new Date(activeGalleryPhoto.created_at).toLocaleDateString()}</div>
              </div>
              {activeGalleryPhoto.content ? (
                <div style={{ fontSize: 14, color: t.text, marginTop: 8, lineHeight: 1.5 }}>{activeGalleryPhoto.content}</div>
              ) : null}

              <div style={{ marginTop: 14, borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Comments</div>
                {(comments[activeGalleryPhoto.id] ?? []).length === 0 ? (
                  <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 10 }}>No comments yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                    {(comments[activeGalleryPhoto.id] ?? []).map((c) => (
                      <div key={c.id} style={{ display: "flex", gap: 8 }}>
                        <Avatar photo={c.author_photo} name={c.author_name} size={28} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: t.text }}>
                            <strong>{c.author_name}</strong> {renderUnitText(c.content)}
                          </div>
                          {(() => {
                            const youtubeUrl = firstYouTubeUrlFromText(c.content);
                            return youtubeUrl ? (
                              <YouTubeEmbed
                                url={youtubeUrl}
                                title="Group comment YouTube video"
                                maxWidth="min(360px, 100%)"
                                marginTop={8}
                              />
                            ) : null;
                          })()}
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
                              t={t as Theme}
                              disabled={!currentUserId}
                              viewerReaction={c.myReaction}
                              totalCount={c.likeCount}
                              busy={togglingCommentReactionFor === c.id}
                              showTriggerCount={false}
                              onPick={(type) =>
                                void handleUnitCommentReaction(activeGalleryPhoto.id, c.id, type)
                              }
                            />
                            <div style={{ flex: "1 1 12px", minWidth: 0 }} />
                            <ReactionLeaderboard
                              t={t as Theme}
                              countsByType={c.reactionCountsByType}
                              reactorNamesByType={c.reactorNamesByType}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={commentInputs[activeGalleryPhoto.id] ?? ""}
                    onChange={(e) => setCommentInputs((prev) => ({ ...prev, [activeGalleryPhoto.id]: e.target.value }))}
                    placeholder="Write a comment..."
                    style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => submitComment(activeGalleryPhoto.id)}
                    style={{ background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 800, cursor: "pointer" }}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setShowInvite(false); setInviteMsg(null); } }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500, padding: 16 }}
        >
          <div style={{ background: t.surface, borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", border: `1px solid ${t.border}` }}>
            {/* Modal header */}
            <div style={{ padding: "20px 20px 12px", borderBottom: `1px solid ${t.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
                Invite Members to {unit.name}
              </div>

              {/* Branch filter chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {BRANCHES.map((branch) => {
                  const active = inviteBranches.has(branch);
                  return (
                    <button
                      key={branch}
                      onClick={() => setInviteBranches((prev) => {
                        const s = new Set(prev);
                        if (active) s.delete(branch);
                        else s.add(branch);
                        return s;
                      })}
                      style={{ background: active ? "#111" : t.badgeBg, color: active ? "#fff" : t.text, border: `1px solid ${active ? "#111" : t.border}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      {branch}
                    </button>
                  );
                })}
                {inviteBranches.size > 0 && (
                  <button onClick={() => setInviteBranches(new Set())} style={{ background: "none", border: "none", color: t.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>

              {/* Name search */}
              <input
                type="text"
                value={inviteQuery}
                onChange={(e) => setInviteQuery(e.target.value)}
                placeholder="Search by name..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* User list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
              {filteredInviteUsers.length === 0 && (
                <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: 24 }}>No matching users found.</div>
              )}
              {filteredInviteUsers.map((u) => {
                const name = displayName(u);
                const checked = selectedInvites.has(u.user_id);
                return (
                  <div
                    key={u.user_id}
                    onClick={() => setSelectedInvites((prev) => {
                      const s = new Set(prev);
                      if (checked) s.delete(u.user_id);
                      else s.add(u.user_id);
                      return s;
                    })}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", background: checked ? (isDark ? "#1a2a1a" : "#f0fdf4") : "transparent" }}
                    onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = t.surfaceHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = checked ? (isDark ? "#1a2a1a" : "#f0fdf4") : "transparent"; }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? "#22c55e" : t.border}`, background: checked ? "#22c55e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {checked && <svg width="11" height="11" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
                    </div>
                    {u.photo_url ? (
                      <img src={u.photo_url} alt={name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                        {(name[0] || "?").toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                      {u.service && <div style={{ fontSize: 12, color: t.textMuted }}>{u.service}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: `1px solid ${t.border}`, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                {selectedInvites.size > 0 ? `${selectedInvites.size} selected` : "Select members to invite"}
              </div>
              {inviteMsg && (
                <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>{inviteMsg}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setShowInvite(false); setInviteMsg(null); }} style={{ background: t.badgeBg, color: t.text, border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Close
                </button>
                <button
                  onClick={sendInvites}
                  disabled={selectedInvites.size === 0 || inviting}
                  style={{ background: selectedInvites.size === 0 ? t.badgeBg : "#111", color: selectedInvites.size === 0 ? t.textMuted : "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontWeight: 800, fontSize: 13, cursor: selectedInvites.size === 0 ? "not-allowed" : "pointer" }}
                >
                  {inviting ? "Inviting..." : `Invite${selectedInvites.size > 0 ? ` (${selectedInvites.size})` : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {flagModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unit-flag-modal-title"
          onClick={() => !flaggingId && setFlagModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, background: t.surface, borderRadius: 16, border: `1px solid ${t.border}`, padding: "20px 22px", boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.5)" : "0 12px 40px rgba(0,0,0,0.12)" }}
          >
            <h2 id="unit-flag-modal-title" style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 800, color: t.text }}>
              {flagModal.contentType === "unit_post_comment" ? "Flag this group comment" : "Flag this group post"}
            </h2>
            <label htmlFor="unit-flag-reason" style={{ display: "block", fontSize: 13, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
              Reason
            </label>
            <select
              id="unit-flag-reason"
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

      {selectedUnitEvent && (
        <div
          onClick={() => setSelectedUnitEvent(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 650, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", background: t.surface, color: t.text, borderRadius: 18, border: `1px solid ${t.border}`, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 9px", fontSize: 11, fontWeight: 900 }}>Group Event</span>
                  <span style={{ borderRadius: 999, background: t.badgeBg, color: t.textMuted, padding: "3px 9px", fontSize: 11, fontWeight: 900 }}>{unit?.name}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>{selectedUnitEvent.title}</div>
                <div style={{ marginTop: 8, color: t.textMuted, fontSize: 14 }}>{formatEventDate(selectedUnitEvent.date)}</div>
              </div>
              <button type="button" onClick={() => setSelectedUnitEvent(null)} style={{ border: `1px solid ${t.border}`, background: t.surface, color: t.text, borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontWeight: 800 }}>
                X
              </button>
            </div>

            {selectedUnitEvent.description ? (
              <div style={{ marginTop: 18, color: t.textMuted, lineHeight: 1.6, fontSize: 14, whiteSpace: "pre-wrap" }}>{selectedUnitEvent.description}</div>
            ) : null}

            <div style={{ marginTop: 20, borderTop: `1px solid ${t.border}`, paddingTop: 16, display: "grid", gap: 8 }}>
              {selectedUnitEvent.event_time ? <div style={{ color: t.textMuted, fontSize: 14 }}><strong>Time:</strong> {selectedUnitEvent.event_time}</div> : null}
              {selectedUnitEvent.location ? <div style={{ color: t.textMuted, fontSize: 14 }}><strong>Location:</strong> {selectedUnitEvent.location}</div> : null}
              {(selectedUnitEvent.poc_name || selectedUnitEvent.poc_phone) ? (
                <div style={{ color: t.textMuted, fontSize: 14 }}>
                  <strong>Point of Contact:</strong> {selectedUnitEvent.poc_name ?? ""}
                  {selectedUnitEvent.poc_name && selectedUnitEvent.poc_phone ? " — " : ""}
                  {selectedUnitEvent.poc_phone ? <a href={`tel:${selectedUnitEvent.poc_phone.replace(/\s+/g, "")}`} style={{ fontWeight: 800 }}>{selectedUnitEvent.poc_phone}</a> : null}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button type="button" onClick={() => toggleUnitEventAttendance(selectedUnitEvent.id, "interested")} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: unitEventMyAttendance[selectedUnitEvent.id] === "interested" ? t.text : t.surface, color: unitEventMyAttendance[selectedUnitEvent.id] === "interested" ? t.surface : t.text }}>
                Interested{(unitEventAttendance[selectedUnitEvent.id]?.interested ?? 0) > 0 ? ` · ${unitEventAttendance[selectedUnitEvent.id].interested}` : ""}
              </button>
              <button type="button" onClick={() => toggleUnitEventAttendance(selectedUnitEvent.id, "going")} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer", background: unitEventMyAttendance[selectedUnitEvent.id] === "going" ? t.text : t.surface, color: unitEventMyAttendance[selectedUnitEvent.id] === "going" ? t.surface : t.text }}>
                Going{(unitEventAttendance[selectedUnitEvent.id]?.going ?? 0) > 0 ? ` · ${unitEventAttendance[selectedUnitEvent.id].going}` : ""}
              </button>
              {selectedUnitEvent.signup_url ? <ExternalSiteLink href={selectedUnitEvent.signup_url} style={{ display: "inline-block", textDecoration: "none", background: "#111", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 800, marginLeft: "auto" }}>Open Event Link</ExternalSiteLink> : null}
            </div>
          </div>
        </div>
      )}

      {/* Add to Rabbithole modal — unit post source */}
      {rabbitholeModalPost && (
        <AddToRabbitholeModal
          open={true}
          post={rabbitholeModalPost}
          sourceType="unit"
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

      <FeedImageGalleryModal
        open={isPostGalleryOpen}
        images={postGalleryImages}
        index={postGalleryIndex}
        onClose={closePostGallery}
        onPrev={showPrevPostGalleryImage}
        onNext={showNextPostGalleryImage}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type ThemeTokens = {
  surface: string; border: string; text: string; textMuted: string; textFaint: string;
  badgeBg: string; input: string; inputBorder: string; surfaceHover: string; borderLight: string;
  bg: string; badgeText: string; navBg: string; navBorder: string;
};

function Avatar({ photo, name, size = 38 }: { photo: string | null; name: string; size?: number }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        background: t.badgeBg,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: t.textMuted,
        fontSize: size * 0.32,
        boxSizing: "border-box",
      }}
    >
      {photo ? (
        <OptimizedAvatarImg photoUrl={photo} displayName={name} sizePx={size} />
      ) : (
        (name?.trim()?.[0] || "U").toUpperCase()
      )}
    </div>
  );
}

function JoinRequestCard({ post, isGod, currentUserId, onVote, onApprove, onDeny, t, isDark }: {
  post: UnitPost; isGod: boolean; currentUserId: string;
  onVote: () => void; onApprove: () => void; onDeny: () => void;
  t: ThemeTokens; isDark: boolean;
}) {
  const [voting, setVoting] = useState(false);
  const [acting, setActing] = useState<"approve" | "deny" | null>(null);
  const approvalCount = post.approval_count ?? 0;
  const isRequester = post.user_id === currentUserId;

  return (
    <div style={{ border: `1px solid ${isDark ? "#2a2a00" : "#fef08a"}`, borderRadius: 14, padding: 16, background: isDark ? "#1a1a00" : "#fefce8", display: "flex", gap: 14, alignItems: "flex-start" }}>
      <Avatar photo={post.meta?.avatar_url ?? post.author_photo} name={post.author_name} size={42} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{post.content}</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3 }}>{timeAgo(post.created_at)}</div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Vote progress */}
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < approvalCount ? "#22c55e" : (isDark ? "#2e2e2e" : "#e5e7eb") }} />
            ))}
            <span style={{ fontSize: 12, color: t.textMuted, marginLeft: 4, fontWeight: 600 }}>{approvalCount}/3 approved</span>
          </div>

          {!isRequester && (
            <>
              {!post.user_voted && (
                <button
                  disabled={voting}
                  onClick={async () => { setVoting(true); try { await Promise.resolve(onVote()); } finally { setVoting(false); } }}
                  style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: voting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                >
                  {voting && <span className="btn-spinner" />}
                  Vouch
                </button>
              )}
              {post.user_voted && (
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>✓ Vouched</span>
              )}
              {isGod && (
                <>
                  <button
                    disabled={acting === "approve"}
                    onClick={async () => { setActing("approve"); try { await Promise.resolve(onApprove()); } finally { setActing(null); } }}
                    style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: acting === "approve" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    {acting === "approve" && <span className="btn-spinner" />}
                    Approve
                  </button>
                  <button
                    disabled={acting === "deny"}
                    onClick={async () => { setActing("deny"); try { await Promise.resolve(onDeny()); } finally { setActing(null); } }}
                    style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "5px 12px", fontWeight: 800, fontSize: 12, cursor: acting === "deny" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    {acting === "deny" && <span className="btn-spinner" />}
                    Deny
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({
  post,
  t,
  isDark,
  comments,
  commentInput,
  onCommentInputChange,
  expanded,
  togglingPostReactionFor,
  onPostReaction,
  currentUserId,
  togglingCommentReactionFor,
  onCommentReaction,
  onToggleComments,
  onSubmitComment,
  canManagePost,
  isEditingPost,
  editingPostContent,
  savingPost,
  deletingPost,
  flaggingPost,
  isMobile,
  onEdit,
  onCancelEdit,
  onEditContentChange,
  onSaveEdit,
  onDelete,
  onFlag,
  editingCommentId,
  editingCommentContent,
  savingCommentId,
  deletingCommentId,
  flaggingCommentId,
  onEditComment,
  onCancelEditComment,
  onEditCommentContentChange,
  onSaveEditComment,
  onDeleteComment,
  onFlagComment,
  onAddToRabbithole,
  rabbitholeThreadId,
  onOpenGallery,
  canInteract = true,
}: {
  post: UnitPost; t: ThemeTokens; isDark: boolean;
  comments: Comment[] | undefined;
  commentInput: string;
  onCommentInputChange: (v: string) => void;
  expanded: boolean;
  togglingPostReactionFor: string | null;
  onPostReaction: (picked: ReactionType) => void;
  currentUserId: string | null;
  togglingCommentReactionFor: string | null;
  onCommentReaction: (commentId: string, picked: ReactionType) => void;
  onToggleComments: () => void;
  onSubmitComment: (imageFile?: File | null, gifUrl?: string | null) => Promise<void>;
  canManagePost: boolean;
  isEditingPost: boolean;
  editingPostContent: string;
  savingPost: boolean;
  deletingPost: boolean;
  flaggingPost: boolean;
  isMobile: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onEditContentChange: (value: string) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onFlag: () => void;
  editingCommentId: string | null;
  editingCommentContent: string;
  savingCommentId: string | null;
  deletingCommentId: string | null;
  flaggingCommentId: string | null;
  onEditComment: (commentId: string, content: string) => void;
  onCancelEditComment: () => void;
  onEditCommentContentChange: (value: string) => void;
  onSaveEditComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onFlagComment: (commentId: string) => void;
  onAddToRabbithole?: (() => void) | undefined;
  rabbitholeThreadId?: string | null;
  onOpenGallery: (startIndex: number) => void;
  canInteract?: boolean;
}) {
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentGif, setCommentGif] = useState<string | null>(null);
  const [commentImage, setCommentImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [expandedCommentImageUrl, setExpandedCommentImageUrl] = useState<string | null>(null);
  const commentImageInputRef = useRef<HTMLInputElement | null>(null);

  const postImageUrls =
    post.image_urls?.length
      ? post.image_urls
      : post.photo_url
        ? [post.photo_url]
        : [];
  const postAttachments = attachmentsFromUrls(postImageUrls);

  function clearCommentMedia() {
    setCommentGif(null);
    if (commentImage) URL.revokeObjectURL(commentImage.previewUrl);
    setCommentImage(null);
    if (commentImageInputRef.current) commentImageInputRef.current.value = "";
  }

  function attachCommentImage(file: File) {
    const pickError = validateImagePick(file);
    if (pickError) {
      alert(pickError);
      if (commentImageInputRef.current) commentImageInputRef.current.value = "";
      return;
    }
    if (commentImage) URL.revokeObjectURL(commentImage.previewUrl);
    setCommentImage({ file, previewUrl: URL.createObjectURL(file) });
    setCommentGif(null);
    if (commentImageInputRef.current) commentImageInputRef.current.value = "";
  }

  function handleCommentImagePaste(e: ClipboardEvent) {
    handlePasteImageFromClipboard(e, (files) => {
      if (files[0]) attachCommentImage(files[0]);
    }, { imagesOnly: true });
  }

  async function handleSend() {
    if (submittingComment) return;
    setSubmittingComment(true);
    try {
      await onSubmitComment(commentImage?.file ?? null, commentGif);
      clearCommentMedia();
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <div id={`unit-post-${post.id}`} style={feedPostCardStyle(t)}>
      {/* Author row */}
      <FeedPostHeader
        profileHref={`/profile/${post.user_id}`}
        avatar={<Avatar photo={post.author_photo} name={post.author_name} size={FEED_POST_AVATAR_SIZE} />}
        authorName={post.author_name}
        createdAtLabel={timeAgo(post.created_at)}
        t={t}
        isOwnPost={canManagePost}
        canEdit={canManagePost}
        canDelete={canManagePost}
        isEditingPost={isEditingPost}
        isMobile={isMobile}
        isDeleting={deletingPost}
        isFlagging={flaggingPost}
        onEdit={onEdit}
        onDelete={onDelete}
        onFlag={onFlag}
      />

      {isEditingPost ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={editingPostContent}
            onChange={(e) => onEditContentChange(e.target.value)}
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
              onClick={onCancelEdit}
              style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: "pointer", color: t.text }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSaveEdit}
              disabled={savingPost}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 700, cursor: savingPost ? "not-allowed" : "pointer", opacity: savingPost ? 0.7 : 1 }}
            >
              {savingPost ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* Content */}
      {post.rabbithole_contribution_id && (
        <div style={{ marginBottom: 6, fontSize: 11, color: t.textFaint }}>
          Shared from{" "}
          <Link
            href={`/rabbithole/contribution/${encodeURIComponent(post.rabbithole_contribution_id)}`}
            style={{ color: t.textMuted, textDecoration: "underline" }}
          >
            RabbitHole
          </Link>
        </div>
      )}
      {post.content && (
        <ExpandableText
          textLength={post.content.length}
          style={{ fontSize: 15, color: t.text }}
          wrapperStyle={{ marginBottom: postImageUrls.length > 0 ? 12 : 0 }}
          toggleColor={t.textMuted}
        >
          {renderUnitText(post.content)}
        </ExpandableText>
      )}

      {post.content && (() => {
        const youtubeUrl = firstYouTubeUrlFromText(post.content);
        const ogUrl = post.rabbithole_contribution_id ? post.meta?.og?.url : null;
        if (!youtubeUrl || sameYouTubeVideo(youtubeUrl, ogUrl)) return null;
        return <YouTubeEmbed url={youtubeUrl} title="Group post YouTube video" marginTop={10} maxWidth={520} />;
      })()}

      {post.rabbithole_contribution_id && post.meta?.og?.url && (() => {
        const og = post.meta?.og;
        if (!og?.url) return null;
        const ytId = getYouTubeVideoId(og.url);
        if (ytId) {
          return <YouTubeEmbed videoId={ytId} title="Group post YouTube video" marginTop={10} maxWidth={520} />;
        }
        return (
          <a
            href={og.url}
            target="_blank"
            rel="noreferrer"
            style={{
              marginTop: 10,
              display: "block",
              textDecoration: "none",
              border: `1px solid ${t.border}`,
              borderRadius: 12,
              padding: 10,
              background: t.badgeBg,
              color: t.text,
            }}
          >
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 2 }}>
              {og.site_name || "External source"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
              {og.title || "Open shared RabbitHole source"}
            </div>
            {og.description && <div style={{ fontSize: 13, color: t.textMuted }}>{og.description}</div>}
          </a>
        );
      })()}

      <FeedPostImageGrid
        attachments={postAttachments}
        onOpenGallery={onOpenGallery}
        borderColor={t.borderLight}
      />

      {/* GIF */}
      {post.gif_url && (
        <div style={{ marginTop: FEED_SECTION_GAP, width: "100%", maxWidth: FEED_POST_IMAGES_MAX_WIDTH }}>
          <img src={post.gif_url} alt="GIF" style={{ width: "100%", maxHeight: 360, borderRadius: FEED_MEDIA_RADIUS, display: "block", objectFit: "contain" }} />
        </div>
      )}

      {/* Like / Comment / Rabbithole toolbar */}
      <div style={{ display: "flex", gap: FEED_ACTION_ROW_GAP, alignItems: "center", marginTop: FEED_SECTION_GAP, padding: FEED_ACTION_ROW_PADDING, borderTop: `1px solid ${t.borderLight}`, flexWrap: "wrap" }}>
        {canInteract ? (
        <ReactionPickerTrigger
          t={t as Theme}
          disabled={!currentUserId}
          viewerReaction={post.myReaction}
          totalCount={post.like_count}
          busy={togglingPostReactionFor === post.id}
          showTriggerCount={false}
          onPick={onPostReaction}
        />
        ) : null}
        <button
          type="button"
          onClick={onToggleComments}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontWeight: 700, color: t.textMuted, fontSize: 14 }}
        >
          {expanded
            ? "Hide Comments"
            : post.comment_count > 0
              ? "Show more"
              : canInteract
                ? "Comment"
                : "View Comments"}
        </button>
        <ReactionLeaderboard
          t={t as Theme}
          countsByType={post.reactionCountsByType}
          reactorNamesByType={post.reactorNamesByType}
        />
        <div style={{ fontSize: 14, color: t.textMuted }}>{post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}</div>

        {/* Rabbithole button — grouped at right edge */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          {rabbitholeThreadId ? (
            <div
              title="Filed to Rabbithole — locked"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                overflow: "hidden",
                border: "2px solid #7c3aed",
                opacity: 0.45,
                filter: "grayscale(50%)",
                boxSizing: "border-box",
                cursor: "not-allowed",
                flexShrink: 0,
              }}
            >
              <img
                src="/rabbithole-btn.png"
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ) : onAddToRabbithole ? (
            <button
              type="button"
              title="Add to Rabbithole"
              onClick={onAddToRabbithole}
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "block", flexShrink: 0 }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
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
          ) : null}
        </div>
      </div>

      {/* Murphy banner — shown when post has been filed to Rabbithole */}
      {rabbitholeThreadId && <MurphyRabbitholeBanner />}
        </>
      )}

      {/* Collapsed preview: first couple comments so the wall isn't empty until expand */}
      {!expanded && (() => {
        const previewSource =
          comments && comments.length > 0
            ? comments
            : (post.comment_preview ?? []).map((c) => ({
                id: c.id,
                user_id: c.user_id,
                content: c.content,
                created_at: c.created_at,
                author_name: c.author_name,
                author_photo: c.author_photo,
                image_url: c.image_url ?? null,
                gif_url: c.gif_url ?? null,
              }));
        const previewRows = previewSource.slice(0, 2);
        if (previewRows.length === 0) return null;
        const remaining = Math.max(0, post.comment_count - previewRows.length);
        return (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.borderLight}` }}>
            {previewRows.map((c) => (
              <div key={c.id} style={{ marginBottom: 10 }}>
                <div style={{ background: t.badgeBg, borderRadius: 10, padding: "7px 12px" }}>
                  <Link
                    href={`/profile/${c.user_id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 4,
                      color: t.text,
                      textDecoration: "none",
                    }}
                  >
                    <Avatar photo={c.author_photo} name={c.author_name} size={28} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.author_name}
                    </span>
                  </Link>
                  {c.content ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: t.text,
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 3,
                        overflow: "hidden",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {renderUnitText(c.content)}
                    </div>
                  ) : null}
                  {(c.image_url || c.gif_url) && (
                    <div style={{ marginTop: 6, fontSize: 12, color: t.textFaint }}>Photo attached</div>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={onToggleComments}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontWeight: 700,
                color: t.textMuted,
                fontSize: 13,
              }}
            >
              {remaining > 0
                ? `…Show more (${remaining} more comment${remaining === 1 ? "" : "s"})`
                : "…Show more"}
            </button>
          </div>
        );
      })()}

      {/* Comments section */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.borderLight}` }}>
          {(comments ?? []).length === 0 && (
            <div style={{ color: t.textFaint, fontSize: 13, marginBottom: 10 }}>No comments yet.</div>
          )}
          {(comments ?? []).map((c) => {
            const isOwnComment = !!currentUserId && currentUserId === c.user_id;
            const isEditingComment = editingCommentId === c.id;
            return (
            <div key={c.id} id={`unit-comment-${c.id}`} style={{ marginBottom: 10 }}>
              <div style={{ background: t.badgeBg, borderRadius: 10, padding: "7px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <Link
                    href={`/profile/${c.user_id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 2,
                      color: t.text,
                      textDecoration: "none",
                    }}
                  >
                    <Avatar photo={c.author_photo} name={c.author_name} size={28} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.author_name}
                    </span>
                  </Link>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                    {!isOwnComment && currentUserId && canInteract ? (
                      <button
                        type="button"
                        onClick={() => onFlagComment(c.id)}
                        disabled={flaggingCommentId === c.id}
                        title="Flag for review"
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: "0 2px",
                          cursor: flaggingCommentId === c.id ? "not-allowed" : "pointer",
                          color: t.textFaint,
                          fontSize: 12,
                          lineHeight: 1,
                        }}
                      >
                        Report Comment
                      </button>
                    ) : null}
                    {isOwnComment && canInteract ? (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {!isEditingComment && (
                          <button
                            type="button"
                            onClick={() => onEditComment(c.id, c.content)}
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              color: t.textMuted,
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteComment(c.id)}
                          disabled={deletingCommentId === c.id}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: deletingCommentId === c.id ? "not-allowed" : "pointer",
                            color: t.textMuted,
                            fontWeight: 700,
                            fontSize: 12,
                            opacity: deletingCommentId === c.id ? 0.6 : 1,
                          }}
                        >
                          {deletingCommentId === c.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                {isEditingComment ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={editingCommentContent}
                      onChange={(e) => onEditCommentContentChange(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 70,
                        border: `1px solid ${t.inputBorder}`,
                        borderRadius: 10,
                        padding: 10,
                        resize: "vertical",
                        fontSize: 13,
                        boxSizing: "border-box",
                        background: t.input,
                        color: t.text,
                      }}
                    />
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                      <button
                        type="button"
                        onClick={onCancelEditComment}
                        style={{
                          background: "transparent",
                          border: `1px solid ${t.border}`,
                          borderRadius: 10,
                          padding: "8px 14px",
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
                        onClick={() => onSaveEditComment(c.id)}
                        disabled={savingCommentId === c.id}
                        style={{
                          background: "#111",
                          color: "white",
                          border: "none",
                          borderRadius: 10,
                          padding: "8px 14px",
                          fontWeight: 700,
                          cursor: savingCommentId === c.id ? "not-allowed" : "pointer",
                          opacity: savingCommentId === c.id ? 0.7 : 1,
                          fontSize: 13,
                        }}
                      >
                        {savingCommentId === c.id ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {c.content && (
                      <>
                        <div style={{ fontSize: 13, color: t.text, lineHeight: 1.45 }}>{renderUnitText(c.content)}</div>
                        {(() => {
                          const youtubeUrl = firstYouTubeUrlFromText(c.content);
                          return youtubeUrl ? (
                            <YouTubeEmbed
                              url={youtubeUrl}
                              title="Group comment YouTube video"
                              maxWidth="min(360px, 100%)"
                              marginTop={8}
                            />
                          ) : null;
                        })()}
                      </>
                    )}
                    {c.image_url && (
                      <button
                        type="button"
                        onClick={() => setExpandedCommentImageUrl(c.image_url!)}
                        aria-label="View comment image full size"
                        style={{
                          marginTop: 8,
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
                        <img src={c.image_url} alt="Comment image" style={feedContainedImageStyle} />
                      </button>
                    )}
                    {c.gif_url && (
                      <div style={{ marginTop: 8 }}>
                        <img src={c.gif_url} alt="GIF" style={{ maxWidth: 180, borderRadius: 10, display: "block" }} />
                      </div>
                    )}
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    marginTop: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {canInteract ? (
                  <ReactionPickerTrigger
                    t={t as Theme}
                    disabled={!currentUserId}
                    viewerReaction={c.myReaction}
                    totalCount={c.likeCount}
                    busy={togglingCommentReactionFor === c.id}
                    showTriggerCount={false}
                    onPick={(type) => onCommentReaction(c.id, type)}
                  />
                  ) : null}
                  <div style={{ flex: "1 1 12px", minWidth: 0 }} />
                  <ReactionLeaderboard
                    t={t as Theme}
                    countsByType={c.reactionCountsByType}
                    reactorNamesByType={c.reactorNamesByType}
                  />
                </div>
              </div>
            </div>
            );
          })}

          {canInteract && (
          <div style={{ marginTop: 8 }}>
            <textarea
              value={commentInput}
              onChange={(e) => onCommentInputChange(e.target.value)}
              onPaste={handleCommentImagePaste}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder="Write a comment..."
              rows={2}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.inputBorder}`, background: t.input, color: t.text, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />

            <input
              ref={commentImageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                attachCommentImage(file);
              }}
            />

            {/* GIF preview */}
            {commentGif && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block" }}>
                <img src={commentGif} alt="GIF" style={{ maxWidth: 180, borderRadius: 10, display: "block" }} />
                <button type="button" onClick={() => setCommentGif(null)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            )}

            {/* Image preview */}
            {commentImage && (
              <div style={{ marginTop: 8, position: "relative", display: "inline-block", width: 120, height: 120, borderRadius: 10, overflow: "hidden", border: `1px solid ${t.border}`, background: FEED_MEDIA_FRAME_BG }}>
                <img src={commentImage.previewUrl} alt="" style={feedContainedImageStyle} />
                <button type="button" onClick={() => { if (commentImage) URL.revokeObjectURL(commentImage.previewUrl); setCommentImage(null); if (commentImageInputRef.current) commentImageInputRef.current.value = ""; }} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.75)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              </div>
            )}

            {/* Action row: Photo / Emoji / GIF / Send */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => commentImageInputRef.current?.click()}
                style={{ background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 10, padding: "7px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {commentImage ? "Change Photo" : "Add Photo"}
              </button>

              <EmojiPickerButton
                value={commentInput}
                onChange={onCommentInputChange}
                inputRef={{ current: null }}
                theme={isDark ? "dark" : "light"}
              />

              <GifPickerButton
                onSelect={(url) => { setCommentGif(url); setCommentImage(null); }}
                theme={isDark ? "dark" : "light"}
              />

              <button
                type="button"
                disabled={submittingComment}
                onClick={() => void handleSend()}
                style={{ marginLeft: "auto", background: "#111", color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: submittingComment ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: submittingComment ? 0.7 : 1 }}
              >
                {submittingComment && <span className="btn-spinner" />}
                Send
              </button>
            </div>
          </div>
          )}
        </div>
      )}
      <FeedImageGalleryModal
        open={!!expandedCommentImageUrl}
        images={expandedCommentImageUrl ? [expandedCommentImageUrl] : []}
        index={0}
        onClose={() => setExpandedCommentImageUrl(null)}
        onPrev={() => {}}
        onNext={() => {}}
      />
    </div>
  );
}
