"use client";

import { MemorialScrapbookPreview } from "../memorial/scrapbook";
import type { MemorialScrapbookTheme } from "../memorial/scrapbook/types";

type EventScrapbookPreviewProps = {
  eventId: string;
  t: MemorialScrapbookTheme;
  accentColor: string;
  variant?: "full" | "compact";
  isMobile?: boolean;
  panelBackground?: string;
  scrapbookActorUserId?: string | null;
  scrapbookActorIsAdmin?: boolean;
};

export default function EventScrapbookPreview({
  eventId,
  t,
  accentColor,
  variant = "full",
  isMobile,
  panelBackground,
  scrapbookActorUserId,
  scrapbookActorIsAdmin,
}: EventScrapbookPreviewProps) {
  return (
    <MemorialScrapbookPreview
      targetId={eventId}
      subjectType="event"
      nounLabel="event"
      t={t}
      accentColor={accentColor}
      variant={variant}
      isMobile={isMobile}
      panelBackground={panelBackground}
      scrapbookActorUserId={scrapbookActorUserId}
      scrapbookActorIsAdmin={scrapbookActorIsAdmin}
    />
  );
}
