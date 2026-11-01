import {z} from "zod";
export type JobGold = {gold_highlight?:boolean|null;gold_tags?:string[]|null;gold_revision?:number;gold_updated_at?:string|null};
export const goldColor="#c9a23b";
export function goldCardStyle(job:JobGold){return job.gold_highlight?{border:`2px solid ${goldColor}`,boxShadow:"0 0 0 1px rgba(201,162,59,.16)"}:{};}
export function parseGoldTags(text:string){
  const tags=[...new Map(text.split(/[,\n]/).map(s=>s.trim()).filter(Boolean).map(s=>[s.toLocaleLowerCase(),s])).values()];
  if(tags.length>6||tags.some(s=>s.length>40||/[\u0000-\u001f\u007f]/.test(s)))throw new Error("Use up to 6 tags, with 40 characters or fewer in each.");
  return tags;
}
export const jobGoldRequest=z.object({enabled:z.boolean(),tags:z.array(z.string().trim().min(1).max(40).refine(s=>!/[\u0000-\u001f\u007f]/.test(s))).max(6),revision:z.number().int().nonnegative(),teach:z.object({phrase:z.string().trim().min(3).max(100),jobOnly:z.boolean().optional(),missionRequired:z.boolean(),score:z.union([z.literal(90),z.literal(100)])}).optional()}).refine(v=>!v.enabled||v.tags.length>0,{message:"Add at least one tag for the gold label.",path:["tags"]});
