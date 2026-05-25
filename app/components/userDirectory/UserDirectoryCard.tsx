"use client";

import Link from "next/link";
import { useTheme } from "../../lib/ThemeContext";
import { getServiceRingColor } from "../../lib/serviceBranchVisual";
import { ServiceSealValue } from "../../lib/serviceSeals";
import { SkillBadgeValue } from "../../lib/skillBadges";
import {
  memberDisplayName,
  memberInitial,
  type UserDirectoryMember,
} from "../../lib/userDirectory";

type UserDirectoryCardProps = {
  member: UserDirectoryMember;
  isLoggedIn: boolean;
  isMobile: boolean;
  busy: boolean;
  onKnow: () => void;
  onConfirmKnow: () => void;
  onDenyKnow: () => void;
  onCancelKnow: () => void;
  onMessage: () => void;
  onSignInPrompt: () => void;
};

export default function UserDirectoryCard({
  member,
  isLoggedIn,
  isMobile,
  busy,
  onKnow,
  onConfirmKnow,
  onDenyKnow,
  onCancelKnow,
  onMessage,
  onSignInPrompt,
}: UserDirectoryCardProps) {
  const { t } = useTheme();
  const name = memberDisplayName(member);
  const initial = memberInitial(member);
  const ringColor = getServiceRingColor(member.service);
  const profileHref = `/profile/${member.user_id}`;

  const btnBase: React.CSSProperties = {
    minWidth: isMobile ? 0 : 96,
    flex: isMobile ? 1 : "0 0 auto",
    background: t.surface,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: "8px 14px",
    fontWeight: 700,
    fontSize: 13,
    cursor: busy ? "not-allowed" : "pointer",
    textAlign: "center",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
    opacity: busy ? 0.7 : 1,
  };

  function renderKnowButtons() {
    if (!isLoggedIn) {
      return (
        <button type="button" onClick={onSignInPrompt} style={btnBase}>
          Know
        </button>
      );
    }

    const { knowStatus } = member;

    if (knowStatus === "none") {
      return (
        <button type="button" onClick={onKnow} disabled={busy} style={btnBase}>
          Know
        </button>
      );
    }

    if (knowStatus === "pending_outgoing") {
      return (
        <button type="button" onClick={onCancelKnow} disabled={busy} style={{ ...btnBase, color: t.textMuted }}>
          Request Sent
        </button>
      );
    }

    if (knowStatus === "pending_incoming") {
      return (
        <>
          <button
            type="button"
            onClick={onConfirmKnow}
            disabled={busy}
            style={{ ...btnBase, background: "#111", color: "#fff", border: "none" }}
          >
            Know Back
          </button>
          <button type="button" onClick={onDenyKnow} disabled={busy} style={{ ...btnBase, color: t.textMuted }}>
            Deny
          </button>
        </>
      );
    }

    if (knowStatus === "accepted") {
      return (
        <button
          type="button"
          disabled
          style={{ ...btnBase, color: t.textMuted, cursor: "default", opacity: 0.85 }}
        >
          Connected
        </button>
      );
    }

    return null;
  }

  function renderMessageButton() {
    if (!isLoggedIn) {
      return (
        <button type="button" onClick={onSignInPrompt} style={btnBase}>
          Message
        </button>
      );
    }

    return (
      <button type="button" onClick={onMessage} disabled={busy} style={btnBase}>
        Message
      </button>
    );
  }

  return (
    <article
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        background: t.surface,
        padding: isMobile ? "14px 16px" : "16px 20px",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 14 : 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flex: 1,
          minWidth: 0,
        }}
      >
        <Link href={profileHref} style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              overflow: "hidden",
              background: t.badgeBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              color: t.textMuted,
              fontSize: 24,
              boxSizing: "border-box",
              border: ringColor ? `3px solid ${ringColor}` : `2px solid ${t.border}`,
            }}
          >
            {member.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user avatar
              <img
                src={member.photo_url}
                alt={name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              initial
            )}
          </div>
        </Link>

        <div style={{ minWidth: 0, flex: 1 }}>
          <Link
            href={profileHref}
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: t.text,
              textDecoration: "none",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {name}
          </Link>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px 20px",
              marginTop: 10,
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontWeight: 700,
                  color: t.textFaint,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                Service
              </span>
              <ServiceSealValue service={member.service} size={40} notSetLabel="—" />
            </div>

            {member.skill_badge?.trim() && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontWeight: 700,
                    color: t.textFaint,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  Badge
                </span>
                <SkillBadgeValue skillBadge={member.skill_badge} width={52} notSetLabel="" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexShrink: 0,
          flexWrap: "wrap",
          justifyContent: isMobile ? "stretch" : "flex-end",
          width: isMobile ? "100%" : "auto",
        }}
      >
        {renderKnowButtons()}
        {member.knowStatus !== "pending_incoming" && renderMessageButton()}
      </div>
    </article>
  );
}
