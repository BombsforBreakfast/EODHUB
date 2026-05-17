"use client";

import { useTheme } from "@/app/lib/ThemeContext";
import {
  daysUntilExpiryUtc,
  displayListingDescription,
  displayListingTitle,
  isPubliclyLive,
  listingCardImageUrls,
  type MarketplaceListingRow,
} from "@/app/lib/lemonLot";

type Props = {
  row: MarketplaceListingRow;
  sellerLabel: string;
  currentUserId: string | null;
  onOpen: () => void;
  onContact: () => void;
  onRelist: () => void;
  onRemove: () => void;
  /** Owner-only: open edit form */
  onEdit?: () => void;
  contacting: boolean;
  relisting: boolean;
  removing: boolean;
};

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function LemonLotListingCard({
  row,
  sellerLabel,
  currentUserId,
  onOpen,
  onContact,
  onRelist,
  onRemove,
  onEdit,
  contacting,
  relisting,
  removing,
}: Props) {
  const { t, isDark } = useTheme();
  const cardUrls = listingCardImageUrls(row);
  const title = displayListingTitle(row);
  const desc = displayListingDescription(row);
  const live = isPubliclyLive(row);
  const dLeft = daysUntilExpiryUtc(row.expires_at);
  const warn = live && dLeft >= 0 && dLeft <= 3;
  const isOwner = currentUserId !== null && row.user_id === currentUserId;
  const showExpired = !live && row.status === "active";
  const canRelist = isOwner && showExpired;
  const canRemove = isOwner && row.status !== "removed";

  return (
    <article
      style={{
        borderRadius: 14,
        border: `1px solid ${t.border}`,
        background: isDark ? "rgba(22,24,28,0.72)" : t.surface,
        boxShadow: isDark ? "0 8px 28px rgba(0,0,0,0.35)" : "0 4px 18px rgba(0,0,0,0.06)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        maxWidth: "100%",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          textAlign: "left",
          background: "transparent",
          color: "inherit",
          width: "100%",
        }}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            background: "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {cardUrls.length === 0 ? (
            <span style={{ fontSize: 36, opacity: 0.35 }}>🍋</span>
          ) : cardUrls.length === 1 ? (
            // eslint-disable-next-line @next/next/no-img-element -- external / user URLs
            <img src={cardUrls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : cardUrls.length === 2 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 3,
                width: "100%",
                height: "100%",
              }}
            >
              {cardUrls.slice(0, 2).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                width: "100%",
                height: "100%",
                gap: 3,
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.52fr)",
                gridTemplateRows: "1fr 1fr",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cardUrls[0]}
                alt=""
                style={{ gridRow: "span 2", width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cardUrls[1]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardUrls[2]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {cardUrls.length > 3 ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.5)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 900,
                      fontSize: 20,
                    }}
                  >
                    +{cardUrls.length - 3}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 14px 10px" }}>
          <div style={{ fontWeight: 900, fontSize: 15, lineHeight: 1.25, color: t.text }}>{title}</div>
          <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, color: t.textMuted, fontWeight: 600 }}>
            {row.price ? <span>{row.price}</span> : null}
            {row.location ? <span>{row.location}</span> : null}
            {row.mileage != null ? <span>{row.mileage.toLocaleString()} mi</span> : null}
          </div>
          {desc ? (
            <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted, lineHeight: 1.45, maxHeight: 72, overflow: "hidden" }}>
              {desc}
            </div>
          ) : null}
        </div>
      </button>
      <div style={{ padding: "0 14px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(row.tags ?? []).map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.04,
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              background: warn && tag === "Urgent" ? "rgba(220,38,38,0.18)" : t.badgeBg,
              color: t.text,
              border: `1px solid ${t.border}`,
            }}
          >
            {tag}
          </span>
        ))}
        {warn ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.06,
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(234,179,8,0.22)",
              color: "#92400e",
              border: "1px solid rgba(234,179,8,0.45)",
            }}
          >
            {dLeft === 0 ? "Last day" : `${dLeft}d left`}
          </span>
        ) : live && dLeft > 3 ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.06,
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              background: t.badgeBg,
              color: t.textMuted,
              border: `1px solid ${t.border}`,
            }}
          >
            {dLeft}d left
          </span>
        ) : null}
        {showExpired ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.06,
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(107,114,128,0.2)",
              color: t.textMuted,
              border: `1px solid ${t.border}`,
            }}
          >
            Expired
          </span>
        ) : null}
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "10px 14px 14px",
          borderTop: `1px solid ${t.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>
          <span>{sellerLabel}</span>
          <span style={{ opacity: 0.5 }}> · </span>
          <span>Listed {formatShortDate(row.created_at)}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {!isOwner && live ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContact();
              }}
              disabled={contacting}
              style={{
                flex: "1 1 120px",
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                background: "#111827",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
                cursor: contacting ? "wait" : "pointer",
                opacity: contacting ? 0.75 : 1,
              }}
            >
              {contacting ? "…" : "Contact"}
            </button>
          ) : null}
          {canRelist ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRelist();
              }}
              disabled={relisting}
              style={{
                flex: "1 1 120px",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.surface,
                color: t.text,
                fontWeight: 800,
                fontSize: 14,
                cursor: relisting ? "wait" : "pointer",
              }}
            >
              {relisting ? "…" : "Relist 30d"}
            </button>
          ) : null}
          {isOwner && onEdit && row.status !== "removed" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.surface,
                color: t.text,
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Edit
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              disabled={removing}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid rgba(220,38,38,0.35)`,
                background: "transparent",
                color: "#b91c1c",
                fontWeight: 700,
                fontSize: 13,
                cursor: removing ? "wait" : "pointer",
              }}
            >
              {removing ? "…" : "Delete"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
