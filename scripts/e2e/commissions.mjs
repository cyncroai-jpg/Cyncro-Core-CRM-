import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const month=new Date().toISOString().slice(0,7);
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Comm ${stamp}`,displayName:"Casey Owner",email:`comm+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie, tenantId=su.b.tenantId;
const other=(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Other ${stamp}`,displayName:"Other",email:`other+${stamp}@example.com`,password:"Password123!"})})).cookie;
const m1=`jordan+${stamp}@example.com`, m2=`riley+${stamp}@example.com`;
for(const [e,n] of [[m1,"Jordan Rep"],[m2,"Riley Rep"]]) check(`invite ${n}`,(await api("/api/tenants",{method:"POST",body:JSON.stringify({action:"invite",tenantId,inviteEmail:e,inviteRole:"USER",inviteDisplayName:n})},A)).r.ok);
let g=(await api(`/api/crm/commissions?month=${month}`,{},A)).b;
check("desk lists 3 people with default 20% of profit", g.canManage===true && g.people.length===3 && g.people.every(p=>p.plan.rate===20&&p.plan.basis==="PROFIT"&&!p.plan.set), JSON.stringify(g.people.map(p=>p.display_name)));
check("members endpoint for pickers", (await api("/api/crm/commissions?members=1",{},A)).b.members.length===3);
// plans: any rate, any basis
check("set Jordan to 35% of revenue (no 20–30 cap)", (await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"plan",memberEmail:m1,rate:35,basis:"REVENUE"})},A)).b.rate===35);
check("set Riley to 12.5% of profit", (await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"plan",memberEmail:m2,rate:12.5})},A)).b.rate===12.5);
check("cannot assign a plan to someone outside the company", (await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"plan",memberEmail:`other+${stamp}@example.com`,rate:50})},A)).r.status===400);
// entries
const e1=await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"entry",month,memberEmail:m1,label:"Acme automation build",revenue:10000,cost:4000})},A);
check("entry uses Jordan's plan: 35% of $10,000 revenue = $3,500", e1.r.status===201 && e1.b.payout_cents===350000 && e1.b.basis==="REVENUE", JSON.stringify(e1.b));
const e2=await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"entry",month,memberEmail:m2,label:"Beta retainer",revenue:6000,cost:1000})},A);
check("entry uses Riley's plan: 12.5% of $5,000 profit = $625", e2.b.payout_cents===62500, JSON.stringify(e2.b));
const e3=await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"entry",month,memberEmail:m2,label:"One-off bonus deal",revenue:2000,cost:0,rate:50,basis:"PROFIT"})},A);
check("per-entry override rate 50%", e3.b.payout_cents===100000);
check("entry needs a label", (await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"entry",month,memberEmail:m2,revenue:1})},A)).r.status===400);
g=(await api(`/api/crm/commissions?month=${month}`,{},A)).b;
const riley=g.people.find(p=>p.email===m2), jordan=g.people.find(p=>p.email===m1);
check("month totals per person", riley.month.revenue_cents===800000 && riley.month.profit_cents===700000 && riley.month.payout_cents===162500 && riley.month.pending_cents===162500 && jordan.month.payout_cents===350000, JSON.stringify(riley.month));
check("history has this month", g.history.length===1 && g.history[0].month===month && Number(g.history[0].payout_cents)===512500 && Number(g.history[0].profit_cents)===1300000, JSON.stringify(g.history));
// edit + status
const p1=await api("/api/crm/commissions",{method:"PATCH",body:JSON.stringify({id:e1.b.id,updates:{cost:5000,rate:30,basis:"PROFIT"}})},A);
check("editing recomputes payout: 30% of $5,000 profit", p1.b.payout_cents===150000, JSON.stringify(p1.b));
check("approve one", (await api("/api/crm/commissions",{method:"PATCH",body:JSON.stringify({id:e2.b.id,updates:{status:"APPROVED"}})},A)).b.status==="APPROVED");
check("clawback zeroes payout", (await api("/api/crm/commissions",{method:"PATCH",body:JSON.stringify({id:e3.b.id,updates:{status:"CLAWBACK"}})},A)).b.payout_cents===0);
check("reassign entry to another teammate", (await api("/api/crm/commissions",{method:"PATCH",body:JSON.stringify({id:e3.b.id,updates:{memberEmail:m1}})},A)).b.saved===true);
check("pay the month for Riley", (await api("/api/crm/commissions",{method:"PATCH",body:JSON.stringify({action:"payMonth",month,memberEmail:m2})},A)).b.paid===1);
g=(await api(`/api/crm/commissions?month=${month}`,{},A)).b;
check("Riley fully paid, Jordan still owed", g.people.find(p=>p.email===m2).month.pending_cents===0 && g.people.find(p=>p.email===m1).month.pending_cents===150000 && g.entries.find(e=>e.id===e2.b.id).paid_at);
check("previous month is empty", (await api(`/api/crm/commissions?month=2020-01`,{},A)).b.entries.length===0);
// deals → commissions
const acct=await api("/api/crm/accounts",{method:"POST",body:JSON.stringify({name:`Acme ${stamp}`,category:"Client"})},A);
const deal=await api("/api/crm/opportunities",{method:"POST",body:JSON.stringify({accountId:acct.b.account.id,name:"Acme automation",stage:"CLOSED WON",value:12000,assignedRep:m2,commissionRate:45,collected:12000})},A);
check("deal accepts 45% rate and a real teammate", deal.r.status===201, JSON.stringify(deal.b).slice(0,80));
check("service kind persists on deals", (await api("/api/crm/opportunities",{method:"PATCH",body:JSON.stringify({id:deal.b.opportunity.id,updates:{serviceKind:"WEBSITE"}})},A)).r.ok);
g=(await api(`/api/crm/commissions?month=${month}`,{},A)).b;
const dl=g.deals.find(d=>d.id===deal.b.opportunity.id);
check("closed deal shows on desk with rep, rate, service", dl && dl.assigned_rep===m2 && dl.commission_rate_bps===4500 && dl.service_kind==="WEBSITE" && dl.logged===0, JSON.stringify(dl));
const le=await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"entry",month,memberEmail:m2,label:"Acme automation · Acme",dealId:deal.b.opportunity.id,revenue:12000,cost:0,rate:45})},A);
check("deal logged as entry at 45%: $5,400", le.b.payout_cents===540000 && (await api(`/api/crm/commissions?month=${month}`,{},A)).b.deals.find(d=>d.id===deal.b.opportunity.id).logged===1);
check("deal from another company rejected", (await api("/api/crm/commissions",{method:"POST",body:JSON.stringify({action:"entry",month,memberEmail:`other+${stamp}@example.com`,label:"x",dealId:deal.b.opportunity.id,revenue:1})},other)).r.status===404);
check("other company sees none of it", (await api(`/api/crm/commissions?month=${month}`,{},other)).b.entries.length===0);
check("delete entry", (await api(`/api/crm/commissions?id=${e3.b.id}`,{method:"DELETE"},A)).b.deleted===1);
// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm`,{waitUntil:"networkidle"}); await page.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{}); await page.waitForTimeout(1500);
check("Commissions is its own nav item", await page.locator(".crmNav button",{hasText:"Commissions"}).count()===1 && await page.locator(".crmNav button",{hasText:"Compensation"}).count()===0);
await page.locator(".crmNav button",{hasText:"Commissions"}).click(); await page.waitForTimeout(1800);
check("desk renders: KPIs, 3 people, entries, deals", page.url().includes("#crm/commissions") && await page.locator(".cmKpis article").count()===4 && await page.locator(".cmPerson").count()===3 && await page.locator(".cmLedger .cmRow").count()===3 && await page.locator(".cmDeals .cmRow").count()===1, page.url());
check("KPI profit matches", (await page.locator(".cmKpis article.hi b").textContent()).replace(/\D/g,"")==="22000");
// add an entry through the UI
await page.locator(".cmAddGrid select").first().selectOption(m1);
await page.locator(".cmAddGrid label.wide input").first().fill("Website for Globex");
await page.locator(".cmAddGrid input[type=number]").nth(0).fill("4000"); await page.locator(".cmAddGrid input[type=number]").nth(1).fill("1500");
check("live preview uses Jordan's 35% of revenue", (await page.locator(".cmPreview b").textContent()).includes("1,400"));
await page.locator(".cmAddBtn").click(); await page.waitForTimeout(1200);
check("entry added from UI", await page.locator(".cmLedger .cmRow").count()===4 && (await page.locator(".cmLedger").textContent()).includes("Website for Globex"));
// change a plan inline
const jordanCard=page.locator(".cmPerson",{hasText:"Jordan Rep"});
await jordanCard.locator(".cmPct input").fill("40"); await jordanCard.locator(".cmPlan .coSave").click(); await page.waitForTimeout(900);
check("plan changed from the card", (await api("/api/crm/commissions",{},A)).b.people.find(p=>p.email===m1).plan.rate===40);
await page.screenshot({path:`${OUT}/comm-desk.png`,fullPage:true});
// deal modal rep picker
await page.locator(".crmNav button",{hasText:"Pipeline"}).click(); await page.waitForTimeout(1500);
await page.locator("button",{hasText:"Add opportunity"}).first().click(); await page.waitForTimeout(800);
const repSel=page.locator("label",{hasText:"Assigned rep"}).locator("select");
check("new-deal rep is a teammate picker, commission has no 20–30 cap", await repSel.count()===1 && await repSel.locator("option").count()===4 && (await page.locator("label",{hasText:"Commission %"}).locator("input").getAttribute("max"))==="100" && (await page.locator("label",{hasText:"Commission %"}).locator("input").getAttribute("min"))==="0");
await page.screenshot({path:`${OUT}/comm-deal.png`});
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
