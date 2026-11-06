// Disposable PostgreSQL only. Set PGLITE_MODULE to an installed PGlite entrypoint.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : "@electric-sql/pglite");
const db = new PGlite();
const root = new URL("../", import.meta.url);
const owner = "a28ddac8-dc3a-4ae1-83f5-b675e7b85871";
const buyer = randomUUID(), other = randomUUID(), coordinator = randomUUID(), eventId = randomUUID();
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const tokens = quantity => Array.from({ length: quantity }, () => ({ qr: randomBytes(32).toString("base64url"), manual: [...randomBytes(8)].map(byte => alphabet[byte & 31]).join("") }));
const expectCode = (promise, code) => assert.rejects(promise, error => error.code === code);
const claim = (actor, type = "paid", quantity = 1, request = randomUUID(), ticketTokens = tokens(quantity)) => db.query("select public.ticketing_issue_pilot_order($1,$2,$3,$4,$5,$6::jsonb) as id", [actor, eventId, type, quantity, request, JSON.stringify(ticketTokens)]);
try {
  await db.exec(`
    create role anon; create role authenticated; create role authenticator noinherit; create role eod_rental noinherit; create role eod_portal noinherit; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,role text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',created_at timestamptz default now(),email_confirmed_at timestamptz);
    create table public.profiles(user_id uuid primary key references auth.users(id),email text,verification_status text,is_admin boolean default false,created_at timestamptz default now());
    create function public.handle_new_user() returns trigger language plpgsql security definer as $$ begin
      insert into public.profiles(user_id,verification_status,email) values(new.id,'pending',new.email) on conflict(user_id) do nothing; return new;
    end $$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
    create function public.hub_member_signup_count() returns bigint language sql stable security definer set search_path='' as $$ select count(*) from public.profiles $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id));
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to service_role;
    grant all on all tables in schema public,storage to service_role;
    insert into auth.users(id,email,role) values('${owner}','micheal.p.twigg@gmail.com','authenticated');
    update public.profiles set is_admin=true where user_id='${owner}';
  `);
  for (const file of ["20261102172846_ticketing_pilot_access_events.sql", "20261103000241_ticketing_verified_identity_lookups.sql", "20261103000908_ticketing_revision_conflicts.sql", "20261105200516_ticketing_no_card_pilot_orders.sql"]) {
    await db.exec(await readFile(new URL(`supabase/migrations/${file}`, root), "utf8"));
  }
  for (const actor of [buyer, other, coordinator]) {
    await db.query("insert into auth.users(id,email,role,raw_app_meta_data,email_confirmed_at) values($1,$2,'eod_ticketing','{\"account_type\":\"ticketing_customer\"}',now())", [actor, `qa-${actor}@example.invalid`]);
    await db.query("insert into public.ticketing_accounts(user_id) values($1) on conflict do nothing", [actor]);
  }
  await db.query("insert into public.ticketing_accounts(user_id) values($1) on conflict do nothing", [owner]);
  const event = { title: "No-card pilot QA", startsAt: "2099-01-01T14:00:00Z", endsAt: "2099-01-01T20:00:00Z", timeZone: "America/New_York", location: "Test venue", capacity: 3, priceCents: 0, ticketTypes: [ { id: "paid", name: "Normally paid admission", priceCents: 2500, capacity: 2 }, { id: "free", name: "Free admission", priceCents: 0, capacity: 1 } ] };
  await db.query("insert into public.ticketing_events(id,created_by,event,review_status) values($1,$2,$3,'approved')", [eventId, owner, JSON.stringify(event)]);
  await expectCode(claim(buyer), "PT409");
  await expectCode(db.query("select public.ticketing_set_no_card_pilot($1,$2,1,true)", [coordinator, eventId]), "42501");
  await db.exec("set role service_role");
  await db.query("select public.ticketing_set_no_card_pilot($1,$2,1,true)", [owner, eventId]);
  const request = randomUUID();
  const first = (await claim(buyer, "paid", 2, request)).rows[0].id;
  assert.equal((await claim(buyer, "paid", 2, request)).rows[0].id, first);
  await expectCode(claim(buyer, "paid", 1, request), "PT409");
  await expectCode(claim(other), "PT409");
  await claim(other, "free");
  const inventory = (await db.query("select * from public.ticketing_pilot_inventory($1::uuid[])", [[eventId]])).rows[0];
  assert.equal(Number(inventory.total), 3);
  assert.deepEqual(inventory.counts, { paid: 2, free: 1 });
  const order = (await db.query("select * from public.ticketing_pilot_orders where id=$1", [first])).rows[0];
  assert.equal(order.regular_subtotal_cents, 5000); assert.equal(order.regular_hub_fee_cents, 300);
  for (const field of ["amount_collected_cents", "hub_fee_cents", "processing_fee_cents"]) assert.equal(order[field], 0);
  assert.equal(order.payment_mode, "no_card_pilot");
  assert.equal(Number((await db.query("select count(*) as n from public.ticketing_pilot_tickets where order_id=$1", [first])).rows[0].n), 2);
  await db.query("select public.ticketing_set_no_card_pilot($1,$2,2,false)", [owner, eventId]);
  await expectCode(claim(buyer, "free"), "PT409");
  assert.equal((await claim(buyer, "paid", 2, request)).rows[0].id, first);
  assert.equal(Number((await db.query("select count(*) as n from public.ticketing_pilot_tickets")).rows[0].n), 3);
  await db.query("select public.ticketing_set_no_card_pilot($1,$2,3,true)", [owner, eventId]);
  await db.query("update public.ticketing_events set review_status='pending' where id=$1", [eventId]);
  assert.equal((await db.query("select no_card_pilot_enabled from public.ticketing_events where id=$1", [eventId])).rows[0].no_card_pilot_enabled, false);
  await expectCode(db.query("select public.ticketing_set_no_card_pilot($1,$2,4,true)", [owner, eventId]), "PT409");
  // A client role cannot read tickets, invoke issuance, or enable the switch.
  await db.exec("reset role; set role authenticated");
  await expectCode(db.query("select * from public.ticketing_pilot_tickets"), "42501");
  await expectCode(claim(buyer), "42501");
  await expectCode(db.query("select public.ticketing_set_no_card_pilot($1,$2,4,true)", [owner, eventId]), "42501");
  await db.exec("reset role");
  await db.query("delete from auth.users where id=$1", [buyer]);
  assert.equal(Number((await db.query("select count(*) as n from public.ticketing_pilot_orders where buyer_id=$1", [buyer])).rows[0].n), 0);
  assert.equal(Number((await db.query("select count(*) as n from public.ticketing_pilot_tickets where order_id=$1", [first])).rows[0].n), 0);
  assert.equal(Number((await db.query("select public.hub_member_signup_count() as n")).rows[0].n), 1);
  console.log("No-card pilot SQL passed: owner-only switch, zero charges, inventory limits, idempotent retries, disabled-mode denial, retained tickets, review-change closure, API-only permissions, account deletion, and preserved Hub count.");
} finally { await db.close(); }
