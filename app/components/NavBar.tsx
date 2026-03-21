"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/lib/supabaseClient";

export default function NavBar() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      setCurrentUserId(data.user?.id ?? null);
    }

    loadUser();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  const navButton: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #ccc",
    textDecoration: "none",
    fontWeight: 700,
    background: "white",
    color: "black",
  };

  const primaryButton: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    textDecoration: "none",
    fontWeight: 700,
    background: "black",
    color: "white",
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 30,
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" style={navButton}>
          Home
        </Link>

        {currentUserId && (
          <Link href={`/profile/${currentUserId}`} style={navButton}>
            My Wall
          </Link>
        )}

        <Link href="/profile" style={navButton}>
          My Account
        </Link>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/post-job" style={primaryButton}>
          Post Job
        </Link>

        <button
          onClick={handleLogout}
          style={{
            ...navButton,
            cursor: "pointer",
          }}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}