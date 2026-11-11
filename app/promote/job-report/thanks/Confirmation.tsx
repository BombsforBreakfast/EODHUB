"use client";
import { useEffect,useState } from "react";
export default function Confirmation({sessionId}:{sessionId?:string}) {
  const [message,setMessage]=useState("Confirming your subscription and preparing your first report…");
  useEffect(()=>{
    let canceled=false;
    void(async()=>{for(let attempt=0;attempt<8&&!canceled;attempt++){
      try{const response=await fetch("/api/job-report/confirm",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId})});const body=await response.json();
        if(body.paid){if(!canceled)setMessage(body.reportSent?`You’re subscribed. Your first report with ${body.jobCount} approved ${body.jobCount===1?"job":"jobs"} has been sent to your checkout email.`:body.jobCount?"Your subscription is confirmed. Your first report is queued for delivery and will retry automatically if needed.":"You’re subscribed. There are no newly approved jobs to report today. You’ll receive the next report when new opportunities are ready.");return;}
      }catch{/* The verified webhook and scheduled worker also complete this work. */}
      await new Promise(resolve=>setTimeout(resolve,2000));
    }if(!canceled)setMessage("We’re still confirming your payment. Confirmation and any available first report will arrive at your checkout email once payment succeeds.");})();
    return()=>{canceled=true;};
  },[sessionId]);
  return <p role="status">{message}</p>;
}
