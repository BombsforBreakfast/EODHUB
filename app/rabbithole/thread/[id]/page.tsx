import { Suspense } from "react";
import ThreadPageClient from "./ThreadPageClient";

function ThreadFallback() {
  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: "24px 16px 48px", color: "#94a3b8" }}>
      Loading thread…
    </div>
  );
}

export default function ThreadPage() {
  return (
    <Suspense fallback={<ThreadFallback />}>
      <ThreadPageClient />
    </Suspense>
  );
}
