import {test} from "node:test";
import assert from "node:assert/strict";
import {accountAccess,isPortalOnlyIdentity,safeAccountReturn,parsePortal} from "../app/lib/account/access";
const empty={profile:null,rental:null,events:null,assignments:[]};
test('rental approval does not grant Hub membership or organizer access',()=>{
  assert.deepEqual(accountAccess({...empty,rental:{status:'approved'}}),{hub:false,rentals:true,events:false,eventOperator:false,tickets:true});
});
test('Hub and event permissions are independently additive',()=>{
  const profile={email_verified:true,admin_verified:true,verification_status:'verified'};
  assert.equal(accountAccess({...empty,profile}).hub,true);
  assert.equal(accountAccess({...empty,profile}).rentals,false);
  const both=accountAccess({...empty,profile,events:{active:true,can_submit_events:true}});
  assert.equal(both.hub,true);assert.equal(both.events,true);assert.equal(both.rentals,false);
});
test('pending Hub applicants have no full access even though their profile counts as an application',()=>{
  assert.equal(accountAccess({...empty,profile:{email_verified:true,admin_verified:false,verification_status:'awaiting_admin_review'}}).hub,false);
});
test('operator assignments never imply coordinator access and expired or revoked assignments do not grant access',()=>{
  const now=Date.parse('2026-11-03T12:00:00Z'),events={active:true,can_submit_events:false};
  const active={role:'checkin_staff',expires_at:'2026-11-03T13:00:00Z',revoked_at:null};
  const access=accountAccess({...empty,events,assignments:[active]},now);assert.equal(access.events,false);assert.equal(access.eventOperator,true);
  for(const assignment of [{...active,expires_at:'2026-11-03T11:00:00Z'},{...active,revoked_at:'2026-11-03T11:00:00Z'},{...active,expires_at:null}])assert.equal(accountAccess({...empty,events,assignments:[assignment]},now).eventOperator,false);
  assert.equal(accountAccess({...empty,events:{...events,active:false},assignments:[active]},now).eventOperator,false);
});
test('global suspension denies every portal while an expired ban no longer blocks independent permissions',()=>{
  const now=Date.parse('2026-11-03T12:00:00Z'),input={...empty,rental:{status:'approved'},events:{active:true,can_submit_events:true},bannedUntil:'2026-11-04T12:00:00Z'};
  assert.deepEqual(accountAccess(input,now),{hub:false,rentals:false,events:false,eventOperator:false,tickets:false});
  assert.equal(accountAccess({...input,bannedUntil:'2026-11-02T12:00:00Z'},now).rentals,true);
});
test('API-only identity classes do not depend on mutable user metadata',()=>{
  for(const role of ['eod_portal','eod_rental','eod_ticketing'])assert.equal(isPortalOnlyIdentity({role}),true);
  assert.equal(isPortalOnlyIdentity({role:'authenticated'}),false);assert.equal(isPortalOnlyIdentity(null),false);
});
test('organizer suspension removes coordinator access while retaining an independently assigned operator role',()=>{
  const assignments=[{role:'coordinator',expires_at:null,revoked_at:null},{role:'checkin_staff',expires_at:'2026-11-04T12:00:00Z',revoked_at:null}];
  const value=accountAccess({...empty,events:{active:true,can_submit_events:true},organizerSuspended:true,assignments},Date.parse('2026-11-03T12:00:00Z'));
  assert.equal(value.events,false);assert.equal(value.eventOperator,true);assert.equal(value.tickets,true);
});
test('shared sign-in returns only to supported local account/portal paths',()=>{
  for(const path of ['https://evil.invalid','//evil.invalid','/\\evil.invalid','/account\nanything','/api/admin','/admin'])assert.equal(safeAccountReturn(path),'/account');
  assert.equal(safeAccountReturn('/account?portal=rentals'),'/account?portal=rentals');assert.equal(safeAccountReturn('/promote/rentals/portal'),'/promote/rentals/portal');
  assert.equal(parsePortal('rentals'),'rentals');assert.equal(parsePortal('evil'),'hub');
});
