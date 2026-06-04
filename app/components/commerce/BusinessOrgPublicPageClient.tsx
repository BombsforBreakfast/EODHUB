"use client";

import Link from "next/link";
import { useTheme } from "../../lib/ThemeContext";
import type { BusinessProfileCardData } from "./BusinessProfileCard";
import BusinessCommerceSection from "./BusinessCommerceSection";
import BusinessProfileCard from "./BusinessProfileCard";

type Props = {
  page: BusinessProfileCardData & { id: string };
};

export default function BusinessOrgPublicPageClient({ page }: Props) {
  const { t } = useTheme();

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 18px 64px" }}>
      <Link
        href="/business-org"
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: t.textMuted,
          fontWeight: 800,
          fontSize: 13,
          textDecoration: "none",
        }}
      >
        ← Back to Business / Organization Pages
      </Link>

      <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
        <BusinessProfileCard page={page} showExtendedDetails />
        <BusinessCommerceSection businessId={page.id} />
      </div>
    </main>
  );
}
