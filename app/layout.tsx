import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./lib/ThemeContext";
import SessionGuard from "./components/SessionGuard";
import AnalyticsTracker from "./components/AnalyticsTracker";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MemorialNavModalProvider } from "./components/memorial/MemorialNavModalProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EOD Hub",
  description: "The community platform for EOD professionals",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const showVercelAnalytics = process.env.NODE_ENV === "production";
  return (
    <html lang="en" data-theme="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        data-dark="true"
      >
        <ThemeProvider>
          <MemorialNavModalProvider>
          <SessionGuard />
          <AnalyticsTracker />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@graph": [
                  {
                    "@type": "Organization",
                    "@id": "https://www.eod-hub.com/#organization",
                    name: "EOD Hub",
                    url: "https://www.eod-hub.com",
                    description:
                      "A professional network, job board, and community platform for the Explosive Ordnance Disposal (EOD) community.",
                    sameAs: [
                      "https://www.facebook.com/EODHUB",
                      "https://www.tiktok.com/@eodhub",
                    ],
                  },
                  {
                    "@type": "WebSite",
                    "@id": "https://www.eod-hub.com/#website",
                    url: "https://www.eod-hub.com",
                    name: "EOD Hub",
                    description:
                      "EOD Hub is a professional network and community platform for active duty technicians, veterans, and industry professionals in the Explosive Ordnance Disposal community.",
                    publisher: {
                      "@id": "https://www.eod-hub.com/#organization",
                    },
                    potentialAction: {
                      "@type": "SearchAction",
                      target: "https://www.eod-hub.com/units?q={search_term_string}",
                      "query-input": "required name=search_term_string",
                    },
                  },
                ],
              }),
            }}
          />
          {children}
          <footer
            aria-label="Site footer"
            style={{
              fontSize: 12,
              color: "var(--foreground)",
              opacity: 0.62,
              textAlign: "center",
              padding: "18px 16px 20px",
              borderTop: "1px solid rgba(128, 128, 128, 0.18)",
              marginTop: 24,
            }}
          >
            © EOD Hub — A professional network for the Explosive Ordnance Disposal community
          </footer>
          {showVercelAnalytics ? (
            <>
              <Analytics />
              <SpeedInsights />
            </>
          ) : null}
          </MemorialNavModalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
