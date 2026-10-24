"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { isNativeApp } from "@/app/lib/native/isNativeApp";

const subscribe = () => () => {};
const getPlatform = () => isNativeApp() ? "native" : "web";
const getServerPlatform = () => "pending";

export default function RentalsWebGate({ children }: { children: ReactNode }) {
  const platform = useSyncExternalStore(subscribe, getPlatform, getServerPlatform);
  if (platform === "native") {
    return <section aria-labelledby="rentals-web-only-title" style={{ maxWidth: 560, margin: "60px auto", padding: 24 }}>
      <h1 id="rentals-web-only-title" style={{ fontSize: 26, fontWeight: 750 }}>Rentals are web-only for now</h1>
      <p style={{ marginBlock: 20 }}>This rental directory is not currently available in the EOD-HUB iOS or Android app.</p>
      <Link href="/" style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>Back to EOD-HUB</Link>
    </section>;
  }
  return <div data-rentals-platform={platform} aria-busy={platform === "pending"} style={platform === "pending" ? { visibility: "hidden" } : undefined}>{children}</div>;
}
