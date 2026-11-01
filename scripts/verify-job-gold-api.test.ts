import assert from "node:assert/strict";
import {test} from "node:test";
import {NextRequest} from "next/server";
import {PATCH} from "../app/api/admin/jobs/[jobId]/highlight/route";
test("gold writes require administrator identity, validate labels and keep approval untouched",async()=>{
  const before=globalThis.fetch,keys=["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"],values=keys.map(k=>process.env[k]);let admin=false,changed=false;const writes:Record<string,unknown>[]=[];
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://db.example";process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="test";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input));assert.equal(url.hostname,"db.example");if(url.pathname.includes('/auth/'))return Response.json({id:"admin",aud:"authenticated",role:"authenticated"});if(url.pathname.endsWith('/profiles'))return Response.json([{is_admin:admin}]);assert.ok(url.pathname.endsWith('/rpc/set_job_gold_highlight'));const body=JSON.parse(String(init?.body));writes.push(body);return Response.json(changed?null:{gold_highlight:body.p_enabled,gold_tags:body.p_tags,gold_revision:1});};
  const id="11111111-1111-4111-8111-111111111111",params=Promise.resolve({jobId:id}),req=(body:unknown,auth=true)=>new NextRequest(`https://example.test/api/admin/jobs/${id}/highlight`,{method:"PATCH",headers:{...(auth?{Authorization:"Bearer test"}:{}),"Content-Type":"application/json"},body:JSON.stringify(body)}),body={enabled:true,tags:["Great pay"],revision:0,teach:{phrase:"Technical-Project Manager",missionRequired:true,score:90}};
  try{
    assert.equal((await PATCH(req(body,false),{params})).status,401);assert.equal((await PATCH(req(body),{params})).status,403);assert.equal(writes.length,0);admin=true;
    assert.equal((await PATCH(req({...body,tags:[]}),{params})).status,400);assert.equal(writes.length,0);
    const saved=await PATCH(req({...body,is_approved:true,role:"service_role"}),{params});assert.equal(saved.status,200);assert.deepEqual(writes[0],{p_id:id,p_enabled:true,p_tags:["Great pay"],p_revision:0,p_phrase:"technical project manager",p_mission:true,p_score:90,p_job_only:false});
    assert.equal((await PATCH(req({...body,enabled:false,tags:[],teach:{...body.teach,jobOnly:true,score:100}}),{params})).status,200);assert.equal(writes[1].p_job_only,true);assert.equal(writes[1].p_enabled,false);assert.equal(writes[1].p_score,100);
    changed=true;assert.equal((await PATCH(req(body),{params})).status,409);
  }finally{globalThis.fetch=before;keys.forEach((k,i)=>{if(values[i]===undefined)delete process.env[k];else process.env[k]=values[i];});}
});
