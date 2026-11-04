"use client";
import Link from "next/link";
import { useEffect,useRef,useState,type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/lib/supabaseClient";
import { signInWithOAuthProvider } from "@/app/lib/auth/oauthSignIn";
import { resolveAuthLoginEmail } from "@/app/lib/auth/resolveAuthLoginEmail";
import type { Portal } from "@/app/lib/account/access";
import AccountFrame from "../AccountFrame";
import { createEmailEntryLoader } from "@/app/lib/auth/emailEntry.client";
import s from "../account.module.css";
export default function AccountSignIn({portal,next,serviceReady,oauthReady}:{portal:Portal;next:string;serviceReady:boolean;oauthReady:boolean}){
  const [mode,setMode]=useState<"login"|"signup"|"link">("login"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const entry=useRef<ReturnType<typeof createEmailEntryLoader<Session>>|null>(null);
  useEffect(()=>{let active=true;void(async()=>{
    if(!serviceReady)return;
    const token=new URLSearchParams(location.hash.slice(1)).get("token_hash");
    if(token){history.replaceState(null,"",location.pathname+location.search);setBusy(true);}
    entry.current??=createEmailEntryLoader(async hash=>{const result=await supabase.auth.verifyOtp({type:"email",token_hash:hash});if(result.error||!result.data.session)throw new Error("This sign-in link is invalid or expired. Request a new one.");},async()=>(await supabase.auth.getSession()).data.session);
    try{const result=await entry.current(token);if(active&&result.workspace)location.replace(next);else if(active)setBusy(false);}catch(e){if(active){setError(e instanceof Error?e.message:"Could not verify your link.");setBusy(false);}}
  })();return()=>{active=false;};},[next,serviceReady]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");setNotice("");const form=new FormData(event.currentTarget),email=String(form.get("email")??"").trim();
    try{
      if(mode==="login"){
        const resolvedEmail=await resolveAuthLoginEmail(supabase,email),result=await supabase.auth.signInWithPassword({email:resolvedEmail,password:String(form.get("password")??"")});
        if(result.error)throw new Error("Could not sign in. Check your details, use Google or Apple, or request an email sign-in link.");location.assign(next);
      }else{
        if(mode==="signup" && form.get("password")!==form.get("confirmPassword"))throw new Error("Passwords do not match.");
        const response=await fetch("/api/shared-auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:mode==="signup"?"signup":"request-link",portal,next,email,password:form.get("password")})}),value=await response.json();
        if(!response.ok)throw new Error(value.error||"Could not send your sign-in link.");setNotice(value.message);
      }
    }catch(e){setError(e instanceof Error?e.message:"Could not sign in.");}finally{setBusy(false);}
  }
  async function oauth(provider:"google"|"apple"){setBusy(true);setError("");try{const result=await signInWithOAuthProvider(supabase,provider,{nextPath:next});if(result.error)throw result.error;}catch(e){setError(e instanceof Error?e.message:"Could not start sign-in.");setBusy(false);}}
  return <AccountFrame><section className={`${s.card} ${s.auth}`}><h1>{mode==="signup"?"Create your account":"One account. Your EOD-HUB."}</h1><p className={s.muted}>Use the same sign-in for the Hub, Rentals and Events. Each portal keeps its own access approvals.</p>{!serviceReady?<p className={s.notice}>Shared sign-in is being prepared. <Link href="/login">Use the current Hub sign-in</Link>.</p>:!oauthReady?<p className={s.muted}>Google and Apple sign-in will open with shared access. Email sign-in is available.</p>:null}<div className={s.providers}><button className={s.button} disabled={busy||!oauthReady} onClick={()=>void oauth("google")}>Continue with Google</button><button className={s.button} disabled={busy||!oauthReady} onClick={()=>void oauth("apple")}>Continue with Apple</button></div><form className={s.form} onSubmit={submit}><label>{mode==="login"?"Email or existing Hub username":"Email"}<input name="email" type={mode==="login"?"text":"email"} autoComplete="username" required maxLength={254}/></label>{mode!=="link"?<label>Password<input name="password" type="password" required minLength={mode==="signup"?8:undefined} maxLength={128} autoComplete={mode==="signup"?"new-password":"current-password"}/></label>:null}{mode==="signup"?<label>Confirm password<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password"/></label>:null}<button className={`${s.button} ${s.primary}`} disabled={busy||!serviceReady}>{busy?"Please wait…":mode==="login"?"Sign in":mode==="signup"?"Create account":"Email my sign-in link"}</button></form>{error?<p role="alert" className={`${s.notice} ${s.error}`}>{error}</p>:null}{notice?<p role="status" className={s.notice}>{notice}</p>:null}<div className={s.row}><button className={s.textButton} disabled={busy} onClick={()=>{setMode(mode==="signup"?"login":"signup");setError("");setNotice("");}}>{mode==="signup"?"Already have an account? Sign in":"Create an account"}</button><button className={s.textButton} disabled={busy} onClick={()=>{setMode(mode==="link"?"login":"link");setError("");setNotice("");}}>{mode==="link"?"Use a password instead":"Email me a sign-in link"}</button></div><p className={s.muted}>Google or Apple makes returning easy. You can connect more sign-in methods in account settings later.</p><Link className={s.textButton} href="/reset-password">Forgot your password?</Link></section></AccountFrame>;
}
