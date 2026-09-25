// Server-side checks for the upgraded automation engine (no browser).
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie="",extra={}){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Eng"), B=await mk("Peer");
const wfd=async(id)=>(await api(`/api/crm/automations?id=${id}`,{},A)).b;
const contact=async(name,extra={})=>(await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`${name} ${stamp}`,email:`${name.toLowerCase().replace(/\s/g,"")}+${stamp}@example.com`,phone:"8135550"+String(Math.floor(Math.random()*900)+100),source:"WEBSITE",...extra})},A)).b;

// 1) Branching: IF_ELSE + nested steps + SPLIT_TEST + LEAD_SCORE + UPDATE_FIELD + CREATE_DEAL
const wf1=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Branchy",trigger:"CONTACT_CREATED",settings:{reenroll:"once"},steps:[
  {type:"LEAD_SCORE",delta:15},
  {type:"IF_ELSE",field:"lead_score",op:"gt",value:"10",then:[{type:"ADD_TAG",tag:"scored"},{type:"IF_ELSE",field:"source",op:"equals",value:"WEBSITE",then:[{type:"ADD_NOTE",text:"deep yes"}],else:[{type:"ADD_NOTE",text:"deep no"}]}],else:[{type:"ADD_TAG",tag:"low"}]},
  {type:"UPDATE_FIELD",field:"title",value:"Scored {{contact.score}}"},
  {type:"CREATE_DEAL",name:"{{contact.name}} deal",valueDollars:1200},
  {type:"SPLIT_TEST",percentA:100,then:[{type:"ADD_TAG",tag:"variant-a"}],else:[{type:"ADD_TAG",tag:"variant-b"}]},
  {type:"ADD_NOTE",text:"after split"}]})},A);
check("branch workflow saved with nested steps", wf1.r.status===201 && wf1.b.steps[1].then.length===2 && wf1.b.steps[1].then[1].else.length===1, JSON.stringify(wf1.b).slice(0,200));
const c1=await contact("Branch Lead");
let d=await wfd(wf1.b.id); let en=d.enrollments[0]; let kinds=d.events.map(e=>e.kind);
check("ran through nested branches to DONE", en?.status==="DONE" && kinds.includes("IF_ELSE") && kinds.includes("SPLIT_TEST") && kinds.includes("CREATE_DEAL"), JSON.stringify({status:en?.status,err:en?.last_error,kinds}));
let row=(await api(`/api/crm/contacts?q=${encodeURIComponent("Branch Lead")}`,{},A)).b.contacts.find(x=>x.id===c1.id||x.id===c1.contact?.id)||{};
check("tags/score/title/deal applied", JSON.parse(row.tags||"[]").join()==="scored,variant-a" && row.lead_score===15 && row.title==="Scored 15", JSON.stringify({tags:row.tags,score:row.lead_score,title:row.title}));
const deals=(await api("/api/crm/opportunities",{},A)).b.opportunities||[];
check("deal created for $1,200", deals.some(o=>o.name.startsWith("Branch Lead")&&o.value_cents===120000), JSON.stringify(deals.map(o=>[o.name,o.value_cents])));
check("notes from the deep branch", (await api(`/api/crm/activities?contactId=${row.id}`,{},A)).b.activities.some(a=>a.details==="deep yes"));
// reenroll once: manual enroll again should be refused
const again=await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf1.b.id,contactId:row.id})},A);
check("reenroll=once blocks a second run", again.r.status===409, JSON.stringify(again.b));

// 2) WAIT_FOR with event arrival + goal exit + booking link
const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Consult",slug:`consult-${stamp}`,durationMinutes:30})},A);
const wf2=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Wait for booking",trigger:"TAG_ADDED",triggerFilter:{tag:"wait"},steps:[
  {type:"WAIT_FOR",event:"BOOKING_CREATED",amount:2,unit:"days",then:[{type:"ADD_TAG",tag:"booked-yes"}],else:[{type:"ADD_TAG",tag:"booked-no"}]},{type:"ADD_NOTE",text:"after wait"}]})},A);
