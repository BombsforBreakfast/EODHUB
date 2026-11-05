import type { SupabaseClient } from "@supabase/supabase-js";
export async function autoApproveExplicitJobs(_client: SupabaseClient, _source?: string, _errors?: string[]): Promise<number> { return 0; }
export async function autoApproveAfterImport(_client: SupabaseClient, _source: string, _errors: string[]): Promise<number> { return 0; }
