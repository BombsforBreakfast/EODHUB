import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLinkedInUrl } from "@/app/lib/linkedInUrl";
import { isEmployerAccount } from "@/app/lib/profileCompleteness";

export type SaveProfileBody = {
  accountKind?: unknown;
  company_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  display_name?: unknown;
  role?: unknown;
  bio?: unknown;
  service?: unknown;
  status?: unknown;
  years_experience?: unknown;
  skill_badge?: unknown;
  company_website?: unknown;
  linkedin_url?: unknown;
  open_to_opportunities?: unknown;
  employer_summary?: unknown;
  resume_url?: unknown;
  education_url?: unknown;
  specialized_training?: unknown;
  specialized_training_docs?: unknown;
  availability_type?: unknown;
  availability_date?: unknown;
  current_city?: unknown;
  current_state?: unknown;
  willing_to_relocate?: unknown;
  willing_to_travel?: unknown;
  work_preference?: unknown;
  clearance_level?: unknown;
  clearance_status?: unknown;
  clearance_expiration_date?: unknown;
  has_oconus_experience?: unknown;
  has_contract_experience?: unknown;
  has_federal_le_military_crossover?: unknown;
  professional_tags?: unknown;
  unit_history_tags?: unknown;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return items.length ? items : null;
}

function asTrainingDocs(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, url]) => typeof url === "string" && url.trim(),
  ) as [string, string][];
  if (!entries.length) return null;
  return Object.fromEntries(entries.map(([tag, url]) => [tag, url.trim()]));
}

function asBool(value: unknown): boolean {
  return value === true;
}

export async function saveProfileUpdate(
  adminClient: SupabaseClient,
  userId: string,
  body: SaveProfileBody,
): Promise<{ ok: true; profile: Record<string, unknown> } | { ok: false; error: string; status: number }> {
  const { data: existing, error: readError } = await adminClient
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    return { ok: false, error: "Could not load profile.", status: 500 };
  }
  if (!existing) {
    return { ok: false, error: "Profile not found.", status: 404 };
  }

  const employerSave =
    body.accountKind === "employer"
    || !!(existing as { is_employer?: boolean | null }).is_employer
    || isEmployerAccount(existing as { account_type?: string | null; company_name?: string | null });

  let updates: Record<string, unknown>;

  if (employerSave) {
    updates = {
      company_name: asTrimmedString(body.company_name),
      first_name: asTrimmedString(body.first_name),
      last_name: asTrimmedString(body.last_name),
      company_website: asTrimmedString(body.company_website),
      bio: asTrimmedString(body.bio),
    };
  } else {
    const linkedInResult = normalizeLinkedInUrl(typeof body.linkedin_url === "string" ? body.linkedin_url : "");
    if (!linkedInResult.ok) {
      return { ok: false, error: linkedInResult.error, status: 400 };
    }

    updates = {
      display_name: asTrimmedString(body.display_name),
      role: asTrimmedString(body.role),
      bio: asTrimmedString(body.bio),
      service: asTrimmedString(body.service),
      status: asTrimmedString(body.status),
      years_experience: asTrimmedString(body.years_experience),
      skill_badge: asTrimmedString(body.skill_badge),
      company_website: asTrimmedString(body.company_website),
      linkedin_url: linkedInResult.url,
      open_to_opportunities: asBool(body.open_to_opportunities),
      employer_summary: asTrimmedString(body.employer_summary),
      resume_url: asTrimmedString(body.resume_url),
      education_url: asTrimmedString(body.education_url),
      specialized_training: asStringArray(body.specialized_training),
      specialized_training_docs: asTrainingDocs(body.specialized_training_docs),
      availability_type: asTrimmedString(body.availability_type),
      availability_date: asTrimmedString(body.availability_date),
      current_city: asTrimmedString(body.current_city),
      current_state: asTrimmedString(body.current_state),
      willing_to_relocate: asBool(body.willing_to_relocate),
      willing_to_travel: asTrimmedString(body.willing_to_travel),
      work_preference: asTrimmedString(body.work_preference),
      clearance_level: asTrimmedString(body.clearance_level),
      clearance_status: asTrimmedString(body.clearance_status),
      clearance_expiration_date: asTrimmedString(body.clearance_expiration_date),
      has_oconus_experience: asBool(body.has_oconus_experience),
      has_contract_experience: asBool(body.has_contract_experience),
      has_federal_le_military_crossover: asBool(body.has_federal_le_military_crossover),
      professional_tags: asStringArray(body.professional_tags),
      unit_history_tags: asStringArray(body.unit_history_tags),
    };
  }

  const { data: saved, error: updateError } = await adminClient
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return { ok: false, error: updateError.message, status: 500 };
  }
  if (!saved) {
    return { ok: false, error: "Your changes were not saved. Please refresh and try again.", status: 409 };
  }

  return { ok: true, profile: saved as Record<string, unknown> };
}
