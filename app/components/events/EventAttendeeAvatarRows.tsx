"use client";

import { useTheme } from "../../lib/ThemeContext";
import { LikerAvatar, type PostLikerBrief } from "../PostLikersStack";

const MAX_AVATARS = 4;
const AVATAR_SIZE = 26;
const OVERLAP = -6;

type RowProps = {
  label: string;
  likers: PostLikerBrief[];
  onOpenList: () => void;
};

function AvatarRow({ label, likers, onOpenList }: RowProps) {
  const { t } = useTheme();
  if (likers.length === 0) return null;

  const show = likers.slice(0, MAX_AVATARS);
  const extra = Math.max(0, likers.length - MAX_AVATARS);

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          marginTop: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            lineHeight: 0,
          }}
          aria-label={`${label} — show full list`}
        >
          {show.map((liker, i) => (
            <button
              key={liker.userId}
              type="button"
              title={liker.name}
              onClick={onOpenList}
              style={{
                marginLeft: i === 0 ? 0 : OVERLAP,
                position: "relative",
                zIndex: show.length - i,
                padding: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                lineHeight: 0,
                borderRadius: "50%",
              }}
            >
              <LikerAvatar
                photoUrl={liker.photoUrl}
                name={liker.name}
                size={AVATAR_SIZE}
                service={liker.service}
                isEmployer={liker.isEmployer}
              />
            </button>
          ))}
          {extra > 0 && (
            <button
              type="button"
              onClick={onOpenList}
              style={{
                marginLeft: 6,
                background: t.bg,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                minWidth: 28,
                height: AVATAR_SIZE,
                padding: "0 6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: t.textMuted,
                fontSize: 12,
                fontWeight: 800,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              +{extra}
            </button>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            color: t.textMuted,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

type Props = {
  interested: PostLikerBrief[];
  going: PostLikerBrief[];
  onOpenInterested: () => void;
  onOpenGoing: () => void;
};

/**
 * Stacked avatars for event RSVP, shown under the Interested/Going buttons.
 * Matches PostLikersStack overlap; labels show total counts.
 */
export default function EventAttendeeAvatarRows({ interested, going, onOpenInterested, onOpenGoing }: Props) {
  if (interested.length === 0 && going.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        width: "100%",
        marginTop: 8,
        alignItems: "flex-start",
      }}
    >
      {interested.length > 0 && (
        <AvatarRow
          label={`${interested.length} interested`}
          likers={interested}
          onOpenList={onOpenInterested}
        />
      )}
      {going.length > 0 && (
        <AvatarRow
          label={`${going.length} going`}
          likers={going}
          onOpenList={onOpenGoing}
        />
      )}
    </div>
  );
}
