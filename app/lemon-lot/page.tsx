"use client";

import { LemonLotMarketplaceView } from "@/app/components/lemonLot/LemonLotMarketplaceView";
import { useRequireFullAccess } from "@/app/hooks/useRequireFullAccess";

export default function LemonLotPage() {
  useRequireFullAccess("app/lemon-lot/page.tsx");
  return <LemonLotMarketplaceView variant="page" />;
}
