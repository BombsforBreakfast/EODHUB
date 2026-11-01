import type {JobGold} from "@/app/lib/jobHighlights";
export default function JobGoldLabels({job}:{job:JobGold}){
  if(!job.gold_highlight)return null;
  return <span aria-label="EOD-HUB gold highlight" style={{display:"flex",gap:6,flexWrap:"wrap",margin:"8px 0"}}>{(job.gold_tags??[]).map(tag=><span key={tag.toLowerCase()} style={{background:"#f3d784",color:"#392905",border:"1px solid #c9a23b",borderRadius:7,padding:"4px 9px",fontSize:12,fontWeight:800,overflowWrap:"anywhere"}}>★ {tag}</span>)}</span>;
}
