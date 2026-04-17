import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

type ThemeLike = {
  text: string;
  textMuted: string;
  textFaint: string;
  surface: string;
  border: string;
};

type FeedPostHeaderProps = {
  profileHref: string;
  avatar: ReactNode;
  authorName: string;
  createdAtLabel: string;
  t: ThemeLike;

  isOwnPost: boolean;
  isEditingPost: boolean;
  isMobile: boolean;

  isDeleting: boolean;
  isFlagging: boolean;

  onEdit: () => void;
  onDelete: () => void;
  onFlag: () => void;
};

export default function FeedPostHeader({
  profileHref,
  avatar,
  authorName,
  createdAtLabel,
  t,
  isOwnPost,
  isEditingPost,
  isMobile,
  isDeleting,
  isFlagging,
  onEdit,
  onDelete,
  onFlag,
}: FeedPostHeaderProps) {
  const [mobileOwnerMenuOpen, setMobileOwnerMenuOpen] = useState(false);
  const showCollapsedOwnerMenu = isMobile && isOwnPost;
  const ownerMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mobileOwnerMenuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      const el = ownerMenuRef.current;
      if (!el?.contains(e.target as Node)) setMobileOwnerMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
  }, [mobileOwnerMenuOpen]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "clamp(8px, 2.4vw, 14px)",
        alignItems: "flex-start",
        flexWrap: "wrap",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Left author block: allow shrinking to keep actions within viewport */}
      <div
        style={{
          display: "flex",
          gap: "clamp(8px, 2.2vw, 12px)",
          alignItems: "flex-start",
          minWidth: 0,
          flex: "1 1 auto",
        }}
      >
        <Link href={profileHref} style={{ textDecoration: "none" }}>
          {avatar}
        </Link>

        <div style={{ minWidth: 0, flex: "1 1 0%" }}>
          <Link
            href={profileHref}
            style={{
              fontWeight: 800,
              color: t.text,
              textDecoration: "none",
              display: "block",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
              maxWidth: "100%",
            }}
          >
            {authorName}
          </Link>

          <div
            style={{
              fontSize: "clamp(12px, 3.1vw, 13px)",
              color: t.textMuted,
              marginTop: 2,
            }}
          >
            {createdAtLabel}
          </div>
        </div>
      </div>

      {/* Right actions: allow wrapping on mobile so Delete never spills */}
      <div
        ref={ownerMenuRef}
        style={{
          display: "flex",
          gap: "clamp(8px, 2vw, 12px)",
          alignItems: "center",
          flexShrink: 0,
          flexWrap: "wrap",
          justifyContent: "flex-end",
          position: "relative",
          minWidth: 0,
        }}
      >
        {showCollapsedOwnerMenu ? (
          <>
            <button
              type="button"
              onClick={() => setMobileOwnerMenuOpen((open) => !open)}
              title="Post actions"
              style={{
                background: "transparent",
                border: "none",
                padding: "0 2px",
                cursor: "pointer",
                color: t.textMuted,
                fontSize: 20,
                lineHeight: 1,
                fontWeight: 800,
              }}
            >
              ...
            </button>
            {mobileOwnerMenuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 6,
                  display: "grid",
                  gap: 6,
                  minWidth: 112,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: 8,
                  background: t.surface,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 5,
                  maxWidth: "min(220px, 85vw)",
                }}
              >
                {!isEditingPost && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOwnerMenuOpen(false);
                      onEdit();
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "4px 0",
                      textAlign: "left",
                      cursor: "pointer",
                      color: t.textMuted,
                      fontWeight: 700,
                    }}
                  >
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOwnerMenuOpen(false);
                    onDelete();
                  }}
                  disabled={isDeleting}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "4px 0",
                    textAlign: "left",
                    cursor: isDeleting ? "not-allowed" : "pointer",
                    color: t.textMuted,
                    fontWeight: 700,
                    opacity: isDeleting ? 0.6 : 1,
                  }}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {isOwnPost && !isEditingPost && (
              <button
                type="button"
                onClick={onEdit}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: t.textMuted,
                  fontWeight: 700,
                }}
              >
                Edit
              </button>
            )}

            {isOwnPost && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  color: t.textMuted,
                  fontWeight: 700,
                  opacity: isDeleting ? 0.6 : 1,
                }}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            )}
          </>
        )}

        {!isOwnPost && (
          <button
            type="button"
            onClick={onFlag}
            disabled={isFlagging}
            title="Flag for review"
            style={{
              background: "transparent",
              border: "none",
              padding: "0 2px",
              cursor: isFlagging ? "not-allowed" : "pointer",
              color: t.textFaint,
              fontSize: 15,
              lineHeight: 1,
            }}
          >
            ...
          </button>
        )}
      </div>
    </div>
  );
}

