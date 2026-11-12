"use client";
import { useState, type FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import styles from "./job-report.module.css";
export default function ReportForm({manage=false}:{manage?:boolean}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;
    if(Capacitor.isNativePlatform()){setMessage("Open eod-hub.com in your browser to subscribe or manage billing.");return;}
    const email=String(new FormData(event.currentTarget).get("email")??"");setBusy(true);setMessage("");
    try {
      const response=await fetch(`/api/job-report/${manage?"manage":"checkout"}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
      const body=await response.json();
      if(!response.ok)throw Error(body.error??"Please retry.");
      if(body.url){window.location.assign(body.url);return;}
      setMessage(body.manage?"You already have a subscription or checkout in progress. A private management link has been emailed to you.":body.message);
    } catch(error){setMessage(error instanceof Error?error.message:"Please retry.");}finally{setBusy(false);}
  }
  return <form className={styles.form} onSubmit={submit}>
    <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>
    <button type="submit" disabled={busy}>{busy?"Please wait…":manage?"Email me a management link":"Subscribe for $1.99/month"}</button>
    {!manage?<span className={styles.notice}>Charged today and monthly until canceled. No free trial. By subscribing, you agree to receive The Job Report by email. Cancel future renewals through the emailed management link.</span>:null}
    {message?<p className={styles.status} role="status">{message}</p>:null}
  </form>;
}
