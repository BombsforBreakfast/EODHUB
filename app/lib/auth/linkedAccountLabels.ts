import type { User } from "@supabase/supabase-js";

export type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  account_type: string | null;
  is_employer: boolean | null;
  company_name: string | null;
  service: string | null;
  verification_status: string | null;
  photo_url: string | null;
};

export type LinkedAccountSummary = {
  userId: string;
  isCurrent: boolean;
  label: string;
  kind: "member" | "employer" | "business";
  subtitle: string;
  signInMethods: string[];
  photoUrl: string | null;
  linkSource: "same_email" | "business_ownership" | "current";
};

import { formatOAuthProviderLabel } from "./oauthProviders";

function formatProviders(providers: string[]): string {
  return providers.map((p) => formatOAuthProviderLabel(p)).join(" · ");
}

export function buildLinkedAccountSummary(
  authUser: User,
  profile: ProfileRow | undefined,
  isCurrent: boolean,
  providers: string[],
  opts?: {
    businessName?: string | null;
    photoUrlOverride?: string | null;
    linkSource?: LinkedAccountSummary["linkSource"];
    /** Force business label when switching into an ownership-linked business login. */
    forceBusiness?: boolean;
  },
): LinkedAccountSummary {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "User";
  const acct = profile?.account_type ?? null;
  const isEmployer = !!profile?.is_employer || acct === "employer";
  const isBusiness =
    opts?.forceBusiness === true || acct === "business_org" || acct === "business";
  const businessName = (opts?.businessName ?? profile?.company_name)?.trim() || null;

  let kind: LinkedAccountSummary["kind"] = "member";
  let label: string;
  if (isBusiness) {
    kind = "business";
    label = businessName ? `Business · ${businessName}` : `Business · ${name}`;
  } else if (isEmployer) {
    kind = "employer";
    label = profile?.company_name ? `Employer · ${profile.company_name}` : `Employer · ${name}`;
  } else {
    kind = "member";
    const svc = profile?.service ? ` · ${profile.service}` : "";
    label = `Personal · ${name}${svc}`;
  }

  const ver = profile?.verification_status;
  const subtitleParts: string[] = [];
  if (opts?.linkSource === "business_ownership") {
    subtitleParts.push(isBusiness ? "Linked business login" : "Linked personal account");
  } else {
    const providersLabel = formatProviders(providers);
    if (providersLabel) subtitleParts.push(providersLabel);
  }
  if (ver && ver !== "verified") subtitleParts.push(ver.replace(/_/g, " "));
  else if (ver === "verified") subtitleParts.push("Verified");

  return {
    userId: authUser.id,
    isCurrent,
    label,
    kind,
    subtitle: subtitleParts.filter(Boolean).join(" — "),
    signInMethods: providers,
    photoUrl: opts?.photoUrlOverride ?? profile?.photo_url ?? null,
    linkSource: opts?.linkSource ?? (isCurrent ? "current" : "same_email"),
  };
}
