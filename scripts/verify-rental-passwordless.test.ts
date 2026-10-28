import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendRentalSignInLink } from "../app/lib/rentals/passwordless.server";
import { rentalSignupAttributes, signupSchema } from "../app/lib/rentals/provider";
import { rentalPortalOrigin } from "../app/lib/rentals/origin.server";
const id="11111111-1111-4111-8111-111111111111",email="owner@example.com";
const rental={id,email,role:"eod_rental",app_metadata:{account_type:"rental_provider"}};
function harness(user:unknown=rental,allowed=true,generatedUser:unknown=user){
  let generated=0,sent=0,href="";
  const db={auth:{admin:{async getUserById(){return{data:{user},error:null};},async generateLink(input:{type:string;email:string}){generated++;assert.equal(input.type,"magiclink");assert.equal(input.email,email);return{data:{user:generatedUser,properties:{hashed_token:"synthetic-token"}},error:null};}}},async rpc(){return{data:allowed,error:null};}} as unknown as SupabaseClient;
  const send=async(_to:string,_subject:string,_message:string,link?:string)=>{sent++;href=link??"";return true;};
  return{db,send,result:()=>({generated,sent,href})};
}
test("rental signup requires consent, has no password, and fixes server-owned role attributes",()=>{
  const input=signupSchema.parse({fullName:"Test Owner",phone:"8505550100",email,company:"",commitment:true,role:"authenticated",app_metadata:{account_type:"member"},password:"should-not-be-saved"});
  const attrs=rentalSignupAttributes(input);
  assert.equal("password" in attrs,false);assert.equal("password" in input,false);
  assert.equal(attrs.role,"eod_rental");assert.deepEqual(attrs.app_metadata,{account_type:"rental_provider"});assert.equal(attrs.email_confirm,false);
  assert.equal(signupSchema.safeParse({...input,commitment:false}).success,false);
});
test("only an existing matching rental Auth identity receives a passwordless link",async()=>{
  const h=harness();assert.equal(await sendRentalSignInLink(h.db,id,email,h.send),true);
  assert.equal(h.result().generated,1);assert.equal(h.result().sent,1);
  const link=new URL(h.result().href);assert.equal(link.origin,"https://eod-hub.com");assert.equal(link.pathname,"/promote/rentals/portal");assert.equal(link.search,"");assert.equal(new URLSearchParams(link.hash.slice(1)).get("token_hash"),"synthetic-token");
});
test("normal members, missing users, mismatched email and exhausted limits never receive a link",async()=>{
  for(const user of [null,{...rental,role:"authenticated"},{...rental,app_metadata:{}},{...rental,email:"other@example.com"}]){
    const h=harness(user);assert.equal(await sendRentalSignInLink(h.db,id,email,h.send),false);assert.deepEqual(h.result(),{generated:0,sent:0,href:""});
  }
  const limited=harness(rental,false);assert.equal(await sendRentalSignInLink(limited.db,id,email,limited.send),false);assert.equal(limited.result().generated,0);
});
test("unexpected identity returned by link generation cannot be sent to a provider",async()=>{
  const h=harness(rental,true,{...rental,id:"another-user"});assert.equal(await sendRentalSignInLink(h.db,id,email,h.send),false);assert.equal(h.result().sent,0);
});

test("preview sign-in links return to the server-configured preview portal",async()=>{
  const previousEnv=process.env.VERCEL_ENV,previousUrl=process.env.VERCEL_URL;
  try{process.env.VERCEL_ENV='preview';process.env.VERCEL_URL='synthetic-preview.vercel.app';const h=harness();assert.equal(await sendRentalSignInLink(h.db,id,email,h.send),true);assert.equal(new URL(h.result().href).origin,'https://synthetic-preview.vercel.app');}
  finally{if(previousEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previousEnv;if(previousUrl===undefined)delete process.env.VERCEL_URL;else process.env.VERCEL_URL=previousUrl;}
});

test("rental returns use the configured preview host and production ignores request hosts",()=>{
  assert.equal(rentalPortalOrigin({NODE_ENV:"production",VERCEL_ENV:"preview",VERCEL_URL:"review-123.vercel.app"},"https://untrusted.example"),"https://review-123.vercel.app");
  assert.equal(rentalPortalOrigin({NODE_ENV:"production",VERCEL_ENV:"production",VERCEL_URL:"production-build.vercel.app"},"https://untrusted.example"),"https://eod-hub.com");
  assert.equal(rentalPortalOrigin({NODE_ENV:"development"},"http://127.0.0.1:3028"),"http://127.0.0.1:3028");
  for (const url of [undefined,"untrusted.example","review.vercel.app/redirect","review.vercel.app@untrusted.example"]) {
    assert.throws(()=>rentalPortalOrigin({NODE_ENV:"production",VERCEL_ENV:"preview",VERCEL_URL:url}),/preview URL/);
  }
});
