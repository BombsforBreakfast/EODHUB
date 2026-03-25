"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";

type Notification = {
  id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  actor_name: string;
  post_owner_id: string | null;
};

type SearchResult = {
  type: "user" | "business" | "job";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  external: boolean;
};

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NavBar() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [userInitial, setUserInitial] = useState<string>("?");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadUnreadMessages(uid: string) {
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false)
      .neq("sender_id", uid)
      .in("conversation_id",
        (await supabase
          .from("conversations")
          .select("id")
          .or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
        ).data?.map((c: { id: string }) => c.id) ?? []
      );
    setUnreadMessages(count ?? 0);
  }

  async function loadNotifications(uid: string) {
    const { data } = await supabase
      .from("notifications")
      .select("id, message, is_read, created_at, actor_name, post_owner_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(20);
    const notifs = (data ?? []) as Notification[];
    setNotifications(notifs);
    setUnreadCount(notifs.filter((n) => !n.is_read).length);
  }

  async function markAllRead() {
    if (!currentUserId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", currentUserId)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  async function handleNotificationClick(n: Notification) {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
      );
    }
    setShowNotifications(false);
    if (n.post_owner_id) {
      window.location.href = `/profile/${n.post_owner_id}`;
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) console.error("Nav auth load error:", error);

      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      setAuthLoaded(true);

      if (uid) {
        const { data } = await supabase
          .from("profiles")
          .select("first_name, display_name")
          .eq("user_id", uid)
          .maybeSingle();
        if (!mounted) return;
        const name = data as { first_name: string | null; display_name: string | null } | null;
        setUserInitial((name?.first_name?.[0] || name?.display_name?.[0] || "?").toUpperCase());
        await loadNotifications(uid);
        await loadUnreadMessages(uid);
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setCurrentUserId(session?.user?.id ?? null);
      setAuthLoaded(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Realtime: new notification comes in → reload
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`nav-notifs-${currentUserId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${currentUserId}`,
      }, () => loadNotifications(currentUserId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  // Realtime: new message comes in → bump unread count
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`nav-messages-${currentUserId}`)
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUserId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showNotifications]);

  async function performSearch(query: string) {
    const q = query.trim();
    if (q.length < 2) { setSearchResults([]); setShowSearchDropdown(false); return; }
    setSearching(true);
    setShowSearchDropdown(true);
    try {
      const [profilesRes, businessesRes, jobsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, display_name, role")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%,role.ilike.%${q}%`).limit(5),
        supabase.from("business_listings").select("id, business_name, og_title, og_site_name, website_url, custom_blurb")
          .eq("is_approved", true)
          .or(`business_name.ilike.%${q}%,og_title.ilike.%${q}%,og_site_name.ilike.%${q}%,custom_blurb.ilike.%${q}%`).limit(5),
        supabase.from("jobs").select("id, title, company_name, location, apply_url")
          .eq("is_approved", true)
          .or(`title.ilike.%${q}%,company_name.ilike.%${q}%,location.ilike.%${q}%`).limit(5),
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

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) { console.error("Logout error:", error); return; }
    window.location.href = "/login";
  }

  const navButton: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #ccc",
    textDecoration: "none",
    fontWeight: 700,
    background: "white",
    color: "black",
  };

  const primaryButton: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    textDecoration: "none",
    fontWeight: 700,
    background: "black",
    color: "white",
  };

  return (
    <div className="nav-root" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30, flexWrap: "wrap", gap: 12 }}>
      {/* Left: avatar + nav links + flame */}
      <div className="nav-left" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Link
          href="/profile"
          className="nav-avatar"
          style={{ width: 38, height: 38, borderRadius: "50%", background: "black", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, textDecoration: "none", flexShrink: 0 }}
        >
          {userInitial}
        </Link>
        {currentUserId && <Link href={`/profile/${currentUserId}`} className="nav-btn" style={navButton}>My Wall</Link>}
        <Link href="/events" className="nav-btn nav-events" style={navButton}>Events</Link>
        <Link href="/" className="nav-btn" style={navButton}>EOD Hub</Link>

        {/* Messages button */}
        {currentUserId && (
          <Link href="/messages" className="nav-btn" style={{ ...navButton, display: "flex", alignItems: "center", gap: 6 }}>
            Messages
            {unreadMessages > 0 && (
              <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", lineHeight: 1 }}>
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </span>
            )}
          </Link>
        )}

        {/* Notifications button — sits right after EOD Hub */}
        {currentUserId && (
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifications((prev) => !prev)}
              className="nav-btn"
              style={{ ...navButton, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              Alerts
              {unreadCount > 0 && (
                <span style={{ background: "#fbbf24", color: "black", borderRadius: 20, minWidth: 18, height: 18, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", lineHeight: 1 }}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div style={{ position: "absolute", top: 46, left: 0, width: 320, background: "white", border: "1px solid #e5e7eb", borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.14)", zIndex: 200, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", fontWeight: 800, fontSize: 15, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#666", fontWeight: 700 }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 380, overflowY: "auto" }}>
                  {notifications.length === 0 && (
                    <div style={{ padding: 20, color: "#888", fontSize: 14, textAlign: "center" }}>No notifications yet.</div>
                  )}
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      style={{ padding: "12px 16px", background: n.is_read ? "white" : "#fef9ec", cursor: "pointer", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 10, alignItems: "flex-start" }}
                    >
                      {!n.is_read && (
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", flexShrink: 0, marginTop: 5 }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600, lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center: search bar */}
      <div ref={searchRef} className="nav-search" style={{ position: "relative", flex: "0 1 340px", minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", border: "1px solid #d1d5db", borderRadius: 10, background: "white", padding: "6px 12px", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => searchQuery.trim().length >= 2 && setShowSearchDropdown(true)}
            placeholder="Search people, jobs, businesses..."
            style={{ border: "none", outline: "none", fontSize: 14, width: "100%", background: "transparent" }}
          />
          {searching && <span style={{ fontSize: 12, color: "#999", flexShrink: 0 }}>...</span>}
        </div>

        {showSearchDropdown && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", zIndex: 300, overflow: "hidden", maxHeight: 420, overflowY: "auto" }}>
            {searchResults.length === 0 && !searching && (
              <div style={{ padding: "16px 16px", fontSize: 14, color: "#888", textAlign: "center" }}>No results found.</div>
            )}

            {(["user", "job", "business"] as const).map((type) => {
              const group = searchResults.filter((r) => r.type === type);
              if (group.length === 0) return null;
              const label = type === "user" ? "People" : type === "job" ? "Jobs" : "Businesses";
              const badge: Record<string, string> = { user: "#dbeafe", job: "#dcfce7", business: "#fef9c3" };
              const badgeText: Record<string, string> = { user: "#1d4ed8", job: "#15803d", business: "#854d0e" };
              return (
                <div key={type}>
                  <div style={{ padding: "8px 14px 4px", fontSize: 11, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
                  {group.map((result) => (
                    <div
                      key={result.id}
                      onClick={() => handleSearchResultClick(result)}
                      style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid #f3f4f6" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
                    >
                      <span style={{ background: badge[type], color: badgeText[type], fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20, flexShrink: 0, textTransform: "uppercase" }}>
                        {type === "user" ? "Person" : type === "job" ? "Job" : "Biz"}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.title}</div>
                        <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.subtitle}</div>
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

      {/* Right: logout */}
      <div className="nav-right" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {!authLoaded ? null : currentUserId ? (
          <button onClick={handleLogout} className="nav-logout" style={{ ...navButton, cursor: "pointer" }}>Log Out</button>
        ) : (
          <Link href="/login" className="nav-logout" style={navButton}>Log In</Link>
        )}
      </div>
    </div>
  );
}
