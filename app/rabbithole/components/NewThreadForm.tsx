"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/lib/supabaseClient";
import { createRabbitholeThread, fetchRabbitholeTopics } from "../lib/dataClient";
import type { RabbitholeTopic } from "../lib/types";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

export default function NewThreadForm() {
  const router = useRouter();
  const [topics, setTopics] = useState<RabbitholeTopic[]>([]);
  const [topicSlug, setTopicSlug] = useState("");
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subtopic, setSubtopic] = useState("");
  const [tags, setTags] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoadingTopics(true);
    fetchRabbitholeTopics(supabase).then((data) => {
      if (!mounted) return;
      setTopics(data);
      if (!data.some((item) => item.slug === topicSlug)) setTopicSlug(data[0]?.slug ?? "");
      setLoadingTopics(false);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTopic = useMemo(
    () => topics.find((topic) => topic.slug === topicSlug),
    [topicSlug, topics],
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!topicSlug) return;
        setError(null);
        setSubmitting(true);
        const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
        createRabbitholeThread(supabase, {
          title,
          body,
          topicSlug,
          subtopic,
          tags: tagList,
        }).then((result) => {
          if (!result.ok || !result.threadId) {
            setError(result.error ?? "Unable to create thread.");
            setSubmitting(false);
            return;
          }
          setSubmitted(true);
          setSubmitting(false);
          track("rabbithole_thread_created", { topic: topicSlug, threadId: result.threadId });
          router.push(`/rabbithole/thread/${result.threadId}`);
        });
      }}
      style={{ border: "1px solid #334155", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}
    >
      <label style={labelStyle}>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Body
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={8} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Topic
        <select value={topicSlug} onChange={(e) => setTopicSlug(e.target.value)} required style={inputStyle}>
          {topics.map((topic) => (
            <option key={topic.slug} value={topic.slug}>
              {topic.name}
            </option>
          ))}
        </select>
      </label>
      {loadingTopics && <div style={{ color: "#94a3b8", fontSize: 13 }}>Loading topics...</div>}
      {!loadingTopics && topics.length === 0 && (
        <div style={{ color: "#fca5a5", fontSize: 13 }}>
          No topics available. Run Rabbithole seed migration first.
        </div>
      )}
      <label style={labelStyle}>
        Subtopic (optional)
        <input value={subtopic} onChange={(e) => setSubtopic(e.target.value)} placeholder="e.g. GPSNAV" style={inputStyle} />
      </label>
      <label style={labelStyle}>
        Tags (comma separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Garmin, Counter-UAS, Exploitation" style={inputStyle} />
      </label>
      {currentTopic && (
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          Suggested subtopics for {currentTopic.name}: {currentTopic.subtopics.join(", ")}
        </div>
      )}
      <button
        type="submit"
        disabled={submitting || !topicSlug || topics.length === 0}
        style={{
          border: "none",
          borderRadius: 10,
          padding: "10px 14px",
          fontWeight: 800,
          background: submitting ? "#475569" : "#facc15",
          color: submitting ? "#e2e8f0" : "#0f172a",
          cursor: submitting || !topicSlug || topics.length === 0 ? "default" : "pointer",
          width: "fit-content",
        }}
      >
        {submitting ? "Creating..." : "Create Thread"}
      </button>
      {submitted && (
        <div style={{ color: "#86efac", fontSize: 14 }}>
          Thread created. Redirecting...
        </div>
      )}
      {error && <div style={{ color: "#fca5a5", fontSize: 14 }}>{error}</div>}
    </form>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "#cbd5e1",
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#0f172a",
  color: "#f8fafc",
};
