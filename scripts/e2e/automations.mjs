import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Auto"), B=await mk("Other");
// custom chain workflow on CONTACT_CREATED
const wf=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Chain test",trigger:"CONTACT_CREATED",triggerFilter:{source:"WEBSITE"},steps:[
 {type:"ADD_TAG",tag:"hot"},{type:"ADD_NOTE",text:"Welcome {{contact.first_name}} from {{company.name}}"},{type:"WAIT",amount:0,unit:"minutes"},
 {type:"CREATE_TASK",title:"Call {{contact.name}}",dueInDays:0,priority:"HIGH"},{type:"IF",field:"lifecycle",op:"equals",value:"LEAD"},{type:"SET_LIFECYCLE",lifecycle:"MQL"},{type:"END"}]})},A);
check("workflow created", wf.r.status===201, JSON.stringify(wf.b).slice(0,80));
// second workflow fired by tag
const wf2=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Tag follow",trigger:"TAG_ADDED",triggerFilter:{tag:"hot"},steps:[{type:"ADD_NOTE",text:"Tagged hot"}]})},A);
check("tag workflow created", wf2.r.status===201);
// recipe (email first step) to prove honest failure without sender
const rec=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({recipe:"lead_nurture"})},A);
check("recipe added", rec.r.status===201 && rec.b.trigger==="CONTACT_CREATED");
// filtered-out contact (source MANUAL) should not enroll in chain
const c0=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Manual Person ${stamp}`,email:`m+${stamp}@example.com`,source:"MANUAL"})},A);
// matching contact
const c1=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Web Lead ${stamp}`,email:`w+${stamp}@example.com`,phone:"8135550101",source:"WEBSITE"})},A);
check("contacts created", c0.r.status===201 && c1.r.status===201);
const cid=c1.b.contact?.id||c1.b.id;
let d=(await api(`/api/crm/automations?id=${wf.b.id}`,{},A)).b;
check("filter: only WEBSITE contact enrolled", d.enrollments.length===1 && d.enrollments[0].contact_name.startsWith("Web Lead"), JSON.stringify(d.enrollments.map(e=>[e.contact_name,e.status,e.step_index])));
check("ran to the wait (step 3) and paused", d.enrollments[0].status==="ACTIVE" && d.enrollments[0].step_index===3 && d.enrollments[0].next_run_at, JSON.stringify(d.enrollments[0]));
const kinds=d.events.map(e=>e.kind); check("events logged: ENROLLED, ADD_TAG, ADD_NOTE, WAIT", ["ENROLLED","ADD_TAG","ADD_NOTE","WAIT"].every(k=>kinds.includes(k)), kinds.join(","));
const d2=(await api(`/api/crm/automations?id=${wf2.b.id}`,{},A)).b;
check("tag workflow fired from ADD_TAG step", d2.enrollments.length===1 && d2.enrollments[0].status==="DONE");
const recD=(await api(`/api/crm/automations?id=${rec.b.id}`,{},A)).b;
check("recipe email step failed honestly (no sender)", recD.enrollments.length===2 && recD.enrollments.every(e=>e.status==="FAILED" && /email sender/.test(e.last_error||"")), JSON.stringify(recD.enrollments.map(e=>[e.status,e.last_error])));
// resume the wait (what cron does)
const run=await api("/api/crm/automations?action=run",{method:"POST",body:"{}"},A);
check("scheduler resumed the waiting enrollment", run.b.resumed>=1, JSON.stringify(run.b));
d=(await api(`/api/crm/automations?id=${wf.b.id}`,{},A)).b;
check("chain finished DONE", d.enrollments[0].status==="DONE", JSON.stringify(d.enrollments[0]));
const cList=(await api(`/api/crm/contacts?q=${encodeURIComponent("Web Lead "+stamp)}`,{},A)).b; const cRow=(cList.contacts||[]).find(c=>c.id===cid)||{};
check("contact tagged + lifecycle MQL", JSON.parse(cRow.tags||"[]").includes("hot") && cRow.lifecycle==="MQL", JSON.stringify({tags:cRow.tags,lc:cRow.lifecycle}));
const acts=(await api(`/api/crm/activities?contactId=${cid}`,{},A)).b.activities;
check("notes written by automation", acts.filter(a=>a.created_by==="automation").length>=2, String(acts.length));
// manual enroll + dedupe + isolation
const en=await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf2.b.id,contactId:cid})},A);
check("manual run works", en.r.status===201 && en.b.enrollment.status==="DONE");
check("B cannot see A's workflow", (await api(`/api/crm/automations?id=${wf.b.id}`,{},B)).r.status===404);
check("B cannot enroll A's contact", (await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf.b.id,contactId:cid})},B)).r.status===404);
// pause + delete
await api("/api/crm/automations",{method:"PATCH",body:JSON.stringify({id:wf2.b.id,active:false})},A);
const c2=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Web Lead Two ${stamp}`,email:`w2+${stamp}@example.com`,source:"WEBSITE"})},A);
const d2b=(await api(`/api/crm/automations?id=${wf2.b.id}`,{},A)).b;
check("paused workflow does not enroll", d2b.enrollments.length===2, String(d2b.enrollments.length));

const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",dg=>dg.accept());
await page.goto(`${BASE}/#crm/automations`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("automations tab renders", await page.locator(".auHub").count()===1);
check("3 workflow cards", await page.locator(".auCards article").count()===3);
await page.locator(".auCards article",{hasText:"Chain test"}).click(); await page.waitForTimeout(700);
check("detail shows people + steps", (await page.locator(".auDetail").textContent()).includes("Web Lead") && (await page.locator(".auDetail .auEvents li").count())>=5);
await page.screenshot({path:`${OUT}/automations.png`,fullPage:true});
await page.locator(".fxLendChips button",{hasText:"Recipes"}).click(); await page.waitForTimeout(300);
check("7 recipes shown", await page.locator(".auRecipeGrid article").count()===7);
await page.locator(".auRecipeGrid article",{hasText:"No-show recovery"}).locator("button").click(); await page.waitForTimeout(1200);
check("recipe added from UI → 4 workflows", await page.locator(".auCards article").count()===4);
await page.locator(".fxCCActions button",{hasText:"New workflow"}).click(); await page.waitForTimeout(300);
check("builder opens with trigger + a step", await page.locator(".auBuilder").count()===1 && await page.locator(".auStep").count()>=2);
await page.locator(".auPalette button",{hasText:"Wait"}).click(); await page.locator(".auPalette button",{hasText:"Add tag"}).click(); await page.waitForTimeout(200);
check("steps added from palette", await page.locator(".auSteps .auStep").count()===4);
await page.locator(".auStepBody input").first().fill("nurture");
await page.locator(".auBuilderLeft input").first().fill(`Built in UI ${stamp}`);
await page.locator(".auBuilder .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1200);
check("saved from builder → 5 workflows", await page.locator(".auCards article").count()===5);
await page.screenshot({path:`${OUT}/automations-builder.png`,fullPage:true});
await page.locator(".fxLendChips button",{hasText:"Activity log"}).click(); await page.waitForTimeout(300);
check("activity log lists events", await page.locator(".auEvents li").count()>=8);
console.log("page errors:",errors.length?errors.slice(0,3):"none"); check("no page errors",errors.length===0);
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
