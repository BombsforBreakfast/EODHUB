"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { FLAG_REASON_OPTIONS, type ScrapbookFlagReason } from "@/app/components/memorial/scrapbook/types";
import type { Theme } from "@/app/lib/theme";

type QueueItem = {
  id: string;
  subjectType: "memorial" | "event";
  memorial_id?: string | null;
  event_id?: string | null;
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
  subjectTitle: string;
  subjectMeta: string;
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
  const [sourceFilter, setSourceFilter] = useState<"all" | "memorial" | "event">("all");

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
      const { data: eventItems, error: eventError } = await supabase
        .from("event_scrapbook_items")
        .select(
          "id, event_id, user_id, item_type, file_url, external_url, thumbnail_url, memory_body, caption, location, event_date, status, created_at",
        )
        .in("status", ["pending", "flagged"])
        .order("created_at", { ascending: false });

      if (error || eventError) {
        console.error("Admin scrapbook load:", error ?? eventError);
        setRows([]);
        return;
      }

      const memorialList = (items ?? []) as Array<{
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
      }>;
      const eventList = (eventItems ?? []) as Array<{
        id: string;
        event_id: string;
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
      }>;

      const list = [
        ...memorialList.map((x) => ({ ...x, subjectType: "memorial" as const })),
        ...eventList.map((x) => ({ ...x, subjectType: "event" as const })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const memorialIds = [...new Set(memorialList.map((x) => x.memorial_id))];
      const eventIds = [...new Set(eventList.map((x) => x.event_id))];
      const userIds = [...new Set(list.map((x) => x.user_id).filter(Boolean))] as string[];
      const memorialItemIds = memorialList.map((x) => x.id);
      const eventItemIds = eventList.map((x) => x.id);

      const memorialMap: Record<string, { name: string; death_date: string }> = {};
      if (memorialIds.length > 0) {
        const { data: mems } = await supabase.from("memorials").select("id, name, death_date").in("id", memorialIds);
        for (const m of mems ?? []) {
          const r = m as { id: string; name: string; death_date: string };
          memorialMap[r.id] = { name: r.name, death_date: r.death_date };
        }
      }
      const eventMap: Record<string, { title: string; date: string; location: string | null }> = {};
      if (eventIds.length > 0) {
        const { data: evs } = await supabase.from("events").select("id, title, date, location").in("id", eventIds);
        for (const e of evs ?? []) {
          const r = e as { id: string; title: string; date: string; location: string | null };
          eventMap[r.id] = { title: r.title, date: r.date, location: r.location };
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
      if (memorialItemIds.length > 0) {
        const { data: flagRows } = await supabase
          .from("memorial_scrapbook_flags")
          .select("id, scrapbook_item_id, reason, details, created_at")
          .in("scrapbook_item_id", memorialItemIds)
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
      if (eventItemIds.length > 0) {
        const { data: flagRows } = await supabase
          .from("event_scrapbook_flags")
          .select("id, scrapbook_item_id, reason, details, created_at")
          .in("scrapbook_item_id", eventItemIds)
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
        subjectTitle:
          it.subjectType === "memorial"
            ? (it.memorial_id ? memorialMap[it.memorial_id]?.name : null) ?? "Unknown memorial"
            : (it.event_id ? eventMap[it.event_id]?.title : null) ?? "Unknown event",
        subjectMeta:
          it.subjectType === "memorial"
            ? (it.memorial_id ? memorialMap[it.memorial_id]?.death_date : null) ?? ""
            : (() => {
                const ev = it.event_id ? eventMap[it.event_id] : null;
                if (!ev?.date) return "";
                const d = new Date(`${ev.date}T12:00:00`);
                const dateLabel = Number.isNaN(d.getTime())
                  ? ev.date
                  : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return [dateLabel, ev.location ?? ""].filter(Boolean).join(" · ");
              })(),
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

  async function runAction(it: QueueItem, action: "approve" | "reject" | "restore" | "delete") {
    const rpcMap =
      it.subjectType === "event"
        ? {
            approve: "approve_event_scrapbook_item",
            reject: "reject_event_scrapbook_item",
            restore: "restore_event_scrapbook_item",
            delete: "delete_event_scrapbook_item",
          }
        : {
            approve: "approve_memorial_scrapbook_item",
            reject: "reject_memorial_scrapbook_item",
            restore: "restore_memorial_scrapbook_item",
            delete: "delete_memorial_scrapbook_item",
          };
    const okMsgMap = {
      approve: "Scrapbook item approved.",
      reject: "Item rejected.",
      restore: "Item restored to approved.",
      delete: "Item deleted.",
    } as const;
    setActingId(it.id);
    try {
      const { error } = await supabase.rpc(rpcMap[action], { p_item_id: it.id });
      if (error) {
        showToast(error.message);
        return;
      }
      showToast(okMsgMap[action]);
      await load();
      onQueueChanged?.();
    } finally {
      setActingId(null);
    }
  }

  const filteredRows = rows.filter((row) => sourceFilter === "all" || row.subjectType === sourceFilter);

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 16 }}>
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 24, background: t.surface }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Scrapbook review</div>
        <div style={{ fontSize: 14, color: t.textMuted, marginBottom: 16 }}>
          Pending submissions and community-flagged scrapbook items. Approve, reject, delete, or restore after review.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {([
            { id: "all", label: `All (${rows.length})` },
            { id: "memorial", label: `Memorial (${rows.filter((r) => r.subjectType === "memorial").length})` },
            { id: "event", label: `Event (${rows.filter((r) => r.subjectType === "event").length})` },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSourceFilter(opt.id)}
              style={{
                borderRadius: 999,
                border: `1px solid ${sourceFilter === opt.id ? t.text : t.border}`,
                background: sourceFilter === opt.id ? t.text : t.surface,
                color: sourceFilter === opt.id ? t.surface : t.text,
                fontWeight: 800,
                fontSize: 12,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loading ? (
          <div style={{ color: t.textFaint }}>Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div style={{ color: t.textFaint, fontSize: 14 }}>No pending or flagged scrapbook items.</div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {filteredRows.map((it) => (
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
                    {it.subjectType === "event" ? "Event: " : "Memorial: "}
                    {it.subjectTitle}
                    {it.subjectMeta ? (
                      <span style={{ color: t.textMuted, fontWeight: 600 }}>
                        {" "}
                        · {it.subjectMeta}
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
                  {" · "}
                  Source: <span style={{ fontWeight: 700 }}>{it.subjectType}</span>
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
                        onClick={() => void runAction(it, "approve")}
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
                        onClick={() => void runAction(it, "reject")}
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
                      onClick={() => void runAction(it, "restore")}
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
                    onClick={() => void runAction(it, "delete")}
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
