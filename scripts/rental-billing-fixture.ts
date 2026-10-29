import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PropertyRow } from "../app/lib/rentals/provider";
type Row=Record<string,any>; // Local test adapter, never used by application code.
export function database(property: PropertyRow){
  const tables:Record<string,Row[]>={rental_properties:[structuredClone(property)],rental_campaigns:[],rental_billing_cases:[],rental_billing_emails:[],rental_providers:[{user_id:property.provider_id,email:"synthetic@example.com",stripe_customer_id:"cus_local_only"}]};
  let now=Date.now();
  const db={
    async rpc(name:string,args:Row={}){
      if(name==="rental_refresh_billing_hold"){
        const deadlines=tables.rental_billing_cases.filter(c=>c.property_id===args.p_property&&c.status!=="resolved").map(c=>c.deadline).sort();
        const property=tables.rental_properties.find(p=>p.id===args.p_property);if(property)property.billing_hold_until=deadlines[0]??null;
        return {data:null,error:null};
      }
      if(name==="rental_claim_billing_emails"){
        const due=tables.rental_billing_emails.filter(e=>!e.sent_at&&Date.parse(e.next_attempt_at)<=now).slice(0,args.p_limit);
        for(const e of due){e.attempts++;e.next_attempt_at=new Date(now+15*60000).toISOString();}
        return {data:structuredClone(due),error:null};
      }
      throw Error("Unexpected test RPC: "+name);
    },
    from(table:string){
      const filters:((row:Row)=>boolean)[]=[];let mode="read",value:Row={},ignore=false,conflict="",limit=Infinity;
      const run=()=>{
        const rows=tables[table]??(tables[table]=[]),found=rows.filter(r=>filters.every(f=>f(r))).slice(0,limit);
        if(mode==="update")for(const r of found)Object.assign(r,structuredClone(value));
        if(mode==="upsert"||mode==="insert"){
          const old=mode==="upsert"?rows.find(r=>r[conflict]===value[conflict]):null;
          if(!old){const created={id:randomUUID(),status:table==="rental_campaigns"?"awaiting_payment":"open",paid:false,attempts:0,sent_at:null,next_attempt_at:new Date(now).toISOString(),...structuredClone(value)};rows.push(created);return{data:[created],error:null};}
          if(!ignore)Object.assign(old,value);return{data:[old],error:null};
        }
        return{data:found,error:null};
      };
      const query={select(){return query;},eq(k:string,v:unknown){filters.push(r=>r[k]===v);return query;},neq(k:string,v:unknown){filters.push(r=>r[k]!==v);return query;},in(k:string,v:unknown[]){filters.push(r=>v.includes(r[k]));return query;},is(k:string,v:unknown){filters.push(r=>r[k]===v);return query;},limit(n:number){limit=n;return query;},update(v:Row){mode="update";value=v;return query;},insert(v:Row){mode="insert";value=v;return query;},upsert(v:Row,options:{onConflict:string;ignoreDuplicates?:boolean}){mode="upsert";value=v;conflict=options.onConflict;ignore=!!options.ignoreDuplicates;return query;},async maybeSingle(){const result=run();return{data:result.data[0]??null,error:null};},async single(){const result=run();if(!result.data[0])throw Error("Missing test row: "+table);return{data:result.data[0],error:null};},then(resolve:(r:{data:Row[];error:null})=>unknown,reject?:(e:unknown)=>unknown){return Promise.resolve(run()).then(resolve,reject);}};
      return query;
    }
  };
  return{db:db as unknown as SupabaseClient,tables,setTime(value:number){now=value;}};
}
