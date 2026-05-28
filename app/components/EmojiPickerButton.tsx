"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import data from "@emoji-mart/data";

// SSR-safe import — emoji-mart touches `document` on load
const Picker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

type InputEl = HTMLTextAreaElement | HTMLInputElement;

type Props = {
  value: string;
  onChange: (val: string) => void;
  inputRef?: { current: InputEl | null };
  theme?: "light" | "dark";
};

export default function EmojiPickerButton({ value, onChange, inputRef, theme = "light" }: Props) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  function handleSelect(emoji: { native: string }) {
    const el = inputRef?.current ?? null;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji.native + value.slice(end);
    onChange(next);
    // Restore cursor position after React re-renders the controlled input
    setTimeout(() => {
      if (el) {
        el.focus();
        const pos = start + emoji.native.length;
        el.setSelectionRange(pos, pos);
      }
    }, 10);
    setOpen(false);
  }

  return (
    <>
      {open && isMobile && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }}
        />
      )}
    <div ref={wrapperRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Add emoji"
        style={{
          background: "transparent",
          border: "none",
          fontSize: 20,
          cursor: "pointer",
          lineHeight: 1,
          padding: "4px 6px",
          borderRadius: 8,
          opacity: open ? 1 : 0.65,
        }}
      >
        😊
      </button>

      {open && (
        <div style={isMobile ? {
          position: "fixed",
          left: 10,
          right: 10,
          bottom: "max(10px, env(safe-area-inset-bottom, 0px))",
          zIndex: 1000,
          maxWidth: "calc(100vw - 20px)",
          overflow: "hidden",
        } : {
          position: "absolute",
          bottom: "calc(100% + 6px)",
          right: 0,
          zIndex: 500,
          maxWidth: "calc(100vw - 24px)",
        }}>
          <Picker
            data={data}
            onEmojiSelect={handleSelect}
            theme={theme}
            previewPosition="none"
            skinTonePosition="search"
          />
        </div>
      )}
    </div>
    </>
  );
}
