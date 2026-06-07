"use client";

import dynamic from "next/dynamic";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";

const RainbowCowboyPage = dynamic(
  () =>
    import("@/app/components/games/rainbow-cowboy/RainbowCowboyPage").then((m) => ({
      default: m.RainbowCowboyPage,
    })),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: "20px 12px 40px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ height: 28, width: 200, borderRadius: 6, background: "rgba(128,128,128,0.15)" }} />
      </div>
    ),
  },
);

export default function RainbowCowboyRoutePage() {
  return (
    <RequireFullAccess route="app/games/rainbow-cowboy/page.tsx">
      <RainbowCowboyPage />
    </RequireFullAccess>
  );
}
