"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import { isNativeApp } from "../../lib/native/isNativeApp";
import NavBar from "../NavBar";

/**
 * Blocks desktop-heavy admin/employer pages inside the native iOS shell.
 */
export default function NativeDesktopOnlyGate({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    setBlocked(isNativeApp());
  }, []);

  if (!blocked) return <>{children}</>;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <NavBar />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "48px 20px", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 12px" }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: t.textMuted }}>
          This area is optimized for desktop. Open{" "}
          <a href="https://www.eod-hub.com" style={{ color: "#2563eb", textDecoration: "none" }}>
            eod-hub.com
          </a>{" "}
          in Safari to use {title.toLowerCase()}.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 24,
            padding: "12px 18px",
            borderRadius: 12,
            background: t.text,
            color: t.surface,
            fontWeight: 800,
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          Back to feed
        </Link>
      </div>
    </div>
  );
}
