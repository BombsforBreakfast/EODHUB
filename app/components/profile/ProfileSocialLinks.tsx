"use client";

type Props = {
  linkedinUrl?: string | null;
};

export default function ProfileSocialLinks({ linkedinUrl }: Props) {
  const linkedIn = linkedinUrl?.trim();
  if (!linkedIn) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
      <a
        href={linkedIn}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LinkedIn profile"
        title="LinkedIn profile"
        style={{ display: "inline-flex", lineHeight: 0, borderRadius: 4 }}
      >
        <img
          src="/social/linkedin.png"
          alt=""
          width={28}
          height={28}
          style={{ display: "block", borderRadius: 4 }}
        />
      </a>
    </div>
  );
}
