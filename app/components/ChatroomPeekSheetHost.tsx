"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import ChatroomPeekSheet from "./ChatroomPeekSheet";
import { useChatroomSheet } from "./ChatroomSheetContext";

export default function ChatroomPeekSheetHost() {
  const pathname = usePathname();
  const isRentalPage = pathname === "/promote/rentals" || pathname.startsWith("/promote/rentals/");
  const { collapse } = useChatroomSheet();
  useEffect(() => { if (isRentalPage) collapse(); }, [isRentalPage, collapse]);
  if (isRentalPage) return null;
  return (
    <Suspense fallback={null}>
      <ChatroomPeekSheet />
    </Suspense>
  );
}
