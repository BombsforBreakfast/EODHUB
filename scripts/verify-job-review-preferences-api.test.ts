import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/admin/job-review-preferences/route";
test("exclusions require admin and a fresh exact-title preview; approved/community jobs survive",async()=>{
 const oldFetch=globalThis.fetch,names=["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"],old=names.map(n=>process.env[n]);
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://db.example";process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="test";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
 let admin=false;const writes:string[]=[],rules:{id:string;phrase:string}[]=[];
 const make=(id:string,title:string,extra={})=>({id,title,source_type:"adzuna",is_approved:false,is_rejected:false,...extra});
 const rows=[make("one","Program Manager"),make("two","PROGRAM-MANAGER"),make("senior","Senior Program Manager"),make("approved","Program Manager",{is_approved:true}),make("community","Program Manager",{source_type:"community"}),make("body","UXO Technician")];
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input)),table=u.pathname.split("/").pop(),method=init?.method??"GET",body=init?.body?JSON.parse(String(init.body)):{};
  if(u.pathname.includes('/auth/'))return Response.json({id:"admin",aud:"authenticated",role:"authenticated"});if(table==="profiles")return Response.json([{is_admin:admin}]);
  if(method!=="GET")writes.push(method+":"+table);
  if(table==="job_priority_rules")return Response.json([]);
  if(table==="job_type_exclusions"){if(method==="POST")rules.push({id:"12345678-1234-1234-1234-123456789012",...body});if(method==="DELETE")rules.length=0;return Response.json(rules);}
  if(["saved_jobs","job_stale_flags","job_applications"].includes(table!))return Response.json([]);
  assert.equal(table,"jobs");
  let selected=rows.filter(r=>(!u.searchParams.has('id')||'eq.'+r.id===u.searchParams.get('id'))&&(u.searchParams.get('is_approved')!=="neq.true"||!r.is_approved)&&(u.searchParams.get('is_rejected')!=="neq.true"||!r.is_rejected)&&(!u.searchParams.has('title')||'eq.'+r.title===u.searchParams.get('title'))&&(!u.searchParams.has('source_type')||r.source_type!=="community"));
  if(method==="PATCH")for(const r of selected)Object.assign(r,body);
  selected=selected.slice(Number(u.searchParams.get('offset')??0),Number(u.searchParams.get('offset')??0)+Number(u.searchParams.get('limit')??100));return Response.json(selected);
 };
 const req=(body:object,token=true)=>new NextRequest('https://example.test/api/admin/job-review-preferences',{method:"POST",headers:{...(token?{Authorization:"Bearer test"}:{}),"Content-Type":"application/json"},body:JSON.stringify(body)});
 try{
  assert.equal((await POST(req({action:"add_exclusion"},false))).status,401);assert.equal((await POST(req({action:"add_exclusion"}))).status,403);admin=true;
  assert.equal((await POST(req({action:"add_exclusion",phrase:"Program Manager"}))).status,409);assert.equal(writes.length,0);
  const preview=await(await POST(req({action:"preview_exclusion",phrase:"Program Manager"}))).json();assert.equal(preview.count,2);
  rows.push(make("new","Program Manager"));assert.equal((await POST(req({action:"add_exclusion",phrase:preview.phrase,previewToken:preview.previewToken}))).status,409);assert.equal(writes.length,0);
  const fresh=await(await POST(req({action:"preview_exclusion",phrase:"Program Manager"}))).json();assert.equal(fresh.count,3);
  const applied=await(await POST(req({action:"add_exclusion",phrase:fresh.phrase,previewToken:fresh.previewToken}))).json();assert.equal(applied.removed,3);assert.equal(applied.failed,0);
  assert.deepEqual(rows.filter(x=>x.is_rejected).map(x=>x.id),["one","two","new"]);assert.equal(rows.find(x=>x.id==="approved")?.is_approved,true);
  const settings=await(await GET(new NextRequest('https://example.test/api/admin/job-review-preferences',{headers:{Authorization:"Bearer test"}}))).json();assert.equal(settings.exclusions.length,1);assert.equal(settings.learnedPatterns,0);
  assert.equal((await POST(req({action:"remove_exclusion",id:rules[0].id}))).status,200);assert.equal(rules.length,0);assert(!writes.some(x=>x.includes("job_review_feedback")));
 }finally{globalThis.fetch=oldFetch;names.forEach((n,i)=>{if(old[i]===undefined)delete process.env[n];else process.env[n]=old[i];});}
});
