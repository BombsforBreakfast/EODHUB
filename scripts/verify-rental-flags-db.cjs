const{PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role eod_rental;create role service_role bypassrls;grant usage on schema public to anon,authenticated,eod_rental,service_role;create schema auth;create table auth.users(id uuid primary key);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261031191729_rental_listing_flags.sql','utf8'));
 const admin=randomUUID(),id=randomUUID();await db.query('insert into auth.users values($1)',[admin]);
 await db.exec('set role service_role');
 await db.query(`insert into rental_listing_flags(id,listing_id,owner_id,address,city,state,reason,details,contact_email)values($1,'legacy-listing','legacy-owner','1 Test Street','Niceville','FL','condition','A synthetic condition report for a local test.','private@example.com')`,[id]);
 let row=(await db.query('select * from rental_listing_flags where id=$1',[id])).rows[0];assert.equal(row.status,'open');
 await db.query(`update rental_listing_flags set status='reviewing',review_note='Checked with the owner',reviewed_by=$2,revision=2 where id=$1 and revision=1`,[id,admin]);
 row=(await db.query('select * from rental_listing_flags where id=$1',[id])).rows[0];assert.equal(row.status,'reviewing');assert.equal(row.contact_email,'private@example.com');
 const hide=async(revision,hidden)=>Number((await db.query(`select rental_set_moderation('legacy-listing',$1,'Review note for this hold',$2,$3) ok`,[hidden,admin,revision])).rows[0].ok);
 assert.equal(await hide(0,true),1);assert.equal(await hide(0,false),0);assert.equal(await hide(1,false),1);
 await db.exec('reset role');
 for(const role of['anon','authenticated','eod_rental']){
  const rights=(await db.query(`select has_table_privilege($1,'rental_listing_flags','select') r,has_table_privilege($1,'rental_listing_flags','insert') w,has_table_privilege($1,'rental_listing_moderation','update') m,has_function_privilege($1,'rental_set_moderation(text,boolean,text,uuid,integer)','execute') x`,[role])).rows[0];assert.deepEqual(rights,{r:false,w:false,m:false,x:false});
 }
 const tables=(await db.query(`select relrowsecurity from pg_class where relname in('rental_listing_flags','rental_listing_moderation')`)).rows;assert.equal(tables.length,2);assert.ok(tables.every(t=>t.relrowsecurity));
 console.log('Flag SQL roundtrips passed: persist/reload/review, manual hide/restore, stale-write rejection, private reporter details, RLS/grants.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
