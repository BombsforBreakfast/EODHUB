import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { POST as report } from "../app/api/rentals/flags/route";
import { GET as queue, PATCH as review } from "../app/api/admin/rentals/flags/route";
import { POST as portal } from "../app/api/rentals/portal/route";
import { GET as photo } from "../app/api/rentals/photo/route";
import { filterModeratedRentals } from "../app/lib/rentals/moderation.server";
import { rentalListings } from "../app/lib/rentals/listings.server";
import { flagSchema } from "../app/lib/rentals/flags";
import { rentalApiAllowed } from "../app/lib/rentals/provider";
import { OWNER_ADMIN_EMAIL, OWNER_ADMIN_USER_ID } from "../app/lib/ownerAdminAccess";

const origin="http://localhost", providerId="11111111-1111-4111-8111-111111111111", propertyId="22222222-2222-4222-8222-222222222222";
const input={id:randomUUID(),listingId:"1186-muirfield-way",reason:"condition",details:"Please review the property condition described in this listing.",email:"reporter@example.com",website:""};
const req=(path:string,body?:unknown,token="",method=body?"POST":"GET",requestOrigin:string|null=origin)=>new NextRequest(origin+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(requestOrigin?{Origin:requestOrigin}:{}),"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});

test("report schema uses bounded reasons/details and keeps the public flag route out of Admin access",()=>{
  assert.equal(flagSchema.safeParse(input).success,true);
  for(const mutation of [{details:"short"},{details:"x".repeat(2001)},{reason:"delete_now"},{email:"not-email"}])assert.equal(flagSchema.safeParse({...input,...mutation}).success,false);
  assert.equal(rentalApiAllowed("/api/rentals/flags","POST"),true);
  assert.equal(rentalApiAllowed("/api/rentals/flags","GET"),false);
  assert.equal(rentalApiAllowed("/api/admin/rentals/flags","PATCH"),false);
});
test("actual route handlers persist flags/reviews and moderation while rejecting unauthorized and stale changes",async()=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://rental-release-test.supabase.co";process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="test-anon";process.env.SUPABASE_SERVICE_ROLE_KEY="test-service";process.env.RESEND_API_KEY="";
  const flags=new Map<string,Record<string,unknown>>(),holds=new Map<string,Record<string,unknown>>();let deliveries=0,allowRate=true,failWrite=false,failModeration=false;
  const property:Record<string,unknown>={id:propertyId,provider_id:providerId,draft:{title:"Original draft"},published:{title:"Approved title"},revision:1,review_status:"draft",hidden:false,paid_until:"2099-01-01T00:00:00Z",grace_until:null,payment_status:"active",setup_order_id:null};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,options)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url),headers=new Headers(options?.headers),method=options?.method??"GET",body=options?.body?JSON.parse(String(options.body)):{};
    if(url.hostname!=="rental-release-test.supabase.co")throw new Error("External network is disabled in route tests.");
    const token=headers.get("authorization")??"";
    if(url.pathname==="/auth/v1/user")return Response.json({id:token.includes("provider-token")?providerId:token.includes("other-admin")?randomUUID():OWNER_ADMIN_USER_ID,email:OWNER_ADMIN_EMAIL,role:token.includes("provider-token")?"eod_rental":"authenticated",email_confirmed_at:"2026-10-01T00:00:00Z",app_metadata:token.includes("provider-token")?{account_type:"rental_provider"}:{}});
    if(url.pathname.endsWith("/profiles"))return Response.json([{is_admin:!token.includes("member-token")&&!token.includes("provider-token")}]);
    const match=(row:Record<string,unknown>)=>[...url.searchParams].every(([key,value])=>value.startsWith("eq.")?String(row[key])===value.slice(3):value.startsWith("in.(")?value.slice(4,-1).split(",").includes(String(row[key])):true);
    if(url.pathname.endsWith("/rpc/rental_consume_limit"))return Response.json(allowRate);
    if(url.pathname.endsWith("/rpc/rental_set_moderation")){
      const existing=holds.get(body.p_listing);if((existing?.revision??0)!==body.p_revision)return Response.json(false);
      holds.set(body.p_listing,{listing_id:body.p_listing,hidden:body.p_hidden,reason:body.p_note,revision:body.p_revision+1});return Response.json(true);
    }
    if(url.pathname.endsWith("/rental_listing_moderation"))return failModeration?Response.json({message:"Unavailable"},{status:503}):Response.json([...holds.values()].filter(match));
    if(url.pathname.endsWith("/rental_billing_emails")){deliveries++;return new Response(null,{status:201});}
    if(url.pathname.endsWith("/rental_listing_flags")){
      if(method==="POST"){
        if(failWrite)return Response.json({message:"Write failed"},{status:503});
        if(!flags.has(body.id))flags.set(body.id,{...body,status:"open",revision:1,review_note:"",created_at:new Date().toISOString()});return new Response(null,{status:201});
      }
      const rows=[...flags.values()].filter(match);
      if(method==="PATCH"){rows.forEach(row=>Object.assign(row,body));return Response.json(rows.map(row=>({id:row.id})));}
      return method==="HEAD"?new Response(null,{headers:{"content-range":`*/${rows.length}`}}):Response.json(rows,{headers:{"content-range":`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
    }
    if(url.pathname.endsWith("/rental_providers"))return Response.json([{user_id:providerId,full_name:"Test Provider",phone:"8505550100",email:"owner@example.com",company:"",status:"approved",email_verified_at:"2026-10-01",created_at:"2026-10-01"}]);
    if(url.pathname.endsWith("/rental_properties")){
      if(method==="PATCH"){
        if(failWrite)return Response.json({message:"Write failed"},{status:503});
        if(!match(property))return Response.json([]);Object.assign(property,body);return Response.json([{id:propertyId}]);
      }
      return Response.json(match(property)?[property]:[]);
    }
    throw new Error(`Unexpected test endpoint: ${url.pathname}`);
  };
  try{
    assert.equal((await report(req("/api/rentals/flags",input,"","POST","https://attacker.invalid"))).status,403);
    assert.equal((await report(req("/api/rentals/flags",{...input,listingId:"not-real"}))).status,404);
    allowRate=false;assert.equal((await report(req("/api/rentals/flags",input))).status,429);allowRate=true;
    failWrite=true;assert.equal((await report(req("/api/rentals/flags",input))).status,503);failWrite=false;
    assert.equal((await report(req("/api/rentals/flags",input))).status,200);assert.equal(flags.size,1);assert.equal(flags.get(input.id)?.contact_email,"reporter@example.com");
    assert.equal((await report(req("/api/rentals/flags",input))).status,200);assert.equal(flags.size,1,"Retry never duplicates the report");assert.ok(deliveries>0,"Admin alert is durably queued");
    assert.equal((await filterModeratedRentals(rentalListings)).listings.length,3,"A flag alone never hides a property");
    for(const token of ["","member-token","other-admin","provider-token"]){assert.ok([401,403].includes((await queue(req("/api/admin/rentals/flags",undefined,token))).status));}
    const admin=await queue(req("/api/admin/rentals/flags",undefined,"owner-token"));assert.equal(admin.status,200);assert.equal((await admin.json()).flags.length,1);
    const decision={action:"review",id:input.id,revision:1,status:"reviewing",note:"Review started with the owner."};
    assert.equal((await review(req("/api/admin/rentals/flags",decision,"owner-token","PATCH"))).status,200);
    assert.equal((await review(req("/api/admin/rentals/flags",decision,"owner-token","PATCH"))).status,409);
    const visibility={action:"visibility",id:input.id,revision:0,hidden:true,note:"Hidden while the concern is checked."};
    assert.equal((await review(req("/api/admin/rentals/flags",visibility,"owner-token","PATCH"))).status,200);
    assert.equal((await filterModeratedRentals(rentalListings)).listings.length,2);
    assert.equal((await review(req("/api/admin/rentals/flags",visibility,"owner-token","PATCH"))).status,409);
    assert.equal((await review(req("/api/admin/rentals/flags",{...visibility,revision:1,hidden:false},"owner-token","PATCH"))).status,200);
    assert.equal((await filterModeratedRentals(rentalListings)).listings.length,3);
    failModeration=true;const unavailable=await filterModeratedRentals(rentalListings);assert.equal(unavailable.unavailable,true);assert.equal(unavailable.listings.length,0,"Review-status outages cannot expose a held property");failModeration=false;
    // Exercise actual provider edit/save failure, optimistic locking and owner visibility routes.
    assert.equal((await portal(req("/api/rentals/portal",{action:"save",id:propertyId,revision:1,draft:{title:"Updated draft"}},"provider-token"))).status,200);
    assert.equal((property.draft as {title:string}).title,"Updated draft");assert.equal((property.published as {title:string}).title,"Approved title","Draft edits don't replace published copy");
    assert.equal((await portal(req("/api/rentals/portal",{action:"save",id:propertyId,revision:1,draft:{}},"provider-token"))).status,409);
    failWrite=true;assert.equal((await portal(req("/api/rentals/portal",{action:"save",id:propertyId,revision:2,draft:{title:"Must not save"}},"provider-token"))).status,503);failWrite=false;
    assert.equal((property.draft as {title:string}).title,"Updated draft");
    holds.set(propertyId,{listing_id:propertyId,hidden:true,revision:1});
    assert.equal((await portal(req("/api/rentals/portal",{action:"hide",id:propertyId,hidden:false},"provider-token"))).status,200);assert.equal(holds.get(propertyId)?.hidden,true,"Owner can't release an Admin hold");
    assert.equal((await photo(req(`/api/rentals/photo?property=${propertyId}&photo=0`))).status,404,"Held photos aren't newly served");
    assert.equal((await portal(req("/api/rentals/portal",{action:"availability",id:propertyId,status:"pending",date:"2027-01-15"},"provider-token"))).status,200);assert.equal(property.available_date,"2027-01-15");
    assert.equal((await portal(req("/api/rentals/portal",{action:"hide",id:randomUUID(),hidden:true},"provider-token"))).status,404,"Other properties cannot be edited");
  }finally{globalThis.fetch=originalFetch;}
});
