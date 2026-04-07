/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
import BreadcrumbTrail from "../components/BreadcrumbTrail";
import RabbitholeShell from "../components/RabbitholeShell";
import ThreadList from "../components/ThreadList";
import { appendToTrail, parseTrail } from "../lib/helpers";
import { supabase } from "../../lib/lib/supabaseClient";
import { fetchRabbitholeThreads, fetchRabbitholeTopics } from "../lib/dataClient";
import type { RabbitholeThread, RabbitholeTopic } from "../lib/types";

export default function TopicPage() {
  const params = useParams<{ topic: string }>();
  const searchParams = useSearchParams();
  const topicSlug = params.topic;

  const [topics, setTopics] = useState<RabbitholeTopic[]>([]);
  const [threads, setThreads] = useState<RabbitholeThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tunnelTrail = useMemo(() => parseTrail(searchParams.get("trail") ?? ""), [searchParams]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      const [topicsData, threadData] = await Promise.all([
        fetchRabbitholeTopics(supabase),
        fetchRabbitholeThreads(supabase, { topicSlug, limit: 60 }),
      ]);
      if (!mounted) return;
      setTopics(topicsData);
      setThreads(threadData);
      if (topicsData.length === 0) setError("Topic taxonomy unavailable.");
      if (topicsData.length > 0 && !topicsData.some((entry) => entry.slug === topicSlug)) {
        setError("Topic not found.");
      }
      setLoading(false);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [topicSlug]);

  const topic = topics.find((entry) => entry.slug === topicSlug);
  if (!topic && !loading) {
    return (
      <RabbitholeShell title="Topic not found">
        <p style={{ color: "#94a3b8" }}>{error ?? "This topic is unavailable."}</p>
      </RabbitholeShell>
    );
  }
  if (!topic) {
    return (
      <RabbitholeShell title="Loading topic...">
        <p style={{ color: "#94a3b8" }}>Loading topic details...</p>
      </RabbitholeShell>
    );
  }

  const nextTrail = appendToTrail(tunnelTrail, topic.name);
  useEffect(() => {
    track("rabbithole_topic_opened", { topic: topic.slug });
  }, [topic.slug]);

  return (
    <RabbitholeShell title={topic.name} description={topic.description}>
      <BreadcrumbTrail label="Library Path" steps={[{ label: "Rabbithole", href: "/rabbithole" }, { label: topic.name }]} />
      {tunnelTrail.length > 0 && (
        <BreadcrumbTrail
          label="Your Tunnel"
          steps={tunnelTrail.map((step) => ({ label: step, href: `/rabbithole?trail=${encodeURIComponent(step)}` }))}
        />
      )}

      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {topic.subtopics.map((subtopic) => (
          <span key={subtopic} style={{ border: "1px solid #334155", borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "#e2e8f0" }}>
            {subtopic}
          </span>
        ))}
        {topic.tags.map((tag) => (
          <span key={tag} style={{ border: "1px solid #475569", borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "#f8fafc" }}>
            #{tag}
          </span>
        ))}
      </div>

      {loading ? (
        <div style={{ color: "#94a3b8" }}>Loading topic threads...</div>
      ) : error ? (
        <div style={{ color: "#fca5a5" }}>{error}</div>
      ) : (
        <ThreadList threads={threads} trail={[...tunnelTrail, topic.name]} />
      )}
      <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
        Shareable tunnel link: <code>/rabbithole/{topic.slug}?trail={nextTrail}</code>
      </div>
    </RabbitholeShell>
  );
}
