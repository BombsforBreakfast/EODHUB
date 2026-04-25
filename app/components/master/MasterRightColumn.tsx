"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { useTheme } from "../../lib/ThemeContext";
import {
  BusinessListingRow,
  getBizTypePriority,
  httpsAssetUrl,
  isBizListingTagsMissingColumnError,
  isBizListingTypeMissingColumnError,
  isPermanentlyFeaturedListing,
  normalizeBizListingTypeForListing,
  normalizeUrl,
  OgCard,
  collapsedRailTitleLinkZoom,
  sectionTitleLinkZoom,
  type BizListingType,
} from "./masterShared";
import { BizListingTagsField } from "../biz/BizListingTagsField";
import { BizListingTagChips } from "../biz/BizListingTagChips";
import { coerceTagsFromDb, normalizeBizTagsInput, rememberCustomBizTag } from "../../lib/bizListingTags";

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

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

type Props = {
  userId: string | null;
  memberInteractionAllowedRef: React.MutableRefObject<boolean>;
  onMemberPaywall: () => void;
  onOpenConversation: (peerId: string) => void;
  railState: "expanded" | "collapsed";
  onToggleRail: () => void;
  /** When false, skip Supabase work so the center column can hydrate first (desktop cold load). */
  sideRailsReady: boolean;
};

