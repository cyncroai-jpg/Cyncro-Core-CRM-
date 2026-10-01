// Billing through a mock Stripe (STRIPE_API_BASE=http://127.0.0.1:5198, STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/STRIPE_PRICE_* set in .dev.vars).
import { chromium } from "playwright-core";
import http from "node:http";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const seen=[]; const CUS=`cus_${stamp}`, SUB=`sub_${stamp}`;
let subState={id:SUB,customer:CUS,status:"active",cancel_at_period_end:false,current_period_end:Math.floor(Date.now()/1000)+30*86400,items:{data:[{price:{id:"price_growth",unit_amount:14900}}]},metadata:{}};
const mock=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{seen.push({method:req.method,url:req.url,auth:req.headers.authorization,form:Object.fromEntries(new URLSearchParams(body))});
  res.setHeader("Content-Type","application/json");
  if(req.url==="/v1/customers")return res.end(JSON.stringify({id:CUS}));
  if(req.url==="/v1/checkout/sessions")return res.end(JSON.stringify({id:"cs_1",url:"https://checkout.stripe.com/c/pay/cs_test_mock"}));
  if(req.url==="/v1/billing_portal/sessions")return res.end(JSON.stringify({url:"https://billing.stripe.com/p/session/test_mock"}));
  if(req.url===`/v1/subscriptions/${SUB}`)return res.end(JSON.stringify(subState));
  res.statusCode=404; res.end(JSON.stringify({error:{message:"mock: unknown "+req.url}}));});});
await new Promise(r=>mock.listen(5198,"127.0.0.1",r));
const sign=(payload)=>{const t=Math.floor(Date.now()/1000);return `t=${t},v1=${createHmac("sha256","whsec_mock").update(`${t}.${payload}`).digest("hex")}`};
const hook=async(event,sig)=>{const body=JSON.stringify(event);const r=await fetch(BASE+"/api/webhooks/stripe",{method:"POST",headers:{"Content-Type":"application/json","stripe-signature":sig===undefined?sign(body):sig},body});return{r,b:await r.json().catch(()=>null)}};

