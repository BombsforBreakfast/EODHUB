import assert from 'node:assert/strict';
import { scoreUSAJobsJob } from '../app/lib/usajobs/relevance';
import { scoreAdzunaJob } from '../app/lib/adzuna/relevance';
import { scoreLinkedInJob, shouldFetchLinkedInJobDetail } from '../app/lib/linkedin/relevance';
import { scoreReliefWebJob } from '../app/lib/reliefweb/scoreReliefWebJob';
import { extractUSAJobsSummary } from '../app/lib/usajobs/api';
const samples: [string,string,boolean][] = [
 ['Emergency Management Specialist','Develop, coordinate and execute installation EM and CBRN Defense programs.',true],
 ['Emergency Preparedness Coordinator','Conducts hazmat responder training and hazardous materials containment.',true],
 ['EM Specialist','Responsible for EOD response planning and training.',true],
 ['Property Disposal Specialist','Manages ammunition demilitarization and ordnance disposal.',true],
 ['CBRN Emergency Management Specialist','',true],
 ['Emergency Management Specialist','Coordinates flood recovery grants and continuity of operations.',false],
 ['Property Disposal Specialist','Coordinates surplus furniture disposal and recycling.',false],
 ['Property Disposal Specialist','Handles hazardous materials recycling.',false],
 ['Property Disposal Specialist','Must hold a security clearance.',false],
 ['Emergency Management Specialist','Works near a CBRN team. Coordinates office administration.',false],
 ['Emergency Management Specialist','Employer: CBRN Defense Corp.',false],
 ['Emergency Management Specialist','Coordinates end of day (EOD) reporting.',false],
 ['UXO Technician','Performs unexploded ordnance clearance.',true],
];
for (const [title,description,expected] of samples) {
 const input={title,description,companyName:'Employer',organizationName:'Employer'};
 for(const [source,result] of [['USAJobs',scoreUSAJobsJob(input)],['Adzuna',scoreAdzunaJob(input)],['LinkedIn',scoreLinkedInJob(input)],['ReliefWeb',scoreReliefWebJob({...input,metadataText:'',themes:[]})]] as const){
  const relevant='relevant' in result ? result.relevant : !result.suppressed && !result.excluded;
  assert.equal(relevant,expected,`${source}: ${title}: ${description}`);
 }
}
assert.equal(shouldFetchLinkedInJobDetail({title:'Emergency Management Specialist',description:'',companyName:'Employer'}),true);
assert.equal(shouldFetchLinkedInJobDetail({title:'Counterintelligence Emergency Management Specialist',description:'',companyName:'Employer'}),false);
const summary=extractUSAJobsSummary({MatchedObjectId:'123',MatchedObjectDescriptor:{PositionID:'x',PositionTitle:'Emergency Management Specialist',PositionURI:'',PositionLocationDisplay:'',OrganizationName:'',UserArea:{Details:{JobSummary:'See below.'}},QualificationSummary:'Must possess hazmat technician certification.'}});
assert.equal(scoreUSAJobsJob({title:'Emergency Management Specialist',description:summary,organizationName:''}).relevant,true);
console.log('Passed: 13 cases across all four sources, LinkedIn detail gate, and USAJobs qualification evidence.');