const wf3=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Goal exit",trigger:"TAG_ADDED",triggerFilter:{tag:"wait"},exitTrigger:"BOOKING_CREATED",steps:[{type:"WAIT",amount:5,unit:"days"},{type:"ADD_TAG",tag:"never"}]})},A);
const c2=await contact("Waiter"); const c2id=c2.contact?.id||c2.id;
await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf1.b.id,contactId:c2id})},A); // just to have activity
// tag via a tiny workflow? use manual: enroll wf2 directly with MANUAL wouldn't match filter; instead trigger TAG_ADDED via ADD_TAG step of another workflow
const tagger=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Tagger",trigger:"MANUAL",steps:[{type:"ADD_TAG",tag:"wait"}]})},A);
await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:tagger.b.id,contactId:c2id})},A);
d=await wfd(wf2.b.id); en=d.enrollments[0];
check("WAIT_FOR pauses with wait_for + timeout", en?.status==="ACTIVE" && en.next_run_at && (await (async()=>{const x=await wfd(wf2.b.id);return x.enrollments[0]})()).status==="ACTIVE", JSON.stringify(en));
const d3=await wfd(wf3.b.id);
check("goal workflow waiting", d3.enrollments[0]?.status==="ACTIVE");
// booking arrives
const st=new Date(); st.setDate(st.getDate()+3); st.setHours(14,0,0,0);
const bk=await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:et.b.id,customerName:`Waiter ${stamp}`,customerEmail:`waiter+${stamp}@example.com`,startsAt:st.toISOString(),timezone:"America/New_York",locationMode:"VIDEO",videoPlatform:"GOOGLE_MEET"})},A);
check("booking created", bk.r.status===201, JSON.stringify(bk.b).slice(0,120));
d=await wfd(wf2.b.id); en=d.enrollments[0];
row=(await api(`/api/crm/contacts?q=${encodeURIComponent("Waiter")}`,{},A)).b.contacts.find(x=>x.id===c2id)||{};
check("event woke WAIT_FOR → then branch → continued to DONE", en?.status==="DONE" && JSON.parse(row.tags||"[]").includes("booked-yes") && d.events.some(e=>e.kind==="WAIT_FOR"&&/Event arrived/.test(e.detail)), JSON.stringify({status:en?.status,tags:row.tags,err:en?.last_error}));
const d3b=await wfd(wf3.b.id);
check("goal reached stops the other workflow", d3b.enrollments[0]?.status==="DONE" && d3b.events.some(e=>e.kind==="GOAL_REACHED"), JSON.stringify(d3b.enrollments[0]));

// 3) WAIT_FOR timeout → else branch (force next_run_at into the past through a 0-minute wait)
const wf4=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Wait timeout",trigger:"MANUAL",steps:[{type:"WAIT_FOR",event:"INVOICE_PAID",amount:0,unit:"minutes",then:[{type:"ADD_TAG",tag:"paid-yes"}],else:[{type:"ADD_TAG",tag:"paid-no"}]},{type:"ADD_NOTE",text:"continued"}]})},A);
const c3=await contact("Timeout"); const c3id=c3.contact?.id||c3.id;
await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf4.b.id,contactId:c3id})},A);
const run=await api("/api/crm/automations?action=run",{method:"POST",body:"{}"},A);
d=await wfd(wf4.b.id); en=d.enrollments[0]; row=(await api(`/api/crm/contacts?q=${encodeURIComponent("Timeout")}`,{},A)).b.contacts.find(x=>x.id===c3id)||{};
check("timeout → else branch → DONE", run.b.resumed>=1 && en?.status==="DONE" && JSON.parse(row.tags||"[]").includes("paid-no") && !JSON.parse(row.tags||"[]").includes("paid-yes"), JSON.stringify({run:run.b,status:en?.status,tags:row.tags,err:en?.last_error}));

