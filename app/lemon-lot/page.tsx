"use client";

import dynamic from "next/dynamic";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";

const LemonLotMarketplaceView = dynamic(
  () =>
    import("@/app/components/lemonLot/LemonLotMarketplaceView").then((m) => ({
      default: m.LemonLotMarketplaceView,
    })),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: "20px 12px 40px", maxWidth: "100%" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ height: 28, width: 160, borderRadius: 6, background: "rgba(128,128,128,0.15)" }} />
          <div style={{ marginTop: 10, height: 14, width: "min(100%, 420px)", borderRadius: 4, background: "rgba(128,128,128,0.1)" }} />
        </div>
        <div style={{ height: 44, width: 140, borderRadius: 10, background: "rgba(128,128,128,0.12)" }} />
      </div>
    ),
  },
);

export default function LemonLotPage() {
  return (
    <RequireFullAccess route="app/lemon-lot/page.tsx">
      <LemonLotMarketplaceView variant="page" />
    </RequireFullAccess>
  );
}
