import type { ReactionType } from "../../lib/reactions";

export type RabbitholeTopic = {
  slug: string;
  name: string;
  description: string;
  subtopics: string[];
  tags: string[];
};

export type RabbitholeThread = {
  id: string;
  title: string;
  /** Curator's Note — optional short annotation added at filing time. Not a copy of post content. */
  curatorNote?: string | null;
  topicSlug: string;
  topicName: string;
  subtopic?: string;
  tags: string[];
  author: string;
  createdAt: string;
  lastActivityAt: string;
  replyCount: number;
  isHighValue?: boolean;
  /**
   * 'feed' = promoted from the main feed (posts table)
   * 'unit' = promoted from a unit/group forum (unit_posts table)
   */
  sourceType: "feed" | "unit";
  /** ID of the feed post this thread was promoted from. */
  promotedFromPostId?: string | null;
  /** ID of the unit post this thread was promoted from. */
  promotedFromUnitPostId?: string | null;
};

export type RabbitholeReply = {
  id: string;
  threadId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type RabbitholeContentType =
  | "archived_post"
  | "document"
  | "video"
  | "article_news"
  | "external_link"
  | "resource";

export type RabbitholeContribution = {
  id: string;
  title: string;
  summary: string;
  contentType: RabbitholeContentType;
  categorySlug: string;
  categoryName: string;
  tags: string[];
  sourceUrl?: string | null;
  sourceDomain?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  createdBy: string;
  likeCount: number;
  commentCount: number;
  viewerLiked: boolean;
};

export type RabbitholeContributionComment = {
  id: string;
  contributionId: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
};

export type RabbitholeAssetStatus = "uploaded" | "processing" | "ready" | "failed" | "deleted";
export type RabbitholeAssetAccessLevel = "public" | "private" | "team";

export type RabbitholeAsset = {
  id: string;
  contributionId: string;
  storageProvider: "supabase" | string;
  bucket: string;
  objectKey: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  uploadedBy: string;
  accessLevel: RabbitholeAssetAccessLevel;
  status: RabbitholeAssetStatus;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Full post data used by the isolated post viewer in thread detail. */
export type IsolatedPost = {
  id: string;
  content: string | null;
  imageUrl: string | null;
  gifUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  ogUrl: string | null;
  createdAt: string;
  author: { id: string; name: string; photoUrl: string | null };
  likeCount: number;
  /** Unit forum binary like only — unset on feed posts that use reactions. */
  viewerLiked?: boolean;
  /** Feed posts (`content_reactions`, subject_kind post). */
  myReaction?: ReactionType | null;
  reactionCountsByType?: Partial<Record<ReactionType, number>>;
  reactorNamesByType?: Partial<Record<ReactionType, string[]>>;
  commentCount: number;
  sourceType: "feed" | "unit";
  /** For unit posts: the name of the unit it came from. */
  unitName?: string | null;
  unitSlug?: string | null;
};

export type IsolatedComment = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
  authorPhoto: string | null;
  imageUrl?: string | null;
  gifUrl?: string | null;
};
