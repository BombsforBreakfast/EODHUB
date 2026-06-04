"use client";

import type { CSSProperties } from "react";
import { Camera, Pencil } from "lucide-react";
import { useTheme } from "../../lib/ThemeContext";

export type BusinessProfileCardData = {
  business_name: string;
  description: string;
  business_email: string;
  logo_url: string | null;
  website_url?: string | null;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  owner_info?: string | null;
  page_type?: "business" | "organization" | null;
};

type Props = {
  page: BusinessProfileCardData;
  subtitle?: string | null;
  isMobile?: boolean;
  isOwnWall?: boolean;
  embedded?: boolean;
  onLogoClick?: () => void;
  logoUploading?: boolean;
  showExtendedDetails?: boolean;
  onEditProfile?: () => void;
};

function formatWebsiteLabel(url: string): string {
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

function normalizeWebsiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export default function BusinessProfileCard({
  page,
  subtitle,
  isMobile = false,
  isOwnWall = false,
  embedded = false,
  onLogoClick,
  logoUploading = false,
  showExtendedDetails = false,
  onEditProfile,
}: Props) {
  const { t } = useTheme();
  const logoSize = isMobile ? 160 : 280;
  const showSubtitle =
    subtitle?.trim() &&
    subtitle.trim().toLowerCase() !== page.business_name.trim().toLowerCase();
  const profileLabel = page.page_type === "organization" ? "Organization Profile" : "Business Profile";

  const editButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "#111",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    padding: isMobile ? "8px 12px" : "7px 12px",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
    width: "auto",
    justifySelf: isMobile ? "center" : "end",
  };

  return (
    <div
      style={{
        border: embedded ? "none" : `1px solid ${t.border}`,
        borderRadius: embedded ? 0 : 16,
        background: embedded ? "transparent" : t.surface,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: embedded ? 0 : isMobile ? "8px 14px" : "10px 18px",
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: isMobile ? 10 : 12,
          alignItems: isMobile ? "stretch" : "start",
        }}
      >
        <div style={{ minWidth: 0, display: "grid", gap: 8, position: "relative", paddingRight: isMobile ? 0 : 130 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 26 : 36,
              fontWeight: 950,
              lineHeight: 1.08,
              color: t.text,
              textAlign: isMobile ? "center" : "left",
            }}
          >
            {page.business_name}
          </h1>
          {showSubtitle && (
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: t.textMuted,
                textAlign: isMobile ? "center" : "left",
              }}
            >
              {subtitle}
            </div>
          )}
          {isOwnWall && onEditProfile && (
            <button
              type="button"
              onClick={onEditProfile}
              style={{
                ...editButtonStyle,
                position: isMobile ? "static" : "absolute",
                top: 0,
                right: 0,
              }}
              aria-label="Edit business profile"
            >
              <Pencil size={12} aria-hidden />
              Edit
            </button>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : `${logoSize}px minmax(0, 1fr)`,
            gap: isMobile ? 14 : 56,
            alignItems: "start",
          }}
        >
          <div
            id="profile-wall-avatar"
            onClick={onLogoClick}
            title={page.logo_url ? "View logo" : isOwnWall ? "Add logo" : undefined}
            style={{
              width: logoSize,
              height: logoSize,
              borderRadius: 16,
              overflow: "hidden",
              background: t.bg,
              border: `1px solid ${t.border}`,
              display: "grid",
              placeItems: "center",
              position: "relative",
              flexShrink: 0,
              margin: isMobile ? "0 auto" : undefined,
              cursor: onLogoClick ? (logoUploading ? "not-allowed" : "pointer") : "default",
            }}
          >
            {page.logo_url ? (
              <img
                src={page.logo_url}
                alt={`${page.business_name} logo`}
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", padding: 8 }}
              />
            ) : (
              <span style={{ color: t.textFaint, fontSize: 56, fontWeight: 900 }}>
                {page.business_name[0]?.toUpperCase() ?? "B"}
              </span>
            )}
            {isOwnWall && onLogoClick && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.45)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  opacity: logoUploading ? 1 : 0,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (!logoUploading) e.currentTarget.style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  if (!logoUploading) e.currentTarget.style.opacity = "0";
                }}
              >
                <Camera size={18} color="white" />
                <span style={{ fontSize: 10, color: "white", fontWeight: 700 }}>
                  {logoUploading ? "Uploading..." : "Update"}
                </span>
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              color: t.textMuted,
              fontSize: 13,
              lineHeight: 1.5,
              paddingLeft: isMobile ? 0 : 24,
              paddingTop: isMobile ? 0 : 4,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                alignSelf: isMobile ? "center" : "flex-start",
                background: t.badgeBg,
                color: t.badgeText,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.2,
              }}
            >
              {profileLabel}
            </span>
            {page.location && (
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ color: t.textFaint, fontWeight: 800, minWidth: 58 }}>Location</span>
                <span style={{ color: t.text, fontWeight: 700 }}>{page.location}</span>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ color: t.textFaint, fontWeight: 800, minWidth: 58 }}>Email</span>
              <a
                href={`mailto:${page.business_email}`}
                style={{ color: t.text, fontWeight: 700, textDecoration: "none", overflowWrap: "anywhere" }}
              >
                {page.business_email}
              </a>
            </div>
            {page.website_url && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: t.textFaint, fontWeight: 800, minWidth: 58 }}>Website</span>
                <a
                  href={normalizeWebsiteHref(page.website_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: `1px solid ${t.border}`,
                    borderRadius: 999,
                    padding: "6px 12px",
                    background: t.bg,
                    color: t.text,
                    fontWeight: 800,
                    fontSize: 12,
                    textDecoration: "none",
                  }}
                >
                  Visit {formatWebsiteLabel(page.website_url)}
                </a>
              </div>
            )}
            {page.description?.trim() && (
              <p
                style={{
                  margin: "6px 0 0",
                  color: t.textMuted,
                  fontSize: 14,
                  lineHeight: 1.65,
                  fontWeight: 500,
                }}
              >
                {page.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {showExtendedDetails && (page.address || page.phone || page.owner_info) && (
        <div
          style={{
            borderTop: `1px solid ${t.borderLight}`,
            padding: isMobile ? "10px 14px 8px" : "10px 18px 8px",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "8px 20px",
            color: t.textMuted,
            fontSize: 13,
          }}
        >
          {page.phone && (
            <div>
              <span style={{ color: t.textFaint, fontWeight: 800 }}>Phone </span>
              <span style={{ color: t.text }}>{page.phone}</span>
            </div>
          )}
          {page.address && (
            <div style={{ gridColumn: isMobile ? "auto" : page.phone ? "auto" : "1 / -1" }}>
              <span style={{ color: t.textFaint, fontWeight: 800 }}>Address </span>
              <span style={{ color: t.text }}>{page.address}</span>
            </div>
          )}
          {page.owner_info && (
            <div style={{ gridColumn: "1 / -1" }}>
              <span style={{ color: t.textFaint, fontWeight: 800 }}>Owner </span>
              <span style={{ color: t.text }}>{page.owner_info}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
