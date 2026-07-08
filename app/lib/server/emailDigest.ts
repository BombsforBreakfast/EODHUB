import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import {
  buildDigestEmailHtml,
  buildDigestHomeUrl,
  buildNotificationPreferencesUrl,
  digestSubject,
  type DigestEmailItem,
  type DigestEmailSection,
  type DigestType,
} from "@/app/lib/email/digestEmail";
import { getAppOrigin } from "@/app/lib/email/verificationEmail";
import { getNotificationHref } from "@/app/lib/notificationNavigation";
import { hasFullPlatformAccess } from "@/app/lib/verificationAccess";

const EOD_HUB_TIME_ZONE = "America/New_York";
const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 50;
const SCHEDULE_WINDOW_MINUTES = 20;

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  display_name: string | null;
  email_verified: boolean | null;
  admin_verified: boolean | null;
  verification_status: string | null;
  is_admin: boolean | null;
  created_at: string | null;
};

type NotificationPreferenceRow = {
  user_id: string;
  email_notifications: boolean;
  morning_digest: boolean;
  evening_digest: boolean;
  timezone: string;
  digest_frequency: "twice_daily" | "daily" | "off";
  last_digest_sent_at: string | null;
};

type NotificationRow = {
  id: string;
  created_at: string;
  message: string | null;
  type: string | null;
  category: string | null;
  link: string | null;
  post_id: string | null;
  unit_id: string | null;
  unit_post_id: string | null;
  post_owner_id: string | null;
  metadata: Record<string, unknown> | null;
};

type Recipient = {
  profile: ProfileRow;
  preferences: NotificationPreferenceRow;
};

export type EmailDigestRunResult = {
  ok: true;
  digestType: DigestType;
  dryRun: boolean;
  scheduleSkipped: boolean;
  windowStart: string;
  windowEnd: string;
  batchSize: number;
  eligibleProfiles: number;
  eligiblePreferences: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicateSkipped: number;
  emptySkipped: number;
  dryRunRecipients: Array<{
    userId: string;
    personalItems: number;
    communityItems: number;
  }>;
  errors: string[];
};

type DigestWindow = {
  windowStart: Date;
  windowEnd: Date;
  localDate: { year: number; month: number; day: number };
};

function clampBatchSize(batchSize?: number): number {
  if (!Number.isFinite(batchSize ?? DEFAULT_BATCH_SIZE)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, Math.floor(batchSize ?? DEFAULT_BATCH_SIZE)));
}

function getZonedParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: EOD_HUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function timeZoneOffsetMs(date: Date): number {
  const parts = getZonedParts(date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
): Date {
  const wallTime = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  let utc = wallTime - timeZoneOffsetMs(new Date(wallTime));
  utc = wallTime - timeZoneOffsetMs(new Date(utc));
  return new Date(utc);
}

function addDays(local: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day + days, 12, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function getDigestWindow(now: Date, digestType: DigestType): DigestWindow {
  const localNow = getZonedParts(now);
  const localDate = { year: localNow.year, month: localNow.month, day: localNow.day };
  if (digestType === "morning") {
    const previous = addDays(localDate, -1);
    return {
      localDate,
      windowStart: zonedTimeToUtc({ ...previous, hour: 17, minute: 30 }),
      windowEnd: zonedTimeToUtc({ ...localDate, hour: 6, minute: 30 }),
    };
  }
  return {
    localDate,
    windowStart: zonedTimeToUtc({ ...localDate, hour: 6, minute: 30 }),
    windowEnd: zonedTimeToUtc({ ...localDate, hour: 17, minute: 30 }),
  };
}

function isWithinScheduleWindow(now: Date, digestType: DigestType): boolean {
  const local = getZonedParts(now);
  const currentMinutes = local.hour * 60 + local.minute;
  const targetMinutes = digestType === "morning" ? 6 * 60 + 30 : 17 * 60 + 30;
  return Math.abs(currentMinutes - targetMinutes) <= SCHEDULE_WINDOW_MINUTES;
}

function absoluteUrl(origin: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const base = getAppOrigin(origin);
  return `${base}${href.startsWith("/") ? href : `/${href}`}`;
}

function itemLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return fallback;
  return trimmed.length > 110 ? `${trimmed.slice(0, 107)}...` : trimmed;
}

function displayName(profile: ProfileRow): string {
  return profile.first_name?.trim() || profile.display_name?.trim() || "EOD Member";
}

async function ensureDefaultPreferences(
  adminClient: SupabaseClient,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  await adminClient.from("notification_preferences").upsert(
    userIds.map((userId) => ({ user_id: userId })),
    { onConflict: "user_id", ignoreDuplicates: true },
  );
}

async function loadRecipients(
  adminClient: SupabaseClient,
  digestType: DigestType,
  batchSize: number,
  window: DigestWindow,
  dryRun: boolean,
): Promise<{ recipients: Recipient[]; eligibleProfiles: number; eligiblePreferences: number }> {
  const { data: profileData, error: profileError } = await adminClient
    .from("profiles")
    .select("user_id, first_name, display_name, email_verified, admin_verified, verification_status, is_admin, created_at")
    .eq("email_verified", true)
    .eq("admin_verified", true)
    .eq("verification_status", "verified")
    .order("created_at", { ascending: true })
    .limit(500);

  if (profileError) throw new Error(profileError.message);

  const profiles = ((profileData ?? []) as ProfileRow[]).filter(hasFullPlatformAccess);
  await ensureDefaultPreferences(adminClient, profiles.map((profile) => profile.user_id));

  const { data: preferenceData, error: preferenceError } = await adminClient
    .from("notification_preferences")
    .select("user_id, email_notifications, morning_digest, evening_digest, timezone, digest_frequency, last_digest_sent_at")
    .in("user_id", profiles.map((profile) => profile.user_id));

  if (preferenceError) throw new Error(preferenceError.message);

  let alreadyHandledUserIds = new Set<string>();
  if (!dryRun && profiles.length > 0) {
    const { data: handledLogs } = await adminClient
      .from("digest_send_logs")
      .select("user_id")
      .eq("digest_type", digestType)
      .eq("window_start", window.windowStart.toISOString())
      .eq("window_end", window.windowEnd.toISOString())
      .in("status", ["sending", "sent", "skipped"])
      .in("user_id", profiles.map((profile) => profile.user_id));
    alreadyHandledUserIds = new Set(
      ((handledLogs ?? []) as { user_id: string }[]).map((row) => row.user_id),
    );
  }

  const profileById = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const recipients = ((preferenceData ?? []) as NotificationPreferenceRow[])
    .filter((preferences) => {
      if (alreadyHandledUserIds.has(preferences.user_id)) return false;
      if (!preferences.email_notifications) return false;
      if (preferences.digest_frequency === "off") return false;
      if (preferences.digest_frequency === "daily" && digestType !== "morning") return false;
      if (digestType === "morning" && !preferences.morning_digest) return false;
      if (digestType === "evening" && !preferences.evening_digest) return false;
      return profileById.has(preferences.user_id);
    })
    .map((preferences) => ({ profile: profileById.get(preferences.user_id)!, preferences }))
    .sort((a, b) => {
      const aTime = a.preferences.last_digest_sent_at
        ? new Date(a.preferences.last_digest_sent_at).getTime()
        : 0;
      const bTime = b.preferences.last_digest_sent_at
        ? new Date(b.preferences.last_digest_sent_at).getTime()
        : 0;
      return aTime - bTime;
    })
    .slice(0, batchSize);

  return {
    recipients,
    eligibleProfiles: profiles.length,
    eligiblePreferences: (preferenceData ?? []).length,
  };
}

async function buildPersonalSections(
  adminClient: SupabaseClient,
  userId: string,
  isAdmin: boolean,
  origin: string,
  window: DigestWindow,
): Promise<DigestEmailSection[]> {
  const { data: notificationsData } = await adminClient
    .from("notifications")
    .select("id, created_at, message, type, category, link, post_id, unit_id, unit_post_id, post_owner_id, metadata")
    .eq("recipient_user_id", userId)
    .is("archived_at", null)
    .gte("created_at", window.windowStart.toISOString())
    .lte("created_at", window.windowEnd.toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  const notifications = (notificationsData ?? []) as NotificationRow[];
  const notificationItems: DigestEmailItem[] = notifications.map((notification) => ({
    label: itemLabel(notification.message, "New EOD-HUB notification"),
    href: absoluteUrl(
      origin,
      getNotificationHref(
        { ...notification, message: notification.message ?? "" },
        { currentUserId: userId, isAdmin },
      ),
    ),
    meta: notification.category ?? notification.type,
  }));

  const { data: conversationsData } = await adminClient
    .from("conversations")
    .select("id, participant_1, participant_2, status")
    .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
    .eq("status", "accepted");

  const conversationIds = ((conversationsData ?? []) as { id: string }[]).map((row) => row.id);
  let unreadMessageCount = 0;
  if (conversationIds.length > 0) {
    const { count } = await adminClient
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .neq("sender_id", userId)
      .eq("is_read", false)
      .gte("created_at", window.windowStart.toISOString())
      .lte("created_at", window.windowEnd.toISOString());
    unreadMessageCount = count ?? 0;
  }

  const messageItems: DigestEmailItem[] =
    unreadMessageCount > 0
      ? [{
          label: `${unreadMessageCount} unread message${unreadMessageCount === 1 ? "" : "s"}`,
          href: absoluteUrl(origin, "/sidebar"),
          meta: "Messages",
        }]
      : [];

  return [
    { title: "Personal activity", items: notificationItems },
    { title: "Unread messages", items: messageItems },
  ].filter((section) => section.items.length > 0);
}

async function buildCommunitySections(
  adminClient: SupabaseClient,
  origin: string,
  window: DigestWindow,
): Promise<DigestEmailSection[]> {
  const windowStart = window.windowStart.toISOString();
  const windowEnd = window.windowEnd.toISOString();

  const [jobsRes, postsRes, eventsRes, groupsRes, marketplaceRes, trendingRes] = await Promise.all([
    adminClient
      .from("jobs")
      .select("id, title, company_name, location, created_at")
      .eq("is_approved", true)
      .neq("is_rejected", true)
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(5),
    adminClient
      .from("posts")
      .select("id, content, content_type, og_title, created_at")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(5),
    adminClient
      .from("events")
      .select("id, title, organization, date, created_at")
      .eq("visibility", "public")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(5),
    adminClient
      .from("units")
      .select("id, name, slug, type, created_at")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(5),
    adminClient
      .from("marketplace_listings")
      .select("id, title, category, location, created_at")
      .eq("approved", true)
      .eq("status", "active")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("created_at", { ascending: false })
      .limit(5),
    adminClient
      .from("ranked_posts")
      .select("id, content, created_at, ranking_score")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .order("ranking_score", { ascending: false })
      .limit(3),
  ]);

  const sections: DigestEmailSection[] = [
    {
      title: "New jobs",
      items: ((jobsRes.data ?? []) as Array<Record<string, unknown>>).map((job) => ({
        label: itemLabel(job.title, "New job listing"),
        href: absoluteUrl(origin, `/job/${String(job.id)}`),
        meta: [job.company_name, job.location].filter((v) => typeof v === "string" && v).join(" · "),
      })),
    },
    {
      title: "New posts",
      items: ((postsRes.data ?? []) as Array<Record<string, unknown>>).map((post) => ({
        label: itemLabel(post.og_title ?? post.content, "New community post"),
        href: absoluteUrl(origin, `/?postId=${String(post.id)}`),
        meta: typeof post.content_type === "string" ? post.content_type : "Community",
      })),
    },
    {
      title: "New events",
      items: ((eventsRes.data ?? []) as Array<Record<string, unknown>>).map((event) => ({
        label: itemLabel(event.title, "New EOD-HUB event"),
        href: absoluteUrl(origin, "/events"),
        meta: [event.organization, event.date].filter((v) => typeof v === "string" && v).join(" · "),
      })),
    },
    {
      title: "New groups",
      items: ((groupsRes.data ?? []) as Array<Record<string, unknown>>).map((group) => ({
        label: itemLabel(group.name, "New group"),
        href: absoluteUrl(origin, `/units/${String(group.slug ?? "")}`),
        meta: typeof group.type === "string" ? group.type : "Group",
      })),
    },
    {
      title: "New businesses and resources",
      items: ((marketplaceRes.data ?? []) as Array<Record<string, unknown>>).map((listing) => ({
        label: itemLabel(listing.title, "New Lemon Lot listing"),
        href: absoluteUrl(origin, "/directory"),
        meta: [listing.category, listing.location].filter((v) => typeof v === "string" && v).join(" · "),
      })),
    },
    {
      title: "Trending content",
      items: ((trendingRes.data ?? []) as Array<Record<string, unknown>>).map((post) => ({
        label: itemLabel(post.content, "Trending community post"),
        href: absoluteUrl(origin, `/?postId=${String(post.id)}`),
        meta: "Trending now",
      })),
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

function countItems(sections: DigestEmailSection[]): number {
  return sections.reduce((sum, section) => sum + section.items.length, 0);
}

async function logSkipped(
  adminClient: SupabaseClient,
  recipient: Recipient,
  digestType: DigestType,
  window: DigestWindow,
  reason: string,
): Promise<void> {
  await adminClient.from("digest_send_logs").insert({
    user_id: recipient.profile.user_id,
    digest_type: digestType,
    window_start: window.windowStart.toISOString(),
    window_end: window.windowEnd.toISOString(),
    status: "skipped",
    error_message: reason,
  });
}

export async function runEmailDigest(
  adminClient: SupabaseClient,
  params: {
    digestType: DigestType;
    dryRun: boolean;
    origin: string;
    batchSize?: number;
    enforceScheduleWindow?: boolean;
  },
): Promise<EmailDigestRunResult> {
  const now = new Date();
  const batchSize = clampBatchSize(params.batchSize);
  const window = getDigestWindow(now, params.digestType);
  const errors: string[] = [];

  const result: EmailDigestRunResult = {
    ok: true,
    digestType: params.digestType,
    dryRun: params.dryRun,
    scheduleSkipped: false,
    windowStart: window.windowStart.toISOString(),
    windowEnd: window.windowEnd.toISOString(),
    batchSize,
    eligibleProfiles: 0,
    eligiblePreferences: 0,
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    duplicateSkipped: 0,
    emptySkipped: 0,
    dryRunRecipients: [],
    errors,
  };

  if (
    params.enforceScheduleWindow !== false &&
    !params.dryRun &&
    !isWithinScheduleWindow(now, params.digestType)
  ) {
    return { ...result, scheduleSkipped: true };
  }

  const { recipients, eligibleProfiles, eligiblePreferences } = await loadRecipients(
    adminClient,
    params.digestType,
    batchSize,
    window,
    params.dryRun,
  );
  result.eligibleProfiles = eligibleProfiles;
  result.eligiblePreferences = eligiblePreferences;

  const communitySections = await buildCommunitySections(adminClient, params.origin, window);
  const communityItemCount = countItems(communitySections);
  const resend = !params.dryRun && process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

  for (const recipient of recipients) {
    result.processed += 1;
    const userId = recipient.profile.user_id;

    try {
      const personalSections = await buildPersonalSections(
        adminClient,
        userId,
        Boolean(recipient.profile.is_admin),
        params.origin,
        window,
      );
      const personalItemCount = countItems(personalSections);

      if (params.dryRun) {
        result.dryRunRecipients.push({
          userId,
          personalItems: personalItemCount,
          communityItems: communityItemCount,
        });
        if (personalItemCount === 0 && communityItemCount === 0) {
          result.emptySkipped += 1;
          result.skipped += 1;
        }
        continue;
      }

      if (personalItemCount === 0 && communityItemCount === 0) {
        result.emptySkipped += 1;
        result.skipped += 1;
        await logSkipped(adminClient, recipient, params.digestType, window, "empty_digest");
        continue;
      }

      const { data: claim, error: claimError } = await adminClient
        .from("digest_send_logs")
        .insert({
          user_id: userId,
          digest_type: params.digestType,
          window_start: window.windowStart.toISOString(),
          window_end: window.windowEnd.toISOString(),
          status: "sending",
        })
        .select("id")
        .single();

      if (claimError || !claim) {
        result.duplicateSkipped += 1;
        result.skipped += 1;
        continue;
      }

      if (!resend) {
        result.failed += 1;
        await adminClient
          .from("digest_send_logs")
          .update({ status: "failed", error_message: "RESEND_API_KEY not configured" })
          .eq("id", (claim as { id: string }).id);
        continue;
      }

      const { data: userData } = await adminClient.auth.admin.getUserById(userId);
      const email = userData?.user?.email ?? null;
      if (!email) {
        result.failed += 1;
        await adminClient
          .from("digest_send_logs")
          .update({ status: "failed", error_message: "No auth email for user" })
          .eq("id", (claim as { id: string }).id);
        continue;
      }

      const origin = getAppOrigin(params.origin);
      const { data: sendData, error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
        to: email,
        subject: digestSubject(params.digestType),
        html: buildDigestEmailHtml({
          firstName: displayName(recipient.profile),
          digestType: params.digestType,
          personalSections,
          communitySections,
          digestUrl: buildDigestHomeUrl(origin),
          preferencesUrl: buildNotificationPreferencesUrl(origin),
        }),
      });

      if (sendError) {
        result.failed += 1;
        await adminClient
          .from("digest_send_logs")
          .update({ status: "failed", error_message: sendError.message })
          .eq("id", (claim as { id: string }).id);
        continue;
      }

      const sentAt = new Date().toISOString();
      await Promise.all([
        adminClient
          .from("digest_send_logs")
          .update({
            status: "sent",
            sent_at: sentAt,
            resend_message_id: sendData?.id ?? null,
          })
          .eq("id", (claim as { id: string }).id),
        adminClient
          .from("notification_preferences")
          .update({ last_digest_sent_at: sentAt })
          .eq("user_id", userId),
      ]);
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      errors.push(err instanceof Error ? err.message : "Unknown digest error");
    }
  }

  return result;
}

export type { DigestType };
