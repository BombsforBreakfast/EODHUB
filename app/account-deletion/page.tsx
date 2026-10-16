"use client";

import Link from "next/link";
import NavBar from "../components/NavBar";
import { useTheme } from "../lib/ThemeContext";
import { LEGAL_CONTACT_EMAIL } from "../lib/legalText";

const deletionEmail = `mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("EOD-HUB account and personal data deletion request")}`;

export default function AccountDeletionPage() {
  const { t } = useTheme();

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      <NavBar />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px", lineHeight: 1.65 }}>
        <h1 style={{ margin: "0 0 16px", fontSize: 30, lineHeight: 1.2 }}>
          EOD-HUB account and data deletion
        </h1>
        <p>
          You can request deletion of your EOD-HUB account and associated personal data
          without installing the app or signing in.
        </p>
        <section aria-labelledby="request-deletion-title">
          <h2 id="request-deletion-title" style={{ fontSize: 21 }}>Request deletion by email</h2>
          <p>
            Email <a href={deletionEmail} style={{ color: "#2563eb" }}>{LEGAL_CONTACT_EMAIL}</a> from
            the email address associated with your account. Use the subject
            {" "}&ldquo;EOD-HUB account and personal data deletion request&rdquo; and tell us
            whether you want your account closed, remaining personal data removed, or both.
          </p>
          <p>
            If you cannot access that email address, contact the same support address for
            help verifying ownership. Do not send your password. We may need to verify
            that you own the account before completing the request.
          </p>
        </section>
        <section aria-labelledby="close-account-title">
          <h2 id="close-account-title" style={{ fontSize: 21 }}>Close your account in the app</h2>
          <ol style={{ paddingLeft: 24 }}>
            <li>Sign in to EOD-HUB and open your account settings at <Link href="/profile" style={{ color: "#2563eb" }}>/profile</Link>.</li>
            <li>Scroll to <strong>Close account</strong>.</li>
            <li>Read the explanation, confirm the checkbox, and select <strong>Close account</strong>.</li>
          </ol>
          <p>Closing your account is permanent and removes your ability to sign in.</p>
        </section>
        <section aria-labelledby="deletion-data-title">
          <h2 id="deletion-data-title" style={{ fontSize: 21 }}>What is removed and what may remain</h2>
          <p>
            Account closure removes your login and clears identifying profile information.
            Private conversations, connections, saved items, notifications, push registrations,
            and verification documents are removed through the account-closure process.
          </p>
          <p>
            Shared posts, job listings, business submissions, and group content may remain
            attributed to &ldquo;Former member&rdquo; to preserve community discussions and records.
            We also retain a record of account-deletion requests. These shared records and
            request logs do not currently have an automatic expiration period.
          </p>
          <p>
            To request removal of remaining personal data, including personal details within
            shared content or retained records, email <a href={deletionEmail} style={{ color: "#2563eb" }}>{LEGAL_CONTACT_EMAIL}</a>.
            You can request personal-data removal separately from closing your account.
          </p>
        </section>
        <p>
          If you have an active subscription, contact support about cancellation and billing
          when requesting deletion.
        </p>
        <p><Link href="/privacy" style={{ color: "#2563eb" }}>Privacy Policy</Link>{" · "}<Link href="/support" style={{ color: "#2563eb" }}>Support</Link></p>
      </main>
    </div>
  );
}
