"use client";

import Link from "next/link";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import { LEGAL_CONTACT_EMAIL } from "../lib/legalText";

export default function SupportPage() {
  const { t } = useTheme();

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <NavBar />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>Support</h1>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.6, color: t.textMuted }}>
          EOD-Hub is the professional community platform for Explosive Ordnance Disposal
          personnel and Public Service Bomb Technicians.
        </p>

        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>Contact</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            Email{" "}
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} style={{ color: "#2563eb", textDecoration: "none" }}>
              {LEGAL_CONTACT_EMAIL}
            </a>{" "}
            for account help, verification questions, or to report a problem.
          </p>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>iOS app</h2>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: t.textMuted }}>
            The EOD-Hub iOS app uses the same account as the website. For account changes, sign in at{" "}
            <a href="https://www.eod-hub.com" style={{ color: "#2563eb", textDecoration: "none" }}>
              eod-hub.com
            </a>
            .
          </p>
        </section>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 8px" }}>Policies</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.8 }}>
            <li>
              <Link href="/privacy" style={{ color: "#2563eb", textDecoration: "none" }}>
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link href="/terms" style={{ color: "#2563eb", textDecoration: "none" }}>
                Terms of Service
              </Link>
            </li>
            <li>
              <Link href="/guidelines" style={{ color: "#2563eb", textDecoration: "none" }}>
                Community Guidelines
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