export default function MasterRightColumn({
  userId,
  memberInteractionAllowedRef,
  onMemberPaywall,
  onOpenConversation,
  railState,
  onToggleRail,
  sideRailsReady,
}: Props) {
  const { t } = useTheme();

  const [desktopConversations, setDesktopConversations] = useState<DesktopConversation[]>([]);

  const [businessListings, setBusinessListings] = useState<BusinessListingRow[]>([]);
  const [bizLoaded, setBizLoaded] = useState(false);
  const [showBizForm, setShowBizForm] = useState(false);
  const [bizUrl, setBizUrl] = useState("");
  const [bizName, setBizName] = useState("");
  const [bizBlurb, setBizBlurb] = useState("");
  const [bizType, setBizType] = useState<BizListingType>("business");
  const [bizOgPreview, setBizOgPreview] = useState<OgPreview | null>(null);
  const [featuredBizBillboardIndex, setFeaturedBizBillboardIndex] = useState(0);
  const [fetchingBizOg, setFetchingBizOg] = useState(false);
  const [submittingBiz, setSubmittingBiz] = useState(false);
  const [bizSubmitSuccess, setBizSubmitSuccess] = useState(false);
  const [bizTags, setBizTags] = useState<string[]>([]);
  const bizOgDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [likedBizIds, setLikedBizIds] = useState<Set<string>>(new Set());
  const [togglingBizLikeFor, setTogglingBizLikeFor] = useState<string | null>(null);

  function blockMemberInteraction(): boolean {
    if (memberInteractionAllowedRef.current) return false;
    onMemberPaywall();
    return true;
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

  const loadBusinessListings = useCallback(async () => {
    const { data, error } = await supabase
      .from("business_listings")
      .select("*")
      .eq("is_approved", true)
      .order("is_featured", { ascending: false })
      .order("business_name", { ascending: true, nullsFirst: false })
      .limit(50);

    if (error) {
      console.error("Business listings load error:", error);
      return;
    }

    setBusinessListings((data ?? []) as BusinessListingRow[]);
    setBizLoaded(true);
  }, []);

  const loadBizLikes = useCallback(async (uid: string) => {
    const { data } = await supabase.from("business_likes").select("business_id").eq("user_id", uid);
    setLikedBizIds(new Set((data ?? []).map((r: { business_id: string }) => r.business_id)));
  }, []);

  const loadDesktopConversations = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, participant_1, participant_2, last_message_at")
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
      .order("last_message_at", { ascending: false });

    if (error || !data) {
      setDesktopConversations([]);
      return;
    }

    const otherIds = data.map((c) => (c.participant_1 === uid ? c.participant_2 : c.participant_1));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .in("user_id", otherIds);
    const profileMap = new Map(
      (profiles ?? []).map((p: { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; photo_url: string | null }) => [
        p.user_id,
        p,
      ])
    );

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
  }, []);

  useEffect(() => {
    if (!sideRailsReady) return;
    loadBusinessListings().catch((e) => console.error(e));
  }, [sideRailsReady, loadBusinessListings]);

  useEffect(() => {
    if (!sideRailsReady) return;
    if (!userId) {
      setDesktopConversations([]);
      return;
    }
    loadBizLikes(userId).catch(() => {});
    loadDesktopConversations(userId).catch((err) => console.error("Desktop conversations load failed:", err));
  }, [sideRailsReady, userId, loadBizLikes, loadDesktopConversations]);

  useEffect(() => {
    if (!sideRailsReady || !userId) return;
    const ch = supabase
      .channel("master-shell-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void loadDesktopConversations(userId);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [sideRailsReady, userId, loadDesktopConversations]);

  useEffect(() => {
    if (!sideRailsReady || !userId) return;
    const ch = supabase
      .channel("master-shell-biz")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_listings" },
        () => {
          void loadBusinessListings();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [sideRailsReady, userId, loadBusinessListings]);

  const featuredBizPool = useMemo(
    () =>
      [...businessListings]
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

  const rotatingFeaturedBusinesses = useMemo(
    () => featuredBizPool.filter((b) => normalizeBizListingTypeForListing(b) === "business"),
    [featuredBizPool]
  );

  const desktopBillboardListing =
    rotatingFeaturedBusinesses.length > 0
      ? rotatingFeaturedBusinesses[featuredBizBillboardIndex % rotatingFeaturedBusinesses.length]
      : null;

  const businessListingsForPane = featuredBizPool
    .filter((b) => !desktopBillboardListing || b.id !== desktopBillboardListing.id)
    .slice(0, 5);

  useEffect(() => {
    if (rotatingFeaturedBusinesses.length <= 1) return;
    const id = window.setInterval(() => {
      setFeaturedBizBillboardIndex((prev) => (prev + 1) % rotatingFeaturedBusinesses.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [rotatingFeaturedBusinesses.length]);

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
      setBizType("business");
      setBizTags([]);
      setBizOgPreview(null);
      setTimeout(() => {
        setBizSubmitSuccess(false);
        setShowBizForm(false);
      }, 3000);
    } finally {
      setSubmittingBiz(false);
    }
  }

  async function handleBizLike(e: React.MouseEvent, bizId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!userId || togglingBizLikeFor === bizId) return;
    if (blockMemberInteraction()) return;
    setTogglingBizLikeFor(bizId);

    const already = likedBizIds.has(bizId);
    if (already) {
      await supabase.from("business_likes").delete().eq("user_id", userId).eq("business_id", bizId);
      setLikedBizIds((prev) => {
        const s = new Set(prev);
        s.delete(bizId);
        return s;
      });
      setBusinessListings((prev) => prev.map((b) => (b.id === bizId ? { ...b, like_count: Math.max(0, (b.like_count ?? 0) - 1) } : b)));
    } else {
      await supabase.from("business_likes").insert({ user_id: userId, business_id: bizId });
      setLikedBizIds((prev) => new Set(prev).add(bizId));
      setBusinessListings((prev) => prev.map((b) => (b.id === bizId ? { ...b, like_count: (b.like_count ?? 0) + 1 } : b)));
    }
    const { count } = await supabase.from("business_likes").select("*", { count: "exact", head: true }).eq("business_id", bizId);
    await supabase.from("business_listings").update({ like_count: count ?? 0 }).eq("id", bizId);

    setTogglingBizLikeFor(null);
  }

  if (railState === "collapsed") {
    return (
      <aside
        style={{
          position: "sticky",
          top: 20,
          height: "calc(100vh - 80px)",
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          background: t.surface,
          color: t.textMuted,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 4px",
          boxSizing: "border-box",
          overflow: "hidden",
          transition: "border-color 140ms ease, background-color 140ms ease",
        }}
      >
        <Link
          href="/sidebar"
          {...collapsedRailTitleLinkZoom}
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            writingMode: "vertical-rl",
            transform: "rotate(180deg) scale(1)",
            textTransform: "uppercase",
            userSelect: "none",
            color: t.text,
            textDecoration: "none",
            display: "block",
            transition: "transform 0.15s ease",
            cursor: "pointer",
          }}
        >
          Sidebars
        </Link>
        <button
          type="button"
          onClick={onToggleRail}
          aria-label="Expand right panel"
          title="Expand right panel"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = t.surfaceHover;
            e.currentTarget.style.borderColor = t.border;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = t.borderLight;
          }}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: `1px solid ${t.borderLight}`,
            background: "transparent",
            color: t.text,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            lineHeight: 1,
          }}
        >
          «
        </button>
        <Link
          href="/businesses"
          {...collapsedRailTitleLinkZoom}
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            writingMode: "vertical-rl",
            transform: "rotate(180deg) scale(1)",
            textTransform: "uppercase",
            userSelect: "none",
            color: t.text,
            textDecoration: "none",
            display: "block",
            transition: "transform 0.15s ease",
            cursor: "pointer",
          }}
        >
          Biz/Orgs/Resources
        </Link>
      </aside>
    );
  }

  return (
    <aside
      style={{
        display: "block",
        position: "sticky",
        top: 20,
        width: "calc(100% + 12px)",
        marginRight: -12,
        maxHeight: "none",
        overflowY: "visible",
        overflowX: "hidden",
        scrollbarGutter: "stable",
      }}
    >
      {/* Messages */}
      <div style={{ border: "1px solid transparent", borderRadius: 16, background: "transparent", padding: 0, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Link
              href="/sidebar"
              {...sectionTitleLinkZoom}
              style={{
                fontSize: 15,
                fontWeight: 900,
                color: t.text,
                textDecoration: "none",
                whiteSpace: "nowrap",
                display: "inline-block",
                transform: "scale(1)",
                transition: "transform 0.15s ease",
                cursor: "pointer",
              }}
            >
              Sidebars
            </Link>
            <a href="/sidebar" style={{ color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
              See all →
            </a>
          </div>
          <button
            type="button"
            onClick={onToggleRail}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = t.surfaceHover;
              e.currentTarget.style.borderColor = t.border;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = t.borderLight;
            }}
            style={{
              border: `1px solid ${t.borderLight}`,
              background: "transparent",
              color: t.textMuted,
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 800,
              cursor: "pointer",
              lineHeight: 1.1,
              flexShrink: 0,
            }}
            aria-label="Collapse right panel"
            title="Collapse right panel"
          >
            Collapse
          </button>
        </div>
        <div style={{ display: "grid", gap: 8, maxHeight: 270, overflowY: "auto", paddingRight: 2 }}>
          {desktopConversations.length === 0 && <div style={{ color: t.textFaint, fontSize: 12 }}>No conversations yet.</div>}
          {desktopConversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onOpenConversation(conv.other_user_id)}
              style={{
                border: `1px solid ${t.border}`,
                background: t.surface,
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
              <div
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  color: t.textMuted,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {conv.last_message_preview || "Start a conversation"}
              </div>
              {conv.unread_count > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: "#b45309", fontWeight: 800 }}>
                  {conv.unread_count > 9 ? "9+" : conv.unread_count} new
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Featured / business */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 14, marginBottom: 10 }}>
          <Link
            href="/businesses"
            {...sectionTitleLinkZoom}
            style={{
              fontSize: 15,
              fontWeight: 900,
              color: t.text,
              textDecoration: "none",
              whiteSpace: "nowrap",
              display: "inline-block",
              transform: "scale(1)",
              transition: "transform 0.15s ease",
              cursor: "pointer",
            }}
          >
            Biz/Orgs/Resources
          </Link>
          <a href="/businesses" style={{ color: "#2563eb", fontWeight: 700, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>
            See all →
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 8, marginBottom: 6 }}>
          <button
            type="button"
            onClick={() => {
              setShowBizForm((p) => !p);
              setBizSubmitSuccess(false);
            }}
            style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
          >
            {showBizForm ? "Cancel" : "Add Biz/Org/Resource \u2192"}
          </button>
        </div>
        <div style={{ marginTop: 10, maxHeight: 430, overflowY: "auto", paddingRight: 2 }}>
          {showBizForm && (
            <div style={{ marginTop: 4, border: `1px solid ${t.border}`, borderRadius: 12, padding: 14, background: t.surface }}>
              {bizSubmitSuccess ? (
                <div style={{ textAlign: "center", padding: "16px 0", color: "#16a34a", fontWeight: 700, fontSize: 14 }}>
                  ✓ Submitted! Our team will review and approve your listing.
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
                    {fetchingBizOg && <div style={{ fontSize: 11, color: t.textFaint, marginTop: 4 }}>Fetching preview...</div>}
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

                  <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 10 }}>Submissions are reviewed by our team before going live.</div>

                  <button
                    type="button"
                    onClick={submitBizListing}
                    disabled={submittingBiz || !bizUrl.trim() || !bizName.trim()}
                    style={{
                      width: "100%",
                      background: "#111",
                      color: "white",
                      border: "none",
                      borderRadius: 10,
                      padding: "10px 0",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: submittingBiz || !bizUrl.trim() || !bizName.trim() ? "not-allowed" : "pointer",
                      opacity: submittingBiz || !bizUrl.trim() || !bizName.trim() ? 0.5 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                    }}
                  >
                    {submittingBiz && <span className="btn-spinner" />}
                    Submit for Review
                  </button>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {desktopBillboardListing &&
            (() => {
              const listing = desktopBillboardListing;
              const displayTitle =
                listing.og_title || listing.business_name || listing.og_site_name || "Business Listing";
              const displayDescription = listing.custom_blurb || listing.og_description || "Visit website";
              const isLiked = likedBizIds.has(listing.id);
              return (
                <div
                  key={`billboard-${listing.id}`}
                  style={{
                    border: `2px solid ${t.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: t.surface,
                  }}
                >
                  <a href={listing.website_url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                    {listing.og_image ? (
                      <img
                        src={httpsAssetUrl(listing.og_image)}
                        alt={displayTitle}
                        style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                      />
                    ) : null}
                    <div style={{ padding: 14, paddingBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#111", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>
                          Featured Spotlight
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>Rotates every 5s</span>
                      </div>
                      <div style={{ fontWeight: 800, lineHeight: 1.3, fontSize: 18 }}>{displayTitle}</div>
                      <div style={{ marginTop: 8, fontSize: 14, color: t.textMuted, lineHeight: 1.5 }}>{displayDescription}</div>
                    </div>
                  </a>
                  <div style={{ padding: "0 14px 8px" }}>
                    <BizListingTagChips tags={coerceTagsFromDb(listing.tags)} />
                  </div>
                  <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted }}>Business</span>
                    <button
                      onClick={(e) => handleBizLike(e, listing.id)}
                      disabled={togglingBizLikeFor === listing.id || !userId}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: userId ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "4px 0",
                        opacity: togglingBizLikeFor === listing.id ? 0.5 : 1,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? t.text : "none"} stroke={t.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{listing.like_count ?? 0}</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          {!bizLoaded && [0, 1, 2].map((i) => <SkeletonCard key={i} />)}
          {bizLoaded && businessListingsForPane.length === 0 && (
            <div style={{ fontSize: 14, color: t.textMuted }}>No featured listings yet.</div>
          )}

          {bizLoaded &&
            businessListingsForPane.map((listing) => {
              const displayTitle = listing.og_title || listing.business_name || listing.og_site_name || "Business Listing";
              const displayDescription = listing.custom_blurb || listing.og_description || "Visit website";
              const isLiked = likedBizIds.has(listing.id);
              return (
                <div
                  key={listing.id}
                  style={{
                    border: `1px solid ${t.border}`,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: t.surface,
                  }}
                >
                  <a href={listing.website_url} target="_blank" rel="noreferrer" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
                    {listing.og_image ? (
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

                  <div style={{ padding: "0 14px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {(listing.is_featured || isPermanentlyFeaturedListing(listing)) ? (
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#111", background: "#fef9c3", padding: "2px 8px", borderRadius: 20 }}>
                          Featured
                        </span>
                      ) : null}
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "capitalize" }}>
                        {normalizeBizListingTypeForListing(listing)}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleBizLike(e, listing.id)}
                      disabled={togglingBizLikeFor === listing.id || !userId}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: userId ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "4px 0",
                        opacity: togglingBizLikeFor === listing.id ? 0.5 : 1,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isLiked ? t.text : "none"} stroke={t.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{listing.like_count ?? 0}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
