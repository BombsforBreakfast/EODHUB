/* Local Postgres only. Never connects to production. */
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role eod_rental;create role service_role bypassrls;grant usage on schema public to anon,authenticated,eod_rental,service_role;
      create table rental_providers(user_id uuid primary key,status text);
      create table rental_properties(id uuid primary key,provider_id uuid,published jsonb,hidden boolean default false,paid_until timestamptz,grace_until timestamptz,billing_hold_until timestamptz);
      create table rental_property_metrics(property_id uuid references rental_properties(id),day date,views int default 0,contacts int default 0,primary key(property_id,day));
      grant select on rental_providers,rental_properties to service_role;grant select,insert,update on rental_property_metrics to service_role;`);
    const owner = randomUUID(), property = randomUUID();
    await db.query("insert into rental_providers values($1,'approved')", [owner]);
    await db.query("insert into rental_properties(id,provider_id,published,paid_until) values($1,$2,'{}',now()+interval '1 day')", [property, owner]);
    await db.query("insert into rental_property_metrics values($1,current_date,20,3)", [property]);
    await db.exec(fs.readFileSync('supabase/migrations/20261031191913_rental_engagement_analytics.sql', 'utf8'));
    const first = (await db.query("select impressions,contact_opens from rental_engagement_daily where subject_id=$1", [property])).rows[0];
    assert.equal(Number(first.impressions), 20); assert.equal(Number(first.contact_opens), 3);
    const record = (kind, id = '1186-muirfield-way', own = 'terry-grawey', event = randomUUID(), subject = 'property') => db.query('select rental_record_engagement($1,$2,$3,$4,$5)', [subject, id, own, kind, event]);
    await db.exec('set role service_role');
    const event = randomUUID(); await record('property_open', undefined, undefined, event); await record('property_open', undefined, undefined, event);
    await record('contact_open'); await record('email_copy'); await record('phone_click'); await record('application_click');
    await record('ad_click', 'eod_home_buying', 'eod_home_buying', randomUUID(), 'advertiser');
    await record('impression', property, owner); await record('contact_open', property, owner);
    await db.exec('reset role');
    const row = (await db.query("select * from rental_engagement_daily where subject_id='1186-muirfield-way'")).rows[0];
    for (const key of ['property_opens','contact_opens','email_copies','phone_clicks','application_clicks']) assert.equal(Number(row[key]), 1, key);
    const old = (await db.query('select views,contacts from rental_property_metrics where property_id=$1', [property])).rows[0];
    assert.deepEqual(old, { views: 21, contacts: 4 });
    await db.query('update rental_properties set hidden=true where id=$1', [property]);
    await db.exec('set role service_role'); await record('property_open', property, owner); await db.exec('reset role');
    assert.equal(Number((await db.query('select property_opens from rental_engagement_daily where subject_id=$1', [property])).rows[0].property_opens), 0);
    await db.query('update rental_properties set hidden=false,billing_hold_until=now()-interval \'1 hour\' where id=$1', [property]);
    await db.exec('set role service_role'); await record('property_open', property, owner); await db.exec('reset role');
    assert.equal(Number((await db.query('select property_opens from rental_engagement_daily where subject_id=$1', [property])).rows[0].property_opens), 0);
    for (const role of ['anon','authenticated','eod_rental']) {
      const rights = (await db.query("select has_table_privilege($1,'rental_engagement_daily','select') r,has_table_privilege($1,'rental_engagement_receipts','insert') w,has_function_privilege($1,'rental_record_engagement(text,text,text,text,uuid)','execute') x", [role])).rows[0];
      assert.deepEqual(rights, {r:false,w:false,x:false}, role);
    }
    const flags = (await db.query("select relname,relrowsecurity from pg_class where relname in ('rental_engagement_daily','rental_engagement_receipts')")).rows;
    assert.equal(flags.length,2); assert.ok(flags.every(r=>r.relrowsecurity));
    await assert.rejects(record('ad_click'), /Invalid property event/);
    await assert.rejects(record('ad_click','evil','evil',randomUUID(),'advertiser'), /Invalid advertiser/);
    await assert.rejects(record(null), /Invalid engagement/);
    console.log('Rental analytics SQL passed: backfill, atomic increments, retry dedupe, billing/visibility guards, old summaries, private tables and RPC.');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
