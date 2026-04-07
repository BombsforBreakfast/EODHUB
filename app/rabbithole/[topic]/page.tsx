import { Suspense } from "react";
import TopicPageClient from "./TopicPageClient";

function TopicFallback() {
  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: "24px 16px 48px", color: "#94a3b8" }}>
      Loading topic…
    </div>
  );
}

export default function TopicPage() {
  return (
    <Suspense fallback={<TopicFallback />}>
      <TopicPageClient />
    </Suspense>
  );
}
