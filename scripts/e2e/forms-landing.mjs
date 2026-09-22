import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Land"), B=await mk("Rival");
const repEmail=`land+${stamp}@example.com`;
const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Intro call",slug:`intro-${stamp}`,durationMinutes:30})},A);
check("event type created", et.r.status===201, JSON.stringify(et.b).slice(0,80));
// automation listening for form submits + tag
const wf=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Form follow-up",trigger:"FORM_SUBMITTED",steps:[{type:"ADD_NOTE",text:"Submitted {{ctx.formTitle}}"}]})},A);
const wfTag=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Intake tag",trigger:"TAG_ADDED",triggerFilter:{tag:"intake"},steps:[{type:"ADD_NOTE",text:"tagged intake"}]})},A);
check("workflows created", wf.r.status===201 && wfTag.r.status===201);

// ---- CRM Form with after-submit = book
const form=await api("/api/crm/forms",{method:"POST",body:JSON.stringify({title:`Intake ${stamp}`,status:"PUBLISHED",fields:[{id:"q1",label:"What do you need?",type:"SHORT",required:false}],settings:{afterSubmit:"book",bookingEvent:`intro-${stamp}`,tags:"intake, web",assignTo:repEmail}})},A);
check("form created with settings", form.r.status===201, JSON.stringify(form.b).slice(0,80));
const pub=(await api(`/api/crm/forms?token=${form.b.token}`)).b;
check("public form GET exposes only afterSubmit/successMessage", pub.form?.settings?.afterSubmit==="book" && pub.form.settings.successMessage==="" && pub.form.settings_json===undefined && pub.form.settings.tags===undefined, JSON.stringify(pub.form?.settings));
const sub=await api("/api/crm/forms",{method:"PATCH",body:JSON.stringify({action:"SUBMIT",token:form.b.token,respondentName:"Form Lead",respondentEmail:`fl+${stamp}@example.com`,answers:{q1:"help"}})});
check("submit returns booking hand-off", sub.r.ok && sub.b.next===`/?event=intro-${stamp}&name=Form+Lead&email=fl%2B${stamp}%40example.com#book`, JSON.stringify(sub.b));
let list=(await api(`/api/crm/contacts?q=${encodeURIComponent("Form Lead")}`,{},A)).b.contacts||[]; let c=list.find(x=>x.email===`fl+${stamp}@example.com`)||{};
check("contact tagged + assigned in tenant A", JSON.parse(c.tags||"[]").join()==="intake,web" && c.assigned_rep===repEmail, JSON.stringify({tags:c.tags,rep:c.assigned_rep}));
let d=(await api(`/api/crm/automations?id=${wf.b.id}`,{},A)).b;
check("FORM_SUBMITTED workflow enrolled the form lead", d.enrollments.some(e=>e.contact_name==="Form Lead"&&e.status==="DONE"), JSON.stringify(d.enrollments.map(e=>[e.contact_name,e.status])));
let dt=(await api(`/api/crm/automations?id=${wfTag.b.id}`,{},A)).b;
check("TAG_ADDED workflow fired from form tag", dt.enrollments.some(e=>e.contact_name==="Form Lead"), JSON.stringify(dt.enrollments.length));
// edit settings persists
const ed=await api("/api/crm/forms",{method:"PATCH",body:JSON.stringify({id:form.b.id,title:`Intake ${stamp}`,status:"PUBLISHED",fields:[],settings:{afterSubmit:"message",successMessage:"Custom thanks!"}})},A);
const one=(await api(`/api/crm/forms?id=${form.b.id}`,{},A)).b.form;
check("settings saved on edit", ed.r.ok && JSON.parse(one.settings_json).successMessage==="Custom thanks!", one.settings_json);
const sub2=await api("/api/crm/forms",{method:"PATCH",body:JSON.stringify({action:"SUBMIT",token:form.b.token,respondentName:"Form Lead",respondentEmail:`fl+${stamp}@example.com`,answers:{}})});
check("message mode returns successMessage and no next", sub2.b.next===null && sub2.b.successMessage==="Custom thanks!", JSON.stringify(sub2.b));

