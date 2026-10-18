"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WebSupportOnly } from "@/app/components/support/HubSupportProvider";
import { isNativeApp } from "@/app/lib/native/isNativeApp";
import { supportDollars } from "@/app/lib/hubSupport";
import styles from "@/app/components/support/hubSupport.module.css";

export default function SupportThanksPage() {
  return <Suspense fallback={<p role="status">Checking payment confirmation…</p>}><SupportThanksContent /></Suspense>;
}

function SupportThanksContent() {
  const session = useSearchParams().get("session_id");
  const [receipt, setReceipt] = useState<{ status: string; amount_cents: number } | null>(null);
  const [message, setMessage] = useState("Checking your payment confirmation…");
  useEffect(() => {
    if (isNativeApp()) return;
    if (!session) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    async function check(attempt = 0) {
      try {
        const response = await fetch(`/api/hub-support/status?session_id=${encodeURIComponent(session!)}`, { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (response.ok && body.status !== "pending") { setReceipt(body); return; }
        if (attempt < 9) { timer = setTimeout(() => void check(attempt + 1), 2000); return; }
      } catch { if (cancelled) return; }
      setMessage("Your payment confirmation is still pending. Check your Stripe receipt before trying again. For help, contact Hello@eod-hub.com.");
    }
    void check();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session]);
  const paid = receipt?.status === "paid" || receipt?.status === "partially_refunded";
  return <main className={styles.page}><Link href="/login">EOD-HUB</Link><WebSupportOnly>
    <h1>{paid ? "Thanks for supporting the Hub." : receipt?.status === "refunded" ? "Your contribution was refunded." : "Payment confirmation"}</h1>
    <p role="status">{paid ? `Your ${supportDollars(receipt.amount_cents)} one-time contribution is confirmed. We appreciate your support.${receipt.status === "partially_refunded" ? " A partial refund has also been recorded." : ""}` : receipt?.status === "expired" ? "This checkout expired. No contribution was completed through it." : receipt?.status === "refunded" ? "A refund has been recorded. Contact Hello@eod-hub.com if you need help." : !session ? "No payment reference was supplied. Check your Stripe receipt before making another contribution." : message}</p>
  </WebSupportOnly><Link href="/login">Back to EOD-HUB</Link></main>;
}
