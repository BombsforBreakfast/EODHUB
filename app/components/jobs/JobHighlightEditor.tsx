"use client";
import {useEffect,useRef,useState,type CSSProperties} from "react";
import {createPortal} from "react-dom";
import {useQueryClient} from "@tanstack/react-query";
import {supabase} from "@/app/lib/lib/supabaseClient";
import {useTheme} from "@/app/lib/ThemeContext";
import {useSuppressChatroomPeek} from "@/app/hooks/useSuppressChatroomPeek";
import {parseGoldTags,type JobGold} from "@/app/lib/jobHighlights";
import {normalizeJobPhrase} from "@/app/lib/jobReviewPreferences";
import {publishJobGold,useGoldJob} from "@/app/lib/jobHighlights.client";
import JobGoldLabels from "./JobGoldLabels";
import s from "./JobHighlightEditor.module.css";
type GoldJob=JobGold&{id:string;title?:string|null};
export default function JobHighlightEditor({job:source,onChanged}:{job:GoldJob;onChanged?:()=>void|Promise<void>}){
  const job=useGoldJob(source),{t,isDark}=useTheme(),cache=useQueryClient();
  const[open,setOpen]=useState(false),[enabled,setEnabled]=useState(true),[text,setText]=useState(""),[teach,setTeach]=useState(false),[phrase,setPhrase]=useState(""),[mission,setMission]=useState(true),[jobOnly,setJobOnly]=useState(false),[score,setScore]=useState<90|100>(90),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLFormElement>(null);
  useSuppressChatroomPeek(open,`job-gold-editor-${job.id}`);
  function close(){if(!busy){setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());}}
  useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!busy){setOpen(false);trigger.current?.focus();}}if(e.key==='Tab'){const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')??[]);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}
    window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('keydown',key,true);document.body.style.overflow=previous;};
  },[open,busy]);
  let tags:string[]=[];try{tags=parseGoldTags(text);}catch{}
  async function save(remove=false){
    setError("");let labels:string[];try{labels=remove||!enabled?[]:parseGoldTags(text);if(!remove&&enabled&&!labels.length)throw Error("Add at least one tag for the gold label.");if(!remove&&teach&&normalizeJobPhrase(phrase).length<3)throw Error("Enter a specific title phrase to teach.");}catch(e){setError(e instanceof Error?e.message:"Check your labels.");return;}
    setBusy(true);
    try{
      const{data}=await supabase.auth.getSession();const response=await fetch(`/api/admin/jobs/${job.id}/highlight`,{method:"PATCH",headers:{Authorization:`Bearer ${data.session?.access_token??""}`,"Content-Type":"application/json"},body:JSON.stringify({enabled:!remove&&enabled,tags:labels,revision:job.gold_revision??0,...(!remove&&teach?{teach:{phrase,missionRequired:mission,score,jobOnly}}:{})})});
      const result=await response.json();if(!response.ok)throw Error(result.error||"Could not save highlight.");
      publishJobGold(job.id,result.job);
      cache.setQueriesData<GoldJob[]>({queryKey:["jobs","list"]},rows=>rows?.map(row=>row.id===job.id?{...row,...result.job}:row));
      cache.setQueriesData<(JobGold&{job_id:string})[]>({queryKey:["saved-jobs"]},rows=>rows?.map(row=>row.job_id===job.id?{...row,...result.job}:row));
      setOpen(false);trigger.current?.focus();await onChanged?.();
    }catch(e){setError(e instanceof Error?e.message:"Could not save highlight.");}finally{setBusy(false);}
  }
  const variables={"--gold-bg":t.surface,"--gold-text":t.text,"--gold-muted":t.textMuted,"--gold-border":t.border,"--gold-input":t.input,"--gold-error":isDark?"#fca5a5":"#b91c1c"}as CSSProperties;
  return <><button type="button" ref={trigger} onClick={()=>{setEnabled(true);setText((job.gold_tags??[]).join("\n"));setTeach(false);setJobOnly(false);setMission(true);setScore(90);setPhrase((job.title??"").slice(0,100));setError("");setOpen(true);}} style={{border:"1px solid #c9a23b",borderRadius:8,padding:"5px 10px",fontSize:12,fontWeight:800,background:job.gold_highlight?"#f3d784":"transparent",color:job.gold_highlight?"#392905":t.text,cursor:"pointer"}}>★ {job.gold_highlight?"Edit gold highlight":"Gold highlight"}</button>
    {open&&typeof document!=="undefined"?createPortal(<div className={s.overlay} style={variables} onClick={e=>{if(e.target===e.currentTarget)close();}}><form ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`gold-title-${job.id}`} className={s.dialog} onSubmit={e=>{e.preventDefault();void save();}}>
      <h2 id={`gold-title-${job.id}`}>Gold job highlight</h2><p>{job.title}</p>
      <label className={s.check}><input type="checkbox" checked={enabled} disabled={busy} onChange={e=>setEnabled(e.target.checked)}/>Show a gold border and labels on this job</label>
      {enabled?<><label className={s.field}>Custom gold tags<textarea value={text} disabled={busy} onChange={e=>setText(e.target.value)} maxLength={350} placeholder={"Great location\nGreat pay\nJob of the day"}/></label><p>One tag per line, or separate tags with commas. Up to 6 tags, 40 characters each.</p><div className={s.presets}>{["Great location","Great pay","Job of the day"].map(tag=><button type="button" key={tag} disabled={busy} onClick={()=>setText(value=>value.split(/[,\n]/).some(s=>s.trim().toLowerCase()===tag.toLowerCase())?value:[value.trim(),tag].filter(Boolean).join("\n"))}>+ {tag}</button>)}</div><JobGoldLabels job={{gold_highlight:true,gold_tags:tags}}/></>:null}
      <div className={s.teach}><label className={s.check}><input type="checkbox" checked={teach} disabled={busy} onChange={e=>setTeach(e.target.checked)}/>Set a review priority for this job or similar roles</label>
      {teach?<><label className={s.check}><input type="checkbox" checked={jobOnly} disabled={busy} onChange={e=>{setJobOnly(e.target.checked);if(e.target.checked)setScore(100);}}/>Apply only to this specific job</label><label className={s.field}>Title phrase to prioritize<input value={phrase} disabled={busy} maxLength={100} onChange={e=>setPhrase(e.target.value)}/></label><label className={s.check}><input type="checkbox" checked={!jobOnly&&mission} disabled={busy||jobOnly} onChange={e=>setMission(e.target.checked)}/>Require EOD / CBRN / CWMD mission terms in the description</label><label className={s.field}>Review priority<select disabled={busy} value={score} onChange={e=>setScore(Number(e.target.value)as 90|100)}><option value={90}>90 / 100 — Strong match</option><option value={100}>100 / 100 — Top match</option></select></label><p>A job-specific override records your review even when an imported excerpt omits key requirements. Title rules prioritize matching future jobs. Neither option approves jobs or applies public gold labels. Manage these rules under Exclusions & learning.</p></>:null}</div>
      {error?<p className={s.error} role="alert">{error}</p>:null}
      <div className={s.actions}><button type="button" disabled={busy} onClick={close}>Cancel</button>{job.gold_highlight?<button type="button" disabled={busy} onClick={()=>void save(true)}>Remove gold highlight</button>:null}<button className={s.save} disabled={busy||(!enabled&&!teach)}>{busy?"Saving…":"Save job preferences"}</button></div><p>Pending jobs become public only after approval. Gold highlights remain until you remove them or the listing expires.</p>
    </form></div>,document.body):null}
  </>;
}
