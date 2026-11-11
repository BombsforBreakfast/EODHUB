import { createHash } from "node:crypto";
import { normalizeJobPhrase } from "@/app/lib/jobReviewPreferences";
import { removeJobWithImportMemory } from "@/app/lib/server/removeJobWithImportMemory";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadJobReviewPreferences } from "@/app/lib/server/jobReviewPreferences";
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
    if (["preview_exclusion", "add_exclusion"].includes(body.action)) {
      const bulk = Array.isArray(body.phrases);
      const input: unknown[] = bulk ? body.phrases : [body.phrase];
      if (!input.length || input.length > 100 || input.some(value => typeof value !== "string")) {
        return NextResponse.json({ error: "Select between 1 and 100 complete job titles." }, { status: 400 });
      }
      const phrases = [...new Set(input.map(value => normalizeJobPhrase(value as string)))].sort();
      if (phrases.some(phrase => phrase.length < 3 || !/[a-z]/.test(phrase))) {
        return NextResponse.json({ error: "Each complete job title must contain at least 3 characters and include a letter." }, { status: 400 });
      }
      const titles = new Set(phrases);
      const matches:Array<{id:string;title:string}>=[];
      for(let start=0;;start+=500){
        const page=await client.from("jobs").select("id,title").neq("is_rejected",true).neq("is_approved",true).in("source_type",["adzuna","usajobs","linkedin","reliefweb"]).order("id").range(start,start+499);
        if(page.error)throw page.error;
        matches.push(...(page.data??[]).filter(row=>titles.has(normalizeJobPhrase(row.title??""))));
        if((page.data?.length??0)<500)break;
      }
      const previewToken=createHash("sha256").update(JSON.stringify([bulk ? phrases : phrases[0],matches.map(row=>[row.id,row.title])])).digest("hex");
      if(body.action==="preview_exclusion")return NextResponse.json({phrase:phrases[0],phrases,count:matches.length,examples:matches.slice(0,12),previewToken});
      if(body.previewToken!==previewToken)return NextResponse.json({error:"Preview the current matches before saving. The queue may have changed."},{status:409});
      const saved=await client.from("job_type_exclusions").upsert(bulk ? phrases.map(phrase => ({phrase})) : {phrase:phrases[0]},{onConflict:"phrase",ignoreDuplicates:true});if(saved.error)throw saved.error;
      let removed=0,failed=0;
      for(const row of matches){const result=await removeJobWithImportMemory(client,row.id,{pendingOnly:true,expectedTitle:row.title});if(!result.ok)failed++;else if(!result.skipped)removed++;}
      return NextResponse.json({success:true,excluded:phrases.length,removed,failed,message:failed?"Rules saved. Some pending matches could not be removed. Preview and retry to finish.":undefined});
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) { return failure(error); }
}
