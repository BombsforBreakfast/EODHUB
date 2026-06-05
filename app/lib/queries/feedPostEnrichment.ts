import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentReactionRow } from "../reactions";

export type FeedPostEnrichmentProfile = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean | null;
  is_pure_admin: boolean | null;
  email: string | null;
};

export type FeedPostEnrichmentComment = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
  image_url: string | null;
  gif_url: string | null;
  parent_comment_id: string | null;
};

type FeedPostEnrichmentRpcRow = {
  post_id: string;
  image_urls: string[] | null;
  post_reactions: ContentReactionRow[] | null;
  comments: FeedPostEnrichmentComment[] | null;
  comment_reactions: ContentReactionRow[] | null;
  profiles: FeedPostEnrichmentProfile[] | null;
};

export type FeedPostEnrichmentBundle = {
  multiPostImageMap: Map<string, string[]>;
  postReactionRows: ContentReactionRow[];
  comments: FeedPostEnrichmentComment[];
  commentReactionRows: ContentReactionRow[];
  profiles: FeedPostEnrichmentProfile[];
};

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export async function fetchFeedPostEnrichment(
  supabase: SupabaseClient,
  postIds: string[],
): Promise<FeedPostEnrichmentBundle | null> {
  if (postIds.length === 0) {
    return {
      multiPostImageMap: new Map(),
      postReactionRows: [],
      comments: [],
      commentReactionRows: [],
      profiles: [],
    };
  }

  const { data, error } = await supabase.rpc("get_feed_post_enrichment", {
    p_post_ids: postIds,
  });

  if (error) {
    console.warn("Feed post enrichment RPC unavailable; using legacy fan-out.", error.message);
    return null;
  }

  const rows = (data ?? []) as FeedPostEnrichmentRpcRow[];
  const multiPostImageMap = new Map<string, string[]>();
  const postReactionRows: ContentReactionRow[] = [];
  const comments: FeedPostEnrichmentComment[] = [];
  const commentReactionRows: ContentReactionRow[] = [];
  const profileById = new Map<string, FeedPostEnrichmentProfile>();

  rows.forEach((row) => {
    const imageUrls = asArray(row.image_urls).filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
    if (imageUrls.length > 0) {
      multiPostImageMap.set(row.post_id, imageUrls);
    }
    postReactionRows.push(...asArray(row.post_reactions));
    comments.push(...asArray(row.comments));
    commentReactionRows.push(...asArray(row.comment_reactions));
    asArray(row.profiles).forEach((profile) => {
      if (profile?.user_id) profileById.set(profile.user_id, profile);
    });
  });

  return {
    multiPostImageMap,
    postReactionRows,
    comments,
    commentReactionRows,
    profiles: [...profileById.values()],
  };
}
