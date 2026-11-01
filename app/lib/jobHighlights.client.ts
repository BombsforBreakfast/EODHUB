"use client";
import {useSyncExternalStore} from "react";
import type {JobGold} from "./jobHighlights";
const edits=new Map<string,JobGold>(),listeners=new Set<()=>void>();
function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function publishJobGold(id:string,value:JobGold){edits.set(id,value);for(const fn of listeners)fn();}
export function useGoldJob<T extends JobGold&{id:string}>(job:T):T;
export function useGoldJob<T extends JobGold&{id:string}>(job:T|null):T|null;
export function useGoldJob<T extends JobGold&{id:string}>(job:T|null):T|null{
  const edit=useSyncExternalStore(subscribe,()=>edits.get(job?.id??"")??null,()=>null);
  return job&&edit&&(edit.gold_revision??0)>(job.gold_revision??0)?{...job,...edit}:job;
}
