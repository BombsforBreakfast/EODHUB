import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { scoreAdzunaJob, detectAdzunaCategory } from "../app/lib/adzuna/relevance";
import { fetchAdzunaJobs } from "../app/lib/adzuna/api";
import { ADZUNA_KEYWORD_CHANNELS, ADZUNA_INTL_KEYWORD_CHANNELS, ADZUNA_COMPANY_CHANNELS, ADZUNA_CATEGORY_CHANNELS, ADZUNA_COUNTRIES, ADZUNA_WHAT_EXCLUDE, ADZUNA_DISCOVERY_CHANNELS, adzunaIndexedPhrase } from "../app/lib/adzuna/intakeConfig";
import { GET } from "../app/api/import-adzuna/route";
import type { NextRequest } from "next/server";
const generic = (title:string, description="Company introduction and general job responsibilities.")=>({title,description,companyName:"Example employer"});

test("generic EOD support roles survive a truncated API snippet when exact indexed search matches",()=>{
  for(const title of ["Configuration Management Specialist","Operations Coordinator","Associate Product Manager","Systems Safety Engineer III","Force Development Specialist","Combat Skills Instructor","Digital Forensics Examiner"]){
    assert.equal(scoreAdzunaJob(generic(title)).relevant,false);
    const result=scoreAdzunaJob(generic(title),{intakeChannel:"body:eod@us"});
    assert.equal(result.relevant,true,title);assert.ok(result.reasons.some(r=>r.includes("Indexed announcement")));
  }
});
test("EOD in the returned text still works through all legacy channels",()=>{
  assert.equal(scoreAdzunaJob(generic("Associate Product Manager","Develop digital imaging systems for explosive ordnance disposal environments.")).relevant,true);
  assert.equal(scoreAdzunaJob(generic("EMF EOD Technician")).relevant,true);
});
test("unknown, broad, and forged country channel keys cannot bypass relevance",()=>{
  for(const intakeChannel of ["kw:random@us","co:unknown","body:not-registered@us","body:ctr@gb","body:eod","body:EOD@us","body:eod@us@untrusted"])
    assert.equal(scoreAdzunaJob(generic("Accountant"),{intakeChannel}).relevant,false);
  assert.equal(adzunaIndexedPhrase("body:eod@gb"),"explosive ordnance disposal");
});
test("recruitment exclusions remain in force, and SOAE/CTR and safety specialties are recognized",()=>{
  assert.equal(scoreAdzunaJob(generic("National Guard Recruiter"),{intakeChannel:"body:eod@us"}).relevant,false);
  assert.equal(detectAdzunaCategory("Strategic Offensive Arms Elimination (SOAE) Expert"),"CWMD");
  assert.equal(detectAdzunaCategory("Ordnance Safety Technician III"),"Explosive Safety");
  assert.equal(detectAdzunaCategory("Program Analyst","","body:ctr@us"),"CWMD");
  assert.equal(detectAdzunaCategory("UXO Technician","CWMD program","body:cwmd@us"),"UXO");
});
test("every existing market, channel and exclusion remains unchanged",()=>{
  const original=JSON.parse(fs.readFileSync("scripts/fixtures/adzuna-intake-baseline.json","utf8"));
  assert.deepEqual(ADZUNA_KEYWORD_CHANNELS,original.keyword);assert.deepEqual(ADZUNA_INTL_KEYWORD_CHANNELS,original.intl);
  assert.deepEqual(ADZUNA_COMPANY_CHANNELS,original.company);assert.deepEqual(ADZUNA_CATEGORY_CHANNELS,original.category);
  assert.deepEqual(ADZUNA_COUNTRIES,original.countries);assert.equal(ADZUNA_WHAT_EXCLUDE,original.exclude);
  assert.ok(ADZUNA_DISCOVERY_CHANNELS.some(c=>c.phrase==="cooperative threat reduction"));
});
test("exact phrase requests are full-index searches with no title, category, or age restriction",async()=>{
  const oldFetch=globalThis.fetch,oldId=process.env.ADZUNA_APP_ID,oldKey=process.env.ADZUNA_APP_KEY;
  process.env.ADZUNA_APP_ID="test";process.env.ADZUNA_APP_KEY="test";
  let observed:URL|undefined;
  globalThis.fetch=async input=>{observed=new URL(String(input));return Response.json({count:1,results:[]})};
  try{const result=await fetchAdzunaJobs({whatPhrase:"explosive ordnance disposal",country:"us",page:1});assert.equal(result.count,1);assert.equal(observed?.searchParams.get("what_phrase"),"explosive ordnance disposal");for(const name of ["title_only","category","max_days_old","what_exclude"])assert.equal(observed?.searchParams.has(name),false);}
  finally{globalThis.fetch=oldFetch;if(oldId===undefined)delete process.env.ADZUNA_APP_ID;else process.env.ADZUNA_APP_ID=oldId;if(oldKey===undefined)delete process.env.ADZUNA_APP_KEY;else process.env.ADZUNA_APP_KEY=oldKey;}
});
test("a rejected snippet is reconsidered once with normal moderation while analysts and scientists stay excluded",async()=>{
  const names=["ADZUNA_APP_ID","ADZUNA_APP_KEY","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","CRON_SECRET"];
  const saved=names.map(n=>process.env[n]),oldFetch=globalThis.fetch;
  ["test","test","https://db.example","test","secret"].forEach((v,i)=>process.env[names[i]]=v);
  const writes:Record<string,unknown>[]=[];
  const ad={id:"12345",title:"Configuration Management Specialist",description:"General company introduction without the specialty in this short snippet.",company:{display_name:"Example"},location:{display_name:"Charleston, SC"},redirect_url:"https://www.adzuna.com/details/12345",created:"2026-01-01"};
  const excludedAds=[{...ad,id:"12346",title:"EOD Analyst",redirect_url:"https://www.adzuna.com/details/12346"},{...ad,id:"12347",title:"EOD Scientist",redirect_url:"https://www.adzuna.com/details/12347"}];
  globalThis.fetch=async (input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==="api.adzuna.com"){
      const match=url.pathname.includes("/us/") && (url.searchParams.get("what")==="explosive ordnance disposal"||url.searchParams.get("what_phrase")==="explosive ordnance disposal");
      return Response.json({count:match?3:0,results:match?[ad,...excludedAds]:[]});
    }
    if(url.hostname==="db.example"){
      if(init?.method==="POST" && init.body)writes.push(...JSON.parse(String(init.body)));
      return Response.json([],{headers:{"content-range":"*/0"}});
    }
    throw Error("Unexpected test endpoint");
  };
  try{
    const response=await GET({headers:new Headers({Authorization:"Bearer secret"}),nextUrl:new URL("https://example.test/api/import-adzuna")} as unknown as NextRequest);
    const body=await response.json();assert.equal(body.imported,1);assert.equal(writes.length,1);assert.equal(writes[0].is_approved,false);assert.equal(writes[0].adzuna_ad_id,"12345");
    assert.equal((writes[0].import_metadata as Record<string,unknown>).indexed_phrase,"explosive ordnance disposal");
  }finally{globalThis.fetch=oldFetch;names.forEach((n,i)=>{if(saved[i]===undefined)delete process.env[n];else process.env[n]=saved[i]});}
});
