import {matchesJobPhrase,normalizeJobPhrase} from "./jobReviewPreferences";
export type JobPriorityRule={id:string;job_id?:string|null;phrase:string;mission_required:boolean;target_score:90|100};
export function missionEvidence(text:string){return /\b(?:eod|explosive ordnance disposal|uxo|unexploded ordnance|cbrne?|cwmd|c wmd|wmd|weapons of mass destruction|chemical warfare|chemical weapons|counter ied|c ied|iedd|improvised explosive devices?)\b/i.test(text);}
export function jobMissionPriority(title:string,body:string,rules:JobPriorityRule[]=[],jobId=""):{score:number;reason?:string}{
  const role=normalizeJobPhrase(title).replace(/\band\b/g," ").replace(/\s+/g," ").trim();
  if(/\b(?:eod|explosive ordnance disposal|uxo|unexploded ordnance|bomb) (?:tech(?:nician)?s?)\b/.test(role))return{score:100,reason:"100: Direct EOD / UXO / Bomb Technician role in the title"};
  if(matchesJobPhrase(role,"chemical security elimination")&&/\b(?:sme|subject matter expert)\b/.test(role))return{score:100,reason:"100: Chemical Security and Elimination SME is an explicit Admin priority role"};
  // Specific experience/qualifications, not repeated keywords, establish a direct match.
  const sentences=body.split(/[.;\n]/).map(normalizeJobPhrase);
  const credential=sentences.some(s=>/\b(?:master eod technician|(?:eod|bomb) (?:technician|tech)|(?:eod|explosive ordnance disposal) (?:technician|qualifications?|qualified)|navscoleod|naval school eod|naval school (?:of )?explosive ordnance disposal|eod school)\b/i.test(s)&&
    !/\b(?:not required|no .{0,25}required|work(?:ing)? with|support(?:ing)? (?:the |our )?eod|coordinate with|customers? include|founded|founder)\b/i.test(s)&&
    /\b(?:experience|experienced|qualifications?|qualified|graduate|graduation|certified|certification|background|served|service as|must|requires?|required|understanding)\b/i.test(s));
  if(credential)return{score:100,reason:"100: EOD technician experience or qualification explicitly identified in the description"};
  let result:{score:number;reason?:string}={score:0};
  if(missionEvidence(body)&&["technical project manager","policy sme","policy subject matter expert"].some(p=>matchesJobPhrase(role,p)))result={score:90,reason:"90: preferred technical project management / policy SME role with EOD / CBRN / CWMD mission evidence"};
  for(const rule of rules)if((rule.job_id?rule.job_id===jobId:matchesJobPhrase(title,rule.phrase)&&(!rule.mission_required||missionEvidence(body)))&&rule.target_score>result.score)result={score:rule.target_score,reason:rule.job_id?`${rule.target_score}: Admin-confirmed priority for this specific listing`:`${rule.target_score}: Admin priority rule “${rule.phrase}”${rule.mission_required?" with mission evidence":""}`};
  return result;
}
