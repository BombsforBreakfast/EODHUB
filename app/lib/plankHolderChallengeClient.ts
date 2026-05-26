"use client";

import { track } from "@vercel/analytics";
import { supabase } from "./lib/supabaseClient";

export const PLANK_HOLDER_CAP = 50;

/** localStorage key — earned-state feed banner stays dismissed permanently per user. */
export function plankHolderBannerDismissedKey(userId: string): string {
  return `eod_plank_holder_banner_dismissed:${userId}`;
}

export type PlankHolderTaskKey = "profilePhoto" | "bio" | "contribution" | "connection" | "invite";

export type PlankHolderProgress = Record<PlankHolderTaskKey, boolean> & {
  completedCount: number;
  total: 5;
};

export type PlankHolderResponse = {
  ok: true;
  eligible: boolean;
  progress: PlankHolderProgress;
  awarded: boolean;
  plankHolderNumber?: number;
  claimedCount: number;
  remainingSpots: number;
  alreadyClosed: boolean;
  seenModal: boolean;
};

export type PlankHolderToastState = {
  title: string;
  detail: string;
  progress: string;
} | null;

export const PLANK_HOLDER_TASK_LABELS: Record<PlankHolderTaskKey, string> = {
  profilePhoto: "Add profile photo",
  bio: "Complete your bio (50 character min)",
  contribution: "First Contribution",
  connection: "Connect With Another Tech",
  invite: "Invite a teammate w/ your referral code",
};

export const PLANK_HOLDER_TASK_HINTS: Record<PlankHolderTaskKey, string> = {
  profilePhoto: "",
  bio: "Write 50+ characters about you on your profile.",
  contribution:
    "Counts: post, comment, react, vote in a poll, RSVP an event, post a job, add a business or resource, or review/comment on one.",
  connection: "Send or accept one Know request in the user directory.",
  invite: "Copy your referral link, share it, or open the QR code.",
};

export const PLANK_HOLDER_TASK_ORDER: PlankHolderTaskKey[] = [
  "profilePhoto",
  "bio",
  "contribution",
  "connection",
  "invite",
];

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function postChallenge<T>(url: string): Promise<T | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  const res = await fetch(url, { method: "POST", headers });
  const json = (await res.json().catch(() => null)) as T | { error?: string } | null;
  if (!res.ok) {
    const message = json && typeof json === "object" && "error" in json ? json.error : undefined;
    throw new Error(message || "Challenge request failed.");
  }
  return json as T;
}

export async function fetchPlankHolderProgress(): Promise<PlankHolderResponse | null> {
  return postChallenge<PlankHolderResponse>("/api/challenges/plank-holder/check-award");
}

export async function recordPlankHolderInvite(): Promise<PlankHolderResponse | null> {
  return postChallenge<PlankHolderResponse>("/api/challenges/plank-holder/record-invite");
}

export async function dismissPlankHolderModal(): Promise<void> {
  await postChallenge<{ ok: true }>("/api/challenges/plank-holder/dismiss-modal");
}

export function getNextIncompleteTask(progress: PlankHolderProgress | null | undefined): PlankHolderTaskKey | null {
  if (!progress) return null;
  return PLANK_HOLDER_TASK_ORDER.find((task) => !progress[task]) ?? null;
}

export function getTaskCtaHref(task: PlankHolderTaskKey | null, userId: string | null): string {
  if (!task) return userId ? `/profile/${userId}` : "/";
  if (task === "profilePhoto") return userId ? `/profile/${userId}?challenge=photo` : "/";
  if (task === "bio") return userId ? `/profile/${userId}?challenge=bio` : "/";
  if (task === "contribution") return "/";
  if (task === "connection") return "/user-directory";
  if (task === "invite") return userId ? `/profile/${userId}?challenge=invite` : "/";
  return "/";
}

export function newlyCompletedTasks(
  previous: PlankHolderProgress | null | undefined,
  next: PlankHolderProgress | null | undefined,
): PlankHolderTaskKey[] {
  if (!previous || !next) return [];
  return PLANK_HOLDER_TASK_ORDER.filter((task) => !previous[task] && next[task]);
}

export function trackPlankHolderEvent(
  name: "challenge_viewed" | "challenge_cta_clicked" | "challenge_task_completed" | "challenge_awarded",
  props: {
    task?: PlankHolderTaskKey;
    completedCount?: number;
    claimedCount?: number;
    remainingSpots?: number;
  } = {},
) {
  track(name, {
    challenge: "plank_holder",
    ...props,
  });
}
