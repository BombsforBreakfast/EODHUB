"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LemonLotListingCard from "@/app/components/lemonLot/LemonLotListingCard";
import { useTheme } from "@/app/lib/ThemeContext";
import { supabase } from "@/app/lib/lib/supabaseClient";
import {
  coerceGalleryImages,
  coerceListingTags,
  displayListingDescription,
  displayListingTitle,
  isPubliclyLive,
  listingMatchesLemonLotKeyword,
  LEMON_LOT_BADGE_OPTIONS,
  LEMON_LOT_CATEGORIES,
  lemonLotListingUrl,
  listingDetailImageUrls,
  parsePriceFilterNumber,
  type LemonLotCategoryId,
  type MarketplaceListingRow,
} from "@/app/lib/lemonLot";
import { postNotifyJson } from "@/app/lib/postNotifyClient";
import { prepareImageUploadFile } from "@/app/lib/prepareUploadFile";
import { validateImagePick } from "@/app/lib/uploadLimits";

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

type GalleryEntry = { type: "url"; url: string } | { type: "file"; file: File; preview: string };

function extFromFile(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

/** Returns canonical http(s) URL string, or null if the field is not a usable public URL yet. */
function normalizeWebsiteUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function plainPreviewSnippet(s: string, maxLen: number): string {
  const t = s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= maxLen ? t : `${t.slice(0, maxLen)}…`;
}

export type LemonLotMarketplaceVariant = "page" | "embedded";

type Props = { variant?: LemonLotMarketplaceVariant };

export function LemonLotMarketplaceView({ variant = "page" }: Props) {
  const { t, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MarketplaceListingRow[]>([]);
  const [profilesByUser, setProfilesByUser] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState("Someone");

  const [keyword, setKeyword] = useState("");
  const [filterCategory, setFilterCategory] = useState<LemonLotCategoryId | "">("");
  const [formCategory, setFormCategory] = useState<LemonLotCategoryId>("misc");
  const [locationQ, setLocationQ] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<"newest" | "priceAsc" | "priceDesc">("newest");

  const [showComposer, setShowComposer] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [scrapedOgImage, setScrapedOgImage] = useState<string | null>(null);
  const [fetchingOg, setFetchingOg] = useState(false);
  const [ogErr, setOgErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [mileage, setMileage] = useState("");
  const [ogSiteName, setOgSiteName] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [tagsSel, setTagsSel] = useState<Set<string>>(() => new Set());
  const [galleryEntries, setGalleryEntries] = useState<GalleryEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const [detail, setDetail] = useState<MarketplaceListingRow | null>(null);
  const [galleryLightbox, setGalleryLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  /** When set, next publish updates this row instead of inserting. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contactingId, setContactingId] = useState<string | null>(null);
  const [relistingId, setRelistingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const loadRowsSeqRef = useRef(0);

  const loadRows = useCallback(async (uid: string | null) => {
    const seq = ++loadRowsSeqRef.current;
    const nowIso = new Date().toISOString();
    setLoading(true);
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
      setLoading(false);
      return;
    }
    const list = (data ?? []) as MarketplaceListingRow[];
    if (seq !== loadRowsSeqRef.current) return;
    setRows(list);
    const ids = [...new Set(list.map((r) => r.user_id))];
    if (ids.length === 0) {
      if (seq !== loadRowsSeqRef.current) return;
      setProfilesByUser({});
      setLoading(false);
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
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      void loadRows(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        void loadRows(uid);
        void (async () => {
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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRows]);

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

  const resolvedWebsiteUrl = useMemo(() => normalizeWebsiteUrlInput(websiteUrl), [websiteUrl]);

  useEffect(() => {
    if (!showComposer || !userId) return;
    if (!resolvedWebsiteUrl) {
      setFetchingOg(false);
      setOgErr(null);
      setScrapedOgImage(null);
      setOgSiteName("");
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setFetchingOg(true);
        setOgErr(null);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) {
            if (!cancelled) {
              setFetchingOg(false);
              setOgErr("Sign in to load a website preview.");
            }
            return;
          }
          const res = await fetch("/api/preview-url", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url: resolvedWebsiteUrl }),
          });
          const json = (await res.json()) as {
            title?: string | null;
            description?: string | null;
            image?: string | null;
            siteName?: string | null;
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok) throw new Error(json.error || "Preview failed");
          setTitle(json.title ?? "");
          setDescription(json.description ?? "");
          setScrapedOgImage(json.image ?? null);
          setOgSiteName(json.siteName ?? "");
          setOgErr(null);
        } catch (e) {
          if (cancelled) return;
          setOgErr(e instanceof Error ? e.message : "Could not load preview");
          setScrapedOgImage(null);
          setOgSiteName("");
        } finally {
          if (!cancelled) setFetchingOg(false);
        }
      })();
    }, 550);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [resolvedWebsiteUrl, showComposer, userId]);

  function resetComposerState() {
    setGalleryEntries((prev) => {
      for (const e of prev) {
        if (e.type === "file") URL.revokeObjectURL(e.preview);
      }
      return [];
    });
    setEditingId(null);
    setWebsiteUrl("");
    setScrapedOgImage(null);
    setOgSiteName("");
    setTitle("");
    setDescription("");
    setPrice("");
    setLocation("");
    setMileage("");
    setSubcategory("");
    setFormCategory("misc");
    setTagsSel(new Set());
    setOgErr(null);
    setFormErr(null);
  }

  async function resolveGalleryEntriesToUrls(uid: string, entries: GalleryEntry[]): Promise<string[]> {
    const out: string[] = [];
    for (const e of entries) {
      if (e.type === "url") {
        out.push(e.url);
        continue;
      }
      const prepared = await prepareImageUploadFile(e.file);
      if (!prepared.ok) throw new Error(prepared.error);
      const file = prepared.file;
      const ext = extFromFile(file);
      const path = `lemon-lot/${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("feed-images").upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
      out.push(data.publicUrl);
    }
    return out.slice(0, 10);
  }

  function populateFormFromRow(row: MarketplaceListingRow) {
    setEditingId(row.id);
    setFormCategory((row.category as LemonLotCategoryId) || "misc");
    setSubcategory(row.subcategory ?? "");
    setTitle(row.title ?? "");
    setDescription(row.description ?? "");
    setPrice(row.price ?? "");
    setLocation(row.location ?? "");
    setMileage(row.mileage != null ? String(row.mileage) : "");
    setOgSiteName(row.og_site_name ?? "");
    setWebsiteUrl(row.external_url ?? "");
    setScrapedOgImage(row.og_image?.trim() || null);
    setGalleryEntries((prev) => {
      for (const e of prev) {
        if (e.type === "file") URL.revokeObjectURL(e.preview);
      }
      return coerceGalleryImages(row.gallery_images).map((u) => ({ type: "url" as const, url: u }));
    });
    setTagsSel(new Set(coerceListingTags(row.tags)));
    setFormErr(null);
    setShowComposer(true);
  }

  function onPickGalleryPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (picked.length === 0) return;
    for (const f of picked) {
      const err = validateImagePick(f);
      if (err) {
        setFormErr(err);
        return;
      }
    }
    setFormErr(null);
    setGalleryEntries((prev) => {
      const next = [...prev];
      for (const f of picked) {
        if (next.length >= 10) break;
        next.push({ type: "file", file: f, preview: URL.createObjectURL(f) });
      }
      return next;
    });
  }

  function removeGalleryAt(index: number) {
    setGalleryEntries((prev) => {
      const e = prev[index];
      if (e?.type === "file") URL.revokeObjectURL(e.preview);
      return prev.filter((_, j) => j !== index);
    });
  }

  async function submitListing() {
    setFormErr(null);
    if (!userId) {
      window.location.href = "/login";
      return;
    }
    if (!title.trim() || !description.trim()) {
      setFormErr("Title and description are required.");
      return;
    }
    const tags = coerceListingTags([...tagsSel]);
    setSubmitting(true);
    try {
      const galleryUrls = await resolveGalleryEntriesToUrls(userId, galleryEntries);
      const base = {
        listing_mode: "native" as const,
        category: formCategory,
        subcategory: subcategory.trim() || null,
        title: title.trim(),
        description: description.trim() || null,
        manual_notes: null,
        price: price.trim() || null,
        location: location.trim() || null,
        mileage: (() => {
          if (!mileage.trim()) return null;
          const n = Number.parseInt(mileage, 10);
          return Number.isFinite(n) ? n : null;
        })(),
        external_url: websiteUrl.trim() || null,
        og_title: null,
        og_description: null,
        og_image: scrapedOgImage?.trim() || null,
        og_site_name: websiteUrl.trim() ? ogSiteName.trim() || null : null,
        gallery_images: galleryUrls,
        tags,
      };
      if (editingId) {
        const patch: Record<string, unknown> = { ...base };
        const { error } = await supabase
          .from("marketplace_listings")
          .update(patch)
          .eq("id", editingId)
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
      } else {
        const row = {
          user_id: userId,
          ...base,
          status: "active" as const,
          expires_at: expiryIsoFromNow(),
          approved: true,
          featured: false,
        };
        const { error } = await supabase.from("marketplace_listings").insert(row);
        if (error) throw new Error(error.message);
      }
      setShowComposer(false);
      resetComposerState();
      await loadRows(userId);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
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
            setShowComposer((v) => {
              const next = !v;
              if (!next) resetComposerState();
              else setFormErr(null);
              return next;
            });
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

      {showComposer && userId && (
        <section
          style={{
            marginBottom: 24,
            padding: 18,
            borderRadius: 14,
            border: `1px solid ${t.border}`,
            background: isDark ? "rgba(22,24,28,0.55)" : t.surface,
          }}
        >
          <h2 style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 900, color: t.text, letterSpacing: -0.02 }}>
            {editingId ? "Edit listing" : "Post a listing"}
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Website (optional)</label>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com/your-listing"
              style={{ ...inputStyle, width: "100%" }}
            />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
              When this looks like a full web address, a preview loads automatically (title, description, and image when available).
            </p>
            {resolvedWebsiteUrl ? (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  border: `1px solid ${t.border}`,
                  background: isDark ? "rgba(0,0,0,0.25)" : t.badgeBg,
                  padding: 12,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint, marginBottom: 8, wordBreak: "break-all" }}>{resolvedWebsiteUrl}</div>
                {fetchingOg ? (
                  <div style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>Loading preview…</div>
                ) : null}
                {ogErr ? <div style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{ogErr}</div> : null}
                {!fetchingOg && !ogErr ? (
                  scrapedOgImage || title.trim() || description.trim() || ogSiteName ? (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    {scrapedOgImage && galleryEntries.length === 0 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={scrapedOgImage}
                        alt=""
                        style={{
                          width: 120,
                          height: 72,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: `1px solid ${t.border}`,
                          flexShrink: 0,
                        }}
                      />
                    ) : null}
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      {ogSiteName ? (
                        <div style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, textTransform: "uppercase", letterSpacing: 0.04 }}>{ogSiteName}</div>
                      ) : null}
                      {title.trim() ? (
                        <div style={{ fontSize: 15, fontWeight: 900, color: t.text, marginTop: 4, lineHeight: 1.3 }}>{title}</div>
                      ) : (
                        <div style={{ fontSize: 13, color: t.textMuted, marginTop: 4 }}>No title returned for this URL.</div>
                      )}
                      {description.trim() ? (
                        <div style={{ fontSize: 13, color: t.textMuted, marginTop: 8, lineHeight: 1.45 }}>{plainPreviewSnippet(description, 220)}</div>
                      ) : null}
                    </div>
                  </div>
                  ) : (
                    <div style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
                      Loaded the page, but no title, description, or preview image was found.
                    </div>
                  )
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Description *</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ ...inputStyle, minHeight: 100, resize: "vertical" as const }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Category *</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as LemonLotCategoryId)}
                style={inputStyle}
              >
                {LEMON_LOT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Subcategory</label>
              <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} placeholder="Optional" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Price</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$800 / mo, OBO…" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Mileage</label>
              <input value={mileage} onChange={(e) => setMileage(e.target.value.replace(/[^\d]/g, ""))} placeholder="Vehicles / bikes" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Photos (optional, up to 10)</label>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: t.textMuted, lineHeight: 1.45 }}>
                Your photos show first on the card and override the website preview image.
              </p>
              <input ref={photoInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onPickGalleryPhotos} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={galleryEntries.length >= 10}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    fontWeight: 800,
                    border: `1px solid ${t.border}`,
                    background: t.surface,
                    cursor: galleryEntries.length >= 10 ? "not-allowed" : "pointer",
                    opacity: galleryEntries.length >= 10 ? 0.55 : 1,
                  }}
                >
                  Add photo
                </button>
                <span style={{ fontSize: 12, color: t.textMuted, alignSelf: "center" }}>
                  {galleryEntries.length}/10
                </span>
              </div>
              {galleryEntries.length > 0 ? (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {galleryEntries.map((entry, i) => (
                    <div key={entry.type === "url" ? `${entry.url}-${i}` : entry.preview} style={{ position: "relative", width: 88, height: 88 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.type === "url" ? entry.url : entry.preview}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: `1px solid ${t.border}`, display: "block" }}
                      />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => removeGalleryAt(i)}
                        style={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          border: "none",
                          background: "rgba(0,0,0,0.65)",
                          color: "#fff",
                          fontWeight: 900,
                          fontSize: 14,
                          lineHeight: 1,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, color: t.textMuted }}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {LEMON_LOT_BADGE_OPTIONS.map((b) => (
                <label key={b} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={tagsSel.has(b)}
                    onChange={() => {
                      setTagsSel((prev) => {
                        const n = new Set(prev);
                        if (n.has(b)) n.delete(b);
                        else n.add(b);
                        return n;
                      });
                    }}
                  />
                  {b}
                </label>
              ))}
            </div>
          </div>

          {formErr ? <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 12 }}>{formErr}</p> : null}
          <button
            type="button"
            onClick={() => void submitListing()}
            disabled={submitting}
            style={{
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 10,
              border: "none",
              background: "#111827",
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              cursor: submitting ? "wait" : "pointer",
              width: "100%",
              maxWidth: 320,
            }}
          >
            {submitting ? (editingId ? "Saving…" : "Publishing…") : editingId ? "Save changes" : "Publish listing"}
          </button>
        </section>
      )}

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

      {loading && rows.length === 0 ? (
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
              onEdit={userId === row.user_id ? () => populateFormFromRow(row) : undefined}
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
                    populateFormFromRow(detail);
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

      {galleryLightbox ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 13000,
            background: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
            boxSizing: "border-box",
          }}
          onClick={() => setGalleryLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close gallery"
            onClick={(e) => {
              e.stopPropagation();
              setGalleryLightbox(null);
            }}
            style={{
              position: "fixed",
              top: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "none",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              fontSize: 22,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ×
          </button>
          {galleryLightbox.urls.length > 1 ? (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                setGalleryLightbox((lb) =>
                  lb
                    ? {
                        urls: lb.urls,
                        index: (lb.index - 1 + lb.urls.length) % lb.urls.length,
                      }
                    : null,
                );
              }}
              style={{
                position: "fixed",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              ‹
            </button>
          ) : null}
          {galleryLightbox.urls.length > 1 ? (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                setGalleryLightbox((lb) =>
                  lb
                    ? {
                        urls: lb.urls,
                        index: (lb.index + 1) % lb.urls.length,
                      }
                    : null,
                );
              }}
              style={{
                position: "fixed",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              ›
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={galleryLightbox.urls[galleryLightbox.index]}
            alt=""
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", borderRadius: 4 }}
          />
        </div>
      ) : null}
    </div>
  );
}
