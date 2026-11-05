import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { scoreJobReview } from "../app/lib/jobReviewPriority";
import { JobImportMemory, filterRememberedJobs } from "../app/lib/server/jobImportMemory";
import { loadJobReviewPreferences } from "../app/lib/server/jobReviewPreferences";
test("legacy exclusions, learned penalties and degree requirements cannot lower scores", () => {
 const row={id:"x",title:"UXO Analyst",description:"PhD in chemistry required"};
 assert.equal(scoreJobReview(row,{exclusions:[{id:"old",phrase:"uxo analyst"}],signals:[{phrase:"uxo analyst",approved:0,rejected:30}]}).score,100);
});
test("legacy exclusion lists cannot prevent intake",async()=>{
 const client=createClient("https://db.example","test",{global:{fetch:async()=>{throw Error("Unexpected database mutation");}}});
 const memory=new JobImportMemory([],Date.now(),[{id:"old",phrase:"program manager"}]);
 const result=await filterRememberedJobs(client,[{title:"Program Manager",companyName:"New employer"}],x=>x,memory);
 assert.equal(result.candidates.length,1);assert.equal(result.skipped,0);
});
test("preferences load only positive priorities, never historical negative training",async()=>{
 const client=createClient("https://db.example","test",{global:{fetch:async input=>{assert.match(String(input),/job_priority_rules/);return Response.json([]);}}});
 assert.deepEqual(await loadJobReviewPreferences(client),{exclusions:[],signals:[],priorities:[]});
});
