// Local Postgres adapter for lifecycle tests; no cloud database credentials.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
type Row = Record<string, unknown>;
export async function supportFixture() {
  const require = createRequire(import.meta.url);
  const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
  const pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role eod_rental;create role service_role bypassrls;grant usage on schema public to public;
    create schema auth;create table auth.users(id uuid,email text);create table public.profiles(user_id uuid,email text,is_admin boolean);create table public.notifications(id uuid);`);
  for (const file of ["20261018180000_hub_support.sql", "20261018190000_hub_support_owner_notifications.sql", "20261101170448_monthly_hub_support.sql"]) await pg.exec(readFileSync("supabase/migrations/"+file,"utf8"));
  const identifier = (name: string) => { if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw Error("Invalid test identifier"); return `"${name}"`; };
  const db = {
    async rpc(name: string, args: Row) {
      try {
        const keys = Object.keys(args), call = `public.${identifier(name)}(${keys.map((k,i) => `${identifier(k)}=>$${i+1}`).join(",")})`;
        const many = name === "hub_support_claim_emails", result = await pg.query(many ? `select * from ${call}` : `select ${call} result`, Object.values(args));
        return { data: many ? result.rows : result.rows[0].result, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table: string) {
      let mode = "read", value: Row = {}, columns = "*", conflict = "", ignore = false;
      const filters: Array<[string, unknown]> = [];
      const run = async () => {
        const keys = Object.keys(value), params: unknown[] = mode === "read" ? [] : Object.values(value);
        const where = filters.map(([key, val]) => { params.push(val); return `${identifier(key)}=$${params.length}`; }).join(" and ");
        const sql = mode === "read" ? `select ${columns === "*" ? "*" : columns.split(",").map(identifier).join(",")} from public.${identifier(table)}${where ? " where "+where : ""}` : mode === "update" ? `update public.${identifier(table)} set ${keys.map((k,i)=>`${identifier(k)}=$${i+1}`).join(",")}${where ? " where "+where : ""} returning *` : `insert into public.${identifier(table)}(${keys.map(identifier).join(",")}) values(${keys.map((_,i)=>`$${i+1}`).join(",")})${conflict ? ` on conflict(${identifier(conflict)}) do ${ignore ? "nothing" : `update set ${keys.map(k=>`${identifier(k)}=excluded.${identifier(k)}`).join(",")}`}` : ""} returning *`;
        try { return { data: (await pg.query(sql, params)).rows, error: null }; } catch(error) { return { data: [], error }; }
      };
      const query = {
        select(v = "*") { columns=v; return query; }, eq(key: string, val: unknown) { filters.push([key,val]); return query; },
        update(v: Row) { mode="update"; value=v; return query; },
        upsert(v: Row, options: {onConflict: string; ignoreDuplicates?: boolean}) { mode="insert"; value=v; conflict=options.onConflict; ignore=!!options.ignoreDuplicates; return query; },
        async maybeSingle() { const result=await run(); return {...result,data:result.data[0]??null}; },
        async single() { const result=await run(); return {...result,data:result.data[0]??null,error:result.error||(!result.data.length?Error("Missing test row"):null)}; },
        then(resolve: (r: unknown)=>unknown, reject?: (e: unknown)=>unknown) { return run().then(resolve,reject); },
      };
      return query;
    },
  };
  return { db: db as unknown as SupabaseClient, pg, async reserve(id: string, amount: number, product: string) {
    const result = await db.rpc("reserve_hub_support_v2", {p_id:id,p_amount:amount,p_live:false,p_source:"a".repeat(64),p_frequency:"monthly",p_product:product});
    if (result.error) throw result.error;
  } };
}
