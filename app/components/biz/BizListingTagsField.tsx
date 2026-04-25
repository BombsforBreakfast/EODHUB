"use client";

import { useMemo, useState } from "react";
import { useTheme } from "../../lib/ThemeContext";
import {
  allBizTagOptionsForPicker,
  normalizeBizTagsInput,
  rememberCustomBizTag,
} from "../../lib/bizListingTags";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
};

export function BizListingTagsField({ value, onChange }: Props) {
  const { t } = useTheme();
  const [customInput, setCustomInput] = useState("");
  const [pickerKey, setPickerKey] = useState(0);

  const allOptions = useMemo(() => allBizTagOptionsForPicker(), [pickerKey]);

  const selectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const x of value) s.add(x.trim().toLowerCase());
    return s;
  }, [value]);

  const pickable = useMemo(
    () => allOptions.filter((o) => !selectedSet.has(o.trim().toLowerCase())),
    [allOptions, selectedSet]
  );

  function toggle(tag: string) {
    const tNorm = tag.trim().toLowerCase();
    if (!tNorm) return;
    const has = value.some((x) => x.trim().toLowerCase() === tNorm);
    if (has) {
      onChange(value.filter((x) => x.trim().toLowerCase() !== tNorm));
    } else {
      onChange(normalizeBizTagsInput([...value, tag]));
    }
  }

  function addCustom() {
    const raw = customInput.trim();
    if (!raw) return;
    if (value.some((x) => x.trim().toLowerCase() === raw.toLowerCase())) {
      setCustomInput("");
      return;
    }
    rememberCustomBizTag(raw);
    onChange(normalizeBizTagsInput([...value, raw]));
    setCustomInput("");
    setPickerKey((k) => k + 1);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>Tags</label>
      <p style={{ fontSize: 11, color: t.textFaint, margin: "0 0 8px", lineHeight: 1.4 }}>
        Choose labels that help others understand the listing. Your custom tags are saved in this browser for next time.
      </p>

      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {value.map((tag, i) => (
            <button
              key={`${tag}-${i}`}
              type="button"
              onClick={() => toggle(tag)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                color: t.text,
                background: t.surface,
                border: `1px solid ${t.border}`,
                borderRadius: 999,
                padding: "4px 10px",
                cursor: "pointer",
              }}
            >
              {tag}
              <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</span>
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          maxHeight: 120,
          overflowY: "auto",
          padding: 8,
          borderRadius: 8,
          border: `1px solid ${t.borderLight}`,
          background: t.bg,
          marginBottom: 8,
        }}
      >
        {pickable.length === 0 ? (
          <span style={{ fontSize: 11, color: t.textFaint }}>All available tags are selected.</span>
        ) : (
          pickable.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: t.textMuted,
                background: t.surface,
                border: `1px dashed ${t.border}`,
                borderRadius: 999,
                padding: "3px 9px",
                cursor: "pointer",
              }}
            >
              + {tag}
            </button>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add a custom tag…"
          style={{
            flex: 1,
            minWidth: 160,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${t.inputBorder}`,
            fontSize: 13,
            boxSizing: "border-box",
            background: t.input,
            color: t.text,
          }}
        />
        <button
          type="button"
          onClick={addCustom}
          style={{
            background: t.surface,
            color: t.text,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: "6px 12px",
            fontWeight: 700,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
