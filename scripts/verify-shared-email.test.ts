import {test} from "node:test";
import assert from "node:assert/strict";
import {primaryEmailProof} from "../app/lib/account/email-proof";
const email="fixture@example.invalid",date="2026-11-04T11:00:00.000Z",stamp=Date.parse(date)/1000;
const base={email,email_confirmed_at:date,app_metadata:{}};
test("legacy auto-confirmed password is not verified email ownership",()=>{
  assert.equal(primaryEmailProof(base,{email,email_verified:false},{email,amr:[{method:"password",timestamp:stamp}]}).verified,false);
});
test("existing verified Hub profiles retain email proof, mismatched email does not",()=>{
  assert.equal(primaryEmailProof(base,{email,email_verified:true},{}).verified,true);
  assert.equal(primaryEmailProof(base,{email:"different@example.invalid",email_verified:true},{}).verified,false);
});
test("only matching trusted Google/Apple identity email verifies",()=>{
  assert.equal(primaryEmailProof({...base,identities:[{provider:"google",identity_data:{email}}]},null,{}).verified,true);
  assert.equal(primaryEmailProof({...base,identities:[{provider:"apple",identity_data:{email:"other@example.invalid"}}]},null,{}).verified,false);
  assert.equal(primaryEmailProof({...base,identities:[{provider:"email",identity_data:{email}}]},null,{}).verified,false);
});
test("server recorded email proof survives password sign-in, never transfers to another email",()=>{
  const user={...base,app_metadata:{shared_verified_email:email}};
  assert.deepEqual(primaryEmailProof(user,null,{}),{verified:true,record:false});
  assert.equal(primaryEmailProof({...user,email:"changed@example.invalid"},null,{}).verified,false);
});
test("fresh one-use email proof is recorded only for the current confirmed email",()=>{
  assert.deepEqual(primaryEmailProof(base,null,{email,amr:[{method:"otp",timestamp:stamp}]}),{verified:true,record:true});
  assert.equal(primaryEmailProof(base,null,{email,amr:[{method:"otp",timestamp:stamp-60}]}).verified,false);
  assert.equal(primaryEmailProof(base,null,{email:"other@example.invalid",amr:[{method:"otp",timestamp:stamp}]}).verified,false);
  for(const method of ["password","signup","token_refresh","email"])assert.equal(primaryEmailProof(base,null,{email,amr:[{method,timestamp:stamp}]}).verified,false);
});
test("missing confirmation or malformed claims fail closed",()=>{
  assert.equal(primaryEmailProof({email},null,{email,amr:[{method:"otp",timestamp:stamp}]}).verified,false);
  assert.equal(primaryEmailProof(base,null,{email,amr:[{method:"otp",timestamp:NaN}]}).verified,false);
});
