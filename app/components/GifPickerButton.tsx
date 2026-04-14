"use client";

import { useEffect, useRef, useState } from "react";

type GiphyGif = {
  id: string;
  title: string;
  images: {
    fixed_height_small: { url: string };
    original: { url: string };
  };
};

type Props = {
  onSelect: (gifUrl: string) => void;
  theme?: "light" | "dark";
};

export default function GifPickerButton({ onSelect, theme = "light" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close on outside click
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

  // Load trending when opened with no query
  useEffect(() => {
    if (!open || query) return;
    loadTrending();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search as user types
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      loadTrending();
      return;
    }
    debounceRef.current = setTimeout(() => searchGifs(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function loadTrending() {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`
      );
      const data = await res.json();
      setGifs(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  async function searchGifs(q: string) {
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=20&rating=g`
      );
      const data = await res.json();
      setGifs(data.data ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  function handleSelect(gif: GiphyGif) {
    onSelect(gif.images.original.url);
    setOpen(false);
    setQuery("");
    setGifs([]);
  }

  const bg = theme === "dark" ? "#1e1e1e" : "#fff";
  const border = theme === "dark" ? "#333" : "#e5e7eb";
  const text = theme === "dark" ? "#fff" : "#111";
  const inputBg = theme === "dark" ? "#2a2a2a" : "#f3f4f6";
  const isMobileSheet = open && isMobile;

  return (
    <>
      {isMobileSheet && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999 }}
        />
      )}
    <div ref={wrapperRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Add GIF"
        style={{
          background: "transparent",
          border: "none",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: 8,
          opacity: open ? 1 : 0.65,
          color: text,
          letterSpacing: 0.5,
        }}
      >
        GIF
      </button>

      {open && (
        <div
          style={isMobile ? {
            position: "fixed",
            left: 10,
            right: 10,
            bottom: 10,
            zIndex: 1000,
            maxHeight: "72vh",
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          } : {
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            zIndex: 500,
            width: 360,
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            overflow: "hidden",
          }}
        >
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 10px 0" }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: text,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: 0.75,
                  padding: "4px 6px",
                }}
              >
                Close
              </button>
            </div>
          )}
          <div style={{ padding: "10px 10px 8px" }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs..."
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 20,
                border: `1px solid ${border}`,
                background: inputBg,
                color: text,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              height: isMobile ? "min(42vh, 280px)" : 320,
              overflowY: "auto",
              padding: "0 10px 10px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 4,
              alignContent: "start",
            }}
          >
            {loading && (
              <div style={{ gridColumn: "span 3", textAlign: "center", padding: 40, color: text, opacity: 0.5, fontSize: 13 }}>
                Loading...
              </div>
            )}
            {!loading && gifs.length === 0 && (
              <div style={{ gridColumn: "span 3", textAlign: "center", padding: 40, color: text, opacity: 0.5, fontSize: 13 }}>
                No GIFs found
              </div>
            )}
            {!loading && gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => handleSelect(gif)}
                style={{
                  border: "none",
                  padding: 0,
                  borderRadius: 6,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: inputBg,
                  display: "block",
                  width: "100%",
                  height: 90,
                }}
              >
                <img
                  src={gif.images.fixed_height_small.url}
                  alt={gif.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  loading="lazy"
                />
              </button>
            ))}
          </div>

          <div style={{ padding: "6px 10px", borderTop: `1px solid ${border}`, textAlign: "right" }}>
            <span style={{ fontSize: 10, color: text, opacity: 0.4, fontWeight: 600 }}>Powered by GIPHY</span>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
