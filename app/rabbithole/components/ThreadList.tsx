import Link from "next/link";
import { appendToTrail, getThreadBreadcrumb } from "../lib/helpers";
import type { RabbitholeThread } from "../lib/types";

export default function ThreadList({
  threads,
  trail,
}: {
  threads: RabbitholeThread[];
  trail: string[];
}) {
  if (threads.length === 0) {
    return <div style={{ color: "#94a3b8", border: "1px solid #334155", borderRadius: 12, padding: 16 }}>No threads yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {threads.map((thread) => {
        const canonicalPath = getThreadBreadcrumb(thread).join(" / ");
        const trailValue = appendToTrail(trail, thread.title);
        return (
          <article key={thread.id} style={{ border: "1px solid #334155", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>{canonicalPath}</div>
            <Link
              href={`/rabbithole/thread/${thread.id}?trail=${trailValue}`}
              style={{ color: "#f8fafc", fontWeight: 800, textDecoration: "none", fontSize: 18 }}
            >
              {thread.title}
            </Link>
            {thread.curatorNote && (
              <p style={{ margin: "8px 0", color: "#94a3b8", fontStyle: "italic", fontSize: 13 }}>{thread.curatorNote}</p>
            )}
            <div style={{ color: "#94a3b8", fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
              {thread.replyCount} replies · updated {new Date(thread.lastActivityAt).toLocaleDateString()}
              {thread.tags.length > 0 && (
                <span style={{ fontSize: 11, color: "#475569" }}>+{thread.tags.length} tag{thread.tags.length !== 1 ? "s" : ""}</span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
