import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie="",extra={}){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Dash"), B=await mk("Peer");
// seed: workflow on CONTACT_CREATED with a note + tag; failing recipe; contacts
const wf=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Welcome",trigger:"CONTACT_CREATED",steps:[{type:"ADD_TAG",tag:"dash"},{type:"ADD_NOTE",text:"hi {{contact.first_name}}"}]})},A);
const rec=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({recipe:"lead_nurture"})},A);
// 3 manual contacts + 1 created by the landing-page lead below = 4 CONTACT_CREATED enrollments per workflow
for(const n of ["One","Two","Three"]) await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Dash ${n} ${stamp}`,email:`d${n}+${stamp}@example.com`,source:"WEBSITE"})},A);
const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Demo",slug:`demo-${stamp}`,durationMinutes:30})},A);
const form=await api("/api/crm/forms",{method:"POST",body:JSON.stringify({title:`Survey ${stamp}`,status:"PUBLISHED",fields:[],requiresSignature:true,settings:{afterSubmit:"book",bookingEvent:`demo-${stamp}`,tags:"survey"}})},A);
await api("/api/crm/forms",{method:"PATCH",body:JSON.stringify({action:"SUBMIT",token:form.b.token,respondentName:"Resp One",respondentEmail:`r1+${stamp}@example.com`,answers:{},signatureName:"Resp One"})});
await api("/api/crm/forms",{method:"PATCH",body:JSON.stringify({action:"SUBMIT",token:form.b.token,respondentName:"Resp Two",respondentEmail:`r2+${stamp}@example.com`,answers:{},signatureName:"Resp Two"})});
const pg=await api("/api/studio/pages",{method:"POST",body:JSON.stringify({title:`Promo ${stamp}`,slug:`promo-${stamp}`})},A);
await api("/api/studio/pages",{method:"PATCH",body:JSON.stringify({id:pg.b.id,status:"PUBLISHED"})},A);
for(let i=0;i<5;i++) await api(`/api/studio/public?slug=promo-${stamp}`,{},"",{referer:i<3?"https://www.facebook.com/x":"https://google.com/"});
await api(`/api/studio/public?slug=promo-${stamp}&preview=1`);
await api("/api/studio/public",{method:"POST",body:JSON.stringify({slug:`promo-${stamp}`,answers:{name:"Promo Lead",email:`pl+${stamp}@example.com`}})});

// API stats
const a=(await api("/api/crm/automations?stats=1&days=30",{},A)).b;
check("automation stats: 30-day axis", a.axis?.length===30 && a.perDay.length===30);
check("automation stats: enrollments today", a.perDay[29].enrolled===8 && a.perDay[29].done===4 && a.perDay[29].failed===4, JSON.stringify(a.perDay[29]));
const welcome=a.workflows.find(w=>w.id===wf.b.id);
check("automation stats: leaderboard row", welcome && welcome.enrolled===4 && welcome.done===4 && welcome.success_rate===100, JSON.stringify(welcome));
check("automation stats: kinds + triggers + failures", a.kinds.some(k=>k.kind==="ADD_TAG"&&k.n===4) && a.triggers.some(t=>t.trigger==="CONTACT_CREATED"&&t.n===8) && a.failures.length===1 && /email sender/.test(a.failures[0].reason), JSON.stringify([a.kinds,a.triggers,a.failures]).slice(0,300));
check("automation stats: totals", a.totals.enrolled_period===8 && a.totals.success_rate===50 && a.totals.enrolled_prev===0, JSON.stringify(a.totals));
const f=(await api("/api/crm/forms?stats=1",{},A)).b;
check("form stats: per-day signed", f.perDay[29].submissions===2 && f.perDay[29].signed===2, JSON.stringify(f.perDay[29]));
const fr=f.forms.find(x=>x.id===form.b.id);
check("form stats: form row with hand-off + automations", fr && fr.submissions===2 && fr.people===2 && fr.after_submit==="book" && fr.booking_event===`demo-${stamp}` && fr.tags==="survey" && fr.settings_json===undefined, JSON.stringify(fr));
check("form stats: totals", f.totals.submissions===2 && f.totals.sign_rate===100 && f.totals.contacts_created===2 && f.totals.handoff.book===1, JSON.stringify(f.totals));
const st=(await api("/api/studio/pages?stats=1",{},A)).b;
const pr=st.pages.find(p=>p.id===pg.b.id);
check("studio stats: views counted, preview excluded", pr && pr.views===5 && pr.submissions===1 && pr.conversion===20, JSON.stringify(pr));
check("studio stats: referrers", st.referrers.find(r=>r.referrer==="www.facebook.com")?.n===3 && st.referrers.find(r=>r.referrer==="google.com")?.n===2, JSON.stringify(st.referrers));
check("studio stats: deals + pipeline", pr.deals===1 && pr.contacts===1 && st.totals.deals===1 && st.totals.conversion===20, JSON.stringify(st.totals));
const stB=(await api("/api/studio/pages?stats=1",{},B)).b, aB=(await api("/api/crm/automations?stats=1",{},B)).b, fB=(await api("/api/crm/forms?stats=1",{},B)).b;
check("tenant B sees none of it", stB.totals.views===0 && stB.pages.length===0 && aB.workflows.length===0 && aB.totals.enrolled_all===0 && fB.forms.length===0 && fB.totals.submissions===0);
check("stats need sign-in", (await api("/api/crm/automations?stats=1")).r.status===401 && (await api("/api/studio/pages?stats=1")).r.status===401);

// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm/automations`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("automations opens on Dashboard", await page.locator(".auHub .inDash").count()===1 && (await page.locator(".fxLendChips button.on").first().textContent())==="Dashboard");
check("automations chart + leaderboard rendered", await page.locator(".inDash .inChart svg rect").count()>3 && await page.locator(".inDash .inTable tbody tr").count()===2);
await page.hover(".inDash .inChart svg"); const svg=await page.locator(".inDash .inChart svg").first().boundingBox(); await page.mouse.move(svg.x+svg.width-12, svg.y+svg.height/2); await page.waitForTimeout(200);
check("hover tooltip shows today's totals", (await page.locator(".inTip").count())===1 && /Total8/.test((await page.locator(".inTip").textContent()).replace(/\s/g,"")), (await page.locator(".inTip").textContent()||"").slice(0,80));
await page.screenshot({path:`${OUT}/dash-automations.png`,fullPage:true});
await page.locator(".inDash .inTable tbody tr",{hasText:"Welcome"}).click(); await page.waitForTimeout(600);
check("leaderboard click opens the workflow", (await page.locator(".fxLendChips button.on").first().textContent())==="Workflows" && (await page.locator(".auDetail").textContent()).includes("Welcome"));
await page.goto(`${BASE}/#crm/forms`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("forms opens on Dashboard with rows", await page.locator(".formsOS .inDash").count()===1 && (await page.locator(".inDash .inTable tbody").textContent()).includes(`Survey ${stamp}`));
await page.screenshot({path:`${OUT}/dash-forms.png`,fullPage:true});
await page.locator(".inDash .inTable tbody tr").first().click(); await page.waitForTimeout(500);
check("forms row click opens the form", await page.locator(".formsStage").count()===1 && (await page.locator(".formsStage").textContent()).includes(`Survey ${stamp}`));
await page.goto(`${BASE}/#crm/studio`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("studio opens on Dashboard with page row", await page.locator(".studioOS .inDash").count()===1 && (await page.locator(".inDash .inTable tbody").textContent()).includes(`Promo ${stamp}`));
check("studio referrers + two charts", (await page.locator(".inBreak").first().textContent()).includes("www.facebook.com") && await page.locator(".inDash .inChart").count()===2);
await page.screenshot({path:`${OUT}/dash-studio.png`,fullPage:true});
await page.locator(".inDash .inTable tbody tr").first().click(); await page.waitForTimeout(800);
check("studio row click opens the builder", await page.locator(".studioBuilder").count()===1);
check("no page errors", errors.length===0, errors.join(" | ").slice(0,300));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
