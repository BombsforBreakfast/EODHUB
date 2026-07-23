"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ChatroomSheetContextValue = {
  expanded: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
};

const ChatroomSheetContext = createContext<ChatroomSheetContextValue | null>(null);

export function ChatroomSheetProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const value = useMemo(
    () => ({ expanded, expand, collapse, toggle }),
    [expanded, expand, collapse, toggle],
  );

  return (
    <ChatroomSheetContext.Provider value={value}>{children}</ChatroomSheetContext.Provider>
  );
}

export function useChatroomSheet(): ChatroomSheetContextValue {
  const ctx = useContext(ChatroomSheetContext);
  if (!ctx) {
    return {
      expanded: false,
      expand: () => {},
      collapse: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
