import { Suspense } from "react";
import RabbitholeHomePageClient from "./HomePageClient";

function RabbitholeFallback() {
  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: "24px 16px 48px", color: "#94a3b8" }}>
      Loading Rabbithole…
    </div>
  );
}

export default function RabbitholeHomePage() {
  return (
    <Suspense fallback={<RabbitholeFallback />}>
      <RabbitholeHomePageClient />
    </Suspense>
  );
}
