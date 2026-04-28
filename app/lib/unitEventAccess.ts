export type ScopedEventLike = {
  unit_id?: string | null;
  visibility?: string | null;
};

export function isPublicEvent(event: ScopedEventLike) {
  return !event.unit_id && (event.visibility ?? "public") === "public";
}

export function isGroupEvent(event: ScopedEventLike) {
  return Boolean(event.unit_id) || event.visibility === "group";
}

export function isEventVisibleToViewer(event: ScopedEventLike, visibleUnitIds: Set<string>) {
  if (isPublicEvent(event)) return true;
  return Boolean(event.unit_id && visibleUnitIds.has(event.unit_id));
}

export function filterEventsVisibleToViewer<T extends ScopedEventLike>(events: T[], visibleUnitIds: Set<string>) {
  return events.filter((event) => isEventVisibleToViewer(event, visibleUnitIds));
}
