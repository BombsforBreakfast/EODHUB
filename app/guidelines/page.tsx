"use client";

import Link from "next/link";
import NavBar from "../components/NavBar";
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
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <NavBar />
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
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

        <section
          id="child-safety"
          aria-labelledby="child-safety-heading"
          style={{
            marginTop: 24,
            scrollMarginTop: 120,
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            background: t.surface,
            padding: 20,
            lineHeight: 1.65,
            fontSize: 14,
          }}
        >
          <h2 id="child-safety-heading" style={{ margin: "0 0 8px", fontSize: 24 }}>
            EOD-HUB Child Safety Standards
          </h2>
          <p style={{ marginTop: 0, color: t.textMuted }}>Last updated: October 17, 2026</p>
          <p>
            EOD-HUB is an adult professional community operated by EOD-HUB LLC. Members must be 18 or older.
            We prohibit child sexual abuse and exploitation (CSAE) throughout EOD-HUB, including in profiles,
            posts, comments, messages, groups, and submitted listings.
          </p>

          <h3>Prohibited content and conduct</h3>
          <ul>
            <li>
              Child sexual abuse material (CSAM), including images, videos, links, and computer-generated
              material that depicts or promotes the sexual abuse of a minor.
            </li>
            <li>Grooming, sexual solicitation, sextortion, sex trafficking, or other sexual exploitation of children.</li>
            <li>Content or behavior that sexualizes children or facilitates their sexual abuse or exploitation.</li>
            <li>Requesting, offering, promoting, or distributing prohibited material, including links to it.</li>
          </ul>

          <h3>Report a child-safety concern</h3>
          <p>
            Use the in-app Report action on the relevant post, comment, or message where available, and
            select <strong>Unlawful activity</strong>. Reports are sent to the EOD-HUB admin moderation workflow.
            You can also report a concern directly to our designated child-safety contact at{" "}
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=EOD-HUB%20child%20safety%20concern`}
              style={{ color: "#2563eb", overflowWrap: "anywhere" }}
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
            {" "}with the subject &ldquo;EOD-HUB child safety concern.&rdquo;
          </p>
          <p>
            Provide the relevant link or username and a brief description. Do not download, copy, attach,
            or redistribute suspected CSAM. If a child is in immediate danger, contact local emergency services.
          </p>

          <h3>How EOD-HUB responds</h3>
          <p>
            EOD-HUB reviews child-safety reports and removes or disables access to prohibited content when
            we become aware of it. We may suspend or terminate accounts involved in CSAE. We preserve relevant
            information as required by applicable law and report confirmed CSAM to the National Center for
            Missing &amp; Exploited Children (NCMEC) or the appropriate regional or national authority, in accordance
            with applicable law. We cooperate with lawful requests from the relevant authorities.
          </p>
          <p>
            Our designated child-safety contact is responsible for responding to child-safety concerns and
            questions about EOD-HUB&apos;s prevention practices and compliance. Contact{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#2563eb", overflowWrap: "anywhere" }}>
              {LEGAL_CONTACT_EMAIL}
            </a>.
          </p>
        </section>

        <div style={{ marginTop: 18, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/terms" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>Terms of Service</Link>
          <Link href="/privacy" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}

