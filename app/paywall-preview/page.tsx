import { notFound } from "next/navigation";
import PaywallPreviewClient from "./PaywallPreviewClient";

export default function PaywallPreviewPage() {
  const enabled =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PAYWALL_PREVIEW === "1";
  if (!enabled) {
    notFound();
  }
  return <PaywallPreviewClient />;
}
