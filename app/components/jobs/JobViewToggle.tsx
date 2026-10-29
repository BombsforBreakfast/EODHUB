"use client";

import { List, Map } from "lucide-react";
import { useTheme } from "../../lib/ThemeContext";

export default function JobViewToggle({ value, onChange }: { value: "list" | "map"; onChange: (value: "list" | "map") => void }) {
  const { t } = useTheme();
  return <div role="group" aria-label="Job view" style={{ display: "flex", gap: 4 }}>
    {(["list", "map"] as const).map(view => {
      const Icon = view === "list" ? List : Map;
      return <button key={view} type="button" aria-pressed={value === view} onClick={() => onChange(view)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.border}`, background: value === view ? t.text : t.surface, color: value === view ? t.surface : t.text, cursor: "pointer", fontSize: 13, fontWeight: 700 }}><Icon size={16} aria-hidden="true" />{view === "list" ? "List" : "Map"}</button>;
    })}
  </div>;
}
