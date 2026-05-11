import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostLikerBrief } from "../components/PostLikersStack";
import { isEmployerAccountType, isOrganizationAccountType } from "./accountRoles";

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  service: string | null;
  is_employer: boolean | null;
  account_type: string | null;
  company_name: string | null;
};

function toPostLikerBrief(p: ProfileRow): PostLikerBrief {
  const name =
    (isOrganizationAccountType(p.account_type) && p.company_name?.trim())
      ? p.company_name.trim()
      : p.display_name?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
        "Member";
  return {
    userId: p.user_id,
    name,
    photoUrl: p.photo_url,
    service: p.service,
    isEmployer: isEmployerAccountType(p.account_type),
  };
}

/**
 * Loads up to N profiles per status for event RSVP avatars, ordered by
 * attendance time (oldest first — same order as the full list).
 */
export async function fetchEventAttendeePreviews(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ going: PostLikerBrief[]; interested: PostLikerBrief[] }> {
  const { data: rows, error } = await supabase
    .from("event_attendance")
    .select("user_id, status, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) {
    return { going: [], interested: [] };
  }

  const goingIds: string[] = [];
  const interestedIds: string[] = [];
  for (const r of rows as { user_id: string; status: string }[]) {
    if (r.status === "going") goingIds.push(r.user_id);
    else if (r.status === "interested") interestedIds.push(r.user_id);
  }

  const allIds = [...new Set([...goingIds, ...interestedIds])];
  if (allIds.length === 0) return { going: [], interested: [] };

  const { data: profs } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, photo_url, service, is_employer, account_type, company_name")
    .in("user_id", allIds);

  const byId = new Map(
    (profs as ProfileRow[] | null)?.map((p) => [p.user_id, p]) ?? []
  );

  const mapList = (orderedIds: string[]) =>
    orderedIds
      .map((id) => {
        const p = byId.get(id);
        return p ? toPostLikerBrief(p) : null;
      })
      .filter((x): x is PostLikerBrief => x != null);

  return {
    going: mapList(goingIds),
    interested: mapList(interestedIds),
  };
}
