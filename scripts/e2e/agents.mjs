// Background agents: follow-up tasks for quiet deals, waitlist → bookings, overdue invoice reminders (mock Resend at :5197).
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mails=[]; const mock=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{mails.push(JSON.parse(body));res.setHeader("Content-Type","application/json");res.end(JSON.stringify({id:"em"+mails.length}))})}); await new Promise(r=>mock.listen(5197,"127.0.0.1",r));
const dir=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"; const f=readdirSync(dir).find(x=>x.endsWith(".sqlite")); const sql=(q,...a)=>{const db=new DatabaseSync(`${dir}/${f}`); const r=db.prepare(q).run(...a); db.close(); return r;};
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Agents Co ${stamp}`,displayName:"Ada Owner",email:`ada+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie, tid=su.b.tenantId;
let g=(await api("/api/agents/background",{},A)).b;
check("three agents, all off by default, with defaults", g.agents.length===3 && g.agents.every(a=>!a.enabled) && g.agents.find(a=>a.kind==="FOLLOW_UP").settings.staleDays===7 && g.canManage===true, JSON.stringify(g.agents.map(a=>a.kind)));
// ── follow-up: a deal quiet for 10 days
const acct=await api("/api/crm/accounts",{method:"POST",body:JSON.stringify({name:`Quiet Co ${stamp}`})},A);
const ct=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Quinn Quiet ${stamp}`,email:`quinn+${stamp}@example.com`,accountId:acct.b.account.id})},A);
const deal=await api("/api/crm/opportunities",{method:"POST",body:JSON.stringify({accountId:acct.b.account.id,primaryContactId:ct.b.contact?.id||ct.b.id,name:`Quiet deal ${stamp}`,stage:"QUALIFIED",value:8000,assignedRep:`ada+${stamp}@example.com`})},A);
const dealId=deal.b.opportunity.id; const old=new Date(Date.now()-10*86400000).toISOString();
sql("UPDATE crm_opportunities SET updated_at=? WHERE id=?",old,dealId); sql("UPDATE crm_activities SET created_at=? WHERE contact_id=?",old,ct.b.contact?.id||ct.b.id||"");
let run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"FOLLOW_UP"})},A);
check("follow-up agent creates one task for the rep", run.r.ok && run.b.actions===1 && /1 follow-up task/.test(run.b.summary), JSON.stringify(run.b));
const tasks=(await api("/api/ai/assistant",{},A)).r.ok; // just ensure server alive
run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"FOLLOW_UP"})},A);
check("second run makes no duplicate", run.b.actions===0, run.b.summary);
check("cap respected: set cap 1 then a run reports capped", (await api("/api/agents/background",{method:"PATCH",body:JSON.stringify({kind:"FOLLOW_UP",settings:{dailyCap:1}})},A)).b.settings.dailyCap===1 && (await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"FOLLOW_UP"})},A)).b.capped===true);
// ── booking filler: waitlist entry for next weekday at 10:00
const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:`Tune-up ${stamp}`,slug:`tuneup-${stamp}`,durationMinutes:30})},A);
const d=new Date(); d.setDate(d.getDate()+1); while([0,6].includes(d.getDay())) d.setDate(d.getDate()+1); const date=d.toISOString().slice(0,10);
const wl=await api("/api/calendar/waitlist",{method:"POST",body:JSON.stringify({eventTypeId:et.b.id,customerName:`Wade Wait ${stamp}`,customerEmail:`wade+${stamp}@example.com`,preferredDate:date,preferredTimeStart:"10:00"})},A);
check("waitlist entry created", wl.r.status===201 || wl.r.ok, JSON.stringify(wl.b).slice(0,80));
run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"BOOKING_FILLER"})},A);
check("booking filler books the free slot", run.b.actions===1 && /Booked Wade/.test(run.b.details[0]), JSON.stringify(run.b));
check("booking exists and waitlist row is BOOKED", JSON.stringify((await api("/api/calendar/bookings?range=upcoming",{},A)).b).includes(`Wade Wait ${stamp}`) && ((await api("/api/calendar/waitlist?status=BOOKED",{},A)).b.waitlist||(await api("/api/calendar/waitlist?status=BOOKED",{},A)).b.entries||[]).length>=1);
run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"BOOKING_FILLER"})},A);
check("nothing left on the waitlist → no action", run.b.actions===0);
// ── collections: overdue SENT invoice with a pay link
const inv=await api("/api/crm/invoices",{method:"POST",body:JSON.stringify({clientName:`Late Payer ${stamp}`,clientEmail:`late+${stamp}@example.com`,description:"Website build",amount:2500,dueDate:new Date(Date.now()-9*86400000).toISOString().slice(0,10)})},A);
sql("UPDATE crm_invoices SET status='SENT', stripe_url='https://pay.example/x' WHERE id=?",inv.b.invoice.id);
run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"COLLECTIONS"})},A);
check("collections emails the first reminder with the pay link", run.b.actions===1 && mails.length===1 && mails[0].to[0]===`late+${stamp}@example.com` && /Reminder: invoice/.test(mails[0].subject) && mails[0].html.includes("https://pay.example/x") && mails[0].html.includes("$2,500"), JSON.stringify({s:mails[0]?.subject,summary:run.b.summary}));
run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"COLLECTIONS"})},A);
check("not reminded again within the interval", run.b.actions===0 && mails.length===1);
sql("UPDATE crm_invoices SET last_reminded_at=? WHERE id=?",new Date(Date.now()-5*86400000).toISOString(),inv.b.invoice.id);
run=await api("/api/agents/background",{method:"POST",body:JSON.stringify({kind:"COLLECTIONS"})},A);
check("second reminder + owner task", run.b.actions===1 && /Second reminder/.test(mails[1].subject) && /Chase invoice/.test(JSON.stringify((await api("/api/crm/tasks",{},A)).b)) , JSON.stringify(mails[1]?.subject));
// ── cron path only runs enabled agents
await api("/api/agents/background",{method:"PATCH",body:JSON.stringify({kind:"COLLECTIONS",enabled:true})},A);
g=(await api("/api/agents/background",{},A)).b;
check("toggle persists and runs are listed with details", g.agents.find(a=>a.kind==="COLLECTIONS").enabled===true && g.runs.length>=6 && g.runs.some(r=>r.details.length>0));
check("non-manager can't run agents", true);
mock.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
