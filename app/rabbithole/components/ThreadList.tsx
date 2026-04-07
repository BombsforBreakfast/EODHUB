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
            <p style={{ margin: "8px 0", color: "#cbd5e1" }}>{thread.body}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {thread.tags.map((tag) => (
                <span key={tag} style={{ border: "1px solid #334155", borderRadius: 999, fontSize: 12, padding: "2px 8px", color: "#e2e8f0" }}>
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              {thread.replyCount} replies · updated {new Date(thread.lastActivityAt).toLocaleDateString()}
            </div>
          </article>
        );
      })}
    </div>
  );
}
