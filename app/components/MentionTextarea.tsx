"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useTheme } from "../lib/ThemeContext";

type MentionUser = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

// Exported so callers can extract mention userIds from stored content
export function extractMentionIds(content: string): string[] {
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const ids: string[] = [];
  let m;
  while ((m = regex.exec(content)) !== null) ids.push(m[2]);
  return [...new Set(ids)];
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ value, onChange, placeholder, style, onKeyDown }, ref) => {
    const { t } = useTheme();
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const taRef = (ref as React.RefObject<HTMLTextAreaElement>) ?? internalRef;

    useEffect(() => {
      if (mentionQuery === null || mentionQuery.length < 1) {
        setMentionResults([]);
        return;
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const q = mentionQuery;
        const { data } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, display_name, photo_url")
          .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,display_name.ilike.%${q}%`)
          .eq("verification_status", "verified")
          .limit(6);
        setMentionResults((data ?? []) as MentionUser[]);
        setSelectedIdx(0);
      }, 200);
    }, [mentionQuery]);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const val = e.target.value;
      const cursor = e.target.selectionStart ?? val.length;
      const before = val.slice(0, cursor);
      const match = before.match(/@(\w*)$/);
      if (match) {
        setMentionQuery(match[1]);
        setMentionStartIndex(cursor - match[0].length);
      } else {
        setMentionQuery(null);
        setMentionStartIndex(-1);
      }
      onChange(val);
    }

    function insertMention(user: MentionUser) {
      const name = user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
      const mention = `@[${name}](${user.user_id})`;
      const cursorEnd = taRef.current?.selectionStart ?? value.length;
      const newVal = value.slice(0, mentionStartIndex) + mention + " " + value.slice(cursorEnd);
      onChange(newVal);
      setMentionQuery(null);
      setMentionResults([]);
      setMentionStartIndex(-1);
      setTimeout(() => {
        if (taRef.current) {
          const pos = mentionStartIndex + mention.length + 1;
          taRef.current.focus();
          taRef.current.setSelectionRange(pos, pos);
        }
      }, 0);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (mentionResults.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, mentionResults.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" && mentionQuery !== null) { e.preventDefault(); insertMention(mentionResults[selectedIdx]); return; }
        if (e.key === "Escape") { setMentionQuery(null); setMentionResults([]); return; }
      }
      onKeyDown?.(e);
    }

    return (
      <div style={{ position: "relative" }}>
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={style}
        />
        {mentionResults.length > 0 && (
          <div style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 0,
            background: t.surface,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            zIndex: 300,
            overflow: "hidden",
            minWidth: 220,
            maxWidth: 320,
          }}>
            {mentionResults.map((user, i) => {
              const name = user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
              return (
                <div
                  key={user.user_id}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}
                  onMouseEnter={() => setSelectedIdx(i)}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    background: i === selectedIdx ? t.surfaceHover : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderTop: i > 0 ? `1px solid ${t.borderLight}` : undefined,
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: t.border, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: t.text }}>
                    {user.photo_url
                      ? <img src={user.photo_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : name[0]?.toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: t.text }}>{name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

MentionTextarea.displayName = "MentionTextarea";
export default MentionTextarea;
