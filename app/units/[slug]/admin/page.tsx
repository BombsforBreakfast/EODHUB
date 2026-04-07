"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/lib/supabaseClient";
import { useTheme } from "../../../lib/ThemeContext";
import NavBar from "../../../components/NavBar";

type UnitInfo = {
  id: string;
  name: string;
  slug: string;
  type: string;
  cover_photo_url: string | null;
};

type PendingMember = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  service: string | null;
  job_title: string | null;
  requested_at: string;
};

type Member = {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  service: string | null;
  job_title: string | null;
  role: string;
  joined_at: string;
};

type PhotoPost = {
  id: string;
  user_id: string;
  author_name: string;
  author_photo: string | null;
  photo_url: string | null;
  content: string | null;
  created_at: string;
};

type AdminData = {
  unit: UnitInfo;
  pending: PendingMember[];
  members: Member[];
  photos: PhotoPost[];
};

const ROLE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  owner: { bg: "#fef3c7", color: "#92400e", label: "Owner" },
  admin: { bg: "#dbeafe", color: "#1e40af", label: "Admin" },
  member: { bg: "#f3f4f6", color: "#374151", label: "Member" },
};

function Avatar({ name, photo, size = 36 }: { name: string; photo: string | null; size?: number }) {
  const { t } = useTheme();
  if (photo) {
    return <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: t.text, color: t.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.38, flexShrink: 0 }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default function UnitAdminPage() {
  const { slug } = useParams() as { slug: string };
  const { t } = useTheme();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"requests" | "members" | "photos">("requests");
  const [working, setWorking] = useState<string | null>(null); // id of item being actioned
  const [myRole, setMyRole] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/units/${slug}/admin`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) { setError("You don't have admin access to this unit."); return; }
      if (res.status === 404) { setError("Unit not found."); return; }
      if (!res.ok) { setError("Failed to load admin data."); return; }
      const json = await res.json() as AdminData;
      setData(json);

      // Figure out current user's role
      if (session?.user?.id) {
        const me = json.members.find((m) => m.user_id === session.user.id);
        setMyRole(me?.role ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [slug]);

  async function action(body: Record<string, string>) {
    const key = body.user_id ?? body.post_id ?? body.action;
    setWorking(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/units/${slug}/admin`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error ?? "Action failed");
        return;
      }
      await load();
    } finally {
      setWorking(null);
    }
  }

  const card: React.CSSProperties = {
    border: `1px solid ${t.border}`,
    borderRadius: 16,
    padding: 24,
    background: t.surface,
    marginBottom: 20,
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px",
    borderRadius: 10,
    border: active ? "none" : `1px solid ${t.border}`,
    background: active ? t.text : "transparent",
    color: active ? t.bg : t.text,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  });

  const actionBtn = (variant: "approve" | "deny" | "remove" | "promote" | "demote"): React.CSSProperties => {
    const styles: Record<string, React.CSSProperties> = {
      approve: { background: "#16a34a", color: "#fff", border: "none" },
      deny: { background: "transparent", color: "#dc2626", border: "1px solid #dc2626" },
      remove: { background: "transparent", color: "#dc2626", border: "1px solid #dc2626" },
      promote: { background: "#1d4ed8", color: "#fff", border: "none" },
      demote: { background: "transparent", color: "#6b7280", border: `1px solid ${t.border}` },
    };
    return { padding: "6px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer", ...styles[variant] };
  };

  const padX = { paddingLeft: "max(20px, env(safe-area-inset-left))", paddingRight: "max(20px, env(safe-area-inset-right))" } as const;
  const navShell: CSSProperties = { width: "100%", boxSizing: "border-box", paddingTop: 24, background: t.bg, ...padX };
  const bodyShell: CSSProperties = { maxWidth: 900, margin: "0 auto", boxSizing: "border-box", paddingTop: 16, paddingBottom: 32, ...padX };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={navShell}>
          <NavBar />
        </div>
        <div style={bodyShell}>
          <div style={{ color: t.textMuted, textAlign: "center", padding: 60 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
        <div style={navShell}>
          <NavBar />
        </div>
        <div style={bodyShell}>
          <div style={{ color: "#dc2626", textAlign: "center", padding: 60 }}>{error}</div>
          <div style={{ textAlign: "center" }}>
            <Link href="/units" style={{ color: t.text, fontWeight: 700 }}>← Back to Groups</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { unit, pending, members, photos } = data;
  const isOwner = myRole === "owner";

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <div style={navShell}>
        <NavBar />
      </div>
      <div style={bodyShell}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ width: 48, height: 48, borderRadius: 10, background: unit.cover_photo_url ? `url(${unit.cover_photo_url}) center/cover` : "#1e3a5f", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: t.text }}>{unit.name}</div>
          <div style={{ fontSize: 13, color: t.textMuted, textTransform: "capitalize" }}>{unit.type.replace(/_/g, " ")} · Unit Admin</div>
        </div>
        <Link
          href={`/units/${slug}`}
          style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${t.border}`, color: t.text, textDecoration: "none", fontWeight: 700, fontSize: 13, flexShrink: 0 }}
        >
          ← View Unit
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <button style={tabBtn(tab === "requests")} onClick={() => setTab("requests")}>
          Join Requests {pending.length > 0 && <span style={{ marginLeft: 6, background: "#f97316", color: "#fff", borderRadius: 20, padding: "1px 7px", fontSize: 11 }}>{pending.length}</span>}
        </button>
        <button style={tabBtn(tab === "members")} onClick={() => setTab("members")}>
          Members ({members.length})
        </button>
        <button style={tabBtn(tab === "photos")} onClick={() => setTab("photos")}>
          Photos ({photos.length})
        </button>
      </div>

      {/* ── Join Requests ── */}
      {tab === "requests" && (
        <div style={card}>
          {pending.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "24px 0" }}>No pending join requests.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {pending.map((p) => (
                <div key={p.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${t.borderLight}` }}>
                  <Avatar name={p.display_name} photo={p.photo_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{p.display_name}</div>
                    <div style={{ fontSize: 12, color: t.textMuted }}>
                      {[p.service, p.job_title].filter(Boolean).join(" · ") || "EOD Professional"}
                    </div>
                    <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
                      Requested {new Date(p.requested_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      style={{ ...actionBtn("approve"), display: "flex", alignItems: "center", gap: 5 }}
                      disabled={working === p.user_id}
                      onClick={() => action({ action: "approve_member", user_id: p.user_id })}
                    >
                      {working === p.user_id && <span className="btn-spinner" />}
                      Approve
                    </button>
                    <button
                      style={{ ...actionBtn("deny"), display: "flex", alignItems: "center", gap: 5 }}
                      disabled={working === p.user_id}
                      onClick={() => action({ action: "deny_member", user_id: p.user_id })}
                    >
                      {working === p.user_id && <span className="btn-spinner" style={{ borderTopColor: "#dc2626", borderColor: "rgba(220,38,38,0.2)" }} />}
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Members ── */}
      {tab === "members" && (
        <div style={card}>
          {members.length === 0 ? (
            <div style={{ color: t.textMuted, fontSize: 14, textAlign: "center", padding: "24px 0" }}>No members yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {members.map((m) => {
                const badge = ROLE_BADGE[m.role] ?? ROLE_BADGE.member;
                const isMe = false; // for safety we allow all actions; server enforces
                const canRemove = isOwner ? m.role !== "owner" : m.role === "member";
                const canPromote = isOwner && m.role === "member";
                const canDemote = isOwner && m.role === "admin";
                return (
                  <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${t.borderLight}` }}>
                    <Avatar name={m.display_name} photo={m.photo_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: t.text }}>{m.display_name}</span>
                        <span style={{ background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20 }}>{badge.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>
                        {[m.service, m.job_title].filter(Boolean).join(" · ") || "EOD Professional"}
                      </div>
                      <div style={{ fontSize: 11, color: t.textFaint, marginTop: 2 }}>
                        Joined {new Date(m.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {canPromote && (
                        <button
                          style={{ ...actionBtn("promote"), display: "flex", alignItems: "center", gap: 5 }}
                          disabled={working === m.user_id}
                          onClick={() => action({ action: "change_role", user_id: m.user_id, role: "admin" })}
                        >
                          {working === m.user_id && <span className="btn-spinner" />}
                          Make Admin
                        </button>
                      )}
                      {canDemote && (
                        <button
                          style={{ ...actionBtn("demote"), display: "flex", alignItems: "center", gap: 5 }}
                          disabled={working === m.user_id}
                          onClick={() => action({ action: "change_role", user_id: m.user_id, role: "member" })}
                        >
                          {working === m.user_id && <span className="btn-spinner btn-spinner-dark" />}
                          Demote
                        </button>
                      )}
                      {canRemove && (
                        <button
                          style={{ ...actionBtn("remove"), display: "flex", alignItems: "center", gap: 5 }}
                          disabled={working === m.user_id}
                          onClick={() => {
                            if (confirm(`Remove ${m.display_name} from this unit?`)) {
                              action({ action: "remove_member", user_id: m.user_id });
                            }
                          }}
                        >
                          {working === m.user_id && <span className="btn-spinner" style={{ borderTopColor: "#dc2626", borderColor: "rgba(220,38,38,0.2)" }} />}
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Photos ── */}
      {tab === "photos" && (
        <div>
          {photos.length === 0 ? (
            <div style={{ ...card, color: t.textMuted, fontSize: 14, textAlign: "center", padding: "40px 24px" }}>
              No photos posted yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {photos.map((ph) => (
                <div key={ph.id} style={{ border: `1px solid ${t.border}`, borderRadius: 14, overflow: "hidden", background: t.surface }}>
                  <img
                    src={ph.photo_url!}
                    alt="Unit photo"
                    style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", display: "block" }}
                  />
                  <div style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <Avatar name={ph.author_name} photo={ph.author_photo} size={26} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{ph.author_name}</span>
                    </div>
                    {ph.content && (
                      <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8, lineHeight: 1.4 }}>{ph.content}</div>
                    )}
                    <div style={{ fontSize: 11, color: t.textFaint, marginBottom: 10 }}>
                      {new Date(ph.created_at).toLocaleDateString()}
                    </div>
                    <button
                      style={{ ...actionBtn("remove"), width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 5 }}
                      disabled={working === ph.id}
                      onClick={() => {
                        if (confirm("Delete this photo from the unit wall?")) {
                          action({ action: "delete_post", post_id: ph.id });
                        }
                      }}
                    >
                      {working === ph.id && <span className="btn-spinner" style={{ borderTopColor: "#dc2626", borderColor: "rgba(220,38,38,0.2)" }} />}
                      Delete Photo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
