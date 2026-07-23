"use client";

import { Suspense } from "react";
import ChatroomPeekSheet from "./ChatroomPeekSheet";

/** Suspense boundary for useSearchParams inside ChatroomPeekSheet. */
export default function ChatroomPeekSheetHost() {
  return (
    <Suspense fallback={null}>
      <ChatroomPeekSheet />
    </Suspense>
  );
}
