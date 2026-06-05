"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/app/lib/ThemeContext";
import { supabase } from "@/app/lib/lib/supabaseClient";
import {
  coerceGalleryImages,
  coerceListingTags,
  LEMON_LOT_BADGE_OPTIONS,
  LEMON_LOT_CATEGORIES,
  type LemonLotCategoryId,
  type MarketplaceListingRow,
} from "@/app/lib/lemonLot";
import { prepareImageUploadFile } from "@/app/lib/prepareUploadFile";
import { validateImagePick } from "@/app/lib/uploadLimits";

const THIRTY_DAYS_MS = 30 * 86400000;

type GalleryEntry = { type: "url"; url: string } | { type: "file"; file: File; preview: string };

function expiryIsoFromNow(): string {
  return new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
}

function extFromFile(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "jpg";
}

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

function rowToFormState(row: MarketplaceListingRow) {
  return {
    editingId: row.id,
    formCategory: (row.category as LemonLotCategoryId) || "misc",
    subcategory: row.subcategory ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    price: row.price ?? "",
    location: row.location ?? "",
    mileage: row.mileage != null ? String(row.mileage) : "",
    ogSiteName: row.og_site_name ?? "",
    websiteUrl: row.external_url ?? "",
    scrapedOgImage: row.og_image?.trim() || null,
    galleryEntries: coerceGalleryImages(row.gallery_images).map((u) => ({ type: "url" as const, url: u })),
    tagsSel: new Set(coerceListingTags(row.tags)),
  };
}

type Props = {
  userId: string;
  editRow?: MarketplaceListingRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function LemonLotComposer({ userId, editRow, onClose, onSaved }: Props) {
  const { t, isDark } = useTheme();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const seededEditIdRef = useRef<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(editRow?.id ?? null);
  const [formCategory, setFormCategory] = useState<LemonLotCategoryId>("misc");
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

  useEffect(() => {
    if (!editRow || seededEditIdRef.current === editRow.id) return;
    seededEditIdRef.current = editRow.id;
    const seed = rowToFormState(editRow);
    setEditingId(seed.editingId);
    setFormCategory(seed.formCategory);
    setSubcategory(seed.subcategory);
    setTitle(seed.title);
    setDescription(seed.description);
    setPrice(seed.price);
    setLocation(seed.location);
    setMileage(seed.mileage);
    setOgSiteName(seed.ogSiteName);
    setWebsiteUrl(seed.websiteUrl);
    setScrapedOgImage(seed.scrapedOgImage);
    setGalleryEntries(seed.galleryEntries);
    setTagsSel(seed.tagsSel);
    setFormErr(null);
  }, [editRow]);

  const resolvedWebsiteUrl = useMemo(() => normalizeWebsiteUrlInput(websiteUrl), [websiteUrl]);

  useEffect(() => {
    if (editingId) return;
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
          const {
            data: { session },
          } = await supabase.auth.getSession();
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
  }, [resolvedWebsiteUrl, editingId]);

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
      const entry = prev[index];
      if (entry?.type === "file") URL.revokeObjectURL(entry.preview);
      return prev.filter((_, j) => j !== index);
    });
  }

  async function submitListing() {
    setFormErr(null);
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
        const { error } = await supabase
          .from("marketplace_listings")
          .update(base)
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
      onSaved();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
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
    <section
      style={{
        marginBottom: 24,
        padding: 18,
        borderRadius: 14,
        border: `1px solid ${t.border}`,
        background: isDark ? "rgba(22,24,28,0.55)" : t.surface,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: t.text, letterSpacing: -0.02 }}>
          {editingId ? "Edit listing" : "Post a listing"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: t.textMuted, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

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
            {fetchingOg ? <div style={{ fontSize: 13, color: t.textMuted, fontWeight: 600 }}>Loading preview…</div> : null}
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
          <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as LemonLotCategoryId)} style={inputStyle}>
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
            <span style={{ fontSize: 12, color: t.textMuted, alignSelf: "center" }}>{galleryEntries.length}/10</span>
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
  );
}
