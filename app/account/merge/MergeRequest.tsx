"use client";
import Link from "next/link";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { accountFetch } from "@/app/lib/account/client";
import { supabase } from "@/app/lib/lib/supabaseClient";
import AccountFrame from "../AccountFrame";
import s from "../account.module.css";
export default function MergeRequest(){
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState(""),[rows,setRows]=useState<{id:string;status:string;review_note:string}[]>([]);
  const proof=useRef<Promise<unknown>|null>(null);
  useEffect(()=>{
    const fragment=new URLSearchParams(location.hash.slice(1)),token=fragment.get("token_hash"),id=fragment.get("request");
    if(token&&id){history.replaceState(null,"",location.pathname);setBusy(true);proof.current??=fetch("/api/account/merge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify",id,token})}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error||"Could not verify this request.");return value;});
      void proof.current.then(value=>setNotice((value as {message:string}).message)).catch(e=>setError(e.message)).finally(()=>setBusy(false));return;
    }
    void accountFetch(supabase,"/api/account/merge").then(value=>setRows(value.requests??[])).catch(e=>setError(e.message));
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");try{const value=await accountFetch(supabase,"/api/account/merge",{action:"request",email:new FormData(event.currentTarget).get("email")});setNotice(value.message);}catch(e){setError(e instanceof Error?e.message:"Could not request review.");}finally{setBusy(false);}}
  return <AccountFrame><section className={`${s.card} ${s.auth}`}>
    <h1>Combine existing accounts</h1>
    <p className={s.muted}>Sign in to the account you want to keep, then verify the other account&apos;s email. An administrator will review the accounts and their existing properties, events and billing before any records move.</p>
    <form className={s.form} onSubmit={submit}><label>Other account&apos;s sign-in email<input name="email" type="email" required maxLength={254}/></label><button className={`${s.button} ${s.primary}`} disabled={busy}>{busy?"Please wait…":"Send verification link"}</button></form>
    {notice?<p className={s.notice} role="status">{notice}</p>:null}{error?<p className={`${s.notice} ${s.error}`} role="alert">{error}</p>:null}
    {rows.map(row=><p key={row.id}>{row.status.replaceAll("_"," ")}{row.review_note?` · ${row.review_note}`:""}</p>)}<Link className={s.textButton} href="/account">Back to account settings</Link>
  </section></AccountFrame>;
}
