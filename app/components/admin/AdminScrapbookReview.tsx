"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { FLAG_REASON_OPTIONS, type ScrapbookFlagReason } from "@/app/components/memorial/scrapbook/types";
import type { Theme } from "@/app/lib/theme";

type QueueItem = {
  id: string;
  memorial_id: string;
  user_id: string | null;
  item_type: string;
  file_url: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  memory_body: string | null;
  caption: string | null;
  location: string | null;
  event_date: string | null;
  status: string;
  created_at: string;
  memorialName: string;
  memorialDeathDate: string;
  contributorLabel: string;
  flags: { id: string; reason: string; details: string | null; created_at: string }[];
};

function flagReasonLabel(code: string): string {
  const m = FLAG_REASON_OPTIONS.find((o) => o.value === (code as ScrapbookFlagReason));
  return m?.label ?? code;
}

export function AdminScrapbookReview({
  t,
  showToast,
  onQueueChanged,
}: {
  t: Theme;
  showToast: (msg: string) => void;
  /** Optional: refresh admin pending badges (e.g. Events tab scrapbook count). */
  onQueueChanged?: () => void;
}) {
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: items, error } = await supabase
        .from("memorial_scrapbook_items")
        .select(
          "id, memorial_id, user_id, item_type, file_url, external_url, thumbnail_url, memory_body, caption, location, event_date, status, created_at",
        )
        .in("status", ["pending", "flagged"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Admin scrapbook load:", error);
        setRows([]);
        return;
      }

      const list = (items ?? []) as Omit<QueueItem, "memorialName" | "memorialDeathDate" | "contributorLabel" | "flags">[];
      const memorialIds = [...new Set(list.map((x) => x.memorial_id))];
      const userIds = [...new Set(list.map((x) => x.user_id).filter(Boolean))] as string[];
      const itemIds = list.map((x) => x.id);

      const memorialMap: Record<string, { name: string; death_date: string }> = {};
      if (memorialIds.length > 0) {
        const { data: mems } = await supabase.from("memorials").select("id, name, death_date").in("id", memorialIds);
        for (const m of mems ?? []) {
          const r = m as { id: string; name: string; death_date: string };
          memorialMap[r.id] = { name: r.name, death_date: r.death_date };
        }
      }

      const profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, first_name, last_name")
          .in("user_id", userIds);
        for (const p of profs ?? []) {
          const r = p as {
            user_id: string;
            display_name: string | null;
            first_name: string | null;
            last_name: string | null;
          };
          const d = r.display_name?.trim();
          const name =
            d ||
            `${r.first_name?.trim() ?? ""} ${r.last_name?.trim() ?? ""}`.trim() ||
            r.user_id.slice(0, 8);
          profileMap[r.user_id] = name;
        }
      }

      const flagsByItem: Record<string, { id: string; reason: string; details: string | null; created_at: string }[]> = {};
      if (itemIds.length > 0) {
        const { data: flagRows } = await supabase
          .from("memorial_scrapbook_flags")
          .select("id, scrapbook_item_id, reason, details, created_at")
          .in("scrapbook_item_id", itemIds)
          .order("created_at", { ascending: true });
        for (const f of flagRows ?? []) {
          const r = f as {
            id: string;
            scrapbook_item_id: string;
            reason: string;
            details: string | null;
            created_at: string;
          };
          if (!flagsByItem[r.scrapbook_item_id]) flagsByItem[r.scrapbook_item_id] = [];
          flagsByItem[r.scrapbook_item_id].push({
            id: r.id,
            reason: r.reason,
            details: r.details,
            created_at: r.created_at,
          });
        }
      }

      const enriched: QueueItem[] = list.map((it) => ({
        ...it,
        memorialName: memorialMap[it.memorial_id]?.name ?? "Unknown memorial",
        memorialDeathDate: memorialMap[it.memorial_id]?.death_date ?? "",
        contributorLabel: it.user_id ? profileMap[it.user_id] ?? it.user_id : "Unknown",
        flags: flagsByItem[it.id] ?? [],
      }));

      setRows(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runRpc(
    rpc: "approve_memorial_scrapbook_item" | "reject_memorial_scrapbook_item" | "restore_memorial_scrapbook_item" | "delete_memorial_scrapbook_item",
    id: string,
    okMsg: string,
  ) {
    setActingId(id);
    try {
      const { error } = await supabase.rpc(rpc, { p_item_id: id });
      if (error) {
        showToast(error.message);
        return;
      }
      showToast(okMsg);
      await load();
      onQueueChanged?.();
    } finally {
      setActingId(null);
    }
  }

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Scrapbook review</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
          Pending submissions and community-flagged scrapbook items. Approve, reject, delete, or restore after review.
        </div>
        {loading ? (
          <div style={{ color: t.textFaint }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: t.textFaint, fontSize: 14 }}>No pending or flagged scrapbook items.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {rows.map((it) => (
              <div
                key={it.id}
                style={{
                  border: `1px solid ${t.border}`,
                  borderRadius: 12,
                  padding: 16,
                  background: t.surfaceHover,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    {it.memorialName}
                    {it.memorialDeathDate ? (
                      <span style={{ color: t.textMuted, fontWeight: 600 }}>
                        {" "}
                        · d. {it.memorialDeathDate}
                      </span>
                    ) : null}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: it.status === "flagged" ? "#7c2d12" : "#422006",
                      color: "#fde68a",
                    }}
                  >
                    {it.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: t.textMuted }}>
                  Contributor: <span style={{ color: t.text, fontWeight: 700 }}>{it.contributorLabel}</span>
                  {" · "}
                  Submitted {new Date(it.created_at).toLocaleString()}
                  {" · "}
                  Type: <span style={{ fontWeight: 700 }}>{it.item_type}</span>
                </div>
                {it.caption && (
                  <div style={{ fontSize: 14, color: t.text }}>
                    <span style={{ color: t.textMuted, fontWeight: 700 }}>Caption: </span>
                    {it.caption}
                  </div>
                )}
                {it.memory_body && (
                  <div style={{ fontSize: 14, color: t.text, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    <span style={{ color: t.textMuted, fontWeight: 700 }}>Memory: </span>
                    {it.memory_body}
                  </div>
                )}
                {it.item_type === "photo" && (it.location || it.event_date) && (
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    {[
                      it.location?.trim() || "",
                      it.event_date?.trim()
                        ? (() => {
                            const d = new Date(`${it.event_date}T12:00:00`);
                            return Number.isNaN(d.getTime())
                              ? it.event_date
                              : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                          })()
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                {it.file_url && (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: t.textMuted, fontWeight: 700 }}>File: </span>
                    <a href={it.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", wordBreak: "break-all" }}>
                      {it.file_url}
                    </a>
                  </div>
                )}
                {it.external_url && (
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: t.textMuted, fontWeight: 700 }}>Website: </span>
                    <a href={it.external_url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", wordBreak: "break-all" }}>
                      {it.external_url}
                    </a>
                  </div>
                )}
                {it.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbnail_url} alt="" style={{ maxWidth: 280, maxHeight: 160, borderRadius: 8, border: `1px solid ${t.border}` }} />
                )}

                {it.flags.length > 0 && (
                  <div style={{ marginTop: 6, padding: 10, borderRadius: 8, border: `1px solid ${t.border}`, background: t.surface }}>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6, color: t.textMuted }}>Flags ({it.flags.length})</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: t.text }}>
                      {it.flags.map((f) => (
                        <li key={f.id} style={{ marginBottom: 4 }}>
                          <strong>{flagReasonLabel(f.reason)}</strong>
                          {f.details ? ` — ${f.details}` : ""}
                          <span style={{ color: t.textFaint }}> ({new Date(f.created_at).toLocaleString()})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {it.status === "pending" && (
                    <>
                      <button
                        type="button"
                        disabled={actingId === it.id}
                        onClick={() => void runRpc("approve_memorial_scrapbook_item", it.id, "Scrapbook item approved.")}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 8,
                          border: "none",
                          background: "#16a34a",
                          color: "white",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: actingId === it.id ? "not-allowed" : "pointer",
                          opacity: actingId === it.id ? 0.7 : 1,
                        }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actingId === it.id}
                        onClick={() => void runRpc("reject_memorial_scrapbook_item", it.id, "Item rejected.")}
                        style={{
                          padding: "7px 14px",
                          borderRadius: 8,
                          border: `1px solid ${t.border}`,
                          background: t.surface,
                          color: t.text,
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: actingId === it.id ? "not-allowed" : "pointer",
                          opacity: actingId === it.id ? 0.7 : 1,
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {it.status === "flagged" && (
                    <button
                      type="button"
                      disabled={actingId === it.id}
                      onClick={() => void runRpc("restore_memorial_scrapbook_item", it.id, "Item restored to approved.")}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: "#2563eb",
                        color: "white",
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: actingId === it.id ? "not-allowed" : "pointer",
                        opacity: actingId === it.id ? 0.7 : 1,
                      }}
                    >
                      Return to approved
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actingId === it.id}
                    onClick={() => void runRpc("delete_memorial_scrapbook_item", it.id, "Item deleted.")}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#b91c1c",
                      color: "white",
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: actingId === it.id ? "not-allowed" : "pointer",
                      opacity: actingId === it.id ? 0.7 : 1,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