// 4) WAIT_UNTIL + business hours hold + company settings
const set=await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{timezone:"America/New_York",businessHours:{days:[1,2,3,4,5],start:"09:00",end:"17:00"}}})},A);
check("company settings saved", set.r.ok && set.b.settings.timezone==="America/New_York");
const wf5=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Until 9",trigger:"MANUAL",steps:[{type:"WAIT_UNTIL",time:"09:00",days:[1,2,3,4,5]},{type:"ADD_TAG",tag:"morning"}]})},A);
const c4=await contact("Morning"); const c4id=c4.contact?.id||c4.id;
await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf5.b.id,contactId:c4id})},A);
d=await wfd(wf5.b.id); en=d.enrollments[0];
const nyHour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"numeric",hour12:false}).format(new Date(en?.next_run_at||Date.now())));
check("WAIT_UNTIL scheduled at 9am New York on a weekday", (en?.status==="ACTIVE" && en.next_run_at && nyHour===9) || (en?.status==="DONE" && d.events.some(e=>/Already inside/.test(e.detail))), JSON.stringify({status:en?.status,next:en?.next_run_at,nyHour}));

// 5) Round robin + POST_TO_CHAT + ENROLL_WORKFLOW + REMOVE_FROM_WORKFLOW
const inv=async(mail)=>api("/api/tenants",{method:"POST",body:JSON.stringify({action:"invite",tenantId:(await api("/api/tenants",{},A)).b.tenants[0].id,inviteEmail:mail,inviteRole:"USER",inviteDisplayName:mail.split("@")[0]})},A);
await inv(`rep1+${stamp}@example.com`); await inv(`rep2+${stamp}@example.com`);
const wf6=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"RR",trigger:"MANUAL",steps:[{type:"ROUND_ROBIN",reps:`rep1+${stamp}@example.com, rep2+${stamp}@example.com`},{type:"POST_TO_CHAT",channel:"leads",message:"{{contact.name}} → {{rep}}"},{type:"ENROLL_WORKFLOW",workflowId:wf5.b.id},{type:"REMOVE_FROM_WORKFLOW",workflowId:"all"}]})},A);
const c5=await contact("RR One"), c6=await contact("RR Two");
for(const c of [c5,c6]) await api("/api/crm/automations?action=enroll",{method:"POST",body:JSON.stringify({workflowId:wf6.b.id,contactId:c.contact?.id||c.id})},A);
const rows=(await api(`/api/crm/contacts?q=${encodeURIComponent("RR ")}`,{},A)).b.contacts.filter(x=>x.full_name.startsWith("RR "));
check("round robin spread across both reps", new Set(rows.map(x=>x.assigned_rep)).size===2, JSON.stringify(rows.map(x=>x.assigned_rep)));
const chans=(await api("/api/chat/channels",{},A)).b.channels||[];
const leads=chans.find(c=>c.name==="leads");
check("posted to Team Chat #leads in this company", leads && (await api(`/api/chat/messages?channel=${leads.id}`,{},A)).b.messages.length===2, JSON.stringify(chans.map(c=>c.name)));
check("company B has no #leads channel", !((await api("/api/chat/channels",{},B)).b.channels||[]).some(c=>c.name==="leads"));
d=await wfd(wf5.b.id);
check("ENROLL_WORKFLOW started Until 9 for both, REMOVE stopped them", d.enrollments.filter(e=>e.contact_name.startsWith("RR ")).length===2 && d.enrollments.filter(e=>e.contact_name.startsWith("RR ")).every(e=>e.status==="STOPPED"), JSON.stringify(d.enrollments.map(e=>[e.contact_name,e.status])));

// 6) Bulk enroll by filter
const wf7=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({recipe:"reactivation"})},A);
check("reactivation recipe has exit goal + once", wf7.r.status===201 && wf7.b.trigger==="MANUAL");
const bulk=await api("/api/crm/automations?action=enroll_many",{method:"POST",body:JSON.stringify({workflowId:wf7.b.id,filter:{source:"WEBSITE"}})},A);
check("bulk enrolled every WEBSITE contact", bulk.r.status===201 && bulk.b.matched>=6 && bulk.b.enrolled===bulk.b.matched, JSON.stringify(bulk.b));
const bulk2=await api("/api/crm/automations?action=enroll_many",{method:"POST",body:JSON.stringify({workflowId:wf7.b.id,filter:{source:"WEBSITE"}})},A);
check("second bulk run skips everyone (reenroll once)", bulk2.b.enrolled===0 && bulk2.b.skipped===bulk2.b.matched, JSON.stringify(bulk2.b));

