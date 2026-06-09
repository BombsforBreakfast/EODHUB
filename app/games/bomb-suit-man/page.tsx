"use client";

import dynamic from "next/dynamic";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";
import { RequireArcadePreview } from "@/app/components/games/RequireArcadePreview";

const RainbowCowboyPage = dynamic(
  () =>
    import("@/app/components/games/rainbow-cowboy/RainbowCowboyPage").then((m) => ({
      default: m.RainbowCowboyPage,
    })),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: "20px 12px 40px", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ height: 28, width: 180, borderRadius: 6, background: "rgba(128,128,128,0.15)" }} />
        <div style={{ marginTop: 10, height: 14, width: "min(100%, 420px)", borderRadius: 4, background: "rgba(128,128,128,0.1)" }} />
      </div>
    ),
  },
);

export default function BombSuitManRoutePage() {
  return (
    <RequireFullAccess route="app/games/bomb-suit-man/page.tsx">
      <RequireArcadePreview>
        <RainbowCowboyPage />
      </RequireArcadePreview>
    </RequireFullAccess>
  );
}
