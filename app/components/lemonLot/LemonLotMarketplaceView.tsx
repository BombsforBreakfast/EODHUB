"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LemonLotListingCard from "@/app/components/lemonLot/LemonLotListingCard";
import { useTheme } from "@/app/lib/ThemeContext";
import { supabase } from "@/app/lib/lib/supabaseClient";
import {
  displayListingDescription,
  displayListingTitle,
  isPubliclyLive,
  listingMatchesLemonLotKeyword,
  LEMON_LOT_CATEGORIES,
  lemonLotListingUrl,
  listingDetailImageUrls,
  parsePriceFilterNumber,
  type LemonLotCategoryId,
  type MarketplaceListingRow,
} from "@/app/lib/lemonLot";
import { useViewerGate } from "@/app/hooks/useRequireFullAccess";
import { postNotifyJson } from "@/app/lib/postNotifyClient";
import FeedImageGalleryModal from "@/app/components/FeedImageGalleryModal";

const LemonLotComposer = dynamic(() => import("@/app/components/lemonLot/LemonLotComposer"), {
  ssr: false,
  loading: () => (
    <div style={{ marginBottom: 24, padding: 18, borderRadius: 14, border: "1px dashed rgba(128,128,128,0.35)" }}>
      <div style={{ height: 18, width: 140, borderRadius: 4, background: "rgba(128,128,128,0.12)" }} />
      <div style={{ marginTop: 14, height: 120, borderRadius: 8, background: "rgba(128,128,128,0.08)" }} />
    </div>
  ),
});

const THIRTY_DAYS_MS = 30 * 86400000;
const LEMON_LOT_INITIAL_LIMIT = 50;
const LEMON_LOT_LISTING_COLUMNS =
  "id, user_id, listing_mode, category, subcategory, title, description, manual_notes, price, location, mileage, external_url, og_title, og_description, og_image, og_site_name, gallery_images, status, expires_at, created_at, updated_at, approved, featured, tags";

function expiryIsoFromNow(): string {
  return new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
}

function rowPriceNumber(price: string | null): number | null {
  if (!price) return null;
  return parsePriceFilterNumber(price);
}

export type LemonLotMarketplaceVariant = "page" | "embedded";

type Props = { variant?: LemonLotMarketplaceVariant };

