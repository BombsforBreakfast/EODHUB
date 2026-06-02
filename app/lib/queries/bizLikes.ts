import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { queryKeys } from "../queryKeys";

export const BIZ_LIKES_STALE_MS = 5 * 60_000;

const APPROVED_BUSINESSES_KEY = ["businesses", "approved"] as const;

type ListingWithLikeCount = { id: string; like_count?: number | null };

export async function fetchBizLikes(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("business_likes")
    .select("business_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: { business_id: string }) => r.business_id);
}

export function likedBizIdsFromRows(ids: string[] | undefined): Set<string> {
  return new Set(ids ?? []);
}

function patchApprovedBusinessLikeCounts(
  queryClient: QueryClient,
  bizId: string,
  delta: number,
): void {
  const queries = queryClient.getQueriesData<ListingWithLikeCount[]>({
    queryKey: APPROVED_BUSINESSES_KEY,
  });
  for (const [key, rows] of queries) {
    if (!rows) continue;
    queryClient.setQueryData<ListingWithLikeCount[]>(
      key,
      rows.map((listing) =>
        listing.id === bizId
          ? { ...listing, like_count: Math.max(0, (listing.like_count ?? 0) + delta) }
          : listing,
      ),
    );
  }
}

export async function toggleBizLike({
  queryClient,
  supabase,
  userId,
  bizId,
  liked,
}: {
  queryClient: QueryClient;
  supabase: SupabaseClient;
  userId: string;
  bizId: string;
  liked: boolean;
}): Promise<void> {
  const likesKey = queryKeys.bizLikes(userId);
  const previousLikes = queryClient.getQueryData<string[]>(likesKey);
  const listingsSnapshots = queryClient.getQueriesData<ListingWithLikeCount[]>({
    queryKey: APPROVED_BUSINESSES_KEY,
  });

  if (previousLikes) {
    queryClient.setQueryData<string[]>(
      likesKey,
      liked
        ? previousLikes.filter((id) => id !== bizId)
        : previousLikes.includes(bizId)
          ? previousLikes
          : [...previousLikes, bizId],
    );
  } else if (!liked) {
    queryClient.setQueryData<string[]>(likesKey, [bizId]);
  }

  patchApprovedBusinessLikeCounts(queryClient, bizId, liked ? -1 : 1);

  try {
    if (liked) {
      const { error } = await supabase
        .from("business_likes")
        .delete()
        .eq("user_id", userId)
        .eq("business_id", bizId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("business_likes")
        .insert({ user_id: userId, business_id: bizId });
      if (error) throw error;
    }
  } catch (error) {
    if (previousLikes) queryClient.setQueryData(likesKey, previousLikes);
    else queryClient.removeQueries({ queryKey: likesKey });
    for (const [key, rows] of listingsSnapshots) {
      queryClient.setQueryData(key, rows);
    }
    throw error;
  } finally {
    void queryClient.invalidateQueries({ queryKey: likesKey });
    void queryClient.invalidateQueries({ queryKey: APPROVED_BUSINESSES_KEY });
  }
}
