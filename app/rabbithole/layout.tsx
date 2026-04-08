 "use client";

import { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { supabase } from "../lib/lib/supabaseClient";
import { hasRabbitholeFounderConfig, isFounderUser } from "../lib/rabbitholeAccess";

export default function RabbitholeLayout({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function guard() {
      if (!hasRabbitholeFounderConfig()) {
        window.location.href = "/";
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      const canAccess = isFounderUser(uid);
      if (!mounted) return;
      if (!canAccess) {
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

  return (
    <>
      <NavBar />
      {children}
    </>
  );
}