export function LemonLotMarketplaceView({ variant = "page" }: Props) {
  const { t, isDark } = useTheme();
  const viewerGate = useViewerGate();
  const [listLoading, setListLoading] = useState(true);
  const [rows, setRows] = useState<MarketplaceListingRow[]>([]);
  const [profilesByUser, setProfilesByUser] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(viewerGate?.userId ?? null);
  const [myName, setMyName] = useState(viewerGate?.displayName ?? "Someone");

  const [keyword, setKeyword] = useState("");
  const [filterCategory, setFilterCategory] = useState<LemonLotCategoryId | "">("");
  const [locationQ, setLocationQ] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<"newest" | "priceAsc" | "priceDesc">("newest");

  const [showComposer, setShowComposer] = useState(false);
  const [composerEditRow, setComposerEditRow] = useState<MarketplaceListingRow | null>(null);

  const [detail, setDetail] = useState<MarketplaceListingRow | null>(null);
  const [galleryLightbox, setGalleryLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [contactingId, setContactingId] = useState<string | null>(null);
  const [relistingId, setRelistingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const loadRowsSeqRef = useRef(0);

  const loadRows = useCallback(async (uid: string | null) => {
    const seq = ++loadRowsSeqRef.current;
    const nowIso = new Date().toISOString();
    setListLoading(true);
    let q = supabase.from("marketplace_listings").select(LEMON_LOT_LISTING_COLUMNS);
    if (uid) {
      q = q.or(`user_id.eq.${uid},and(status.eq.active,approved.eq.true,expires_at.gt.${nowIso})`);
    } else {
      q = q.eq("status", "active").eq("approved", true).gt("expires_at", nowIso);
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(LEMON_LOT_INITIAL_LIMIT);
    if (error) {
      console.error("Lemon Lot load:", error);
      if (seq !== loadRowsSeqRef.current) return;
      setRows([]);
      setProfilesByUser({});
      setListLoading(false);
      return;
    }
    const list = (data ?? []) as MarketplaceListingRow[];
    if (seq !== loadRowsSeqRef.current) return;
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length === 0) {
      if (seq !== loadRowsSeqRef.current) return;
      setProfilesByUser({});
      setListLoading(false);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name")
      .in("user_id", ids);
    const map: Record<string, string> = {};
    ((profs ?? []) as { user_id: string; display_name: string | null; first_name: string | null; last_name: string | null }[]).forEach((p) => {
      const n = p.display_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      map[p.user_id] = n || "Member";
    });
    if (seq !== loadRowsSeqRef.current) return;
    setProfilesByUser(map);
    setListLoading(false);
  }, []);

  useEffect(() => {
    if (viewerGate) {
      setUserId(viewerGate.userId);
      setMyName(viewerGate.displayName);
      void loadRows(viewerGate.userId);
      return;
    }
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      if (!uid) return;
      setUserId(uid);
      void loadRows(uid);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      const p = profile as { display_name: string | null; first_name: string | null; last_name: string | null } | null;
      const n = p?.display_name?.trim() || [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      setMyName(n || "You");
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerGate, loadRows]);

  useEffect(() => {
    const id = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("listing");
    if (!id || rows.length === 0) return;
    const hit = rows.find((r) => r.id === id);
    if (hit) setDetail(hit);
  }, [rows]);

  const filtered = useMemo(() => {
    const loc = locationQ.trim().toLowerCase();
    const minN = parsePriceFilterNumber(priceMin);
    const maxN = parsePriceFilterNumber(priceMax);
    let list = rows.filter((r) => {
      if (filterCategory && r.category !== filterCategory) return false;
      if (loc && !(r.location ?? "").toLowerCase().includes(loc)) return false;
      const pn = rowPriceNumber(r.price);
      if (minN != null && (pn == null || pn < minN)) return false;
      if (maxN != null && (pn == null || pn > maxN)) return false;
      if (!listingMatchesLemonLotKeyword(keyword, r)) return false;
      return true;
    });
    if (sort === "newest") {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === "priceAsc") {
      list = [...list].sort((a, b) => (rowPriceNumber(a.price) ?? Infinity) - (rowPriceNumber(b.price) ?? Infinity));
    } else {
      list = [...list].sort((a, b) => (rowPriceNumber(b.price) ?? -Infinity) - (rowPriceNumber(a.price) ?? -Infinity));
    }
    return list;
  }, [rows, keyword, filterCategory, locationQ, priceMin, priceMax, sort]);

  function closeComposer() {
    setShowComposer(false);
    setComposerEditRow(null);
  }

  function openComposer(editRow: MarketplaceListingRow | null = null) {
    setComposerEditRow(editRow);
    setShowComposer(true);
  }

  async function contactSeller(listing: MarketplaceListingRow) {
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (listing.user_id === userId) return;
    setContactingId(listing.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/sidebar/ensure-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ other_user_id: listing.user_id }),
      });
      const json = (await res.json()) as { conversation_id?: string; error?: string };
      if (!res.ok || !json.conversation_id) throw new Error(json.error ?? "Could not open conversation");
      const origin = window.location.origin;
      const link = lemonLotListingUrl(origin, listing.id);
      const snippet = (displayListingDescription(listing) ?? "").slice(0, 140);
      const head = `Lemon Lot — ${displayListingTitle(listing)}`;
      const meta = [listing.price, listing.location].filter(Boolean).join(" · ");
      const body = [head, meta || null, snippet || null, link].filter(Boolean).join("\n");
      const { data: insertedMessage, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: json.conversation_id,
          sender_id: userId,
          content: body,
        })
        .select("id")
        .single();
      if (msgErr) throw msgErr;
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", json.conversation_id);
      await postNotifyJson(supabase, {
        user_id: listing.user_id,
        actor_name: myName,
        post_owner_id: userId,
        type: "message_received",
        category: "message",
        entity_type: "thread",
        entity_id: json.conversation_id,
        parent_entity_type: "message",
        parent_entity_id: insertedMessage?.id ?? null,
        message: `${myName} sent you a message`,
        link: "/sidebar",
        group_key: `thread:${json.conversation_id}:messages`,
        dedupe_key: null,
        metadata: { conversation_id: json.conversation_id },
      });
      try {
        sessionStorage.setItem("eod_sidebar_pending_conv", json.conversation_id);
      } catch {
        /* ignore */
      }
      window.location.href = "/sidebar";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Contact failed");
    } finally {
      setContactingId(null);
    }
  }

  async function relist(id: string) {
    if (!userId) return;
    setRelistingId(id);
    try {
      const { error } = await supabase
        .from("marketplace_listings")
        .update({ expires_at: expiryIsoFromNow(), status: "active" })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      await loadRows(userId);
      setDetail(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Relist failed");
    } finally {
      setRelistingId(null);
    }
  }

  async function removeListing(id: string) {
    if (!userId) return;
    if (!window.confirm("Permanently delete this listing?")) return;
    setRemovingId(id);
    try {
      const { error } = await supabase.from("marketplace_listings").delete().eq("id", id).eq("user_id", userId);
      if (error) throw error;
      await loadRows(userId);
      setDetail(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRemovingId(null);
    }
  }

  const inputStyle = useMemo(
    () =>
      ({
        width: "100%",
        boxSizing: "border-box" as const,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${t.inputBorder}`,
        background: t.input,
        color: t.text,
        fontSize: 14,
        outline: "none",
      }) as const,
    [t.input, t.inputBorder, t.text],
  );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        background: t.bg,
        color: t.text,
        padding: variant === "embedded" ? "8px 0 32px" : "20px 12px 40px",
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: -0.02 }}>Lemon Lot</h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: t.textMuted, lineHeight: 1.55, maxWidth: 640 }}>
          Community classifieds — PCS gear, housing, vehicles, services, and more. Listings expire after 30 days (relist anytime).
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => {
            if (!userId) {
              window.location.href = "/login";
              return;
            }
            if (showComposer) closeComposer();
            else openComposer(null);
          }}
          style={{
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: "#111827",
            color: "#fff",
            fontWeight: 800,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {showComposer ? "Close form" : "+ Post listing"}
        </button>
      </div>

      {showComposer && userId ? (
        <LemonLotComposer
          key={composerEditRow?.id ?? "new"}
          userId={userId}
          editRow={composerEditRow}
          onClose={closeComposer}
          onSaved={() => {
            closeComposer();
            void loadRows(userId);
          }}
        />
      ) : null}

      <section
        style={{
          marginBottom: 18,
          padding: 14,
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: isDark ? "rgba(22,24,28,0.35)" : t.surface,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ width: "100%", minWidth: 0 }}>
            <label htmlFor="lemon-lot-search" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>
              Search
            </label>
            <input
              id="lemon-lot-search"
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search title, tags, description…"
              autoComplete="off"
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            />
            <p style={{ margin: "6px 0 0", fontSize: 11, fontWeight: 600, color: t.textFaint, lineHeight: 1.4 }}>
              Matches as you type across title, tags, and listing text (multiple words narrow results).
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gap: 10,
              width: "100%",
              minWidth: 0,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lemon-lot-cat" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>
                Category
              </label>
              <select
                id="lemon-lot-cat"
                value={filterCategory}
                onChange={(e) => setFilterCategory((e.target.value || "") as LemonLotCategoryId | "")}
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              >
                <option value="">All categories</option>
                {LEMON_LOT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lemon-lot-loc" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>
                Location contains
              </label>
              <input
                id="lemon-lot-loc"
                value={locationQ}
                onChange={(e) => setLocationQ(e.target.value)}
                placeholder="City, state, base…"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lemon-lot-min" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>
                Min price
              </label>
              <input
                id="lemon-lot-min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <label htmlFor="lemon-lot-max" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>
                Max price
              </label>
              <input
                id="lemon-lot-max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="Any"
                inputMode="decimal"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <div style={{ width: "100%", maxWidth: 320, minWidth: 0 }}>
            <label htmlFor="lemon-lot-sort" style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>
              Sort
            </label>
            <select
              id="lemon-lot-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            >
              <option value="newest">Newest</option>
              <option value="priceAsc">Price ↑</option>
              <option value="priceDesc">Price ↓</option>
            </select>
          </div>
        </div>
      </section>

      {listLoading && rows.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: t.textMuted, border: `1px dashed ${t.border}`, borderRadius: 14 }}>
          Loading Lemon Lot listings…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: t.textMuted, border: `1px dashed ${t.border}`, borderRadius: 14 }}>
          No listings match these filters yet. Be the first to post.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {filtered.map((row) => (
            <LemonLotListingCard
              key={row.id}
              row={row}
              sellerLabel={profilesByUser[row.user_id] ?? "Member"}
              currentUserId={userId}
              onOpen={() => setDetail(row)}
              onContact={() => void contactSeller(row)}
              onRelist={() => void relist(row.id)}
              onRemove={() => void removeListing(row.id)}
              onEdit={userId === row.user_id ? () => openComposer(row) : undefined}
              contacting={contactingId === row.id}
              relisting={relistingId === row.id}
              removing={removingId === row.id}
            />
          ))}
        </div>
      )}

      {detail && (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 12000,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            boxSizing: "border-box",
          }}
          onClick={() => {
            setGalleryLightbox(null);
            setDetail(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflow: "auto",
              borderRadius: 14,
              background: t.surface,
              border: `1px solid ${t.border}`,
              padding: 18,
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{displayListingTitle(detail)}</h2>
              <button
                type="button"
                onClick={() => {
                  setGalleryLightbox(null);
                  setDetail(null);
                }}
                style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: t.textMuted }}
              >
                ×
              </button>
            </div>
            {(() => {
              const gUrls = listingDetailImageUrls(detail);
              if (gUrls.length === 0) return null;
              return (
                <div style={{ marginTop: 0, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: t.textMuted, marginBottom: 8 }}>Photos — tap to enlarge</div>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                    {gUrls.map((u, i) => (
                      <button
                        key={`${u}-${i}`}
                        type="button"
                        onClick={() => setGalleryLightbox({ urls: gUrls, index: i })}
                        style={{
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          flexShrink: 0,
                          borderRadius: 8,
                          overflow: "hidden",
                          background: "transparent",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt="" style={{ width: 112, height: 80, objectFit: "cover", display: "block" }} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {displayListingDescription(detail) ? (
              <p style={{ fontSize: 14, lineHeight: 1.55, color: t.textMuted, marginTop: 0 }}>{displayListingDescription(detail)}</p>
            ) : null}
            {detail.external_url ? (
              <a href={detail.external_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, fontWeight: 700, color: "#2563eb" }}>
                Open website →
              </a>
            ) : null}
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
              {userId === detail.user_id ? (
                <button
                  type="button"
                  onClick={() => {
                    openComposer(detail);
                    setDetail(null);
                  }}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${t.border}`,
                    fontWeight: 800,
                    cursor: "pointer",
                    background: t.surface,
                    color: t.text,
                  }}
                >
                  Edit listing
                </button>
              ) : null}
              {userId && detail.user_id !== userId && isPubliclyLive(detail) ? (
                <button
                  type="button"
                  onClick={() => void contactSeller(detail)}
                  disabled={contactingId === detail.id}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "#111827",
                    color: "#fff",
                    fontWeight: 800,
                    cursor: contactingId === detail.id ? "wait" : "pointer",
                  }}
                >
                  Contact
                </button>
              ) : null}
              {userId === detail.user_id && !isPubliclyLive(detail) && detail.status === "active" ? (
                <button type="button" onClick={() => void relist(detail.id)} disabled={relistingId === detail.id} style={{ padding: "12px 16px", borderRadius: 10, border: `1px solid ${t.border}`, fontWeight: 800, cursor: relistingId === detail.id ? "wait" : "pointer" }}>
                  Relist 30 days
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <FeedImageGalleryModal
        open={!!galleryLightbox}
        images={galleryLightbox?.urls ?? []}
        index={galleryLightbox?.index ?? 0}
        onClose={() => setGalleryLightbox(null)}
        onPrev={() =>
          setGalleryLightbox((lb) =>
            lb
              ? {
                  urls: lb.urls,
                  index: (lb.index - 1 + lb.urls.length) % lb.urls.length,
                }
              : null,
          )
        }
        onNext={() =>
          setGalleryLightbox((lb) =>
            lb
              ? {
                  urls: lb.urls,
                  index: (lb.index + 1) % lb.urls.length,
                }
              : null,
          )
        }
      />
    </div>
  );
}
