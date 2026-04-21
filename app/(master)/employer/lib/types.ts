/**
 * Employer Dashboard types.
 *
 * The profiles table contains both public/front-of-card fields AND
 * employer-only/back-of-card fields. We split the two here so the list
 * view only needs the lightweight public columns, and the resume modal
 * loads the heavier employer-only columns on demand.
 */

export const PUBLIC_CANDIDATE_COLUMNS = [
  "user_id",
  "display_name",
  "first_name",
  "last_name",
  "photo_url",
  "bio",
  "role",
  "service",
  "status",
  "years_experience",
  "skill_badge",
  "professional_tags",
  "unit_history_tags",
  "tech_types",
  "current_city",
  "current_state",
  "open_to_opportunities",
  "account_type",
  "verification_status",
  "created_at",
] as const;

export const EMPLOYER_CANDIDATE_COLUMNS = [
  ...PUBLIC_CANDIDATE_COLUMNS,
  "employer_summary",
  "resume_url",
  "resume_text",
  "education_url",
  "specialized_training",
  "specialized_training_docs",
  "availability_type",
  "availability_date",
  "willing_to_relocate",
  "willing_to_travel",
  "work_preference",
  "clearance_level",
  "clearance_status",
  "clearance_expiration_date",
  "has_oconus_experience",
  "has_contract_experience",
  "has_federal_le_military_crossover",
] as const;

export type PublicCandidate = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  bio: string | null;
  role: string | null;
  service: string | null;
  status: string | null;
  years_experience: string | null;
  skill_badge: string | null;
  professional_tags: string[] | null;
  unit_history_tags: string[] | null;
  tech_types: string[] | string | null;
  current_city: string | null;
  current_state: string | null;
  open_to_opportunities: boolean | null;
  account_type: string | null;
  verification_status: string | null;
  created_at: string | null;
};

export type EmployerCandidate = PublicCandidate & {
  employer_summary: string | null;
  resume_url: string | null;
  resume_text: string | null;
  education_url: string | null;
  specialized_training: string[] | null;
  specialized_training_docs: Record<string, string> | null;
  availability_type: string | null;
  availability_date: string | null;
  willing_to_relocate: boolean | null;
  willing_to_travel: string | null;
  work_preference: string | null;
  clearance_level: string | null;
  clearance_status: string | null;
  clearance_expiration_date: string | null;
  has_oconus_experience: boolean | null;
  has_contract_experience: boolean | null;
  has_federal_le_military_crossover: boolean | null;
};

export type EmployerAction = {
  id: string;
  employer_id: string;
  target_user_id: string;
  is_saved: boolean;
  is_interested: boolean;
  is_hidden: boolean;
  notes: string | null;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployerTab = "all" | "saved" | "interested" | "hidden";
