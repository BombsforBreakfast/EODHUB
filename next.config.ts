import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent clickjacking — stops the app from being embedded in iframes
  { key: "X-Frame-Options", value: "DENY" },
  // Stop browsers from guessing content types
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't send the full URL as referrer to external sites
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Force HTTPS for 1 year
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Allow camera/mic for same-origin uploads (native Capacitor WebView); block geolocation.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

/** Vercel default deployment hostname → canonical production domain. */
const VERCEL_DEPLOYMENT_HOST = "eodhub.vercel.app";
const CANONICAL_SITE = "https://eod-hub.com";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: VERCEL_DEPLOYMENT_HOST }],
        destination: `${CANONICAL_SITE}/:path*`,
        permanent: true,
      },
      {
        source: "/games/rainbow-cowboy",
        destination: "/games/bomb-suit-man",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
