import type {JobGold} from "@/app/lib/jobHighlights";
export default function JobGoldLabels({job,compact=false}:{job:JobGold;compact?:boolean}){
  if(!job.gold_highlight)return null;
  if(compact){const tags=job.gold_tags??[],label=tags[0]||"Gold highlight",description=tags.join(", ")||label;return <span className="feed-jobs-gold-label" title={description} aria-label={`Gold highlight: ${description}`}><span className="feed-jobs-gold-label-text">{label}</span>{tags.length>1?<span className="feed-jobs-gold-label-more" aria-hidden="true">+{tags.length-1}</span>:null}</span>;}
  return <span aria-label="EOD-HUB gold highlight" style={{display:"flex",gap:6,flexWrap:"wrap",margin:"8px 0"}}>{(job.gold_tags??[]).map(tag=><span key={tag.toLowerCase()} style={{background:"#f3d784",color:"#392905",border:"1px solid #c9a23b",borderRadius:7,padding:"4px 9px",fontSize:12,fontWeight:800,overflowWrap:"anywhere"}}>★ {tag}</span>)}</span>;
}
