"use client";

import { LemonLotMarketplaceView } from "@/app/components/lemonLot/LemonLotMarketplaceView";
import { RequireFullAccess } from "@/app/hooks/useRequireFullAccess";

export default function LemonLotPage() {
  return (
    <RequireFullAccess route="app/lemon-lot/page.tsx">
      <LemonLotMarketplaceView variant="page" />
    </RequireFullAccess>
  );
}
