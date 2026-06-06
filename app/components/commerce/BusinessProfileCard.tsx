"use client";

import { useLayoutEffect, useState, type CSSProperties } from "react";
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
  const [viewportCompact, setViewportCompact] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setViewportCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const compact = isMobile || viewportCompact;
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
    padding: compact ? "8px 12px" : "7px 12px",
    fontWeight: 800,
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
    width: "auto",
  };

  return (
    <div
      className={`business-profile-card${embedded ? " business-profile-card--embedded" : ""}${compact ? " business-profile-card--compact" : ""}`}
      style={{
        border: embedded ? "none" : `1px solid ${t.border}`,
        borderRadius: embedded ? 0 : 16,
        background: embedded ? "transparent" : t.surface,
      }}
    >
      <div
        className="business-profile-card__inner"
        style={{
          padding: embedded ? 0 : undefined,
        }}
      >
        <div className="business-profile-card__header">
          <h1
            className="business-profile-card__title"
            style={{
              color: t.text,
            }}
          >
            {page.business_name}
          </h1>
          {showSubtitle && (
            <div
              className="business-profile-card__subtitle"
              style={{
                color: t.textMuted,
              }}
            >
              {subtitle}
            </div>
          )}
          {isOwnWall && onEditProfile && (
            <button
              type="button"
              onClick={onEditProfile}
              className="business-profile-card__edit"
              style={editButtonStyle}
              aria-label="Edit business profile"
            >
              <Pencil size={12} aria-hidden />
              Edit
            </button>
          )}
        </div>

        <div className="business-profile-card__body">
          <div
            id="profile-wall-avatar"
            className="business-profile-card__logo"
            onClick={onLogoClick}
            title={page.logo_url ? "View logo" : isOwnWall ? "Add logo" : undefined}
            style={{
              background: t.bg,
              border: `1px solid ${t.border}`,
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
            className="business-profile-card__details"
            style={{
              color: t.textMuted,
            }}
          >
            <span
              className="business-profile-card__badge"
              style={{
                background: t.badgeBg,
                color: t.badgeText,
                border: `1px solid ${t.border}`,
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
          className="business-profile-card__extended"
          style={{
            borderTop: `1px solid ${t.borderLight}`,
            color: t.textMuted,
          }}
        >
          {page.phone && (
            <div>
              <span style={{ color: t.textFaint, fontWeight: 800 }}>Phone </span>
              <span style={{ color: t.text }}>{page.phone}</span>
            </div>
          )}
          {page.address && (
            <div className={page.phone ? undefined : "business-profile-card__extended-full"}>
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
