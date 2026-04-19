/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Flag, Heart, MessageCircle, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { FLAG_CATEGORIES, FLAG_CATEGORY_LABELS, type FlagCategory } from "../../../lib/flagCategories";
import BreadcrumbTrail from "../../components/BreadcrumbTrail";
import RabbitholeShell from "../../components/RabbitholeShell";
import { parseTrail } from "../../lib/helpers";
import {
  createRabbitholeContributionComment,
  fetchRabbitholeContributionDetail,
  toggleRabbitholeContributionLike,
} from "../../lib/dataClient";
import { resolveRabbitholeAssetUrl } from "../../lib/storageService";
import type { RabbitholeAsset, RabbitholeContribution, RabbitholeContributionComment } from "../../lib/types";
import { supabase } from "../../../lib/lib/supabaseClient";

type ShareDestinationType = "feed" | "user_wall" | "unit_wall";
type ShareUserResult = { id: string; name: string; photoUrl: string | null };
type ShareUnitResult = { id: string; name: string; slug: string };

function formatContentType(type: RabbitholeContribution["contentType"]): string {
  switch (type) {
    case "article_news":
      return "Article / News";
    case "external_link":
      return "External Link";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function youtubeEmbedUrl(sourceUrl?: string | null, metadata?: Record<string, unknown>): string | null {
  const metaId = typeof metadata?.youtubeId === "string" ? metadata.youtubeId : null;
  if (metaId) return `https://www.youtube.com/embed/${metaId}`;
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export default function ContributionPageClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tunnelTrail = useMemo(() => parseTrail(searchParams.get("trail") ?? ""), [searchParams]);

  const contributionId = params.id;
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [contribution, setContribution] = useState<RabbitholeContribution | null>(null);
  const [comments, setComments] = useState<RabbitholeContributionComment[]>([]);
  const [assets, setAssets] = useState<RabbitholeAsset[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [embedBlocked, setEmbedBlocked] = useState(false);

  // Author edit + author/admin delete + flag (any user) for the contribution itself.
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Per-comment edit/delete state.
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);

  // Flag modal — used for both the contribution and individual comments.
  type FlagTarget =
    | { kind: "contribution"; id: string }
    | { kind: "comment"; id: string };
  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null);
  const [flagCategory, setFlagCategory] = useState<FlagCategory>("general");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  // Per-row "..." menu so author/admin/flag actions don't clutter the layout.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDestinationType, setShareDestinationType] = useState<ShareDestinationType>("feed");
  const [shareDestinationId, setShareDestinationId] = useState<string | null>(null);
  const [shareDestinationLabel, setShareDestinationLabel] = useState<string>("");
  const [shareQuery, setShareQuery] = useState("");
  const [shareUsers, setShareUsers] = useState<ShareUserResult[]>([]);
  const [shareUnits, setShareUnits] = useState<ShareUnitResult[]>([]);
  const [shareMessage, setShareMessage] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccessMessage, setShareSuccessMessage] = useState<string | null>(null);

  async function loadDetail(userId: string | null) {
    setLoading(true);
    const data = await fetchRabbitholeContributionDetail(supabase, contributionId, userId);
    setContribution(data.contribution);
    setComments(data.comments);
    setAssets(data.assets);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id ?? null;
      setViewerUserId(userId);
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("user_id", userId)
          .maybeSingle();
        setViewerIsAdmin(!!(profile as { is_admin?: boolean } | null)?.is_admin);
      } else {
        setViewerIsAdmin(false);
      }
      void loadDetail(userId);
    });
  }, [contributionId]);

  useEffect(() => {
    let cancelled = false;
    async function resolveAssets() {
      if (assets.length === 0) {
        if (!cancelled) setAssetUrls({});
        return;
      }
      const pairs = await Promise.all(
        assets.map(async (asset) => {
          const resolved = await resolveRabbitholeAssetUrl(supabase, asset);
          return [asset.id, resolved.ok ? resolved.url : ""] as const;
        })
      );
      if (cancelled) return;
      setAssetUrls(
        pairs.reduce<Record<string, string>>((acc, [id, url]) => {
          if (url) acc[id] = url;
          return acc;
        }, {})
      );
    }
    void resolveAssets();
    return () => {
      cancelled = true;
    };
  }, [assets]);

  async function handleToggleLike() {
    if (!contribution || likeBusy) return;
    setLikeBusy(true);
    const result = await toggleRabbitholeContributionLike(supabase, contribution.id);
    setLikeBusy(false);
    if (!result.ok || typeof result.liked !== "boolean") {
      setViewerError(result.error ?? "Could not update like.");
      return;
    }
    setViewerError(null);
    setContribution((prev) =>
      prev
        ? {
            ...prev,
            viewerLiked: result.liked,
            likeCount: Math.max(0, prev.likeCount + (result.liked ? 1 : -1)),
          }
        : prev
    );
  }

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contribution || postingComment) return;
    if (!commentBody.trim()) {
      setViewerError("Comment cannot be empty.");
      return;
    }
    setPostingComment(true);
    const result = await createRabbitholeContributionComment(supabase, {
      contributionId: contribution.id,
      body: commentBody,
    });
    setPostingComment(false);
    if (!result.ok) {
      setViewerError(result.error ?? "Could not post comment.");
      return;
    }
    setViewerError(null);
    setCommentBody("");
    await loadDetail(viewerUserId);
  }

  async function withAuthToken(): Promise<string | null> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function openEditModal() {
    if (!contribution) return;
    setEditTitle(contribution.title);
    setEditSummary(contribution.summary);
    setEditSourceUrl(contribution.sourceUrl ?? "");
    setEditError(null);
    setEditOpen(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contribution || editBusy) return;
    setEditBusy(true);
    setEditError(null);
    const token = await withAuthToken();
    if (!token) {
      setEditBusy(false);
      setEditError("You must be logged in.");
      return;
    }
    const res = await fetch(`/api/rabbithole/contributions/${encodeURIComponent(contribution.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: editTitle,
        summary: editSummary,
        sourceUrl: editSourceUrl.trim() ? editSourceUrl.trim() : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setEditBusy(false);
    if (!res.ok) {
      setEditError(json?.error ?? "Could not update contribution.");
      return;
    }
    setEditOpen(false);
    await loadDetail(viewerUserId);
  }

  async function handleDeleteContribution() {
    if (!contribution || deleteBusy) return;
    const isAuthor = viewerUserId === contribution.createdBy;
    const promptMsg = isAuthor
      ? "Delete this contribution? This will remove the entry, its comments, and any uploaded files."
      : "Remove this contribution as a moderator? This deletes it for everyone.";
    if (!window.confirm(promptMsg)) return;

    setDeleteBusy(true);
    const token = await withAuthToken();
    if (!token) {
      setDeleteBusy(false);
      setViewerError("You must be logged in.");
      return;
    }
    const res = await fetch(`/api/rabbithole/contributions/${encodeURIComponent(contribution.id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    setDeleteBusy(false);
    if (!res.ok) {
      setViewerError(json?.error ?? "Could not delete contribution.");
      return;
    }
    router.push("/rabbithole");
  }

  function startEditComment(comment: RabbitholeContributionComment) {
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
    setOpenMenuId(null);
  }

  async function saveCommentEdit(commentId: string) {
    if (commentBusyId) return;
    setCommentBusyId(commentId);
    const token = await withAuthToken();
    if (!token) {
      setCommentBusyId(null);
      setViewerError("You must be logged in.");
      return;
    }
    const res = await fetch(
      `/api/rabbithole/contribution-comments/${encodeURIComponent(commentId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body: editingCommentBody }),
      }
    );
    const json = await res.json().catch(() => ({}));
    setCommentBusyId(null);
    if (!res.ok) {
      setViewerError(json?.error ?? "Could not update comment.");
      return;
    }
    setEditingCommentId(null);
    setEditingCommentBody("");
    await loadDetail(viewerUserId);
  }

  async function deleteComment(commentId: string, isAuthor: boolean) {
    if (commentBusyId) return;
    const promptMsg = isAuthor ? "Delete this comment?" : "Remove this comment as a moderator?";
    if (!window.confirm(promptMsg)) return;
    setCommentBusyId(commentId);
    setOpenMenuId(null);
    const token = await withAuthToken();
    if (!token) {
      setCommentBusyId(null);
      setViewerError("You must be logged in.");
      return;
    }
    const res = await fetch(
      `/api/rabbithole/contribution-comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json().catch(() => ({}));
    setCommentBusyId(null);
    if (!res.ok) {
      setViewerError(json?.error ?? "Could not delete comment.");
      return;
    }
    await loadDetail(viewerUserId);
  }

  function openFlag(target: FlagTarget) {
    setFlagTarget(target);
    setFlagCategory("general");
    setFlagError(null);
    setOpenMenuId(null);
  }

  async function submitFlag() {
    if (!flagTarget || flagBusy) return;
    setFlagBusy(true);
    setFlagError(null);
    const token = await withAuthToken();
    if (!token) {
      setFlagBusy(false);
      setFlagError("You must be logged in.");
      return;
    }
    const contentType =
      flagTarget.kind === "contribution"
        ? "rabbithole_contribution"
        : "rabbithole_contribution_comment";
    const res = await fetch("/api/flag-content", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        contentType,
        contentId: flagTarget.id,
        category: flagCategory,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setFlagBusy(false);
    if (!res.ok) {
      setFlagError(json?.error ?? "Could not submit flag.");
      return;
    }
    setFlagTarget(null);
    if (flagTarget.kind === "contribution") {
      // The contribution is now hidden_for_review; bounce the viewer back to the
      // index since the detail view will 404 for non-admin/non-author.
      router.push("/rabbithole");
      return;
    }
    await loadDetail(viewerUserId);
  }

  async function handleOpenShareModal() {
    setShareOpen(true);
    setShareError(null);
    setShareSuccessMessage(null);
    setShareDestinationType("feed");
    setShareDestinationId(null);
    setShareDestinationLabel("");
    setShareQuery("");
    setShareUsers([]);
    setShareUnits([]);
    setShareMessage("");
  }

  useEffect(() => {
    let cancelled = false;
    async function searchDestinations() {
      if (!shareOpen || !viewerUserId) return;
      if (shareDestinationType === "feed") return;
      const q = shareQuery.trim();
      if (q.length < 2) {
        if (!cancelled) {
          setShareUsers([]);
          setShareUnits([]);
        }
        return;
      }

      if (shareDestinationType === "user_wall") {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name, photo_url")
          .or(`display_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
          .limit(12);

        if (cancelled) return;
        const users = (data ?? []).map((row: {
          user_id: string;
          display_name: string | null;
          first_name: string | null;
          last_name: string | null;
          photo_url: string | null;
        }) => ({
          id: row.user_id,
          name: row.display_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Member",
          photoUrl: row.photo_url ?? null,
        }));
        setShareUsers(users);
        return;
      }

      const { data: memberships } = await supabase
        .from("unit_members")
        .select("unit_id")
        .eq("user_id", viewerUserId)
        .eq("status", "approved");
      const unitIds = (memberships ?? []).map((row: { unit_id: string }) => row.unit_id).filter(Boolean);
      if (unitIds.length === 0) {
        if (!cancelled) setShareUnits([]);
        return;
      }

      const { data: units } = await supabase
        .from("units")
        .select("id, name, slug")
        .in("id", unitIds)
        .ilike("name", `%${q}%`)
        .limit(12);
      if (cancelled) return;
      setShareUnits(
        (units ?? []).map((row: { id: string; name: string; slug: string }) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
        }))
      );
    }

    const timeout = setTimeout(() => {
      void searchDestinations();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [shareOpen, shareDestinationType, shareQuery, viewerUserId]);

  async function handleShareSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contribution) return;
    if (shareDestinationType !== "feed" && !shareDestinationId) {
      setShareError("Choose a destination.");
      return;
    }
    setShareBusy(true);
    setShareError(null);
    setShareSuccessMessage(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setShareBusy(false);
      setShareError("You must be logged in.");
      return;
    }

    const res = await fetch(`/api/rabbithole/contributions/${encodeURIComponent(contribution.id)}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        destinationType: shareDestinationType,
        destinationId: shareDestinationType === "feed" ? null : shareDestinationId,
        content: shareMessage,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setShareBusy(false);
    if (!res.ok) {
      setShareError(json?.error ?? "Could not share this contribution.");
      return;
    }

    setShareSuccessMessage("Shared successfully.");
    setShareOpen(false);
    if (json.destinationType === "unit_wall" && json.unitSlug) {
      router.push(`/units/${encodeURIComponent(json.unitSlug)}`);
      return;
    }
    if (json.destinationType === "user_wall" && json.wallUserId) {
      router.push(`/profile/${encodeURIComponent(json.wallUserId)}`);
      return;
    }
    router.push("/");
  }

  if (loading) {
    return (
      <RabbitholeShell title="Loading contribution...">
        <p style={{ color: "#94a3b8" }}>Loading contribution...</p>
      </RabbitholeShell>
    );
  }

  if (!contribution) {
    return (
      <RabbitholeShell title="Contribution not found">
        <p style={{ color: "#94a3b8" }}>This contribution is unavailable.</p>
      </RabbitholeShell>
    );
  }

  const librarySteps = [
    { label: "Rabbithole", href: "/rabbithole" },
    { label: contribution.categoryName, href: `/rabbithole/${contribution.categorySlug}` },
    {
      label: formatContentType(contribution.contentType),
      href: `/rabbithole?contentType=${encodeURIComponent(contribution.contentType)}`,
    },
  ];
  const viewerIsAuthor = !!viewerUserId && viewerUserId === contribution.createdBy;
  const canEdit = viewerIsAuthor;
  const canDelete = viewerIsAuthor || viewerIsAdmin;
  const canFlag = !!viewerUserId && !viewerIsAuthor;
  const embedUrl = contribution.contentType === "video"
    ? youtubeEmbedUrl(contribution.sourceUrl, contribution.metadata)
    : contribution.sourceUrl ?? null;
  const canIframe = contribution.contentType === "video" || contribution.contentType === "article_news" || contribution.contentType === "external_link";

  return (
    <RabbitholeShell title={contribution.title}>
      <BreadcrumbTrail label="Library Path" steps={librarySteps} />
      {tunnelTrail.length > 0 && (
        <BreadcrumbTrail label="Your Tunnel" steps={tunnelTrail.map((step) => ({ label: step }))} />
      )}

      <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 900 }}>{contribution.title}</h1>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <span style={badgeStyle("#0f172a", "#facc15", "#facc15")}>{contribution.categoryName}</span>
        <span style={badgeStyle("rgba(71,85,105,0.2)", "#cbd5e1", "#475569")}>
          {formatContentType(contribution.contentType)}
        </span>
        {contribution.sourceDomain && (
          <span style={badgeStyle("rgba(30,41,59,0.7)", "#94a3b8", "#334155")}>{contribution.sourceDomain}</span>
        )}
      </div>
      <p style={{ marginTop: 0, color: "#cbd5e1", lineHeight: 1.55 }}>{contribution.summary}</p>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={handleOpenShareModal}
          style={{
            border: "none",
            borderRadius: 8,
            background: "#facc15",
            color: "#0f172a",
            fontWeight: 800,
            padding: "7px 12px",
            cursor: "pointer",
          }}
        >
          Share to Feed / Wall / Group
        </button>
        {canEdit && (
          <button type="button" onClick={openEditModal} style={secondaryActionStyle}>
            <Pencil size={14} /> Edit
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={handleDeleteContribution}
            disabled={deleteBusy}
            style={dangerActionStyle(deleteBusy)}
          >
            <Trash2 size={14} />
            {deleteBusy ? "Deleting..." : viewerIsAuthor ? "Delete" : "Remove (admin)"}
          </button>
        )}
        {canFlag && (
          <button
            type="button"
            onClick={() => openFlag({ kind: "contribution", id: contribution.id })}
            style={secondaryActionStyle}
          >
            <Flag size={14} /> Flag
          </button>
        )}
      </div>
      {shareSuccessMessage && <div style={{ color: "#22c55e", marginBottom: 12, fontSize: 13 }}>{shareSuccessMessage}</div>}

      <div
        style={{
          border: "1px solid #334155",
          borderRadius: 12,
          padding: 12,
          marginBottom: 14,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={handleToggleLike}
          disabled={likeBusy}
          style={{
            border: "1px solid #334155",
            borderRadius: 8,
            background: contribution.viewerLiked ? "rgba(244,63,94,0.15)" : "transparent",
            color: contribution.viewerLiked ? "#fb7185" : "#cbd5e1",
            padding: "6px 10px",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: likeBusy ? "default" : "pointer",
          }}
        >
          <Heart size={15} />
          {contribution.likeCount}
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 13 }}>
          <MessageCircle size={15} />
          {comments.length} comments
        </span>
      </div>

      {canIframe && embedUrl && !embedBlocked ? (
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              border: "1px solid #334155",
              borderRadius: 12,
              overflow: "hidden",
              minHeight: 380,
              background: "#0b1220",
            }}
          >
            <iframe
              title={`${contribution.title} source`}
              src={embedUrl}
              style={{ width: "100%", minHeight: 420, border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setEmbedBlocked(true)}
            />
          </div>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: "#94a3b8", fontSize: 12 }}>
              If embedded view is blocked by source policy, use Open Source.
            </span>
            {contribution.sourceUrl && (
              <a
                href={contribution.sourceUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#facc15", fontWeight: 700, textDecoration: "none" }}
              >
                Open Source
              </a>
            )}
          </div>
        </div>
      ) : contribution.sourceUrl ? (
        <div style={{ marginBottom: 14, border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
            Embedded preview unavailable for this source.
          </div>
          <a
            href={contribution.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#facc15", fontWeight: 700, textDecoration: "none" }}
          >
            Open Source
          </a>
        </div>
      ) : null}

      {contribution.tags.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {contribution.tags.map((tag) => (
            <Link
              key={tag}
              href={`/rabbithole?tag=${encodeURIComponent(tag)}`}
              style={{ border: "1px solid #334155", borderRadius: 999, padding: "3px 10px", color: "#cbd5e1", textDecoration: "none", fontSize: 12 }}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {assets.length > 0 && (
        <section style={{ border: "1px solid #334155", borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Attached Assets</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {assets.map((asset) => {
              const href = assetUrls[asset.id];
              const sizeMb = typeof asset.sizeBytes === "number" ? `${(asset.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : null;
              return (
                <div
                  key={asset.id}
                  style={{
                    border: "1px solid #334155",
                    borderRadius: 10,
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {asset.originalFilename ?? "Asset"}
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {[asset.mimeType ?? "unknown type", sizeMb ?? null, asset.accessLevel].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#facc15", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                    >
                      Open
                    </a>
                  ) : (
                    <span style={{ color: "#64748b", fontSize: 12 }}>Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Discussion</h2>
        <form onSubmit={handleCommentSubmit} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a text comment (no GIF/emoji in RabbitHole)."
            rows={3}
            maxLength={1200}
            style={{
              width: "100%",
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f8fafc",
              padding: "8px 10px",
              boxSizing: "border-box",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#64748b", fontSize: 12 }}>{commentBody.length}/1200</span>
            <button
              type="submit"
              disabled={postingComment}
              style={{
                border: "none",
                borderRadius: 8,
                background: postingComment ? "#475569" : "#facc15",
                color: postingComment ? "#e2e8f0" : "#0f172a",
                fontWeight: 800,
                padding: "7px 12px",
                cursor: postingComment ? "default" : "pointer",
              }}
            >
              {postingComment ? "Posting..." : "Comment"}
            </button>
          </div>
        </form>

        {viewerError && <div style={{ color: "#fca5a5", marginBottom: 8, fontSize: 13 }}>{viewerError}</div>}

        {comments.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>No comments yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {comments.map((comment) => {
              const isAuthorOfComment = !!viewerUserId && viewerUserId === comment.authorId;
              const canEditComment = isAuthorOfComment;
              const canDeleteComment = isAuthorOfComment || viewerIsAdmin;
              const canFlagComment = !!viewerUserId && !isAuthorOfComment;
              const showMenu = openMenuId === comment.id;
              const isEditing = editingCommentId === comment.id;
              const isBusy = commentBusyId === comment.id;
              return (
                <article key={comment.id} style={{ borderTop: "1px solid #1e293b", paddingTop: 10, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "#1e293b",
                        color: "#cbd5e1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 800,
                        overflow: "hidden",
                      }}
                    >
                      {comment.authorPhotoUrl ? (
                        <img src={comment.authorPhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        comment.authorName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <strong style={{ fontSize: 13 }}>{comment.authorName}</strong>
                    <span style={{ color: "#64748b", fontSize: 12 }}>{new Date(comment.createdAt).toLocaleString()}</span>
                    {(canEditComment || canDeleteComment || canFlagComment) && !isEditing && (
                      <div style={{ marginLeft: "auto", position: "relative" }}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(showMenu ? null : comment.id)}
                          aria-label="Comment actions"
                          style={{
                            border: "1px solid #1e293b",
                            background: "transparent",
                            color: "#94a3b8",
                            borderRadius: 6,
                            padding: "2px 6px",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {showMenu && (
                          <div
                            role="menu"
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "calc(100% + 4px)",
                              background: "#0b1220",
                              border: "1px solid #334155",
                              borderRadius: 8,
                              padding: 4,
                              zIndex: 20,
                              minWidth: 160,
                              boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
                            }}
                          >
                            {canEditComment && (
                              <button type="button" onClick={() => startEditComment(comment)} style={menuItemStyle}>
                                <Pencil size={13} /> Edit
                              </button>
                            )}
                            {canDeleteComment && (
                              <button
                                type="button"
                                onClick={() => deleteComment(comment.id, isAuthorOfComment)}
                                style={{ ...menuItemStyle, color: "#fca5a5" }}
                                disabled={isBusy}
                              >
                                <Trash2 size={13} />
                                {isAuthorOfComment ? "Delete" : "Remove (admin)"}
                              </button>
                            )}
                            {canFlagComment && (
                              <button
                                type="button"
                                onClick={() => openFlag({ kind: "comment", id: comment.id })}
                                style={menuItemStyle}
                              >
                                <Flag size={13} /> Flag
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <textarea
                        value={editingCommentBody}
                        onChange={(e) => setEditingCommentBody(e.target.value)}
                        rows={3}
                        maxLength={1200}
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid #334155",
                          background: "#0f172a",
                          color: "#f8fafc",
                          padding: "6px 8px",
                          boxSizing: "border-box",
                          resize: "vertical",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditingCommentBody("");
                          }}
                          style={shareGhostButtonStyle}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => saveCommentEdit(comment.id)}
                          disabled={isBusy}
                          style={sharePrimaryButtonStyle(isBusy)}
                        >
                          {isBusy ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: "#d1d5db", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{comment.body}</div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={() => router.push("/rabbithole")}
          style={{ border: "1px solid #334155", background: "transparent", color: "#94a3b8", borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}
        >
          Back to Rabbithole
        </button>
      </div>
      {editOpen && (
        <div role="presentation" onClick={() => !editBusy && setEditOpen(false)} style={modalScrimStyle}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit RabbitHole contribution"
            onClick={(e) => e.stopPropagation()}
            style={modalCardStyle}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: 16 }}>Edit contribution</strong>
              <button type="button" onClick={() => setEditOpen(false)} style={shareGhostButtonStyle} disabled={editBusy}>
                Close
              </button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ display: "grid", gap: 10 }}>
              <label style={shareLabelStyle}>
                Title
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={shareInputStyle}
                  maxLength={200}
                  required
                />
              </label>
              <label style={shareLabelStyle}>
                Summary
                <textarea
                  value={editSummary}
                  onChange={(e) => setEditSummary(e.target.value)}
                  rows={5}
                  style={{ ...shareInputStyle, resize: "vertical" }}
                  required
                />
              </label>
              <label style={shareLabelStyle}>
                Source URL (optional)
                <input
                  value={editSourceUrl}
                  onChange={(e) => setEditSourceUrl(e.target.value)}
                  style={shareInputStyle}
                  placeholder="https://..."
                />
              </label>
              {editError && <div style={{ color: "#fca5a5", fontSize: 13 }}>{editError}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setEditOpen(false)} style={shareGhostButtonStyle} disabled={editBusy}>
                  Cancel
                </button>
                <button type="submit" disabled={editBusy} style={sharePrimaryButtonStyle(editBusy)}>
                  {editBusy ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {flagTarget && (
        <div role="presentation" onClick={() => !flagBusy && setFlagTarget(null)} style={modalScrimStyle}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Flag RabbitHole content"
            onClick={(e) => e.stopPropagation()}
            style={{ ...modalCardStyle, maxWidth: 460 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <strong style={{ fontSize: 16 }}>
                Flag {flagTarget.kind === "contribution" ? "contribution" : "comment"}
              </strong>
              <button type="button" onClick={() => setFlagTarget(null)} style={shareGhostButtonStyle} disabled={flagBusy}>
                Close
              </button>
            </div>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
              Flagged content is hidden pending admin review and the author is notified.
            </p>
            <label style={shareLabelStyle}>
              Reason
              <select
                value={flagCategory}
                onChange={(e) => setFlagCategory(e.target.value as FlagCategory)}
                style={shareInputStyle}
              >
                {FLAG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {FLAG_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>
            {flagError && <div style={{ color: "#fca5a5", fontSize: 13 }}>{flagError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setFlagTarget(null)} style={shareGhostButtonStyle} disabled={flagBusy}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFlag}
                disabled={flagBusy}
                style={{ ...sharePrimaryButtonStyle(flagBusy), background: flagBusy ? "#475569" : "#ef4444", color: "#fff" }}
              >
                {flagBusy ? "Submitting..." : "Submit flag"}
              </button>
            </div>
          </div>
        </div>
      )}
      {shareOpen && (
        <div
          role="presentation"
          onClick={() => setShareOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 10100,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share RabbitHole contribution"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 620,
              borderRadius: 12,
              border: "1px solid #334155",
              background: "#0f172a",
              color: "#f8fafc",
              padding: 16,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 16 }}>Share from RabbitHole</strong>
              <button type="button" onClick={() => setShareOpen(false)} style={shareGhostButtonStyle}>
                Close
              </button>
            </div>
            <div style={{ border: "1px solid #334155", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>Attachment preview</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{contribution.title}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{formatContentType(contribution.contentType)}</div>
            </div>
            <form onSubmit={handleShareSubmit} style={{ display: "grid", gap: 10 }}>
              <label style={shareLabelStyle}>
                Destination
                <select
                  value={shareDestinationType}
                  onChange={(event) => {
                    const next = event.target.value as ShareDestinationType;
                    setShareDestinationType(next);
                    setShareDestinationId(null);
                    setShareDestinationLabel("");
                    setShareQuery("");
                    setShareUsers([]);
                    setShareUnits([]);
                  }}
                  style={shareInputStyle}
                >
                  <option value="feed">Main feed</option>
                  <option value="user_wall">User wall</option>
                  <option value="unit_wall">Group wall</option>
                </select>
              </label>
              {shareDestinationType !== "feed" && (
                <label style={shareLabelStyle}>
                  Search destination
                  <input
                    value={shareQuery}
                    onChange={(event) => setShareQuery(event.target.value)}
                    placeholder={shareDestinationType === "user_wall" ? "Search users..." : "Search groups..."}
                    style={shareInputStyle}
                  />
                </label>
              )}
              {shareDestinationType === "user_wall" && shareUsers.length > 0 && (
                <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {shareUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setShareDestinationId(user.id);
                        setShareDestinationLabel(user.name);
                      }}
                      style={shareResultButtonStyle(shareDestinationId === user.id)}
                    >
                      {user.name}
                    </button>
                  ))}
                </div>
              )}
              {shareDestinationType === "unit_wall" && shareUnits.length > 0 && (
                <div style={{ display: "grid", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                  {shareUnits.map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      onClick={() => {
                        setShareDestinationId(unit.id);
                        setShareDestinationLabel(unit.name);
                      }}
                      style={shareResultButtonStyle(shareDestinationId === unit.id)}
                    >
                      {unit.name}
                    </button>
                  ))}
                </div>
              )}
              {shareDestinationType !== "feed" && shareDestinationId && (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  Selected: <strong style={{ color: "#e2e8f0" }}>{shareDestinationLabel || shareDestinationId}</strong>
                </div>
              )}
              <label style={shareLabelStyle}>
                Post message
                <textarea
                  value={shareMessage}
                  onChange={(event) => setShareMessage(event.target.value)}
                  rows={3}
                  placeholder="Optional message to include with this RabbitHole share..."
                  style={{ ...shareInputStyle, resize: "vertical" }}
                />
              </label>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Shared posts will show a small provenance label: <strong>Shared from RabbitHole</strong>.
              </div>
              {shareError && <div style={{ color: "#fca5a5", fontSize: 13 }}>{shareError}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setShareOpen(false)} style={shareGhostButtonStyle}>
                  Cancel
                </button>
                <button type="submit" disabled={shareBusy} style={sharePrimaryButtonStyle(shareBusy)}>
                  {shareBusy ? "Sharing..." : "Share post"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </RabbitholeShell>
  );
}

function badgeStyle(bg: string, color: string, borderColor: string): React.CSSProperties {
  return {
    fontSize: 11,
    borderRadius: 999,
    padding: "2px 9px",
    fontWeight: 700,
    border: `1px solid ${borderColor}`,
    background: bg,
    color,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}

const shareLabelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
};

const shareInputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #334155",
  borderRadius: 10,
  background: "#0b1220",
  color: "#f8fafc",
  padding: "8px 10px",
  boxSizing: "border-box",
};

function shareResultButtonStyle(active: boolean): React.CSSProperties {
  return {
    border: "1px solid #334155",
    borderRadius: 8,
    background: active ? "rgba(250,204,21,0.2)" : "#0b1220",
    color: active ? "#fef3c7" : "#e2e8f0",
    textAlign: "left",
    padding: "7px 9px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
  };
}

const shareGhostButtonStyle: React.CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 8,
  background: "transparent",
  color: "#94a3b8",
  padding: "7px 11px",
  cursor: "pointer",
  fontWeight: 700,
};

function sharePrimaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: "none",
    borderRadius: 8,
    background: disabled ? "#475569" : "#facc15",
    color: disabled ? "#cbd5e1" : "#0f172a",
    padding: "7px 12px",
    cursor: disabled ? "default" : "pointer",
    fontWeight: 800,
  };
}

const secondaryActionStyle: React.CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 8,
  background: "transparent",
  color: "#cbd5e1",
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
};

function dangerActionStyle(busy: boolean): React.CSSProperties {
  return {
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    background: busy ? "#1f2937" : "rgba(239,68,68,0.12)",
    color: busy ? "#94a3b8" : "#fca5a5",
    padding: "6px 10px",
    cursor: busy ? "default" : "pointer",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
  };
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "transparent",
  border: "none",
  color: "#e2e8f0",
  padding: "6px 10px",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 13,
  borderRadius: 6,
};

const modalScrimStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 10100,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
};

const modalCardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 620,
  borderRadius: 12,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f8fafc",
  padding: 16,
  display: "grid",
  gap: 10,
};
