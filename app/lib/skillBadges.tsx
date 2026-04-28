import type { CSSProperties } from "react";

/**
 * Public skill badge assets live under /public/skill-badges/ and are keyed by
 * the exact `profiles.skill_badge` string. Unknown values fall back to text.
 */
const SKILL_BADGE_PATHS: Record<string, string> = {
  Master: "/skill-badges/master.png",
  Senior: "/skill-badges/senior.png",
  Basic: "/skill-badges/basic.png",
  "LEO/FED": "/skill-badges/leo-fed.png",
};

export function getSkillBadgePublicPath(skillBadge: string | null | undefined): string | null {
  if (!skillBadge?.trim()) return null;
  return SKILL_BADGE_PATHS[skillBadge] ?? null;
}

type SkillBadgeValueProps = {
  skillBadge: string | null | undefined;
  notSetLabel?: string;
  width?: number;
  style?: CSSProperties;
};

export function SkillBadgeValue({
  skillBadge,
  notSetLabel = "Not added yet",
  width = 58,
  style,
}: SkillBadgeValueProps) {
  const path = getSkillBadgePublicPath(skillBadge);
  if (!skillBadge?.trim()) {
    return <span>{notSetLabel}</span>;
  }
  if (path) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small local badge asset
      <img
        src={path}
        alt={skillBadge}
        title={skillBadge}
        style={{
          width,
          height: "auto",
          display: "inline-block",
          verticalAlign: "middle",
          ...style,
        }}
      />
    );
  }
  return <span>{skillBadge}</span>;
}
