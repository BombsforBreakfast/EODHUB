"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";

const VOUCHES_NEEDED = 3;

export default function PendingPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [vouchCount, setVouchCount] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      setEmail(user.email ?? null);
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("verification_status, first_name, referral_code, is_admin")
        .eq("user_id", user.id)
        .maybeSingle();

      setStatus(profile?.verification_status ?? null);
      setReferralCode((profile as { verification_status: string | null; first_name: string | null; referral_code: string | null } | null)?.referral_code ?? null);

      if (profile?.is_admin) {
        window.location.href = "/";
        return;
      }

      // Sync Google OAuth name to profile if missing
      const googleName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (profile && !profile.first_name && googleName) {
        const parts = (googleName as string).trim().split(/\s+/);
        await supabase.from("profiles").update({
          first_name: parts[0] || "",
          last_name: parts.slice(1).join(" ") || "",
        }).eq("user_id", user.id);
      }

      if (profile?.verification_status === "verified") {
        window.location.href = "/";
        return;
      }

      // Fetch vouch count
      const { count } = await supabase
        .from("profile_vouches")
        .select("*", { count: "exact", head: true })
        .eq("vouchee_user_id", user.id);
      setVouchCount(count ?? 0);
    }
    check();
  }, []);

  // Poll every 30s so the page auto-advances if they get verified while waiting
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile?.verification_status === "verified") {
        window.location.href = "/";
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const vouched = Math.min(vouchCount, VOUCHES_NEEDED);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", background: "white", borderRadius: 16, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>

        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>EOD HUB</div>
        <div style={{ fontSize: 13, color: "#888", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 36 }}>
          Built for EOD Techs, by an EOD Tech.
        </div>

        {status === "denied" ? (
          <>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
              🚫
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 12px" }}>
              Access Denied
            </h2>
            <p style={{ fontSize: 15, color: "#555", lineHeight: 1.7, margin: "0 0 32px" }}>
              Your account was not approved. If you believe this is an error, please contact an administrator.
            </p>
          </>
        ) : (
          <>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fef9c3", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
              ⏳
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 12px" }}>
              Awaiting Verification
            </h2>
            <p style={{ fontSize: 15, color: "#555", lineHeight: 1.7, margin: "0 0 8px" }}>
              Your account is pending review. Once verified, you'll receive a confirmation email and can access EOD HUB.
            </p>
            {email && (
              <p style={{ fontSize: 14, color: "#888", margin: "0 0 28px" }}>
                We'll notify you at <strong>{email}</strong>
              </p>
            )}

            {/* Vouch progress */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "18px 20px", marginBottom: 28, textAlign: "left" }}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
                Community Verification
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {Array.from({ length: VOUCHES_NEEDED }).map((_, i) => (
                  <div key={i} style={{
                    flex: 1, height: 8, borderRadius: 99,
                    background: i < vouched ? "#22c55e" : "#e5e7eb",
                    transition: "background 0.3s",
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#555" }}>
                {vouched < VOUCHES_NEEDED ? (
                  <><strong>{vouched} of {VOUCHES_NEEDED}</strong> community members have vouched for you. Share your profile link with EOD colleagues to speed up verification.</>
                ) : (
                  <strong style={{ color: "#16a34a" }}>All vouches received — verification in progress.</strong>
                )}
              </div>
            </div>
          </>
        )}

        {referralCode && status !== "denied" && (
          <div style={{ marginBottom: 24, background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "16px 18px", textAlign: "left" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#4338ca", marginBottom: 4 }}>
              🎖️ Invite 5 colleagues, earn a Recruiter Badge
            </div>
            <div style={{ fontSize: 13, color: "#6366f1", marginBottom: 12, lineHeight: 1.5 }}>
              While you wait, share your invite link. When 5 verified members join through your code, you earn your Bronze Recruiter badge.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, background: "white", border: "1px solid #c7d2fe", borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>
                eod-hub.com/login?ref={referralCode}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`https://eod-hub.com/login?ref=${referralCode}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                style={{ background: "#6366f1", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{ padding: "11px 28px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
