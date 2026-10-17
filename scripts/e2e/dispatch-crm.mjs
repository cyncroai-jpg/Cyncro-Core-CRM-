// Dispatch ↔ CRM: online booking becomes a job, tech events fire automations, completing drafts the invoice, contact page books a job, overview shows field KPIs.
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Field Co ${stamp}`,displayName:"Fay",email:`fay+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
await api("/api/crm/kits",{method:"POST",body:JSON.stringify({key:"field_service"})},A);
// automations for tech events
for (const [trig,body] of [["JOB_ASSIGNED","{{job.tech}} is assigned to your {{job.service}}"],["JOB_EN_ROUTE","{{job.tech}} is on the way"],["JOB_RESCHEDULED","Moved to {{job.time}}"]]) await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:`${trig} ${stamp}`,trigger:trig,steps:[{type:"ADD_NOTE",text:body}]})},A);
const meta=(await api("/api/crm/automations",{},A)).b;
check("new dispatch triggers in the builder", (meta.triggers||[]).some(t=>t[0]==="JOB_EN_ROUTE") && (meta.triggers||[]).some(t=>t[0]==="JOB_RESCHEDULED"));
// 1) online in-person booking → dispatch job
const et=(await api("/api/calendar/event-types",{},A)).b; const est=(et.eventTypes||et).find(e=>/estimate/i.test(e.name));
const d=new Date(); d.setDate(d.getDate()+2); while([0,6].includes(d.getDay())) d.setDate(d.getDate()+1); d.setHours(10,0,0,0);
const bk=await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:est.id,customerName:`Hal Homeowner ${stamp}`,customerEmail:`hal+${stamp}@example.com`,customerPhone:"5550108888",startsAt:d.toISOString(),timezone:"America/New_York",locationMode:"IN_PERSON",meetingAddress:"7 Elm St, Jupiter FL"})},A);
check("in-person booking created", bk.r.status===201, JSON.stringify(bk.b).slice(0,100));
let jobs=(await api("/api/dispatch/jobs",{},A)).b.jobs||[];
const job=jobs.find(j=>j.customer_name===`Hal Homeowner ${stamp}`);
check("booking became a dispatch job at the same time and address", job && job.status==="BOOKED" && job.address==="7 Elm St, Jupiter FL" && job.scheduled_at===d.toISOString() && job.booking_id, JSON.stringify(job||jobs.length).slice(0,200));
// 2) tech assigned, en route, rescheduled
const tech=await api("/api/dispatch/technicians",{method:"POST",body:JSON.stringify({name:"Luis Herrera",email:`luis+${stamp}@example.com`,phone:"5550103333"})},A);
const techId=tech.b.id||tech.b.technician?.id;
check("tech created", tech.r.status===201 || tech.r.ok, JSON.stringify(tech.b).slice(0,80));
check("assign tech ok", (await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.id,assignedTechId:techId,status:"ASSIGNED"})},A)).r.ok);
check("en route ok", (await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.id,status:"EN_ROUTE"})},A)).r.ok);
const d2=new Date(d.getTime()+3600000);
check("reschedule ok", (await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.id,scheduledAt:d2.toISOString()})},A)).r.ok);
await new Promise(r=>setTimeout(r,1500));
const contact=(await api(`/api/crm/contacts?q=hal%2B${stamp}`,{},A)).b.contacts[0];
check("booking customer is one CRM contact", contact && contact.full_name===`Hal Homeowner ${stamp}`);
const acts=(await api(`/api/crm/contacts?id=${contact.id}`,{},A)).b;
const notes=JSON.stringify(acts)+JSON.stringify((await api(`/api/crm/activities?contactId=${contact.id}`,{},A)).b);
check("assigned, en route and rescheduled automations wrote notes with tech + time", /Luis Herrera is assigned/.test(notes) && /Luis Herrera is on the way/.test(notes) && /Moved to/.test(notes), notes.slice(0,200));
// 3) complete → draft invoice from revenue
await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.id,revenue:1850})},A);
check("complete ok", (await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.id,status:"COMPLETE"})},A)).r.ok);
const inv=(await api("/api/crm/invoices",{},A)).b.invoices.find(i=>i.client_email===`hal+${stamp}@example.com`);
check("completing the job drafted the invoice for $1,850", inv && inv.amount_cents===185000 && inv.status==="DRAFT" && /Estimate|visit|Elm/i.test(inv.description), JSON.stringify(inv||null).slice(0,160));
await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.id,status:"COMPLETE"})},A);
check("completing again does not duplicate the invoice", (await api("/api/crm/invoices",{},A)).b.invoices.filter(i=>i.client_email===`hal+${stamp}@example.com`).length===1);
check("across cyncro shows job + invoice on the contact", (await api(`/api/crm/contacts/across?id=${contact.id}`,{},A)).b.jobs.length===1 && (await api(`/api/crm/contacts/across?id=${contact.id}`,{},A)).b.invoices.length===1);
// 4) dispatch off → booking does not create a job
await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{apps:["growth"]}})},A);
const bk2=await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:est.id,customerName:`Nope Person ${stamp}`,customerEmail:`nope+${stamp}@example.com`,startsAt:new Date(d.getTime()+2*86400000).toISOString(),timezone:"America/New_York",locationMode:"IN_PERSON",meetingAddress:"1 X St"})},A);
check("with Dispatch switched off, bookings stay calendar-only", bk2.r.status===201 && !((await api("/api/dispatch/jobs",{},A)).b.jobs||[]).some(j=>j.customer_name===`Nope Person ${stamp}`));
await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{apps:["dispatch","growth"]}})},A);
// 5) UI: contact page Create job + overview field KPI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",dd=>dd.accept());
await page.goto(`${BASE}/#crm/contacts`,{waitUntil:"load"}); await page.waitForTimeout(2200); await page.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{});
await page.locator(".contactRow",{hasText:"Hal Homeowner"}).first().locator(".contactRowActions button",{hasText:"Open"}).click(); await page.waitForTimeout(1500);
await page.locator("button",{hasText:"Create job"}).first().click(); await page.waitForTimeout(400);
await page.locator(".contactComposer input").nth(0).fill("Duct cleaning"); await page.locator(".contactComposer input").nth(1).fill("7 Elm St, Jupiter FL"); await page.locator(".contactComposer input[type=number]").fill("450");
await page.locator("button",{hasText:"Book the job"}).click(); await page.waitForTimeout(1500);
jobs=(await api("/api/dispatch/jobs",{},A)).b.jobs||[];
check("Create job from the contact page lands on the dispatch board", jobs.some(j=>j.service_type==="Duct cleaning" && j.customer_name===`Hal Homeowner ${stamp}` && j.revenue_cents===45000), JSON.stringify(jobs.map(j=>j.service_type)));
check("same dispatch customer reused, no duplicate", jobs.filter(j=>j.customer_name===`Hal Homeowner ${stamp}`).map(j=>j.customer_id).every((v,_,a)=>v===a[0]));
await page.screenshot({path:`${OUT}/dispatch-crm-contact.png`});
// overview KPI needs a job today
const today=new Date(); today.setHours(14,0,0,0);
await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:jobs.find(j=>j.service_type==="Duct cleaning").id,scheduledAt:today.toISOString(),status:"EN_ROUTE"})},A);
await page.goto(`${BASE}/#crm`,{waitUntil:"load"}); await page.waitForTimeout(2200);
check("overview shows Field · Today with a tech out", (await page.locator(".ccKpis").first().textContent()).includes("FIELD · TODAY") && (await page.locator(".ccKpis").first().textContent()).includes("1 tech out"));
await page.screenshot({path:`${OUT}/dispatch-crm-overview.png`});
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
