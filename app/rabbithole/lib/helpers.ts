import type { RabbitholeThread } from "./types";

export function getThreadBreadcrumb(thread: RabbitholeThread): string[] {
  const breadcrumb: string[] = [];
  if (thread.topicName) breadcrumb.push(thread.topicName);
  if (thread.subtopic) breadcrumb.push(thread.subtopic);
  if (thread.tags.length > 0) breadcrumb.push(thread.tags[0]);
  return breadcrumb;
}

export function parseTrail(value?: string): string[] {
  if (!value) return [];
  return value.split("|").map((part) => decodeURIComponent(part)).filter(Boolean);
}

export function appendToTrail(trail: string[], nextStep: string): string {
  const updated = [...trail, nextStep];
  return updated.map((step) => encodeURIComponent(step)).join("|");
}
