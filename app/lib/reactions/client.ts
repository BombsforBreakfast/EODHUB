import type { SupabaseClient } from "@supabase/supabase-js";
import { parseReactionType, type ReactionSubjectKind, type ReactionType } from "./types";
import type { ContentReactionRow } from "./aggregate";

export async function fetchContentReactionsForSubjects(
  supabase: SupabaseClient,
  subjectKind: ReactionSubjectKind,
  subjectIds: string[],
): Promise<ContentReactionRow[]> {
  if (subjectIds.length === 0) return [];

  const { data, error } = await supabase
    .from("content_reactions")
    .select("subject_id, user_id, reaction_type")
    .eq("subject_kind", subjectKind)
    .in("subject_id", subjectIds);

  if (error) throw error;
  return ((data ?? []) as ContentReactionRow[]) ?? [];
}

/**
 * Toggle rules: same emoji again removes; different emoji updates; none inserts.
 */
export async function applyContentReaction(
  supabase: SupabaseClient,
  params: {
    subjectKind: ReactionSubjectKind;
    subjectId: string;
    userId: string;
    picked: ReactionType;
  },
): Promise<"inserted" | "updated" | "removed"> {
  const { subjectKind, subjectId, userId, picked } = params;

  const { data: existing, error: selErr } = await supabase
    .from("content_reactions")
    .select("id, reaction_type")
    .eq("subject_kind", subjectKind)
    .eq("subject_id", subjectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) throw selErr;

  const existingRow = existing as { id: string; reaction_type: string } | null;

  if (!existingRow) {
    const { error } = await supabase.from("content_reactions").insert({
      subject_kind: subjectKind,
      subject_id: subjectId,
      user_id: userId,
      reaction_type: picked,
    });
    if (error) throw error;
    return "inserted";
  }

  const existingType = parseReactionType(existingRow.reaction_type);
  if (existingType === picked) {
    const { error } = await supabase.from("content_reactions").delete().eq("id", existingRow.id);
    if (error) throw error;
    return "removed";
  }

  const { error } = await supabase
    .from("content_reactions")
    .update({ reaction_type: picked })
    .eq("id", existingRow.id);

  if (error) throw error;
  return "updated";
}
