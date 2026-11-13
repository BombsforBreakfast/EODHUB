const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 const user={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.test',aud:'authenticated',role:'authenticated'};
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'synthetic'].join('.');
 const session={access_token:token,refresh_token:'synthetic',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user};
 await ctx.addCookies([{name:'sb-synthetic-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'localhost',path:'/'}]);
 const ids=['1186-muirfield-way','4276-calinda-158','4726-calinda-139'];
 const fixture={bundle:{id:'synthetic',full_name:'Test Owner',email:user.email,listing_ids:ids,available_listing_ids:ids,checkout_listing_ids:[ids[0],ids[2]],checkout_plan:'monthly',plan:'monthly',checkout_auto_renew:false,monthly_cents:2500,annual_cents:20000,complimentary_until:'2026-11-21T04:59:59Z',campaign_started_at:'2026-10-21T00:00:00Z',campaign_metrics:{views:100,clicks:10,leases:1,propertiesWithLeads:2,pageViews:200},paid_until:null,risk_hold_until:null,stripe_subscription_id:null},listings:ids.map((id,i)=>({id,address:['1186 Muirfield Way','4276 Calinda Lane Unit 158','4276 Calinda Lane Unit 139'][i],city:'Niceville',state:'FL',zip:'32578',monthlyRent:2000,bedrooms:3,bathrooms:2,description:'Synthetic property for UI verification',photos:['/favicon.ico'],availability:{status:'available-now'}}))};
 const writes=[];
 await ctx.route('https://synthetic.supabase.co/**',r=>r.fulfill({json:user}));
 await ctx.route('**/api/rentals/portal/bundle',async r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();writes.push(b);if(b.action==='availability')fixture.listings.find(p=>p.id===b.id).availability.status=b.status;await r.fulfill({json:{ok:true}});}else await r.fulfill({json:fixture});});
 const page=await ctx.newPage();
 await page.goto('http://localhost:3049/promote/rentals/bundle');
 await page.getByRole('heading',{name:'Choose the properties to keep listed'}).waitFor({timeout:90000});
 const choices=page.locator('fieldset input[type=checkbox]');
 assert.deepEqual(await choices.evaluateAll(xs=>xs.map(x=>x.checked)),[true,false,true]);
 await page.getByRole('button',{name:'Check out 2 listings — $20/month'}).waitFor();
 const selects=page.locator('select[name=status]');assert.equal(await selects.count(),3);
 assert.deepEqual(await selects.nth(0).locator('option').allTextContents(),['Available','Pending','Occupied']);
 await choices.nth(2).uncheck();
 const article=page.locator('article').nth(1);
 for(const status of ['unavailable','pending','available-now']){
  await article.locator('select[name=status]').selectOption(status);
  await article.getByRole('button',{name:'Save availability'}).click();
  await page.getByText('Saved.',{exact:true}).waitFor();
  assert.equal(writes.at(-1).status,status);assert.equal(writes.at(-1).id,ids[1]);
  assert.deepEqual(await choices.evaluateAll(xs=>xs.map(x=>x.checked)),[true,false,false]);
 }
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'../../terry-portal-'+width+'.png',fullPage:true});}
 await page.getByLabel(/I reviewed these/).check();
 await page.getByRole('button',{name:'Check out 1 listings — $10/month'}).click();
 await page.getByText('Saved.',{exact:true}).waitFor();
 assert.equal(writes.at(-1).plan,'monthly');assert.deepEqual(writes.at(-1).listingIds,[ids[0]]);
 console.log('PASS mobile/desktop, monthly default, property selection, all status values, selection preserved after saves, checkout payload; no live requests');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
