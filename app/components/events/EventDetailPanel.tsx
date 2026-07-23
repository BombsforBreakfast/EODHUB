import { httpsAssetUrl } from "@/app/lib/urlPreview";
import ExpandableText from "../ExpandableText";
import type { EventCardModel, EventCardTheme } from "./EventCalendarCard";

type Props = {
  event: EventCardModel;
  theme: EventCardTheme;
};

/** Detail panel matching the /events selected-event modal content. */
export function EventDetailPanel({ event, theme: t }: Props) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {event.image_url ? (
        <div
          style={{
            width: "100%",
            maxHeight: 320,
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${t.border}`,
            background: t.bg,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={httpsAssetUrl(event.image_url)}
            alt=""
            style={{ width: "100%", height: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
          />
        </div>
      ) : null}

      <div>
        <div style={{ fontSize: 20, fontWeight: 900, color: t.text, lineHeight: 1.25 }}>{event.title}</div>
        {event.organization ? (
          <div style={{ fontSize: 14, color: t.textMuted, marginTop: 4 }}>{event.organization}</div>
        ) : null}
      </div>

      <div style={{ fontSize: 14, color: t.text, display: "grid", gap: 6 }}>
        <div>
          <strong>Date:</strong>{" "}
          {new Date(`${event.date}T12:00:00`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </div>
        {event.event_time ? (
          <div>
            <strong>Time:</strong> {event.event_time}
          </div>
        ) : null}
        {event.location ? (
          <div>
            <strong>Location:</strong> {event.location}
          </div>
        ) : null}
        {(event.poc_name || event.poc_phone) && (
          <div>
            <strong>Point of Contact:</strong> {event.poc_name ?? ""}
            {event.poc_name && event.poc_phone ? " — " : ""}
            {event.poc_phone ?? ""}
          </div>
        )}
        {event.signup_url ? (
          <div>
            <strong>Sign up:</strong>{" "}
            <a href={event.signup_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb", fontWeight: 700 }}>
              {event.signup_url}
            </a>
          </div>
        ) : null}
      </div>

      {event.description ? (
        <ExpandableText
          textLength={event.description.length}
          maxLines={5}
          minCharsToToggle={160}
          expandLabel="...show more"
          collapseLabel="Show less"
          toggleColor={t.textMuted}
          style={{ fontSize: 14, color: t.text, lineHeight: 1.55 }}
        >
          {event.description}
        </ExpandableText>
      ) : null}
    </div>
  );
}
