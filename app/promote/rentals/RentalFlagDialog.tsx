"use client";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { X,Flag } from "lucide-react";
import { flagReasons } from "@/app/lib/rentals/flags";
import type { RentalListing } from "@/app/lib/rentals/catalog";
import s from "./rentals.module.css";
import f from "./RentalFlagDialog.module.css";
export default function RentalFlagDialog({listing,close}:{listing:RentalListing;close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),receipt=useRef("");
  const[busy,setBusy]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState("");
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setError("");const form=new FormData(e.currentTarget);
    try{
      receipt.current ||= crypto.randomUUID();
      const response=await fetch("/api/rentals/flags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:receipt.current,listingId:listing.id,reason:form.get("reason"),details:form.get("details"),email:String(form.get("email")??"").trim(),website:form.get("website")})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Your report could not be saved. Please retry.");setSent(true);
    }catch(e){setError(e instanceof Error?e.message:"Your report could not be saved. Please retry.");}finally{setBusy(false);}
  }
  return <dialog ref={dialog} className={`${s.dialog} ${s.contactDialog}`} onClose={close} aria-labelledby="flag-listing-title" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><div className={s.dialogContent}>
    <header className={s.dialogHeader}><div><p className={s.eyebrow}>PRIVATE LISTING REVIEW</p><h2 id="flag-listing-title">Flag this listing</h2></div><button type="button" className={s.iconButton} onClick={()=>dialog.current?.close()} aria-label="Close listing report"><X/></button></header>
    <p>{listing.address} · {listing.city}, {listing.state}</p>
    {sent?<div className={f.success} role="status"><Flag size={26}/><h3>Thank you. Your concern is queued for review.</h3><p>EOD-HUB will review the listing. Your report is private and won’t be published as a review.</p><button type="button" className={s.primaryButton} onClick={()=>dialog.current?.close()}>Done</button></div>:<form className={f.form} onSubmit={submit}>
      <p className={f.muted}>Tell us what needs attention. EOD-HUB reviews concerns before taking action.</p>
      <label>Reason<select name="reason" required defaultValue=""><option value="" disabled>Choose a reason</option>{Object.entries(flagReasons).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>What should we review?<textarea name="details" required minLength={15} maxLength={2000} rows={5} placeholder="Describe the issue and any details that will help us check the listing."/></label>
      <label>Email for follow-up (optional)<input name="email" type="email" maxLength={254} autoComplete="email"/><small>Only EOD-HUB can see your report and follow-up email.</small></label>
      <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off"/></div>
      {error?<p className={f.error} role="alert">{error}</p>:null}
      <button type="submit" className={s.primaryButton} disabled={busy}>{busy?"Sending report…":"Send for review"}</button>
    </form>}
  </div></dialog>;
}
