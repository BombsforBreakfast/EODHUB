import Link from "next/link";
import type { Metadata } from "next";
import { HubSupportButton, WebSupportOnly } from "@/app/components/support/HubSupportProvider";
import { HUB_SUPPORT_DISCLOSURE, HUB_SUPPORT_PAYMENT_DISCLOSURE } from "@/app/lib/hubSupport";
import styles from "@/app/components/support/hubSupport.module.css";

export const metadata: Metadata = { title: "Support the Hub | EOD-HUB", description: "Voluntary support for the EOD-HUB community platform." };
export default function SupportTheHubPage() {
  return <main className={styles.page}>
    <Link href="/login">EOD-HUB</Link>
    <WebSupportOnly><h1>Buy the Hub an energy drink.</h1><p>Help keep our community connected to opportunities, resources, and one another. Anyone can contribute—no account required.</p><HubSupportButton /><small>{HUB_SUPPORT_PAYMENT_DISCLOSURE}</small><small>{HUB_SUPPORT_DISCLOSURE}</small></WebSupportOnly>
    <Link href="/login">Back to EOD-HUB</Link>
  </main>;
}
