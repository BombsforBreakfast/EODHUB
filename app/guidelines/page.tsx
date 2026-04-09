"use client";

import Link from "next/link";
import { useTheme } from "../lib/ThemeContext";
import {
  COMMUNITY_GUIDELINES_TEXT,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
} from "../lib/legalText";

export default function GuidelinesPage() {
  const { t } = useTheme();

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, padding: "32px 20px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>Community Guidelines</h1>
        <div style={{ marginTop: 8, color: t.textMuted, fontSize: 14 }}>
          Effective Date: {LEGAL_EFFECTIVE_DATE} | Last Updated: {LEGAL_LAST_UPDATED}
        </div>
        <div style={{ marginTop: 8, color: t.textMuted, fontSize: 14 }}>
          Contact: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#2563eb", textDecoration: "none" }}>{LEGAL_CONTACT_EMAIL}</a>
        </div>

        <div
          style={{
            marginTop: 20,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            background: t.surface,
            padding: 20,
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
            fontSize: 14,
          }}
        >
          {COMMUNITY_GUIDELINES_TEXT}
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/terms" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>Terms of Service</Link>
          <Link href="/privacy" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
