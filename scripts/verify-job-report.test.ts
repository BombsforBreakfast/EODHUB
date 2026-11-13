import test from 'node:test';
import assert from 'node:assert/strict';
import {reportApplicationUrl,reportCutoff,reportEmail,reportEligible,reportSalary} from '../app/lib/jobReport';
test('paid entitlement stops at expiration, cancellation, suppression, or risk hold',()=>{
 const s={status:'active',paid_until:new Date(Date.now()+60000).toISOString(),unsubscribed_at:null,suppressed_at:null,risk_hold:false};
 assert.ok(reportEligible(s));assert.ok(reportEligible({...s,status:'past_due'}));
 for(const change of [{status:'canceled'},{paid_until:new Date(0).toISOString()},{unsubscribed_at:'now'},{suppressed_at:'now'},{risk_hold:true}])assert.equal(reportEligible({...s,...change}),false);
});
test('8 AM Eastern cutoff handles winter, summer, DST transitions and delayed sweeps',()=>{
 for(const [now,cutoff] of [
 ['2026-11-13T12:59:00Z','2026-11-12T13:00:00.000Z'],
 ['2026-11-13T13:00:00Z','2026-11-13T13:00:00.000Z'],
 ['2026-07-10T11:59:00Z','2026-07-09T12:00:00.000Z'],
 ['2026-07-10T12:00:00Z','2026-07-10T12:00:00.000Z'],
 ['2026-03-08T11:59:00Z','2026-03-07T13:00:00.000Z'],
 ['2026-03-08T12:00:00Z','2026-03-08T12:00:00.000Z'],
 ['2026-11-01T12:59:00Z','2026-10-31T12:00:00.000Z'],
 ['2026-11-01T13:00:00Z','2026-11-01T13:00:00.000Z'],
 ['2026-11-13T22:00:00Z','2026-11-13T13:00:00.000Z']
 ])assert.equal(reportCutoff(new Date(now)).toISOString(),cutoff);
});
test('email escapes content, links original listing, includes cancellation and contact only footer',()=>{
 const mail=reportEmail([{id:'job',title:'<script>bad</script>',applyUrl:'https://www.usajobs.gov/job/123',description:'<p>Work safely</p>'}],'Nov 11','https://eod-hub.com/manage','https://eod-hub.com/unsubscribe');
 assert.ok(!mail.html.includes('<script>'));assert.match(mail.html,/&lt;script&gt;/);assert.match(mail.html,/https:\/\/www.usajobs.gov\/job\/123/);assert.ok(!mail.html.includes('Salary:'));assert.match(mail.html,/Contact: hello@eod-hub.com/);assert.match(mail.text,/Contact: hello@eod-hub.com/);assert.match(mail.text,/Unsubscribe and cancel future renewals/);
 assert.equal(reportApplicationUrl('javascript:alert(1)'),null);assert.equal(reportApplicationUrl('https://user:pass@example.org'),null);assert.equal(reportSalary({id:'a',title:'a',applyUrl:'https://a.org'}),null);
});
