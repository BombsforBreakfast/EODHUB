const MAX_SHARE_IMAGES = 4;

/** Accept only feed-images URLs uploaded under the posting user's folder. */
export function sanitizeClientFeedImageUrls(urls: unknown, userId: string): string[] {
  if (!Array.isArray(urls)) return [];

  const needle = `/feed-images/${userId}/`;
  const seen = new Set<string>();

  return urls
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.includes(needle) && !seen.has(value))
    .filter((value) => {
      seen.add(value);
      return true;
    })
    .slice(0, MAX_SHARE_IMAGES);
}
