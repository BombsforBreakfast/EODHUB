"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import NotificationPreferencesCard from "../../components/account/NotificationPreferencesCard";
import { useTheme } from "../../lib/ThemeContext";
import { supabase } from "../../lib/lib/supabaseClient";
import { useRequireFullAccess } from "../../hooks/useRequireFullAccess";

export default function NotificationSettingsPage() {
  useRequireFullAccess("app/account/notifications/page.tsx");
  const { t } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      setUserId(data.user.id);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: t.bg, color: t.text, padding: "24px 20px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/profile" style={{ color: t.textMuted, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
          Back to account
        </Link>
        <h1 style={{ fontSize: 32, fontWeight: 900, margin: "14px 0 8px" }}>Notification settings</h1>
        <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, margin: "0 0 18px" }}>
          Manage EOD-HUB digest emails and notification preferences.
        </p>
        {loading && (
          <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: 18, background: t.surface, color: t.textMuted }}>
            Loading...
          </div>
        )}
        {!loading && userId && <NotificationPreferencesCard userId={userId} />}
      </div>
    </div>
  );
}
