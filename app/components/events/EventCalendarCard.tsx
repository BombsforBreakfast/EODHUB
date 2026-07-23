import { httpsAssetUrl } from "@/app/lib/urlPreview";

export type EventCardTheme = {
  text: string;
  textMuted: string;
  textFaint?: string;
  border: string;
  bg: string;
  surface: string;
};

export type EventCardModel = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  organization: string | null;
  signup_url: string | null;
  image_url: string | null;
  location: string | null;
  event_time: string | null;
  poc_name: string | null;
  poc_phone: string | null;
};

function dateParts(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return {
    month: d.toLocaleDateString("en-US", { month: "short" }),
    day: d.getDate(),
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    isToday: dateStr === new Date().toISOString().slice(0, 10),
  };
}

type Props = {
  event: EventCardModel;
  theme: EventCardTheme;
  /** When true, show source badge text if provided */
  sourceLabel?: string | null;
  onOpen?: () => void;
};

/** Presentational calendar list card matching /events upcoming layout. */
export function EventCalendarCard({ event, theme: t, sourceLabel, onOpen }: Props) {
  const { month, day, weekday, isToday } = dateParts(event.date);
  const meta = [event.event_time, event.location, event.organization].filter(Boolean).join(" • ");

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 14,
        background: t.surface,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 52,
          background: isToday ? "#f59e0b" : "#1a1a1a",
          color: "white",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 4px",
          gap: 1,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 }}>
          {month}
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1 }}>{day}</div>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.9, marginTop: 2 }}>
          {weekday}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {event.image_url ? (
            <button
              type="button"
              onClick={onOpen}
              aria-label={`Open details for ${event.title}`}
              style={{
                flexShrink: 0,
                width: 88,
                height: 88,
                borderRadius: 10,
                overflow: "hidden",
                border: `1px solid ${t.border}`,
                background: t.bg,
                padding: 0,
                cursor: onOpen ? "pointer" : "default",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={httpsAssetUrl(event.image_url)}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ) : null}

          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              type="button"
              onClick={onOpen}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                cursor: onOpen ? "pointer" : "default",
                textAlign: "left",
                font: "inherit",
                color: t.text,
                fontWeight: 800,
                fontSize: 16,
                lineHeight: 1.2,
              }}
            >
              {event.title}
            </button>
            {event.organization ? (
              <div style={{ fontSize: 13, color: t.textMuted, marginTop: 3 }}>{event.organization}</div>
            ) : null}
            {meta ? (
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>{meta}</div>
            ) : null}
            {event.description ? (
              <div
                style={{
                  fontSize: 13,
                  color: t.textMuted,
                  marginTop: 6,
                  lineHeight: 1.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                }}
              >
                {event.description}
              </div>
            ) : null}
            {sourceLabel ? (
              <div style={{ fontSize: 11, fontWeight: 700, color: t.textFaint ?? t.textMuted, marginTop: 8 }}>
                {sourceLabel}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
