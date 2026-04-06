"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";
import EodCrabLogo from "./EodCrabLogo";
import { useTheme } from "../lib/ThemeContext";
import { fetchAdminPendingBreakdown, sumAdminPending } from "../lib/adminPendingCounts";

type Notification = {
  id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  actor_name: string;
  post_owner_id: string | null;
};

type SearchResult = {
  type: "user" | "business" | "job" | "unit";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  external: boolean;
};

export default function NavBar() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [userInitial, setUserInitial] = useState<string>("?");
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const [showHub, setShowHub] = useState(false);
  const hubBtnRef = useRef<HTMLButtonElement>(null);
  const hubPanelRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPendingTotal, setAdminPendingTotal] = useState(0);

  /** Mobile: reserve vertical space so fixed nav does not cover page content (height tracks hub/search). */
  const navRootRef = useRef<HTMLDivElement>(null);
  const [mobileNavSpacerPx, setMobileNavSpacerPx] = useState(0);

  /** Mobile breakpoint — EOD Hub menu is a modal only when narrow. */
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);

  // Unread counts derived from notifications
  // Profile badge: notifications that link to a profile (wall activity)
  const unreadProfileNotifs = notifications.filter((n) => !n.is_read && n.post_owner_id !== null).length;
  // Feed badge: notifications that link to the home feed
  const unreadFeedNotifs = notifications.filter((n) => !n.is_read && n.post_owner_id === null).length;

  async function loadUnreadMessages(uid: string) {
    // Skip re-fetch while on messages page — badge is managed locally there
    if (typeof window !== "undefined" && window.location.pathname === "/messages") {
      setUnreadMessages(0);
      return;
    }
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, status")
      .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
      .eq("status", "accepted");
    const acceptedIds = ((convs ?? []) as { id: string }[]).map((c) => c.id);

    let unreadMsgCount = 0;
    if (acceptedIds.length > 0) {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false)
        .neq("sender_id", uid)
        .in("conversation_id", acceptedIds);
      unreadMsgCount = count ?? 0;
    }
    setUnreadMessages(unreadMsgCount);
  }

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from("notifications")
      .select("id, message, is_read, created_at, actor_name, post_owner_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data ?? []) as Notification[]);
  }

  async function markProfileNotifsRead() {
    if (!currentUserId || unreadProfileNotifs === 0) return;
    const ids = notifications.filter((n) => !n.is_read && n.post_owner_id !== null).map((n) => n.id);
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setNotifications((prev) => prev.map((n) => n.post_owner_id !== null ? { ...n, is_read: true } : n));
  }

  async function markFeedNotifsRead() {
    if (!currentUserId || unreadFeedNotifs === 0) return;
    const ids = notifications.filter((n) => !n.is_read && n.post_owner_id === null).map((n) => n.id);
    await supabase.from("notifications").update({ is_read: true }).in("id", ids);
    setNotifications((prev) => prev.map((n) => n.post_owner_id === null ? { ...n, is_read: true } : n));
  }

  async function markMessagesRead() {
    if (!currentUserId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch("/api/mark-messages-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
    setUnreadMessages(0);
  }

  useEffect(() => {
    let mounted = true;

    async function refreshAdminPendingBadge() {
      try {
        const b = await fetchAdminPendingBreakdown(supabase);
        if (mounted) setAdminPendingTotal(sumAdminPending(b));
      } catch {
        if (mounted) setAdminPendingTotal(0);
      }
    }

    async function loadNavProfile(uid: string) {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, display_name, photo_url, is_admin")
        .eq("user_id", uid)
        .maybeSingle();
      if (!mounted) return;
      const row = data as {
        first_name: string | null;
        display_name: string | null;
        photo_url: string | null;
        is_admin: boolean | null;
      } | null;
      setUserInitial((row?.first_name?.[0] || row?.display_name?.[0] || "?").toUpperCase());
      setAvatarPhotoUrl(row?.photo_url?.trim() ? row.photo_url : null);
      if (row?.is_admin) {
        setIsAdmin(true);
        await refreshAdminPendingBadge();
      } else {
        setIsAdmin(false);
        setAdminPendingTotal(0);
      }
    }

    async function loadUser() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.error("Nav auth load error:", error);

      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      setAuthLoaded(true);

      if (uid) {
        await loadNavProfile(uid);
        await loadNotifications(uid);
        await loadUnreadMessages(uid);
      } else {
        setAvatarPhotoUrl(null);
        setIsAdmin(false);
        setAdminPendingTotal(0);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      setAuthLoaded(true);
      if (uid) {
        void loadNavProfile(uid);
        void loadNotifications(uid);
        void loadUnreadMessages(uid);
      } else {
        setAvatarPhotoUrl(null);
        setIsAdmin(false);
        setAdminPendingTotal(0);
        setUserInitial("?");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !isAdmin) return;
    async function tick() {
      try {
        const b = await fetchAdminPendingBreakdown(supabase);
        setAdminPendingTotal(sumAdminPending(b));
      } catch {
        setAdminPendingTotal(0);
      }
    }
    const id = window.setInterval(() => void tick(), 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentUserId, isAdmin]);

  // Messages page signals that all messages were read
  useEffect(() => {
    function onAllRead() { setUnreadMessages(0); }
    window.addEventListener("messages-all-read", onAllRead);
    return () => window.removeEventListener("messages-all-read", onAllRead);
  }, []);

  // Realtime: notifications + messages + conversations — single channel per user
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`nav-live-${currentUserId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${currentUserId}`,
      }, () => loadNotifications(currentUserId))
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, (payload) => {
        const msg = payload.new as { sender_id: string; is_read: boolean };
        if (msg.sender_id !== currentUserId && !msg.is_read) {
          setUnreadMessages((prev) => prev + 1);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
      }, () => {
        loadUnreadMessages(currentUserId);
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "conversations",
      }, () => {
        loadUnreadMessages(currentUserId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  async function performSearch(query: string) {
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); setShowSearchDropdown(false); return; }
    setSearching(true);
    setShowSearchDropdown(true);
    try {
      const [profilesRes, businessesRes, jobsRes, unitsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, display_name, role")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%,role.ilike.%${q}%`).limit(5),
        supabase.from("business_listings").select("id, business_name, og_title, og_site_name, website_url, custom_blurb")
          .eq("is_approved", true)
          .or(`business_name.ilike.%${q}%,og_title.ilike.%${q}%,og_site_name.ilike.%${q}%,custom_blurb.ilike.%${q}%`).limit(5),
        supabase.from("jobs").select("id, title, company_name, location, apply_url")
          .eq("is_approved", true)
          .or(`title.ilike.%${q}%,company_name.ilike.%${q}%,location.ilike.%${q}%`).limit(5),
        supabase.from("units").select("id, name, slug, type, description").ilike("name", `%${q}%`).limit(5),
      ]);

      const results: SearchResult[] = [];

      ((profilesRes.data ?? []) as { user_id: string; first_name: string | null; last_name: string | null; display_name: string | null; role: string | null }[]).forEach((p) => {
        const name = p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "User";
        results.push({ type: "user", id: p.user_id, title: name, subtitle: p.role || "EOD Professional", href: `/profile/${p.user_id}`, external: false });
      });

      ((businessesRes.data ?? []) as { id: string; business_name: string | null; og_title: string | null; og_site_name: string | null; website_url: string; custom_blurb: string | null }[]).forEach((b) => {
        const name = b.business_name || b.og_title || b.og_site_name || "Business";
        results.push({ type: "business", id: b.id, title: name, subtitle: b.custom_blurb || b.website_url, href: b.website_url, external: true });
      });

      ((jobsRes.data ?? []) as { id: string; title: string | null; company_name: string | null; location: string | null; apply_url: string | null }[]).forEach((j) => {
        results.push({ type: "job", id: j.id, title: j.title || "Job Listing", subtitle: [j.company_name, j.location].filter(Boolean).join(" · "), href: j.apply_url || "/", external: !!j.apply_url });
      });

      ((unitsRes.data ?? []) as { id: string; name: string; slug: string; type: string; description: string | null }[]).forEach((u) => {
        results.push({ type: "unit", id: u.id, title: u.name, subtitle: u.description || u.type.replace(/_/g, " "), href: `/units/${u.slug}`, external: false });
      });

      setSearchResults(results);
    } finally { setSearching(false); }
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim()) { setSearchResults([]); setShowSearchDropdown(false); return; }
    searchDebounceRef.current = setTimeout(() => performSearch(value), 350);
  }

  function handleSearchResultClick(result: SearchResult) {
    setShowSearchDropdown(false);
    setSearchQuery("");
    setSearchResults([]);
    if (result.external) { window.open(result.href, "_blank", "noreferrer"); }
    else { window.location.href = result.href; }
  }

  // Close search dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    function sync() {
      setIsNarrowViewport(mq.matches);
    }
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!isNarrowViewport) setShowHub(false);
  }, [isNarrowViewport]);

  useEffect(() => {
    if (!showHub || !isNarrowViewport || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showHub, isNarrowViewport]);

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) { console.error("Logout error:", error); return; }
    setIsAdmin(false);
    setAdminPendingTotal(0);
    window.location.href = "/login";
  }

  const { t } = useTheme();

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");

    function measure() {
      const el = navRootRef.current;
      if (!mq.matches || !el) {
        setMobileNavSpacerPx(0);
        return;
      }
      const rect = el.getBoundingClientRect();
      const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      setMobileNavSpacerPx(Math.ceil(rect.height + mb));
    }

    const ro = new ResizeObserver(() => measure());
    const el = navRootRef.current;
    if (el) ro.observe(el);
    measure();
    mq.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
    };
  }, [showSearchDropdown, authLoaded, currentUserId]);

  const navButton: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: `1px solid ${t.navBorder}`,
    textDecoration: "none",
    fontWeight: 700,
    background: t.navBg,
    color: t.text,
  };

  const badge = (count: number) => (
    <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", lineHeight: 1 }}>
      {count > 9 ? "9+" : count}
    </span>
  );

  return (
    <>
      {/* Mobile: in-flow height matches fixed nav so page content is not covered */}
      <div
        className="nav-mobile-spacer"
        aria-hidden
        style={{
          height: mobileNavSpacerPx,
          flexShrink: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />
      <div
        ref={navRootRef}
        className="nav-root"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30, flexWrap: "wrap", gap: 12 }}
      >
      {/* Left: mobile logo (home) + avatar + nav links */}
      <div className="nav-left" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Link
          href="/"
          className="nav-logo-mobile"
          aria-label="EOD HUB home"
          title="Home"
          style={{ flexShrink: 0, display: "flex", alignItems: "center", textDecoration: "none" }}
        >
          <EodCrabLogo variant="navMobile" />
        </Link>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Link
            href={currentUserId ? `/profile/${currentUserId}` : "/login"}
            className="nav-avatar"
            aria-label="My profile"
            title="My profile"
            onClick={async (e) => {
              setShowHub(false);
              if (!authLoaded) {
                e.preventDefault();
                return;
              }
              if (!currentUserId) return;
              e.preventDefault();
              await markProfileNotifsRead();
              window.location.href = `/profile/${currentUserId}`;
            }}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: t.text,
              color: t.navBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 16,
              border: "none",
              cursor: "pointer",
              padding: 0,
              overflow: "hidden",
              textDecoration: "none",
            }}
          >
            {avatarPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded profile photo URL
              <img src={avatarPhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              userInitial
            )}
          </Link>
          {currentUserId && unreadProfileNotifs > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, zIndex: 2, pointerEvents: "none" }}>
              {badge(unreadProfileNotifs)}
            </span>
          )}
        </div>

        <Link href="/events" className="nav-btn nav-events" style={navButton}>Events</Link>
        <Link href="/units" className="nav-btn nav-units" style={navButton}>Groups</Link>
        <Link href="/directory" className="nav-btn nav-directory" style={navButton}>Directory</Link>

        {currentUserId && isAdmin && (
          <Link
            href="/admin"
            className="nav-btn nav-admin"
            style={{ ...navButton, display: "flex", alignItems: "center", gap: 6 }}
          >
            Admin
            {adminPendingTotal > 0 && badge(adminPendingTotal)}
          </Link>
        )}

        <Link
          href="/"
          onClick={async (e) => { e.preventDefault(); await markFeedNotifsRead(); window.location.href = "/"; }}
          className="nav-btn nav-home"
          style={{ ...navButton, display: "flex", alignItems: "center", gap: 6 }}
        >
          Home
          {unreadFeedNotifs > 0 && badge(unreadFeedNotifs)}
        </Link>

        {/* EOD Hub — mobile only */}
        <button
          ref={hubBtnRef}
          onClick={() => setShowHub((v) => !v)}
          className="nav-btn nav-hub-mobile"
          style={{ ...navButton, cursor: "pointer", alignItems: "center", gap: 6 }}
        >
          EOD Hub
          {(unreadMessages + unreadProfileNotifs + unreadFeedNotifs) > 0 && !showHub && badge(unreadMessages + unreadProfileNotifs + unreadFeedNotifs)}
        </button>

        {/* Messages button */}
        {currentUserId && (
          <a
            href="/messages"
            onClick={async (e) => { e.preventDefault(); await markMessagesRead(); window.location.href = "/messages"; }}
            className="nav-btn nav-messages-btn"
            style={{ ...navButton, display: "flex", alignItems: "center", gap: 6 }}
          >
            Messages
            {unreadMessages > 0 && badge(unreadMessages)}
          </a>
        )}
      </div>

      {/* Brand — desktop only; stacked logo + wordmark */}
      <Link
        href="/"
        className="nav-brand"
        aria-label="EOD HUB home"
        style={{
          textDecoration: "none",
          color: t.text,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          lineHeight: 1,
        }}
      >
        <EodCrabLogo variant="navDesktop" />
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>EOD HUB</div>
      </Link>

      {/* Search bar row */}
      <div className="nav-search-row">
        <div ref={searchRef} className="nav-search" style={{ position: "relative", flex: "0 1 340px", minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.inputBorder}`, borderRadius: 10, background: t.input, padding: "6px 12px", gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery.trim().length >= 2 && setShowSearchDropdown(true)}
              placeholder="Search people, jobs, businesses, events, groups..."
              style={{ border: "none", outline: "none", fontSize: 14, width: "100%", background: "transparent", color: t.text }}
            />
            {searching && <span style={{ fontSize: 12, color: "#999", flexShrink: 0 }}>...</span>}
          </div>

          {showSearchDropdown && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.22)", zIndex: 300, overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
              {searchResults.length === 0 && !searching && (
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 14, color: t.textMuted, textAlign: "center", marginBottom: 10 }}>No results found.</div>
                  <div
                    onClick={() => { setShowSearchDropdown(false); window.location.href = `/units?q=${encodeURIComponent(searchQuery)}`; }}
                    style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, border: `1px dashed ${t.border}`, borderRadius: 10, color: t.text }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = t.surfaceHover)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <span style={{ background: "#ede9fe", color: "#7c3aed", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20, flexShrink: 0, textTransform: "uppercase" }}>Group</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>No group &ldquo;{searchQuery}&rdquo; found</div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>Click to create this group →</div>
                    </div>
                  </div>
                </div>
              )}

              {(["user", "unit", "job", "business"] as const).map((type) => {
                const group = searchResults.filter((r) => r.type === type);
                if (group.length === 0) return null;
                const label = type === "user" ? "People" : type === "job" ? "Jobs" : type === "unit" ? "Groups" : "Businesses";
                const badgeColors: Record<string, string> = { user: "#dbeafe", job: "#dcfce7", business: "#fef9c3", unit: "#ede9fe" };
                const badgeText: Record<string, string> = { user: "#1d4ed8", job: "#15803d", business: "#854d0e", unit: "#7c3aed" };
                const badgeLabel: Record<string, string> = { user: "Person", job: "Job", business: "Biz", unit: "Group" };
                return (
                  <div key={type}>
                    <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 800, color: t.textFaint, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                    {group.map((result) => (
                      <div
                        key={result.id}
                        onClick={() => handleSearchResultClick(result)}
                        style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderTop: `1px solid ${t.borderLight}`, background: t.surface, color: t.text }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = t.surfaceHover)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = t.surface)}
                      >
                        <span style={{ background: badgeColors[type], color: badgeText[type], fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20, flexShrink: 0, textTransform: "uppercase" }}>
                          {badgeLabel[type]}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.title}</div>
                          <div style={{ fontSize: 12, color: t.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.subtitle}</div>
                        </div>
                        {result.external && (
                          <svg style={{ flexShrink: 0, marginLeft: "auto" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: logout */}
      <div className="nav-right" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {!authLoaded ? null : currentUserId ? (
          <>
            <Link
              href="/profile"
              className="nav-btn nav-account-settings"
              aria-label="My account"
              title="My account"
              onClick={() => {
                setShowHub(false);
                setShowSearchDropdown(false);
              }}
              style={{ ...navButton, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 12px" }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c0 .55.22 1.05.59 1.41.37.37.86.59 1.41.59H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <button onClick={handleLogout} className="nav-logout" style={{ ...navButton, cursor: "pointer" }}>Log Out</button>
          </>
        ) : (
          <Link href="/login" className="nav-logout" style={navButton}>Log In</Link>
        )}
      </div>
    </div>

      {typeof document !== "undefined" && isNarrowViewport && showHub
        ? createPortal(
            <div
              className="nav-hub-modal-backdrop"
              role="presentation"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1100,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))",
              }}
              onClick={() => setShowHub(false)}
            >
              <div
                ref={hubPanelRef}
                role="dialog"
                aria-modal="true"
                aria-label="EOD Hub"
                className="nav-hub-modal-sheet"
                style={{
                  width: "100%",
                  maxWidth: 420,
                  maxHeight: "min(88vh, 640px)",
                  overflow: "auto",
                  background: t.surface,
                  borderRadius: 16,
                  border: `1px solid ${t.border}`,
                  boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
                  padding: 16,
                  boxSizing: "border-box",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: t.text }}>EOD Hub</span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setShowHub(false)}
                    style={{
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      border: `1px solid ${t.border}`,
                      background: t.bg,
                      color: t.text,
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="nav-hub-modal-grid">
                  {[
                    { label: "My Profile", href: currentUserId ? `/profile/${currentUserId}` : "/profile", emoji: "👤", badge: unreadProfileNotifs, onNav: markProfileNotifsRead },
                    { label: "Home", href: "/", emoji: "🏠", badge: unreadFeedNotifs, onNav: markFeedNotifsRead },
                    { label: "Jobs", href: "/?tab=jobs", emoji: "💼", badge: 0, onNav: null },
                    { label: "Businesses", href: "/?tab=businesses", emoji: "🏢", badge: 0, onNav: null },
                    { label: "Events", href: "/events", emoji: "📅", badge: 0, onNav: null },
                    { label: "Groups", href: "/units", emoji: "🪖", badge: 0, onNav: null },
                    { label: "Directory", href: "/directory", emoji: "📋", badge: 0, onNav: null },
                    ...(isAdmin
                      ? [{ label: "Admin", href: "/admin", emoji: "🛡️", badge: adminPendingTotal, onNav: null as (() => Promise<void>) | null }]
                      : []),
                    { label: "Messages", href: "/messages", emoji: "💬", badge: unreadMessages, onNav: markMessagesRead },
                  ].map((item) => (
                    <a
                      key={item.label}
                      href={item.href}
                      onClick={async (e) => {
                        e.preventDefault();
                        setShowHub(false);
                        if (item.onNav) await item.onNav();
                        window.location.href = item.href;
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, border: `1px solid ${t.border}`, textDecoration: "none", color: t.text, fontWeight: 700, fontSize: 14, background: t.bg }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1 }}>{item.emoji}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge > 0 && badge(item.badge)}
                    </a>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
