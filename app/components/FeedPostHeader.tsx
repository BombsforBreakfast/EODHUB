import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import HideBlockUserButton from "./HideBlockUserButton";

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
  disableProfileLink?: boolean;
  hideAvatar?: boolean;

  isOwnPost: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isEditingPost: boolean;
  isMobile: boolean;

  isDeleting: boolean;
  isFlagging: boolean;
  authorUserId?: string | null;
  currentUserId?: string | null;

  onEdit: () => void;
  onDelete: () => void;
  onFlag: () => void;
  onBlockedUser?: (blockedUserId: string) => void;
};

export default function FeedPostHeader({
  profileHref,
  avatar,
  authorName,
  createdAtLabel,
  t,
  disableProfileLink = false,
  hideAvatar = false,
  isOwnPost,
  canEdit,
  canDelete,
  isEditingPost,
  isMobile,
  isDeleting,
  isFlagging,
  authorUserId,
  currentUserId,
  onEdit,
  onDelete,
  onFlag,
  onBlockedUser,
}: FeedPostHeaderProps) {
  const [mobileOwnerMenuOpen, setMobileOwnerMenuOpen] = useState(false);
  const [viewerMenuOpen, setViewerMenuOpen] = useState(false);
  const hasOwnerActions = canEdit || canDelete;
  const showCollapsedOwnerMenu = isMobile && hasOwnerActions;
  const ownerMenuRef = useRef<HTMLDivElement | null>(null);
  const showViewerActions = !isOwnPost && !canDelete;

  useEffect(() => {
    if (!mobileOwnerMenuOpen && !viewerMenuOpen) return;
    const onDocPointer = (e: PointerEvent) => {
      const el = ownerMenuRef.current;
      if (!el?.contains(e.target as Node)) {
        setMobileOwnerMenuOpen(false);
        setViewerMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
  }, [mobileOwnerMenuOpen, viewerMenuOpen]);

  return (
    <div
      style={{
        display: "flex",
        gap: "clamp(4px, 1.4vw, 8px)",
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
          gap: "clamp(4px, 1.4vw, 8px)",
          alignItems: "center",
          minWidth: 0,
          flex: "1 1 auto",
        }}
      >
        {!hideAvatar && (
          disableProfileLink ? (
            <div style={{ flexShrink: 0, lineHeight: 0 }}>{avatar}</div>
          ) : (
            <Link href={profileHref} style={{ textDecoration: "none", flexShrink: 0, lineHeight: 0 }}>
              {avatar}
            </Link>
          )
        )}

        <div style={{ minWidth: 0, flex: "1 1 0%" }}>
          {disableProfileLink ? (
            <div
              style={{
                fontWeight: 800,
                color: t.text,
                display: "block",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                maxWidth: "100%",
              }}
            >
              {authorName}
            </div>
          ) : (
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
          )}

          <div
            style={{
              fontSize: "clamp(11px, 2.6vw, 12px)",
              color: t.textMuted,
              marginTop: 0,
              lineHeight: 1.25,
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
          gap: "clamp(6px, 1.6vw, 10px)",
          alignItems: "center",
          flexShrink: 0,
          flexWrap: "nowrap",
          justifyContent: "flex-end",
          position: "relative",
          marginLeft: "auto",
          alignSelf: "flex-end",
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
                  left: "auto",
                  marginTop: 6,
                  display: "grid",
                  gap: 6,
                  minWidth: 112,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: 8,
                  background: t.surface,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 50,
                  maxWidth: "min(220px, 85vw)",
                }}
              >
                {canEdit && !isEditingPost && (
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
                {canDelete && (
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
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {canEdit && !isEditingPost && (
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

            {canDelete && (
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

        {showViewerActions && (
          <>
            <button
              type="button"
              onClick={() => setViewerMenuOpen((open) => !open)}
              disabled={isFlagging}
              title="Post actions"
              aria-expanded={viewerMenuOpen}
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
            {viewerMenuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  left: "auto",
                  marginTop: 6,
                  display: "grid",
                  gap: 6,
                  minWidth: 150,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: 8,
                  background: t.surface,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  zIndex: 50,
                  maxWidth: "min(240px, 85vw)",
                }}
              >
                <HideBlockUserButton
                  targetUserId={authorUserId}
                  currentUserId={currentUserId}
                  t={t}
                  compact
                  onBlocked={(blockedUserId) => {
                    setViewerMenuOpen(false);
                    onBlockedUser?.(blockedUserId);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setViewerMenuOpen(false);
                    onFlag();
                  }}
                  disabled={isFlagging}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "4px 0",
                    textAlign: "left",
                    cursor: isFlagging ? "not-allowed" : "pointer",
                    color: t.textMuted,
                    fontWeight: 700,
                    opacity: isFlagging ? 0.6 : 1,
                  }}
                >
                  {isFlagging ? "Reporting…" : "Report Post"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

