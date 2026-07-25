import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Unavailable | EOD-Hub",
  robots: { index: false, follow: false },
};

export default function UnavailablePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f8fafc",
        color: "#111827",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#ffffff",
          padding: "28px 24px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, lineHeight: 1.25 }}>
          Not available in your region
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 15, lineHeight: 1.55, color: "#374151" }}>
          EOD-Hub is not available from your current location.
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.55, color: "#4b5563" }}>
          If you believe you&apos;ve received this notice in error please reach out to admin support at{" "}
          <a
            href="mailto:murphy@eod-hub.com"
            style={{ color: "#047857", fontWeight: 700, textDecoration: "underline" }}
          >
            murphy@eod-hub.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
