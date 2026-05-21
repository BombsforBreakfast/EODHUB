"use client";

import { useEffect } from "react";
import Link from "next/link";
import EodCrabLogo from "../components/EodCrabLogo";

export default function EmailVerifiedPage() {
  useEffect(() => {
    const prevDocColorScheme = document.documentElement.style.colorScheme;
    const prevBodyColorScheme = document.body.style.colorScheme;
    document.documentElement.style.colorScheme = "light";
    document.body.style.colorScheme = "light";
    return () => {
      document.documentElement.style.colorScheme = prevDocColorScheme;
      document.body.style.colorScheme = prevBodyColorScheme;
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", background: "white", borderRadius: 16, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <EodCrabLogo variant="login" priority />
        </div>
        <div style={{ fontSize: 13, color: "#888", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 28 }}>
          Built for EOD Techs, by an EOD Tech.
        </div>

        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
          ✓
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 16px", color: "#111" }}>
          Email Successfully Verified
        </h1>

        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.75, margin: "0 0 16px", textAlign: "left" }}>
          Thanks for signing up for EOD-HUB.
        </p>
        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.75, margin: "0 0 16px", textAlign: "left" }}>
          Your email has been successfully verified and your account has now entered the administrative review process.
        </p>
        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.75, margin: "0 0 16px", textAlign: "left" }}>
          Because EOD-HUB is a private professional network built specifically for the EOD and bomb technician community, all accounts are manually reviewed prior to activation.
        </p>
        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.75, margin: "0 0 24px", textAlign: "left" }}>
          Once your account has been approved — or validated through the community verification system — you&apos;ll receive a follow-up email granting full access.
        </p>

        <p style={{ fontSize: 13, color: "#888", lineHeight: 1.6, margin: "0 0 28px", fontStyle: "italic" }}>
          Thank you for your patience while we build a secure and trusted network for the EOD community.
        </p>

        <Link
          href="/pending"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            borderRadius: 10,
            background: "#111827",
            color: "#fff",
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
            marginRight: 12,
          }}
        >
          Continue
        </Link>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 28px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "white",
            color: "#374151",
            fontWeight: 700,
            fontSize: 15,
            textDecoration: "none",
          }}
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