const owner=`bill+${stamp}@example.com`;
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Bill ${stamp}`,displayName:"Bill Owner",email:owner,password:"Password123!"})});
check("signup ok", su.r.status===201, JSON.stringify(su.b).slice(0,80)); const A=su.cookie; const tenantId=su.b.tenantId;
let g=(await api("/api/billing",{},A)).b;
check("new company: 14-day trial, Stripe connected, 3 plans", g.state.status==="TRIALING" && g.state.daysLeft===14 && g.state.configured===true && g.state.pricesConfigured===true && g.plans.length===3 && g.state.seats===3 && g.state.seatsUsed===1 && g.state.writable===true, JSON.stringify(g.state));
check("bad plan rejected", (await api("/api/billing",{method:"POST",body:JSON.stringify({action:"checkout",plan:"platinum"})},A)).r.status===400);
check("legacy plan name rejected as a purchase", (await api("/api/billing",{method:"POST",body:JSON.stringify({action:"checkout",plan:"pro"})},A)).r.status===400);
check("portal before any customer → honest error", (await api("/api/billing",{method:"POST",body:JSON.stringify({action:"portal"})},A)).r.status===409);
const co=await api("/api/billing",{method:"POST",body:JSON.stringify({action:"checkout",plan:"growth"})},A);
check("checkout returns Stripe URL", co.r.ok && co.b.url?.startsWith("https://checkout.stripe.com/"), JSON.stringify(co.b));
const cust=seen.find(s=>s.url==="/v1/customers"), cs=seen.find(s=>s.url==="/v1/checkout/sessions");
check("customer created with tenant metadata + secret used", cust?.form["metadata[tenant_id]"]===tenantId && cust.auth==="Bearer sk_test_mock" && cust.form.email===owner);
check("checkout uses the plan's price, subscription mode, tenant metadata", cs?.form.mode==="subscription" && cs.form["line_items[0][price]"]==="price_growth" && cs.form.customer===CUS && cs.form["subscription_data[metadata][tenant_id]"]===tenantId && cs.form.success_url.includes("billing=success"), JSON.stringify(cs?.form));
check("portal after customer exists", (await api("/api/billing",{method:"POST",body:JSON.stringify({action:"portal"})},A)).b.url?.startsWith("https://billing.stripe.com/"));
// webhook
check("unsigned webhook rejected", (await hook({id:"evt_0",type:"ping",data:{object:{}}},"")).r.status===400);
check("forged signature rejected", (await hook({id:"evt_0",type:"ping",data:{object:{}}},`t=${Math.floor(Date.now()/1000)},v1=deadbeef`)).r.status===400);
const old=`t=${Math.floor(Date.now()/1000)-900},v1=`+createHmac("sha256","whsec_mock").update(`${Math.floor(Date.now()/1000)-900}.{}`).digest("hex");
check("stale signature rejected", (await fetch(BASE+"/api/webhooks/stripe",{method:"POST",headers:{"stripe-signature":old},body:"{}"})).status===400);
const h1=await hook({id:`evt_co_${stamp}`,type:"checkout.session.completed",data:{object:{id:"cs_1",customer:CUS,subscription:SUB,metadata:{tenant_id:tenantId}}}});
check("checkout.completed pulls the subscription", h1.r.ok && /synced/.test(h1.b.outcome), JSON.stringify(h1.b));
g=(await api("/api/billing",{},A)).b;
check("now ACTIVE on Growth with 10 seats", g.state.status==="ACTIVE" && g.state.plan==="growth" && g.state.seats===10 && g.state.hasCustomer && g.state.periodEnd, JSON.stringify(g.state));
check("replayed event is a no-op", (await hook({id:`evt_co_${stamp}`,type:"checkout.session.completed",data:{object:{}}})).b.duplicate===true);
await hook({id:`evt_up_${stamp}`,type:"customer.subscription.updated",data:{object:{...subState,items:{data:[{price:{id:"price_scale",unit_amount:39900}}]},cancel_at_period_end:true}}});
g=(await api("/api/billing",{},A)).b;
check("subscription.updated → Scale, 25 seats, cancel flag", g.state.plan==="scale" && g.state.seats===25 && g.state.cancelAtPeriodEnd===true, JSON.stringify(g.state));
await hook({id:`evt_pf_${stamp}`,type:"invoice.payment_failed",data:{object:{id:"in_1",subscription:SUB}}});
check("payment_failed → PAST_DUE but still writable", (g=(await api("/api/billing",{},A)).b).state.status==="PAST_DUE" && g.state.writable===true);
await hook({id:`evt_pd_${stamp}`,type:"invoice.paid",data:{object:{id:"in_2",subscription:SUB}}});
check("invoice.paid → ACTIVE again", (await api("/api/billing",{},A)).b.state.status==="ACTIVE");
// seats on starter: downgrade via deleted
await hook({id:`evt_del_${stamp}`,type:"customer.subscription.deleted",data:{object:{...subState,status:"canceled"}}});
g=(await api("/api/billing",{},A)).b;
check("subscription.deleted → back to Starter seats, trial still running", g.state.plan==="starter" && g.state.seats===3 && g.state.status==="TRIALING", JSON.stringify(g.state));
const inv=(n)=>api("/api/tenants",{method:"POST",body:JSON.stringify({action:"invite",tenantId,inviteEmail:`mate${n}+${stamp}@example.com`,inviteRole:"USER",inviteDisplayName:`Mate ${n}`})},A);
check("2nd and 3rd seat fill", (await inv(1)).r.ok && (await inv(2)).r.ok);
const full=await inv(3);
check("4th seat blocked with 402 + upgrade hint", full.r.status===402 && /Upgrade/.test(full.b.error), JSON.stringify(full.b));
check("seatsUsed reflects members", (await api("/api/billing",{},A)).b.state.seatsUsed===3);
// expiry gate: push trial into the past directly in local D1
const dir=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"; const file=readdirSync(dir).find(f=>f.endsWith(".sqlite")); const db=new DatabaseSync(`${dir}/${file}`);
db.prepare("UPDATE tenants SET trial_ends_at=? WHERE id=?").run(new Date(Date.now()-86400000).toISOString(),tenantId); db.close();
g=(await api("/api/billing",{},A)).b;
check("trial over, subscription gone: locked (CANCELLED or EXPIRED)", ["CANCELLED","EXPIRED"].includes(g.state.status) && g.state.writable===false, JSON.stringify(g.state));
const blocked=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:"Nope",email:`n+${stamp}@example.com`})},A);
check("writes return 402 with a clear message", blocked.r.status===402 && /has ended/.test(blocked.b.error), JSON.stringify(blocked.b));
check("reads still work", (await api("/api/crm/contacts",{},A)).r.ok);
check("billing checkout still allowed while expired", (await api("/api/billing",{method:"POST",body:JSON.stringify({action:"checkout",plan:"starter"})},A)).r.ok);
// another company unaffected
const db2=new DatabaseSync(`${dir}/${file}`); db2.prepare("UPDATE tenants SET trial_ends_at=? WHERE id=?").run(new Date(Date.now()-1000).toISOString(),"__none__"); db2.close();
const su2=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Fresh ${stamp}`,displayName:"Fresh",email:`fresh+${stamp}@example.com`,password:"Password123!"})});
check("other company still trialing and writable", (await api("/api/billing",{},su2.cookie)).b.state.writable===true);
// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message));
await page.goto(`${BASE}/#crm/team-access`,{waitUntil:"networkidle"}); await page.waitForTimeout(1800);
check("billing panel shows expired state + 3 plans", await page.locator(".billingPanel").count()===1 && (await page.locator(".billingPanel h2").first().textContent()).includes("has ended") && await page.locator(".billPlan").count()===3 && await page.locator(".billNote.danger").count()===1);
await page.screenshot({path:`${OUT}/bill-expired.png`,fullPage:true});
const ctx2=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx2.addCookies([{name:"cyncro_session",value:su2.cookie.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const p2=await ctx2.newPage(); p2.on("pageerror",e=>errors.push(e.message)); await p2.goto(`${BASE}/#crm/team-access`,{waitUntil:"networkidle"}); await p2.waitForTimeout(1800);
check("fresh company sees trial countdown and Choose buttons", (await p2.locator(".billingPanel h2").first().textContent()).includes("14 days left") && await p2.locator(".billPlan .coSave").count()===3);
await p2.screenshot({path:`${OUT}/bill-trial.png`});
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); mock.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
