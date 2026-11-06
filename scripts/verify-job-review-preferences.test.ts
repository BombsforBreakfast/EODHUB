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
test("exact-title exclusions block new complete-title matches only",async()=>{
 const client=createClient("https://db.example","test",{global:{fetch:async()=>{throw Error("Unexpected database mutation");}}});
 const memory=new JobImportMemory([],Date.now(),[{id:"old",phrase:"program manager"}]);
 const result=await filterRememberedJobs(client,[{title:"Program Manager",companyName:"New employer"},{title:"Senior Program Manager",companyName:"New employer"}],x=>x,memory);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].title,"Senior Program Manager");assert.equal(result.skipped,1);
});
test("preferences load explicit exclusions and positive priorities without negative training",async()=>{
 const client=createClient("https://db.example","test",{global:{fetch:async input=>{assert.match(String(input),/job_priority_rules|job_type_exclusions/);return Response.json([]);}}});
 assert.deepEqual(await loadJobReviewPreferences(client),{exclusions:[],signals:[],priorities:[]});
});
