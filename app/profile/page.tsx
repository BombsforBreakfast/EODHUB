"use client";

import NavBar from "../components/NavBar";

export default function MyAccountPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <NavBar />

      <div
        style={{
          marginTop: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 24,
          background: "white",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>
          My Account
        </h1>

        <div style={{ marginTop: 12, color: "#555", lineHeight: 1.6 }}>
          This page will replace the old profile editor and become the user’s
          account/settings area.
        </div>
      </div>
    </div>
  );
}