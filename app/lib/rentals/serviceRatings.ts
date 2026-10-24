export type ServiceReview = {
  review_id: string;
  score: number;
  display_name: string;
  testimonial: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type RatingSummary = {
  average: number | null;
  count: number;
  mine: number | null;
  displayName: string;
  testimonial: string;
  reviews: ServiceReview[];
  distribution: { bombs: number; count: number }[];
  canManage: boolean;
};

export const ratingSortLabels = {
  featured: "Featured first",
  highest: "Highest rated",
  newest: "Newest first",
  lowest: "Lowest rated",
} as const;
export type RatingSort = keyof typeof ratingSortLabels;
export type ReviewPage = { reviews: ServiceReview[]; total: number; nextOffset: number | null };

export function reviewPageOptions(params: URLSearchParams) {
  const rawSort = params.get("sort") ?? "featured";
  const sort: RatingSort = Object.hasOwn(ratingSortLabels, rawSort) ? rawSort as RatingSort : "featured";
  const rawOffset = Number(params.get("offset") ?? 0);
  const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 1000000) : 0;
  return { sort, offset, pageSize: 20 };
}
