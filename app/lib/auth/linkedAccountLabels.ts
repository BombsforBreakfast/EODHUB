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
};

function formatProviders(providers: string[]): string {
  const pretty = providers.map((p) => (p === "email" ? "Email & password" : p === "google" ? "Google" : p));
  return pretty.join(" · ");
}

export function buildLinkedAccountSummary(
  authUser: User,
  profile: ProfileRow | undefined,
  isCurrent: boolean,
  providers: string[]
): LinkedAccountSummary {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() || "User";
  const acct = profile?.account_type ?? null;
  const isEmployer = !!profile?.is_employer || acct === "employer";

  let kind: LinkedAccountSummary["kind"] = "member";
  let label: string;
  if (acct === "business") {
    kind = "business";
    label = profile?.company_name ? `Business · ${profile.company_name}` : `Business · ${name}`;
  } else if (isEmployer) {
    kind = "employer";
    label = profile?.company_name ? `Employer · ${profile.company_name}` : `Employer · ${name}`;
  } else {
    kind = "member";
    const svc = profile?.service ? ` · ${profile.service}` : "";
    label = `Member · ${name}${svc}`;
  }

  const ver = profile?.verification_status;
  const subtitleParts: string[] = [formatProviders(providers)];
  if (ver && ver !== "verified") subtitleParts.push(ver.replace(/_/g, " "));
  else if (ver === "verified") subtitleParts.push("Verified");

  return {
    userId: authUser.id,
    isCurrent,
    label,
    kind,
    subtitle: subtitleParts.filter(Boolean).join(" — "),
    signInMethods: providers,
    photoUrl: profile?.photo_url ?? null,
  };
}
