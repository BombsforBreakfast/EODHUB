"use client";
import {useCallback,useEffect,useState,type CSSProperties} from "react";
import {supabase} from "@/app/lib/lib/supabaseClient";
import {useTheme} from "@/app/lib/ThemeContext";
import type {Delisting} from "@/app/lib/rentals/delisting";
import s from "@/app/promote/rentals/portal/portal.module.css";
type Queue={jobs:Delisting[];total:number;providers:{user_id:string;full_name:string;company:string;delisted_at?:string|null}[];properties:{id:string;provider_id:string;label:string;delisted_at?:string|null}[]};
async function request(page:number,body?:unknown){
  const{data}=await supabase.auth.getSession();if(!data.session)throw new Error("Sign in as the Hub owner.");
  const response=await fetch(`/api/admin/rentals/delistings?page=${page}`,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${data.session.access_token}`,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not load delistings.");return result;
}
export default function AdminRentalDelistingsPanel(){
  const{t}=useTheme(),[queue,setQueue]=useState<Queue|null>(null),[page,setPage]=useState(0),[scope,setScope]=useState("property"),[target,setTarget]=useState(""),[note,setNote]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const load=useCallback(async()=>{setBusy(true);setError("");try{setQueue(await request(page));}catch(e){setError(e instanceof Error?e.message:"Could not load delistings.");}finally{setBusy(false);}},[page]);
  useEffect(()=>{void load();},[load]);
  async function act(body:unknown){setBusy(true);setMessage("");setError("");try{await request(page,body);await load();setMessage("Saved. Review the billing outcome below.");}catch(e){setError(e instanceof Error?e.message:"Could not save delisting.");}finally{setBusy(false);}}
  return <section className={s.page} style={{minHeight:"auto","--portal-bg":t.bg,"--portal-surface":t.surface,"--portal-text":t.text,"--portal-muted":t.textMuted,"--portal-border":t.border,"--portal-input":t.input}as CSSProperties}>
    <div className={s.sectionHeading}><h2>Delisting & refunds</h2><button className={s.secondary} disabled={busy} onClick={()=>void load()}>Refresh delistings</button></div>
    <p className={s.muted}>Confirmed removal hides the property and stops future listing billing. Monthly fees retain the current paid month. Unused annual listing time is calculated by days remaining. A visitor flag or temporary review hold does not trigger this policy.</p>
    {error?<p className={s.error} role="alert">{error}</p>:null}{message?<p className={s.notice} role="status">{message}</p>:null}
    {queue?<><form className={s.card} onSubmit={e=>{e.preventDefault();if(window.confirm(`Permanently delist this ${scope==='provider'?'provider and ALL their rental properties':'property'}? Future listing charges will stop, and unused paid annual listing time becomes a refund task. This cannot be reversed with Show listing.`))void act({action:"confirm",scope,target,note,confirm:true});}}>
      <h3>Confirm a delisting</h3><fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
      <label className={s.field}><span>Remove</span><select value={scope} onChange={e=>{setScope(e.target.value);setTarget("");}}><option value="property">One property</option><option value="provider">Provider account and all rental properties</option></select></label>
      <label className={s.field}><span>{scope==='provider'?'Provider':'Property'}</span><select required value={target} onChange={e=>setTarget(e.target.value)}><option value="">Choose…</option>{scope==='provider'?queue.providers.filter(p=>!p.delisted_at).map(p=><option key={p.user_id} value={p.user_id}>{p.company||p.full_name}</option>):queue.properties.filter(p=>!p.delisted_at).map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
      <label className={s.field}><span>Reason shared with the provider</span><textarea required minLength={5} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <button className={s.primary} disabled={!target||note.trim().length<5}>Confirm delisting & stop future billing</button></fieldset><p className={s.small}>Only rental permissions and rental listing subscriptions are affected. Hub membership is preserved. Original catalog listings require a manual check of any billing outside the property portal.</p>
    </form>
    <h3>Billing outcomes · {queue.total}</h3>{!queue.jobs.length?<p>No confirmed delistings.</p>:queue.jobs.map(job=><RefundTask key={`${job.id}-${job.state}`} job={job} busy={busy} act={act}/>)}
    <div className={s.actions}><button className={s.secondary} disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>Previous delistings</button><span>Page {page+1}</span><button className={s.secondary} disabled={busy||(page+1)*25>=queue.total} onClick={()=>setPage(p=>p+1)}>Next delistings</button></div></>:<p role="status">{busy?'Loading delistings…':'Select Refresh delistings to retry.'}</p>}
  </section>;
}
function RefundTask({job,busy,act}:{job:Delisting;busy:boolean;act:(body:unknown)=>Promise<void>}){
  const[amount,setAmount]=useState(job.refund_cents===null?'':(job.refund_cents/100).toFixed(2)),[reference,setReference]=useState(''),[note,setNote]=useState(''),[reviewed,setReviewed]=useState(false);
  return <article className={s.card}><span className={s.badge}>{job.state.replaceAll('_',' ')}</span><h3>{job.label}</h3><p>{job.plan} · Removed {new Date(job.effective_at).toLocaleString()}</p><p>{job.result_note||'Subscription cancellation is pending.'}</p>{job.last_error?<p role="alert" className={s.error}>{job.last_error}</p>:null}
    {job.invoice_id?<a href={`https://dashboard.stripe.com/invoices/${encodeURIComponent(job.invoice_id)}`} target="_blank" rel="noopener noreferrer">Review paid invoice in Stripe ↗</a>:job.subscription_id?<a href={`https://dashboard.stripe.com/subscriptions/${encodeURIComponent(job.subscription_id)}`} target="_blank" rel="noopener noreferrer">Review subscription in Stripe ↗</a>:null}
    {job.state==='pending'?<button className={s.secondary} disabled={busy} onClick={()=>void act({action:'retry',id:job.id})}>Retry cancellation</button>:job.state==='completed'?<p>{job.refund_id?`Cash refund recorded: $${(job.refunded_cents/100).toFixed(2)} · ${job.refund_id}`:'Billing review complete.'}</p>:<form onSubmit={e=>{e.preventDefault();if(window.confirm('Record this completed Stripe cash refund/review? This button records the outcome; it does not move money.'))void act({action:'record_refund',id:job.id,cents:Math.round(Number(amount)*100),reference,note,reviewed});}}>
      <p className={s.notice}>{job.refund_cents!==null?`Unused annual listing balance: $${(job.refund_cents/100).toFixed(2)}.`:'Check paid annual time, earlier refunds, disputes, credits and taxes in Stripe.'} Issue the cash refund in Stripe first. This form records the result and emails confirmation; it does not issue money. The separate campaign fee is excluded from the annual calculation.</p>
      <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}><label className={s.field}><span>Actual cash refund (USD; 0 if none due after review)</span><input required type="number" min="0" step="0.01" value={amount} max={job.refund_cents===null?undefined:job.refund_cents/100} onChange={e=>setAmount(e.target.value)}/></label><label className={s.field}><span>Stripe refund ID (re_…; required for a refund)</span><input value={reference} required={Number(amount)>0} onChange={e=>setReference(e.target.value)}/></label><label className={s.field}><span>Review outcome shared with provider</span><textarea required minLength={5} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><label className={s.check}><input type="checkbox" required checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I verified the cash refund was issued, or confirmed nothing further is due, including previous refunds and adjustments.</label><button className={s.primary} disabled={!reviewed||note.trim().length<5||amount===''}>Record completed refund / review</button></fieldset>
    </form>}
  </article>;
}
