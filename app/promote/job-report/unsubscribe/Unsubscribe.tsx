"use client";
import { useState } from "react";
import styles from "../job-report.module.css";
export default function Unsubscribe({token}:{token:string}) {
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  return <><p>Stop Job Report emails now and cancel future monthly renewals. This does not affect membership, Rentals, or other EOD-HUB services.</p><button className={styles.action} disabled={busy||done} onClick={async()=>{setBusy(true);try{const response=await fetch(`/api/job-report/unsubscribe?token=${encodeURIComponent(token)}`,{method:"POST"});const body=await response.json();setMessage(body.message??body.error);setDone(response.ok);}catch{setMessage("Please retry or contact hello@eod-hub.com.");}finally{setBusy(false);}}}>{busy?"Stopping emails…":"Unsubscribe and cancel future renewals"}</button>{message?<p role="status">{message}</p>:null}</>;
}
