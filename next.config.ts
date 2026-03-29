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
  // Restrict browser features (camera, mic, etc.)
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
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
