"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useTheme } from "../lib/ThemeContext";

export type PostLikerBrief = {
  userId: string;
  name: string;
  photoUrl: string | null;
  service: string | null;
  isEmployer: boolean | null;
};

function getServiceRingColor(service: string | null | undefined): string | null {
  switch (service) {
    case "Army":
      return "#556b2f";
    case "Navy":
      return "#003087";
    case "Air Force":
      return "#00b0f0";
    case "Marines":
      return "#bf0a30";
    case "Civilian Bomb Tech":
      return "#000000";
    case "Civil Service":
      return "#d97706";
    case "Federal":
      return "#7c3aed";
    default:
      return null;
  }
}

function LikerAvatar({
  photoUrl,
  name,
  size = 44,
  service,
  isEmployer,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
  service?: string | null;
  isEmployer?: boolean | null;
}) {
  const { t } = useTheme();
  const ringColor = isEmployer ? null : getServiceRingColor(service);
  const borderRadius = isEmployer ? Math.max(4, size * 0.18) : "50%";
  const bgColor = isEmployer ? "#f0f0f0" : t.badgeBg;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius,
        overflow: "hidden",
        background: bgColor,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        color: t.textMuted,
        fontSize: size * 0.32,
        boxSizing: "border-box",
        border: ringColor ? `${size <= 36 ? 3 : 4}px solid ${ringColor}` : undefined,
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            padding: 0,
          }}
        />
      ) : (
        (name?.trim()?.[0] || "U").toUpperCase()
      )}
    </div>
  );
}

const PEEK_LIKERS = 3;

export function PostLikersStack({ likers }: { likers: PostLikerBrief[] }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (likers.length === 0) return null;

  const showEllipsis = likers.length > PEEK_LIKERS;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {likers.slice(0, PEEK_LIKERS).map((liker, i) => (
          <Link
            key={liker.userId}
            href={`/profile/${liker.userId}`}
            title={liker.name}
            style={{
              marginLeft: i === 0 ? 0 : -5,
              position: "relative",
              zIndex: PEEK_LIKERS - i,
              textDecoration: "none",
              lineHeight: 0,
            }}
          >
            <LikerAvatar
              photoUrl={liker.photoUrl}
              name={liker.name}
              size={22}
              service={liker.service}
              isEmployer={liker.isEmployer}
            />
          </Link>
        ))}
        {showEllipsis && (
          <button
            type="button"
            aria-label="Show everyone who liked this post"
            onClick={() => setOpen(true)}
            style={{
              marginLeft: 4,
              background: t.bg,
              border: `1px solid ${t.border}`,
              borderRadius: 999,
              width: 26,
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: t.textMuted,
              fontSize: 14,
              fontWeight: 800,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            …
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="People who liked this post"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: t.surface,
              borderRadius: 14,
              border: `1px solid ${t.border}`,
              maxWidth: 380,
              width: "100%",
              maxHeight: "min(72vh, 520px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                borderBottom: `1px solid ${t.border}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 16, color: t.text }}>
                Likes ({likers.length})
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  color: t.textMuted,
                  padding: 4,
                  margin: -4,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                overflowY: "auto",
                padding: "8px 10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {likers.map((liker) => (
                <Link
                  key={liker.userId}
                  href={`/profile/${liker.userId}`}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 10px",
                    borderRadius: 10,
                    textDecoration: "none",
                    color: t.text,
                  }}
                >
                  <LikerAvatar
                    photoUrl={liker.photoUrl}
                    name={liker.name}
                    size={36}
                    service={liker.service}
                    isEmployer={liker.isEmployer}
                  />
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{liker.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
