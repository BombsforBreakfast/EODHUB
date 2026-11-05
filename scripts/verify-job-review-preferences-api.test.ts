import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/admin/job-review-preferences/route";
test("preferences preserve admin authorization and reject negative rules without job mutations", async () => {
 const prior=globalThis.fetch, names=["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"], old=names.map(n=>process.env[n]);
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://db.example";process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="test";process.env.SUPABASE_SERVICE_ROLE_KEY="test";
 let admin=false;const writes:string[]=[];
 globalThis.fetch=async(input,init)=>{const u=new URL(String(input));const table=u.pathname.split("/").pop();if(u.pathname.includes("/auth/"))return Response.json({id:"admin",aud:"authenticated",role:"authenticated"});if(table==="profiles")return Response.json([{is_admin:admin}]);if((init?.method??"GET")!=="GET")writes.push(`${init?.method}:${table}`);assert.equal(table,"job_priority_rules");return Response.json([]);};
 const req=(action:string,token=true)=>new NextRequest("https://example.test/api/admin/job-review-preferences",{method:"POST",headers:{...(token?{Authorization:"Bearer test"}:{}),"Content-Type":"application/json"},body:JSON.stringify({action,phrase:"uxo analyst",id:"12345678-1234-1234-1234-123456789012"})});
 try {
  assert.equal((await POST(req("add_exclusion",false))).status,401);assert.equal((await POST(req("add_exclusion"))).status,403);admin=true;
  for(const action of ["preview_exclusion","add_exclusion"])assert.equal((await POST(req(action))).status,409);
  const data=await(await GET(new NextRequest("https://example.test/api/admin/job-review-preferences",{headers:{Authorization:"Bearer test"}}))).json();assert.deepEqual(data,{exclusions:[],learnedPatterns:0,priorities:[]});assert.deepEqual(writes,[]);
  assert.equal((await POST(req("remove_priority"))).status,200);assert.deepEqual(writes,["DELETE:job_priority_rules"]);
 }finally {globalThis.fetch=prior;names.forEach((n,i)=>{if(old[i]===undefined)delete process.env[n];else process.env[n]=old[i];});}
});
