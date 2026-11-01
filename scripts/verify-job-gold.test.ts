import assert from "node:assert/strict";
import {test} from "node:test";
import {scoreJobReview,jobReviewPage} from "../app/lib/jobReviewPriority";
import {parseGoldTags,jobGoldRequest} from "../app/lib/jobHighlights";
import {applyJobFilters,DEFAULT_JOB_FILTERS,restoreJobFilters,jobFilterChips,type JobListItem} from "../app/lib/jobFilters";
test("Bomb Tech, Bomb Technician and equivalent direct EOD/UXO titles score 100",()=>{
  for(const title of ["Bomb Tech SME with Security Clearance","Senior Bomb Technician","Master EOD Technician","UXO Tech II","Explosive Ordnance Disposal Technician"]){assert.equal(scoreJobReview({id:"x",title,description:""}).score,100,title);}
});
test("requested management/policy roles require body mission evidence and rank strongly",()=>{
  for(const title of ["Technical Project Manager","Senior Technical-Project Manager","Policy SME","Policy Subject Matter Expert"]){
    for(const domain of ["CBRN","CBRNE","CWMD","EOD"]){const scored=scoreJobReview({id:"x",title,description:`Work supports the ${domain} mission.`});assert.equal(scored.score,90,`${title} / ${domain}`);assert.equal(scored.band,"high");}
    assert.equal(scoreJobReview({id:"x",title,description:"Commercial office work."}).score,0);
  }
});
test("Chemical Security and Elimination SME variants are 100 despite specialist degree requirements",()=>{
  for(const title of ["Chemical Security and Elimination Subject Matter Expert (SME)","A&AS Chemical Security and Elimination SME Jobs","A&AS Chemical Security and Elimination SME with Security Clearance","Chemical Security & Elimination Subject Matter Expert with Security Clearance"]){
    const result=scoreJobReview({id:"x",title,description:"Technical expertise in CWMD/CBRN operations and chemical detection. Master's degree in chemistry required."});assert.equal(result.score,100);assert.equal(result.band,"high");assert.match(result.reasons[0],/Chemical Security/);assert.ok(result.reasons.some(s=>s.includes("Education note")));
  }
});
test("explicit EOD credentials beat the description-only cap without rewarding boilerplate or repetition",()=>{
  for(const text of ["Prior experience as an EOD technician required.","Qualifications: graduate of NAVSCOLEOD.","Graduate of Naval School EOD (NAVSCOLEOD)","Graduate of Naval School, Explosive Ordnance Disposal.","Demonstrate advanced understanding of chemistry fundamentals (Civil Support Team, Master EOD Technician, Hazmat Specialist)."]){assert.equal(scoreJobReview({id:"x",title:"Mission Specialist",description:text}).score,100,text);}
  for(const text of ["EOD ".repeat(100),"Prior EOD technician experience is not required.","Experience working with EOD technicians.","Our company was founded by a Master EOD Technician."]){assert.ok(scoreJobReview({id:"x",title:"Mission Specialist",description:text}).score<70,text);}
});
test("explicit learned priority rules are conditional, nonstacking and subordinate to exclusions",()=>{
  const rule={id:"rule",phrase:"mission advisor",mission_required:true,target_score:90 as const},preferences={exclusions:[],signals:[],priorities:[rule]};
  assert.equal(scoreJobReview({id:"x",title:"Senior Mission Advisor",description:"CWMD support"},preferences).score,90);
  assert.equal(scoreJobReview({id:"x",title:"Mission Advisor",description:"Office support"},preferences).score,0);
  assert.equal(scoreJobReview({id:"x",title:"Senior Mission Advisor",description:"CWMD"},{...preferences,exclusions:[{id:"no",phrase:"mission advisor"}]}).score,0);
  assert.equal(scoreJobReview({id:"x",title:"Mission Advisor",description:"CWMD"},{...preferences,priorities:[rule,{...rule,id:"another"}]}).score,90);
});
test("job-specific priorities do not spill into another same-title listing",()=>{
 const rules={exclusions:[],signals:[],priorities:[{id:"rule",job_id:"verified-job",phrase:"strategic and operational planner",mission_required:false,target_score:100 as const}]};
 assert.equal(scoreJobReview({id:"verified-job",title:"Strategic and Operational Planner",description:"Short source excerpt."},rules).score,100);
 assert.equal(scoreJobReview({id:"another",title:"Strategic and Operational Planner",description:"Short source excerpt."},rules).score,0);
});
test("gold selection is explicit, globally filterable before pagination and searchable by custom tags",()=>{
  const rows=[{id:"one",title:"Technical Project Manager",description:"CBRN",gold_highlight:false},{id:"two",title:"Mission Advisor",description:"EOD",gold_highlight:true,gold_tags:["Great pay","Job of the day"]}];
  assert.equal(jobReviewPage(rows,"gold",0,1).jobs[0].id,"two");assert.equal(jobReviewPage(rows,"gold",0,1).priorityCounts.gold,1);assert.equal(scoreJobReview(rows[1]).score,100);
  const jobs=rows as JobListItem[];assert.deepEqual(applyJobFilters(jobs,{...DEFAULT_JOB_FILTERS,goldOnly:true}).map(j=>j.id),["two"]);
  assert.deepEqual(applyJobFilters(jobs,{...DEFAULT_JOB_FILTERS,keyword:'"great pay"'}).map(j=>j.id),["two"]);
  assert.equal(restoreJobFilters({goldOnly:true}).goldOnly,true);assert.equal(restoreJobFilters({goldOnly:"true"}).goldOnly,false);assert.ok(jobFilterChips({...DEFAULT_JOB_FILTERS,goldOnly:true}).some(c=>c.label==="Gold highlights"));
});
test("custom labels deduplicate and validate bounds without accepting injected permission fields",()=>{
  assert.deepEqual(parseGoldTags("Great pay,Great location\ngreat pay"),["great pay","Great location"]);
  assert.throws(()=>parseGoldTags("x".repeat(41)),/40/);assert.throws(()=>parseGoldTags("a,b,c,d,e,f,g"),/6/);
  assert.equal(jobGoldRequest.safeParse({enabled:true,tags:[],revision:0}).success,false);
  assert.equal(jobGoldRequest.safeParse({enabled:true,tags:["Nice\u0000"],revision:0}).success,false);
});
