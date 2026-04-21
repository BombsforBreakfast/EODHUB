"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "../lib/ThemeContext";
import type { Theme } from "../lib/theme";
import { supabase } from "../lib/lib/supabaseClient";
import ContributeToRabbitholeModal from "./components/ContributeToRabbitholeModal";
import { appendToTrail } from "./lib/helpers";
import { fetchRabbitholeContributions, fetchRabbitholeThreads, fetchRabbitholeTopics } from "./lib/dataClient";
import type { RabbitholeContentType, RabbitholeContribution, RabbitholeThread, RabbitholeTopic } from "./lib/types";

type FilterState = {
  keyword: string;
  topicSlug: string;
  contentType: "" | RabbitholeContentType;
  sort: "newest" | "most_relevant";
};

const DEFAULT_FILTERS: FilterState = { keyword: "", topicSlug: "", contentType: "", sort: "newest" };

function normalize(s: string) {
  return s.toLowerCase().trim();
}

type ListingItem =
  | { kind: "thread"; updatedAt: string; thread: RabbitholeThread }
  | { kind: "contribution"; updatedAt: string; contribution: RabbitholeContribution };

function contentTypeLabel(type: RabbitholeContentType): string {
  switch (type) {
    case "archived_post":
      return "Archived Post";
    case "article_news":
      return "Article / News";
    case "external_link":
      return "External Link";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

export default function RabbitholeHomePageClient() {
  const { t } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [topics, setTopics] = useState<RabbitholeTopic[]>([]);
  const [threads, setThreads] = useState<RabbitholeThread[]>([]);
  const [contributions, setContributions] = useState<RabbitholeContribution[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const queryType = (searchParams.get("contentType") ?? "") as "" | RabbitholeContentType;
  const queryContribute = searchParams.get("contribute");
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    contentType: queryType || "",
  }));
  const [contributeOpen, setContributeOpen] = useState(queryContribute === "1");
  const [isMobile, setIsMobile] = useState(false);

  // Tag filter from URL (?tag=)
  const activeTag = searchParams.get("tag") ?? null;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      if (mounted) setViewerUserId(userId);
      const [topicsData, threadsData, contributionData] = await Promise.all([
        fetchRabbitholeTopics(supabase),
        fetchRabbitholeThreads(supabase, { limit: 200 }),
        fetchRabbitholeContributions(supabase, { limit: 200, viewerUserId: userId }),
      ]);
      if (!mounted) return;
      setTopics(topicsData);
      setThreads(threadsData);
      setContributions(contributionData);
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedTag = activeTag ? normalize(activeTag) : null;
    const kw = normalize(filters.keyword);
    let items: ListingItem[] = [
      ...threads.map((thread) => ({ kind: "thread" as const, updatedAt: thread.lastActivityAt, thread })),
      ...contributions.map((contribution) => ({
        kind: "contribution" as const,
        updatedAt: contribution.lastActivityAt,
        contribution,
      })),
    ];

    if (normalizedTag) {
      items = items.filter((item) => {
        const tags = item.kind === "thread" ? item.thread.tags : item.contribution.tags;
        return tags.some((tag) => normalize(tag) === normalizedTag);
      });
    }

    if (filters.topicSlug) {
      items = items.filter((item) =>
        item.kind === "thread"
          ? item.thread.topicSlug === filters.topicSlug
          : item.contribution.categorySlug === filters.topicSlug
      );
    }

    if (filters.contentType) {
      items = items.filter((item) =>
        item.kind === "thread"
          ? filters.contentType === "archived_post"
          : item.contribution.contentType === filters.contentType
      );
    }

    if (kw) {
      items = items.filter((item) => {
        const haystack =
          item.kind === "thread"
            ? [item.thread.title, item.thread.curatorNote ?? "", item.thread.subtopic ?? "", ...item.thread.tags, item.thread.topicName]
            : [
                item.contribution.title,
                item.contribution.summary,
                item.contribution.sourceDomain ?? "",
                ...item.contribution.tags,
                item.contribution.categoryName,
                contentTypeLabel(item.contribution.contentType),
              ];
        return haystack.join(" ").toLowerCase().includes(kw);
      });
    }

    if (filters.sort === "most_relevant" && kw) {
      return items
        .map((item) => {
          const text =
            item.kind === "thread"
              ? [item.thread.title, item.thread.curatorNote ?? "", ...item.thread.tags].join(" ").toLowerCase()
              : [item.contribution.title, item.contribution.summary, ...item.contribution.tags].join(" ").toLowerCase();
          let score = 0;
          if (text.includes(kw)) score += 2;
          if (
            (item.kind === "thread" ? item.thread.title : item.contribution.title)
              .toLowerCase()
              .includes(kw)
          ) {
            score += 4;
          }
          return { item, score };
        })
        .sort((a, b) => (b.score - a.score) || b.item.updatedAt.localeCompare(a.item.updatedAt))
        .map((entry) => entry.item);
    }

    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [threads, contributions, filters, activeTag]);

  function clearContributeQuery() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("contribute");
    const q = next.toString();
    router.replace(q ? `/rabbithole?${q}` : "/rabbithole");
  }

  function openContributeModal() {
    setContributeOpen(true);
    const next = new URLSearchParams(searchParams.toString());
    next.set("contribute", "1");
    const q = next.toString();
    router.replace(`/rabbithole?${q}`);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${t.inputBorder ?? t.border}`,
    background: t.input ?? t.surface,
    color: t.text,
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1800,
        margin: "0 auto",
        padding: "24px 20px",
        boxSizing: "border-box",
        background: t.bg,
        minHeight: "100vh",
        color: t.text,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src="/rabbithole-mascot.png"
              alt=""
              width={44}
              height={44}
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: `1px solid ${t.border}` }}
            />
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Rabbithole</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                color: "#475569",
                fontWeight: 600,
                fontStyle: "italic",
                padding: "6px 0",
              }}
            >
              Archive — filed from feed/groups plus curated contributions
            </span>
            <button type="button" onClick={openContributeModal} style={contributeButtonStyle}>
              Contribute to RabbitHole
            </button>
          </div>
        </div>
        <div style={{ marginTop: 6, fontSize: 14, color: t.textMuted, maxWidth: 700 }}>
          Long-term knowledge archive — filed platform content and structured external resources in one retrievable layer.
        </div>
      </div>

      {/* Filter bar */}
      <div
        style={{
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          background: t.surface,
          padding: 12,
          marginBottom: 14,
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : "1fr minmax(160px, 220px) minmax(150px, 180px) minmax(130px, 160px)",
          gap: 10,
        }}
      >
        <input
          type="text"
          value={filters.keyword}
          onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
          placeholder="Search title, body, or tag…"
          style={inputStyle}
        />
        <select
          value={filters.topicSlug}
          onChange={(e) => setFilters((prev) => ({ ...prev, topicSlug: e.target.value }))}
          style={inputStyle}
        >
          <option value="">All topics</option>
          {topics.map((topic) => (
            <option key={topic.slug} value={topic.slug}>
              {topic.name}
            </option>
          ))}
        </select>
        <select
          value={filters.contentType}
          onChange={(e) => setFilters((prev) => ({ ...prev, contentType: e.target.value as FilterState["contentType"] }))}
          style={inputStyle}
        >
          <option value="">All content types</option>
          <option value="archived_post">Archived Post</option>
          <option value="document">Document</option>
          <option value="video">Video</option>
          <option value="article_news">Article / News</option>
          <option value="external_link">External Link</option>
          <option value="resource">Resource</option>
        </select>
        <select
          value={filters.sort}
          onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value as FilterState["sort"] }))}
          style={inputStyle}
        >
          <option value="newest">Sort: newest</option>
          <option value="most_relevant">Sort: most relevant</option>
        </select>
      </div>

      {/* Active tag chip */}
      {activeTag && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            padding: "7px 12px",
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            background: t.surface,
            width: "fit-content",
          }}
        >
          <span style={{ fontSize: 13, color: t.text }}>
            Tag: <strong>#{activeTag}</strong>
          </span>
          <button
            type="button"
            onClick={() => router.push("/rabbithole")}
            style={{
              background: "transparent",
              border: `1px solid ${t.border}`,
              borderRadius: 6,
              padding: "1px 8px",
              fontSize: 12,
              color: t.textMuted,
              cursor: "pointer",
            }}
          >
            Clear ×
          </button>
        </div>
      )}

      {/* Result count */}
      {!loading && (
        <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 10 }}>
          {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
          {activeTag ? ` tagged "${activeTag}"` : ""}
          {filters.topicSlug ? ` in "${topics.find((t) => t.slug === filters.topicSlug)?.name ?? filters.topicSlug}"` : ""}
          {filters.keyword ? ` matching "${filters.keyword}"` : ""}
          {filters.contentType ? ` as "${contentTypeLabel(filters.contentType)}"` : ""}
        </div>
      )}

      {/* Archive grid */}
      {loading ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>Loading Rabbithole...</div>
      ) : visibleItems.length === 0 ? (
        <div style={{ fontSize: 14, color: t.textMuted }}>
          No content found.{" "}
          {(filters.keyword || filters.topicSlug || activeTag || filters.contentType) && (
            <button
              type="button"
              onClick={() => { setFilters(DEFAULT_FILTERS); router.push("/rabbithole"); }}
              style={{ background: "none", border: "none", color: t.textMuted, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: 14 }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          {visibleItems.map((item) => (
            item.kind === "thread" ? (
              <ThreadCard key={`thread-${item.thread.id}`} thread={item.thread} theme={t} />
            ) : (
              <ContributionCard
                key={`contribution-${item.contribution.id}`}
                contribution={item.contribution}
                theme={t}
              />
            )
          ))}
        </div>
      )}
      {contributeOpen && (
        <ContributeToRabbitholeModal
          onClose={() => {
            setContributeOpen(false);
            clearContributeQuery();
          }}
          onCreated={async (contributionId) => {
            setContributeOpen(false);
            clearContributeQuery();
            const fresh = await fetchRabbitholeContributions(supabase, { limit: 200, viewerUserId });
            setContributions(fresh);
            const trail = appendToTrail([], "Contributions");
            router.push(`/rabbithole/contribution/${contributionId}?trail=${trail}`);
          }}
        />
      )}
    </div>
  );
}

function ThreadCard({ thread, theme: t }: { thread: RabbitholeThread; theme: Theme }) {
  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        background: t.surface,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 14px 12px" }}>
        {/* Topic + source badges */}
        <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={typeBadgeStyle("archived_post")}>Archived Post</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {thread.topicName}
            {thread.subtopic ? ` · ${thread.subtopic}` : ""}
          </span>
          {thread.sourceType === "unit" && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#7c3aed",
                background: "rgba(124,58,237,0.1)",
                borderRadius: 999,
                padding: "1px 7px",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Group
            </span>
          )}
        </div>

        {/* Title */}
        <Link
          href={`/rabbithole/thread/${thread.id}`}
          style={{
            color: t.text,
            fontWeight: 800,
            fontSize: 15,
            textDecoration: "none",
            lineHeight: 1.3,
            display: "block",
            marginBottom: 8,
          }}
        >
          {thread.title}
        </Link>

        {/* Curator's Note preview */}
        {thread.curatorNote && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: t.textMuted,
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontStyle: "italic",
            }}
          >
            {thread.curatorNote}
          </p>
        )}
      </div>

      {/* Card footer */}
      <div
        style={{
          marginTop: "auto",
          padding: "8px 14px",
          borderTop: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          color: t.textMuted,
        }}
      >
        <span>{thread.replyCount} {thread.replyCount === 1 ? "reply" : "replies"}</span>
        <span style={{ color: t.border }}>·</span>
        <span>{new Date(thread.lastActivityAt).toLocaleDateString()}</span>
        {thread.tags.length > 0 && (
          <>
            <span style={{ color: t.border }}>·</span>
            <span style={{ color: "#475569" }}>
              +{thread.tags.length} {thread.tags.length === 1 ? "tag" : "tags"}
            </span>
          </>
        )}
        <Link
          href={`/rabbithole/thread/${thread.id}`}
          style={{
            marginLeft: "auto",
            fontWeight: 700,
            fontSize: 12,
            color: t.textMuted,
            textDecoration: "none",
          }}
        >
          View →
        </Link>
      </div>
    </div>
  );
}

function ContributionCard({ contribution, theme: t }: { contribution: RabbitholeContribution; theme: Theme }) {
  return (
    <div
      style={{
        border: `1px solid ${t.border}`,
        borderRadius: 12,
        background: t.surface,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 14px 12px" }}>
        <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={typeBadgeStyle(contribution.contentType)}>{contentTypeLabel(contribution.contentType)}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.textMuted,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {contribution.categoryName}
          </span>
          {contribution.sourceDomain && (
            <span style={{ fontSize: 11, color: "#64748b" }}>{contribution.sourceDomain}</span>
          )}
        </div>

        <Link
          href={`/rabbithole/contribution/${contribution.id}?trail=${appendToTrail([], contribution.categoryName)}`}
          style={{
            color: t.text,
            fontWeight: 800,
            fontSize: 15,
            textDecoration: "none",
            lineHeight: 1.3,
            display: "block",
            marginBottom: 8,
          }}
        >
          {contribution.title}
        </Link>

        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: t.textMuted,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {contribution.summary}
        </p>
      </div>

      <div
        style={{
          marginTop: "auto",
          padding: "8px 14px",
          borderTop: `1px solid ${t.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          color: t.textMuted,
        }}
      >
        <span>{contribution.likeCount} likes</span>
        <span style={{ color: t.border }}>·</span>
        <span>{contribution.commentCount} comments</span>
        <span style={{ color: t.border }}>·</span>
        <span>{new Date(contribution.lastActivityAt).toLocaleDateString()}</span>
        {contribution.tags.length > 0 && (
          <>
            <span style={{ color: t.border }}>·</span>
            <span style={{ color: "#475569" }}>
              +{contribution.tags.length} {contribution.tags.length === 1 ? "tag" : "tags"}
            </span>
          </>
        )}
        <Link
          href={`/rabbithole/contribution/${contribution.id}?trail=${appendToTrail([], contribution.categoryName)}`}
          style={{
            marginLeft: "auto",
            fontWeight: 700,
            fontSize: 12,
            color: t.textMuted,
            textDecoration: "none",
          }}
        >
          View →
        </Link>
      </div>
    </div>
  );
}

const contributeButtonStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 8,
  background: "#facc15",
  color: "#0f172a",
  padding: "7px 12px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

function typeBadgeStyle(type: RabbitholeContentType | "archived_post"): React.CSSProperties {
  const isArchived = type === "archived_post";
  return {
    fontSize: 10,
    fontWeight: 700,
    color: isArchived ? "#f8fafc" : "#facc15",
    background: isArchived ? "rgba(51,65,85,0.7)" : "rgba(250,204,21,0.14)",
    borderRadius: 999,
    border: `1px solid ${isArchived ? "#475569" : "#a16207"}`,
    padding: "1px 7px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  };
}
