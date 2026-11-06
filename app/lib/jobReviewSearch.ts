export type JobSearchFields={title?:string|null;company_name?:string|null;location?:string|null;category?:string|null;description?:string|null;og_description?:string|null};
function searchable(text:string){return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ").replace(/&(?:nbsp|amp|#160);/gi," ").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\bc[\s-]+wmd\b/g,"cwmd").replace(/[^a-z0-9]+/g," ").trim();}
/** Literal words, all required, across the full posting. Never an SQL/regex query. */
export function matchesJobReviewSearch(job:JobSearchFields,query:string){
  const terms=searchable(query).split(/\s+/).filter(Boolean);if(!terms.length)return true;
  const haystack=searchable([job.title,job.company_name,job.location,job.category,job.description,job.og_description].filter(Boolean).join(" "));
  return terms.every(term=>haystack.includes(term));
}
