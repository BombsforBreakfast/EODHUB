import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {authenticateAdminApiRequest} from "@/app/lib/server/adminApiAuth";
import {jobGoldRequest,parseGoldTags} from "@/app/lib/jobHighlights";
import {normalizeJobPhrase} from "@/app/lib/jobReviewPreferences";
export async function PATCH(request:NextRequest,{params}:{params:Promise<{jobId:string}>}){
  const access=await authenticateAdminApiRequest(request);
  if(!access.ok)return NextResponse.json({error:access.error},{status:access.status});
  try{
    const {jobId}=await params,id=z.uuid().parse(jobId),raw=await request.text();if(raw.length>6000)return NextResponse.json({error:"Request is too large."},{status:413});
    const body=jobGoldRequest.parse(JSON.parse(raw)),tags=parseGoldTags(body.tags.join("\n")),phrase=body.teach?normalizeJobPhrase(body.teach.phrase):null;
    if(body.teach&&(!phrase||phrase.length<3||!/[a-z]/.test(phrase)))return NextResponse.json({error:"Enter a specific title phrase to teach."},{status:400});
    const {data,error}=await access.admin.rpc("set_job_gold_highlight",{p_id:id,p_enabled:body.enabled,p_tags:tags,p_revision:body.revision,p_phrase:phrase,p_mission:body.teach?.missionRequired??true,p_score:body.teach?.score??90,p_job_only:body.teach?.jobOnly??false});
    if(error)return NextResponse.json({error:"Could not save the job highlight. Please retry."},{status:503});
    if(!data)return NextResponse.json({error:"This job changed or was removed. Refresh before saving."},{status:409});
    return NextResponse.json({job:data});
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError?error.issues[0]?.message:"Check your labels and try again."},{status:400});}
}
