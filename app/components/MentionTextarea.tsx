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
  value: string;                            // display text shown in textarea
  onChange: (displayValue: string) => void; // called with clean display text
  onChangeRaw?: (rawValue: string) => void; // called with @[Name](userId) format for storage
  placeholder?: string;
  style?: React.CSSProperties;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

// Parse stored @[Name](userId) syntax → extract userIds for notifications
export function extractMentionIds(rawContent: string): string[] {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const ids: string[] = [];
  let m;
  while ((m = re.exec(rawContent)) !== null) ids.push(m[2]);
  return [...new Set(ids)];
}

// Map a position in the display string (@Name) to the corresponding position in the raw string (@[Name](userId))
function displayPosToRaw(raw: string, displayPos: number): number {
  const re = /@\[([^\]]+)\]\([^)]+\)/g;
  let rawOff = 0, dispOff = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const beforeLen = m.index - rawOff;
    if (dispOff + beforeLen >= displayPos) return rawOff + (displayPos - dispOff);
    dispOff += beforeLen;
    rawOff = m.index;
    const dispLen = 1 + m[1].length; // "@" + name
    if (dispOff + dispLen >= displayPos) return rawOff + m[0].length; // mention is atomic
    dispOff += dispLen;
    rawOff += m[0].length;
  }
  return rawOff + (displayPos - dispOff);
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ value, onChange, onChangeRaw, placeholder, style, onKeyDown }, ref) => {
    const { t } = useTheme();
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
    const [mentionStartIndex, setMentionStartIndex] = useState(-1); // position in display text
    const [selectedIdx, setSelectedIdx] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const taRef = (ref as React.RefObject<HTMLTextAreaElement | null>) ?? internalRef;

    // Raw content tracked internally — parent sees display text, storage needs raw
    const rawRef = useRef("");

    // Reset raw when parent clears the field (after submit)
    useEffect(() => {
      if (value === "") rawRef.current = "";
    }, [value]);

    // Search profiles when mention query changes
    useEffect(() => {
      if (!mentionQuery || mentionQuery.length < 1) { setMentionResults([]); return; }
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
      const newDisplay = e.target.value;
      const oldDisplay = value;

      // Find edit bounds in display string
      let pre = 0;
      while (pre < oldDisplay.length && pre < newDisplay.length && oldDisplay[pre] === newDisplay[pre]) pre++;
      let oldEnd = oldDisplay.length, newEnd = newDisplay.length;
      while (oldEnd > pre && newEnd > pre && oldDisplay[oldEnd - 1] === newDisplay[newEnd - 1]) { oldEnd--; newEnd--; }

      // Apply same edit to raw string (treating mentions as atomic units)
      const rawPre = displayPosToRaw(rawRef.current, pre);
      const rawOldEnd = displayPosToRaw(rawRef.current, oldEnd);
      const newRaw = rawRef.current.slice(0, rawPre) + newDisplay.slice(pre, newEnd) + rawRef.current.slice(rawOldEnd);
      rawRef.current = newRaw;

      // Detect @query at cursor for dropdown
      const cursor = e.target.selectionStart ?? newDisplay.length;
      const before = newDisplay.slice(0, cursor);
      const match = before.match(/@(\w*)$/);
      if (match) {
        setMentionQuery(match[1]);
        setMentionStartIndex(cursor - match[0].length);
      } else {
        setMentionQuery(null);
        setMentionStartIndex(-1);
      }

      onChange(newDisplay);
      onChangeRaw?.(newRaw);
    }

    function insertMention(user: MentionUser) {
      const name = user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
      const displayMention = `@${name} `;
      const rawMention = `@[${name}](${user.user_id}) `;

      const cursorEnd = taRef.current?.selectionStart ?? value.length;
      const rawStart = displayPosToRaw(rawRef.current, mentionStartIndex);
      const rawEnd = displayPosToRaw(rawRef.current, cursorEnd);

      const newDisplay = value.slice(0, mentionStartIndex) + displayMention + value.slice(cursorEnd);
      const newRaw = rawRef.current.slice(0, rawStart) + rawMention + rawRef.current.slice(rawEnd);
      rawRef.current = newRaw;

      setMentionQuery(null);
      setMentionResults([]);
      setMentionStartIndex(-1);

      onChange(newDisplay);
      onChangeRaw?.(newRaw);

      setTimeout(() => {
        if (taRef.current) {
          const pos = mentionStartIndex + displayMention.length;
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
