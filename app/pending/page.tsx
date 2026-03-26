"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";

export default function PendingPage() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      setEmail(user.email ?? null);

      // If already verified, send them to the app
      const { data: profile } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile?.verification_status === "verified") {
        window.location.href = "/";
      }
    }
    check();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", background: "white", borderRadius: 16, padding: "40px 36px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>

        <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: -1, marginBottom: 8 }}>EOD HUB</div>
        <div style={{ fontSize: 13, color: "#888", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginBottom: 36 }}>
          Built for EOD Techs, by an EOD Tech.
        </div>

        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fef9c3", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>
          ⏳
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 12px" }}>
          Awaiting Verification
        </h2>

        <p style={{ fontSize: 15, color: "#555", lineHeight: 1.7, margin: "0 0 8px" }}>
          Your account is pending review. Once an admin verifies you, you'll receive a confirmation email and can log in to EOD HUB.
        </p>

        {email && (
          <p style={{ fontSize: 14, color: "#888", margin: "0 0 32px" }}>
            We'll notify you at <strong>{email}</strong>
          </p>
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
