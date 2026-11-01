import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { matchesJobPhrase, normalizeJobPhrase } from "@/app/lib/jobReviewPreferences";
import { loadJobReviewPreferences } from "@/app/lib/server/jobReviewPreferences";
import { removeJobWithImportMemory } from "@/app/lib/server/removeJobWithImportMemory";
export const maxDuration = 300;

async function admin(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: header } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await userClient.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!profile?.is_admin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { client: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) };
}
export async function GET(req: NextRequest) {
  const auth = await admin(req);
  if (auth.error) return auth.error;
  try {
    const preferences = await loadJobReviewPreferences(auth.client!);
    return NextResponse.json({ exclusions: preferences.exclusions, learnedPatterns: preferences.signals.length, priorities:preferences.priorities??[] });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update preferences" }, { status: 500 });
}
export async function POST(req: NextRequest) {
  const auth = await admin(req);
  if (auth.error) return auth.error;
  const client = auth.client!;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    if (body.action === "reset_learning") {
      const { error } = await client.from("job_review_feedback").delete().not("job_id", "is", null);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (body.action === "remove_priority") {
      if(typeof body.id!=="string"||!/^[a-f0-9-]{36}$/i.test(body.id))return NextResponse.json({error:"Invalid rule ID"},{status:400});
      const result=await client.from("job_priority_rules").delete().eq("id",body.id);if(result.error)throw result.error;return NextResponse.json({success:true});
    }
    if (body.action === "remove_exclusion") {
      if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id)) return NextResponse.json({ error: "Invalid rule ID" }, { status: 400 });
      const { error } = await client.from("job_type_exclusions").delete().eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    if (!["preview_exclusion", "add_exclusion"].includes(body.action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    const phrase = typeof body.phrase === "string" ? normalizeJobPhrase(body.phrase) : "";
    if (phrase.length < 3 || phrase.length > 100 || !/[a-z]/.test(phrase)) return NextResponse.json({ error: "Enter a title word or phrase, 3–100 characters." }, { status: 400 });
    const matches: Array<{ id: string; title: string }> = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from("jobs").select("id,title").neq("is_rejected", true).neq("is_approved", true)
        .in("source_type", ["adzuna", "usajobs", "linkedin", "reliefweb"]).order("id").range(start, start + 499);
      if (error) throw error;
      matches.push(...(data ?? []).filter(row => matchesJobPhrase(row.title ?? "", phrase)));
      if ((data ?? []).length < 500) break;
    }
    if (body.action === "preview_exclusion") return NextResponse.json({ phrase, count: matches.length, examples: matches.slice(0, 8) });
    const { error } = await client.from("job_type_exclusions").upsert({ phrase }, { onConflict: "phrase", ignoreDuplicates: true });
    if (error) throw error;
    let removed = 0;
    const failures: string[] = [];
    for (const job of matches) {
      const result = await removeJobWithImportMemory(client, job.id, { pendingOnly: true, expectedTitle: job.title });
      if (!result.ok) failures.push(job.id); else if (!result.skipped) removed++;
    }
    return NextResponse.json({ success: true, removed, failed: failures.length, message: failures.length ? "Rule saved. Some pending listings could not be removed; retry this rule to finish." : undefined });
  } catch (error) { return failure(error); }
}