// ---- Studio landing page (tenant scoped) with booking hand-off
const pg=await api("/api/studio/pages",{method:"POST",body:JSON.stringify({title:`Roof Special ${stamp}`,slug:`roof-${stamp}`})},A);
check("studio page created", pg.r.status===201, JSON.stringify(pg.b));
check("B cannot see A's page", (await api(`/api/studio/pages?id=${pg.b.id}`,{},B)).r.status===404);
check("B list excludes A's page", !((await api("/api/studio/pages",{},B)).b.pages||[]).some(p=>p.id===pg.b.id));
check("B cannot patch A's page", (await api("/api/studio/pages",{method:"PATCH",body:JSON.stringify({id:pg.b.id,title:"hacked"})},B)).r.status===404);
const full=(await api(`/api/studio/pages?id=${pg.b.id}`,{},A)).b.page;
const sections=full.sections.map(s=>s.type==="form"?{...s,props:{...s.props,afterSubmit:"book",bookingEvent:`intro-${stamp}`,tags:"landing",assignTo:repEmail}}:s.type==="hero"?{...s,props:{...s.props,ctaHref:`/?event=intro-${stamp}#book`}}:s);
const up=await api("/api/studio/pages",{method:"PATCH",body:JSON.stringify({id:pg.b.id,sections,status:"PUBLISHED"})},A);
check("page published with booking settings", up.r.ok && up.b.updated===true, JSON.stringify(up.b));
const ss=await api("/api/studio/public",{method:"POST",body:JSON.stringify({slug:`roof-${stamp}`,answers:{name:"Site Visitor",email:`sv+${stamp}@example.com`,phone:"8135550199"}})});
check("studio submit returns booking hand-off", ss.r.status===201 && ss.b.next===`/?event=intro-${stamp}&name=Site+Visitor&email=sv%2B${stamp}%40example.com&phone=8135550199#book`, JSON.stringify(ss.b));
list=(await api(`/api/crm/contacts?q=${encodeURIComponent("Site Visitor")}`,{},A)).b.contacts||[]; c=list.find(x=>x.email===`sv+${stamp}@example.com`)||{};
check("studio lead lands in tenant A, tagged + assigned", !!c.id && JSON.parse(c.tags||"[]").includes("landing") && c.assigned_rep===repEmail, JSON.stringify({id:c.id,tags:c.tags,rep:c.assigned_rep}));
const listB=(await api(`/api/crm/contacts?q=${encodeURIComponent("Site Visitor")}`,{},B)).b.contacts||[];
check("studio lead invisible to tenant B", !listB.some(x=>x.email===`sv+${stamp}@example.com`));
d=(await api(`/api/crm/automations?id=${wf.b.id}`,{},A)).b;
check("FORM_SUBMITTED fired for studio lead", d.enrollments.some(e=>e.contact_name==="Site Visitor"), JSON.stringify(d.enrollments.map(e=>e.contact_name)));
const subs=(await api(`/api/studio/pages?id=${pg.b.id}`,{},A)).b.submissions;
check("submission stored with tenant", subs.length===1 && subs[0].tenant_id, JSON.stringify(subs[0]&&{t:subs[0].tenant_id}));

// ---- Browser: public studio page redirects to prefilled booking; builder shows panels
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const anon=await browser.newContext({viewport:{width:1400,height:950}});
const page=await anon.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
await page.goto(`${BASE}/s?slug=roof-${stamp}`,{waitUntil:"networkidle"}); await page.waitForTimeout(800);
check("public page hero links to booking", (await page.locator(".studioHero a.studioBtn").getAttribute("href"))===`/?event=intro-${stamp}#book`);
await page.fill('#lead-form input[name="name"]',"Browser Lead"); await page.fill('#lead-form input[name="email"]',`bl+${stamp}@example.com`); await page.fill('#lead-form input[name="phone"]',"8135550100");
await page.click('#lead-form button[type="submit"]'); await page.waitForURL(/#book/,{timeout:15000}); await page.waitForTimeout(1500);
check("redirected to booking page", page.url().includes(`event=intro-${stamp}`) && page.url().endsWith("#book"), page.url());
check("booking form prefilled from landing page", (await page.inputValue('input[placeholder="Full name"]'))==="Browser Lead" && (await page.inputValue('input[placeholder="Email address"]'))===`bl+${stamp}@example.com`);
check("booking page picked the linked event type", (await page.locator("body").textContent()).includes("Intro call"));
await page.screenshot({path:`${OUT}/forms-landing-book.png`});
// builder
const ctx=await browser.newContext({viewport:{width:1500,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const ed2=await ctx.newPage(); ed2.on("pageerror",e=>errors.push(e.message));
await ed2.goto(`${BASE}/#crm/studio`,{waitUntil:"networkidle"}); await ed2.waitForTimeout(1500);
await ed2.locator("text=Roof Special "+stamp).first().click(); await ed2.waitForTimeout(1500);
check("builder shows after-submit panel", await ed2.locator(".studioAfter").count()===1);
check("builder booking select shows event type", (await ed2.locator(".studioAfter select").nth(1).inputValue())===`intro-${stamp}`);
check("hero link picker shows booking option selected", (await ed2.locator(".studioHero .studioLinkPick select").inputValue())===`book:intro-${stamp}`);
await ed2.screenshot({path:`${OUT}/forms-landing-builder.png`,fullPage:true});
// CRM form editor
await ed2.goto(`${BASE}/#crm/forms`,{waitUntil:"networkidle"}); await ed2.waitForTimeout(1200);
await ed2.locator(".formsList>button",{hasText:`Intake ${stamp}`}).click(); await ed2.waitForTimeout(500);
await ed2.locator("button",{hasText:"Edit form"}).click(); await ed2.waitForTimeout(600);
check("form editor shows after-submit block", await ed2.locator(".formAfter").count()===1);
check("form editor loaded saved thank-you", (await ed2.locator(".formAfterGrid input").first().inputValue())==="Custom thanks!");
await ed2.screenshot({path:`${OUT}/forms-landing-editor.png`,fullPage:true});
check("no page errors", errors.length===0, errors.join(" | ").slice(0,300));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
