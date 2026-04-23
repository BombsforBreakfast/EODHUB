"use client";

import React from "react";
import { useTheme } from "../../lib/ThemeContext";

export type JobRow = {
  id: string;
  created_at: string | null;
  title: string | null;
  category: string | null;
  location: string | null;
  pay_min: number | null;
  pay_max: number | null;
  clearance: string | null;
  description: string | null;
  apply_url: string | null;
  company_name: string | null;
  is_approved: boolean | null;
  source_type: string | null;
  user_id: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  anonymous: boolean | null;
};

export type BusinessListingRow = {
  id: string;
  created_at: string;
  business_name: string | null;
  website_url: string;
  custom_blurb: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  og_site_name: string | null;
  is_approved: boolean;
  is_featured: boolean;
  like_count: number;
  listing_type?: "business" | "organization" | "resource" | null;
};

export type BizListingType = "business" | "organization" | "resource";

export function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://")) return `https://${u.slice(7)}`;
  return u;
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeBizListingType(value: string | null | undefined): BizListingType {
  if (value === "organization" || value === "resource") return value;
  return "business";
}

export function isPermanentlyFeaturedListing(
  listing: Pick<BusinessListingRow, "website_url" | "business_name" | "og_title" | "og_site_name">
): boolean {
  const url = (listing.website_url || "").toLowerCase();
  const text = `${listing.business_name || ""} ${listing.og_title || ""} ${listing.og_site_name || ""}`.toLowerCase();
  return (
    url.includes("thelongwalkhome.org") ||
    url.includes("eod-wf.org") ||
    url.includes("eodwarriorfoundation.org") ||
    text.includes("the long walk") ||
    text.includes("eod warrior foundation")
  );
}

export function normalizeBizListingTypeForListing(
  listing: Pick<BusinessListingRow, "listing_type" | "website_url" | "business_name" | "og_title" | "og_site_name">
): BizListingType {
  if (isPermanentlyFeaturedListing(listing)) return "resource";
  return normalizeBizListingType(listing.listing_type);
}

export function getBizTypePriority(
  listing: Pick<BusinessListingRow, "listing_type" | "website_url" | "business_name" | "og_title" | "og_site_name">
): number {
  const type = normalizeBizListingTypeForListing(listing);
  if (type === "business") return 0;
  if (type === "organization") return 1;
  return 2;
}

export function isBizListingTypeMissingColumnError(error: unknown): boolean {
  const msg = (error as { message?: string } | null)?.message?.toLowerCase?.() ?? "";
  return msg.includes("column") && msg.includes("listing_type");
}

type OgPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

export function OgCard({ og }: { og: OgPreview }) {
  const { t } = useTheme();
  const imgUrl = og.image ? httpsAssetUrl(og.image) : "";
  return (
    <a
      href={og.url ? httpsAssetUrl(og.url) : "#"}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        marginTop: 12,
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: t.bg,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {imgUrl ? (
        <img src={imgUrl} alt={og.title || ""} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
      ) : null}
      <div style={{ padding: "10px 14px" }}>
        {og.siteName && (
          <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
            {og.siteName}
          </div>
        )}
        {og.title && <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.3, color: t.text }}>{og.title}</div>}
        {og.description && (
          <div
            style={{
              fontSize: 13,
              color: t.textMuted,
              marginTop: 4,
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}
          >
            {og.description}
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 12, color: t.textFaint, wordBreak: "break-all" }}>{og.url}</div>
      </div>
    </a>
  );
}

/** Slight zoom on hover for dashboard section title links (e.g. Jobs, Events). */
export const sectionTitleLinkZoom = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "scale(1.04)";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "scale(1)";
  },
};

/** Collapsed side-rail vertical labels: preserve rotate(180deg) with scale. */
export const collapsedRailTitleLinkZoom = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "rotate(180deg) scale(1.04)";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.transform = "rotate(180deg) scale(1)";
  },
};
