"use client";

type Props = {
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  companyWebsite: string | null;
  employerVerified: boolean | null;
  verificationStatus: string | null;
  bio: string | null;
  showEmail?: boolean;
  compact?: boolean;
  borderColor: string;
  textColor: string;
  textMuted: string;
  textFaint: string;
  isOwnWall?: boolean;
  onCompleteBio?: () => void;
};

function displayValue(value: string | null | undefined, fallback = "Not provided") {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function verificationLabel(status: string | null, verified: boolean | null): string {
  if (verified) return "Verified employer";
  if (status === "denied") return "Access denied";
  if (status === "verified") return "Approved";
  if (status === "awaiting_admin_review" || status === "pending_admin_review" || status === "pending") {
    return "Pending admin review";
  }
  return "Awaiting review";
}

export default function EmployerAccountCardDetails({
  companyName,
  firstName,
  lastName,
  email,
  companyWebsite,
  employerVerified,
  verificationStatus,
  bio,
  showEmail = false,
  compact = false,
  borderColor,
  textColor,
  textMuted,
  textFaint,
  isOwnWall = false,
  onCompleteBio,
}: Props) {
  const contactName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const gridGap = compact ? "2px 16px" : "4px 24px";

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: gridGap,
          color: textMuted,
          fontSize: compact ? 14 : undefined,
          lineHeight: 1.7,
        }}
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <strong>Company / Organization:</strong>{" "}
          <span style={{ color: textColor }}>{displayValue(companyName)}</span>
        </div>
        <div>
          <strong>Primary Contact:</strong>{" "}
          <span style={{ color: textColor }}>{displayValue(contactName)}</span>
        </div>
        <div>
          <strong>Account Status:</strong>{" "}
          <span style={{ color: textColor }}>{verificationLabel(verificationStatus, employerVerified)}</span>
        </div>
        {showEmail && (
          <div style={{ gridColumn: "1 / -1" }}>
            <strong>Email:</strong>{" "}
            <span style={{ color: textColor }}>{displayValue(email)}</span>
          </div>
        )}
        <div style={{ gridColumn: "1 / -1" }}>
          <strong>Website:</strong>{" "}
          {companyWebsite?.trim() ? (
            <a
              href={companyWebsite.trim()}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#1d4ed8", wordBreak: "break-all" }}
            >
              {companyWebsite.trim()}
            </a>
          ) : (
            <span style={{ color: textFaint }}>Not added yet</span>
          )}
        </div>
      </div>

      {bio?.trim() ? (
        <div
          style={{
            marginTop: compact ? 12 : 14,
            borderTop: `1px solid ${borderColor}`,
            paddingTop: compact ? 12 : 14,
            paddingInline: 8,
            color: textMuted,
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, color: textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
            About the organization
          </div>
          {bio}
        </div>
      ) : isOwnWall && onCompleteBio ? (
        <div style={{ marginTop: compact ? 12 : 14, borderTop: `1px solid ${borderColor}`, paddingTop: compact ? 12 : 14, lineHeight: 1.6 }}>
          <div
            style={{
              border: `1px dashed ${borderColor}`,
              borderRadius: 10,
              padding: "12px 14px",
              background: "transparent",
              marginInline: 8,
            }}
          >
            <div style={{ fontSize: 13, color: textMuted, marginBottom: 8 }}>
              Add a short description of your organization for reviewers and candidates.
            </div>
            <button
              type="button"
              onClick={onCompleteBio}
              style={{
                background: "#111",
                color: "white",
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Add organization info
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