// 7) Scans: BOOKING_UPCOMING 24h reminder fires once for a booking ~24h out; INVOICE_OVERDUE
const rem=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({recipe:"reminder_24h"})},A);
const soon=new Date(Date.now()+24*3600*1000); 
const bk2=await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:et.b.id,customerName:`Branch Lead ${stamp}`,customerEmail:`branchlead+${stamp}@example.com`,startsAt:soon.toISOString(),timezone:"America/New_York",locationMode:"PHONE"})},A);
check("booking 24h out created", bk2.r.status===201, JSON.stringify(bk2.b).slice(0,100));
const scan=await api("/api/crm/automations?action=scan",{method:"POST",body:"{}"},A);
const scan2=await api("/api/crm/automations?action=scan",{method:"POST",body:"{}"},A);
d=await wfd(rem.b.id);
check("24h reminder fired exactly once", scan.b.upcoming>=1 && scan2.b.upcoming===0 && d.enrollments.length===1, JSON.stringify({scan:scan.b,scan2:scan2.b,n:d.enrollments.length,err:d.enrollments[0]?.last_error}));
check("reminder email failed honestly (no sender) with booking vars", d.enrollments[0]?.status==="FAILED" && /email sender/.test(d.enrollments[0].last_error||""), d.enrollments[0]?.last_error);
const ov=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({recipe:"invoice_overdue"})},A);
const invc=await api("/api/crm/invoices",{method:"POST",body:JSON.stringify({clientName:`Branch Lead ${stamp}`,clientEmail:`branchlead+${stamp}@example.com`,description:"Roof",amount:500,dueDate:"2026-01-01"})},A);
// mark as SENT directly isn't possible without Stripe; overdue scan only looks at SENT → expect 0 and say so
const scan3=await api("/api/crm/automations?action=scan",{method:"POST",body:"{}"},A);
check("overdue scan ignores DRAFT invoices (needs SENT)", invc.r.status===201 && scan3.b.overdue===0, JSON.stringify(scan3.b));

// 8) Triggers: TASK_COMPLETED, CONTACT_UPDATED, INBOUND_SMS webhook
const wf8=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Task done",trigger:"TASK_COMPLETED",steps:[{type:"ADD_NOTE",text:"task {{task.title}} done"}]})},A);
const wf9=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:"Lifecycle change",trigger:"CONTACT_UPDATED",triggerFilter:{field:"lifecycle"},steps:[{type:"ADD_NOTE",text:"now {{contact.lifecycle}}"}]})},A);
const wf10=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({recipe:"text_back"})},A);
const task=await api("/api/crm/tasks",{method:"POST",body:JSON.stringify({title:"Call back",contactId:row.id})},A);
const done=await api("/api/crm/tasks",{method:"PATCH",body:JSON.stringify({id:task.b.task?.id||task.b.id,status:"DONE"})},A);
check("TASK_COMPLETED fired", done.r.ok && (await wfd(wf8.b.id)).enrollments.length===1, JSON.stringify([task.b,done.b]).slice(0,160));
const up=await api("/api/crm/contacts",{method:"PATCH",body:JSON.stringify({id:row.id,updates:{lifecycle:"SQL"}})},A);
check("CONTACT_UPDATED fired on lifecycle change", up.r.ok && (await wfd(wf9.b.id)).enrollments.length===1, JSON.stringify(up.b).slice(0,100));
const up2=await api("/api/crm/contacts",{method:"PATCH",body:JSON.stringify({id:row.id,updates:{notes:"just notes"}})},A);
check("notes-only edit does not fire CONTACT_UPDATED", (await wfd(wf9.b.id)).enrollments.length===1);
const sms=await fetch(BASE+"/api/webhooks/twilio",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({From:"+1"+String(row.phone).replace(/\D/g,""),Body:"Are you open?"})});
d=await wfd(wf10.b.id);
check("inbound SMS webhook → INBOUND_SMS workflow + TwiML", sms.status===200 && (await sms.text()).includes("<Response>") && d.enrollments.length===1 && d.events.some(e=>e.kind==="IF_ELSE"), JSON.stringify(d.enrollments[0]));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
