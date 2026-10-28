import assert from "node:assert/strict";
import { test } from "node:test";
import { bearerClaimsRental,isRentalIdentity,rentalApiAllowed,listingHasPaidAccess,propertySchema,planAmount } from "../app/lib/rentals/provider";
const provider="11111111-1111-4111-8111-111111111111";
const valid={title:"Home near EOD school",address:"1 Test Street",city:"Niceville",state:"FL",zip:"32578",installation:"Eglin AFB",propertyType:"House",rent:1800,rentPeriod:"month",priceBasis:"property",bedrooms:3,bathrooms:2,minimumLeaseMonths:9,deposit:1800,fees:"None",utilities:"Water",petDetails:"Pets considered; disclose fees directly",description:"A furnished property with clear terms and direct contact with the property owner.",contactName:"Test Owner",contactPhone:"8505550100",contactEmail:"owner@example.com",company:"",amenities:["Furnished"],photos:[`${provider}/photos/22222222-2222-4222-8222-222222222222.webp`],militaryLeaseAccepted:true,photoRightsAccepted:true};
test("rental identity requires the server-owned Auth role and app metadata",()=>{
  assert.equal(isRentalIdentity({role:"authenticated",app_metadata:{account_type:"rental_provider"}}),false);
  assert.equal(isRentalIdentity({role:"eod_rental",app_metadata:{}}),false);
  assert.equal(isRentalIdentity({role:"eod_rental",app_metadata:{account_type:"rental_provider"}}),true);
});
test("rental API boundary permits the portal and rejects Hub APIs and prefix lookalikes",()=>{
  for(const path of ["/api/feed","/api/admin/rentals","/api/auth/signup","/api/profile","/api/stripe/checkout","/api/rentals/portal-elsewhere"])assert.equal(rentalApiAllowed(path,"POST"),false,path);
  assert.equal(rentalApiAllowed("/api/rentals/portal","GET"),true);
  assert.equal(rentalApiAllowed("/api/rentals/portal/upload","POST"),true);
  assert.equal(rentalApiAllowed("/api/rentals/service-rating","PATCH"),false);
  assert.equal(bearerClaimsRental(`Bearer x.${Buffer.from(JSON.stringify({role:"eod_rental"})).toString("base64url")}.x`),true);
  assert.equal(bearerClaimsRental("Bearer invalid"),false);
});
test("paid access keeps a canceled paid term, limits grace to renewals, and expires",()=>{
  const now=Date.parse("2026-10-27T12:00:00Z"),future="2026-11-01T00:00:00Z",past="2026-10-25T00:00:00Z";
  assert.equal(listingHasPaidAccess({paid_until:future,payment_status:"canceled",grace_until:null},now),true);
  assert.equal(listingHasPaidAccess({paid_until:null,payment_status:"incomplete",grace_until:future},now),false);
  assert.equal(listingHasPaidAccess({paid_until:past,payment_status:"past_due",grace_until:future},now),true);
  assert.equal(listingHasPaidAccess({paid_until:past,payment_status:"past_due",grace_until:past},now),false);
});
test("every submitted property requires military flexibility, photo rights and price basis",()=>{
  assert.equal(propertySchema.safeParse(valid).success,true);
  for(const mutation of [{militaryLeaseAccepted:false},{photoRightsAccepted:false},{minimumLeaseMonths:12},{photos:[]},{priceBasis:"unknown"},{fees:""},{rent:0}])assert.equal(propertySchema.safeParse({...valid,...mutation}).success,false,JSON.stringify(mutation));
  assert.equal(propertySchema.safeParse({...valid,minimumLeaseMonths:1,priceBasis:"room",bedrooms:100}).success,true,"Room count never multiplies listing charges");
  assert.equal(planAmount("monthly"),1000);assert.equal(planAmount("annual"),10000);
});
