 "use client";

import { useEffect, useState } from "react";
import MasterShell from "../components/master/MasterShell";
import { supabase } from "../lib/lib/supabaseClient";
import { isVerifiedRabbitholeViewer } from "../lib/rabbitholeAccess";

export default function RabbitholeLayout({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function guard() {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) {
        if (mounted) window.location.href = "/login";
        return;
      }
      // Rabbithole is open to every verified EOD HUB member. Unverified or
      // pending accounts are bounced back to the master feed (the same place
      // they would be after sign-in if they hadn't completed verification).
      const { data: profile } = await supabase
        .from("profiles")
        .select("verification_status")
        .eq("user_id", uid)
        .maybeSingle();
      const status = (profile as { verification_status: string | null } | null)?.verification_status ?? null;
      if (!mounted) return;
      if (!isVerifiedRabbitholeViewer(status)) {
        window.location.href = "/";
        return;
      }
      setAllowed(true);
      setChecking(false);
    }

    void guard();
    return () => {
      mounted = false;
    };
  }, []);

  if (checking || !allowed) return null;

  return <MasterShell>{children}</MasterShell>;
}
