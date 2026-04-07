/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";
import BreadcrumbTrail from "./components/BreadcrumbTrail";
import RabbitholeShell from "./components/RabbitholeShell";
import ThreadList from "./components/ThreadList";
import { parseTrail } from "./lib/helpers";
import { fetchRabbitholeThreads, fetchRabbitholeTopics } from "./lib/dataClient";
import type { RabbitholeThread, RabbitholeTopic } from "./lib/types";

export default function RabbitholeHomePageClient() {
  const searchParams = useSearchParams();
  const [topics, setTopics] = useState<RabbitholeTopic[]>([]);
  const [threads, setThreads] = useState<RabbitholeThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      setLoading(true);
      setError(null);
      const [topicsData, threadsData] = await Promise.all([
        fetchRabbitholeTopics(supabase),
        fetchRabbitholeThreads(supabase, { limit: 40 }),
      ]);
      if (!mounted) return;
      setTopics(topicsData);
      setThreads(threadsData);
      if (topicsData.length === 0) setError("Rabbithole taxonomy has not been seeded yet.");
      setLoading(false);
    }
    void loadInitial();
    return () => {
      mounted = false;
    };
  }, []);

  const trail = useMemo(() => {
    return parseTrail(searchParams.get("trail") ?? "");
  }, [searchParams]);

  return (
    <RabbitholeShell
      title="Rabbithole"
      description="Long-term knowledge layer for structured, revisitable technical discussion. Use the search bar at the top to find library threads along with people, jobs, groups, and businesses."
    >
      {trail.length > 0 && (
        <BreadcrumbTrail
          label="Your Tunnel"
          steps={trail.map((step) => ({ label: step, href: "/rabbithole" }))}
        />
      )}

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Topics</h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {topics.map((topic) => (
            <Link
              key={topic.slug}
              href={`/rabbithole/${topic.slug}?trail=${encodeURIComponent(topic.name)}`}
              style={{ textDecoration: "none", color: "inherit", border: "1px solid #334155", borderRadius: 12, padding: 12 }}
            >
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{topic.name}</div>
              <div style={{ fontSize: 13, color: "#94a3b8" }}>{topic.description}</div>
            </Link>
          ))}
        </div>
        {!loading && topics.length === 0 && (
          <div style={{ marginTop: 10, color: "#fca5a5" }}>
            No topics found. Apply the Rabbithole seed migration and refresh.
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Recent Threads</h2>
        {loading ? (
          <div style={{ color: "#94a3b8" }}>Loading Rabbithole...</div>
        ) : error ? (
          <div style={{ color: "#fca5a5" }}>{error}</div>
        ) : (
          <ThreadList threads={threads} trail={trail} />
        )}
      </section>
    </RabbitholeShell>
  );
}
