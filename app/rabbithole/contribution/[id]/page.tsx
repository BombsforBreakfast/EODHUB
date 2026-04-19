import { Suspense } from "react";
import ContributionPageClient from "./ContributionPageClient";

function ContributionFallback() {
  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: "24px 16px 48px", color: "#94a3b8" }}>
      Loading contribution...
    </div>
  );
}

export default function ContributionPage() {
  return (
    <Suspense fallback={<ContributionFallback />}>
      <ContributionPageClient />
    </Suspense>
  );
}
