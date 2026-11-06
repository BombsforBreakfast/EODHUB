import {test} from "node:test";
import assert from "node:assert/strict";
import {matchesJobReviewSearch as matches} from "../app/lib/jobReviewSearch";
test("all search words match across title, employer, location and full body",()=>{
 const job={title:"Program Manager",company_name:"CACI",location:"Arlington, Virginia",description:"Develop CBRN detection technology"};
 assert.equal(matches(job,"caci virginia cbrn"),true);assert.equal(matches(job,"caci germany"),false);assert.equal(matches(job,"   "),true);
});
test("search normalizes accents and markup and ignores script/style content",()=>{
 assert.equal(matches({title:"Ingénieur",description:"<p>C-WMD <b>policy</b></p><script>PAYROLL</script>"},"ingenieur cwmd policy"),true);
 assert.equal(matches({description:"<style>payroll</style><p>UXO</p>"},"payroll"),false);
});
test("queries are literal words rather than SQL or regex instructions",()=>{
 assert.equal(matches({title:"UXO Technician"},"UXO.*"),true);assert.equal(matches({title:"UXO Technician"},"UXO OR payroll"),false);
});
