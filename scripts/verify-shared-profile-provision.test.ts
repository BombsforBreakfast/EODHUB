import {test} from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ensureProfileStubForUser} from "../app/lib/auth/ensureProfileStub";
function fixture({existing=false,role="eod_portal",denied=false}={}){
  const calls:{name:string;value:unknown}[]=[];
  const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:existing?{user_id:"fixture"}:null,error:null})})}),insert:async(value:unknown)=>{calls.push({name:"insert",value});return {error:null};}}),
    auth:{admin:{getUserById:async()=>({data:{user:{id:"fixture",role,user_metadata:{}}}})}},
    rpc:async(name:string,value:unknown)=>{calls.push({name,value});return {error:denied?{message:"request denied"}:null};}};
  return {db:db as unknown as SupabaseClient,calls};
}
test("admin recovery initializes a neutral identity through the explicit Hub request gate",async()=>{
  const f=fixture();assert.equal((await ensureProfileStubForUser(f.db,"fixture","fixture@example.invalid")).ok,true);
  assert.deepEqual(f.calls,[{name:"portal_request_hub",value:{p_actor:"fixture"}}]);
});
test("existing Hub profile is preserved without another request or identity lookup",async()=>{
  const f=fixture({existing:true});assert.equal((await ensureProfileStubForUser(f.db,"fixture","fixture@example.invalid")).ok,true);assert.equal(f.calls.length,0);
});
test("a denied Hub initialization fails closed before recovery can approve a profile",async()=>{
  const f=fixture({denied:true});assert.deepEqual(await ensureProfileStubForUser(f.db,"fixture","fixture@example.invalid"),{ok:false,error:"request denied"});assert.equal(f.calls.some(c=>c.name==="insert"),false);
});
test("legacy ordinary identity still initializes its normal Hub profile",async()=>{
  const f=fixture({role:"authenticated"});assert.equal((await ensureProfileStubForUser(f.db,"fixture","fixture@example.invalid")).ok,true);
  assert.deepEqual(f.calls,[{name:"insert",value:{user_id:"fixture",email:"fixture@example.invalid"}}]);
});
