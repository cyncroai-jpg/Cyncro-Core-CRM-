// Agency layer: enable, bulk-create clients with snapshot, client owner accepts invite, support access, health, billing roll-up, branding.
import { chromium } from "playwright-core";
import http from "node:http";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const seen=[]; const mock=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{seen.push({method:req.method,url:req.url,form:Object.fromEntries(new URLSearchParams(body))});res.setHeader("Content-Type","application/json");
  if(req.url==="/v1/customers")return res.end(JSON.stringify({id:`cus_ag_${stamp}`}));
  if(req.url==="/v1/checkout/sessions")return res.end(JSON.stringify({url:"https://checkout.stripe.com/c/mock"}));
  if(req.url===`/v1/subscriptions/sub_ag_${stamp}`)return res.end(JSON.stringify({id:`sub_ag_${stamp}`,customer:`cus_ag_${stamp}`,status:"active",items:{data:[{id:"si_1",price:{id:"price_agency",unit_amount:9700},quantity:2}]},current_period_end:Math.floor(Date.now()/1000)+2592000,metadata:{}}));
  if(req.url==="/v1/subscription_items/si_1")return res.end(JSON.stringify({id:"si_1",quantity:Number(Object.fromEntries(new URLSearchParams(body)).quantity)}));
  res.statusCode=404;res.end(JSON.stringify({error:{message:"mock 404 "+req.url}}));});});
await new Promise(r=>mock.listen(5198,"127.0.0.1",r));
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Northwind Agency ${stamp}`,displayName:"Nora Agency",email:`nora+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie, agId=su.b.tenantId;
check("fresh company is not an agency", (await api("/api/agency",{},A)).b.isAgency===false);
check("creating clients before enabling is refused", (await api("/api/agency",{method:"POST",body:JSON.stringify({action:"create",clients:[{name:"x",ownerEmail:"x@x.com"}]})},A)).r.status===409);
// set up some things to snapshot
await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Estimate visit",slug:`estimate-${stamp}`,durationMinutes:45})},A);
await api("/api/crm/forms",{method:"POST",body:JSON.stringify({title:"Intake",description:"Tell us about the job",fields:[{id:"f1",label:"Address",type:"SHORT",required:true,options:[]}],status:"PUBLISHED"})},A);
await api("/api/crm/pipelines",{},A); // ensures default pipeline + stages exist
const en=await api("/api/agency",{method:"POST",body:JSON.stringify({action:"enable",brandName:"Northwind Growth",whiteLabel:true})},A);
check("owner enables agency mode with brand", en.b.enabled===true && en.b.settings.agency===true && en.b.settings.brandName==="Northwind Growth" && en.b.settings.whiteLabel===true, JSON.stringify(en.b).slice(0,120));
const cr=await api("/api/agency",{method:"POST",body:JSON.stringify({action:"create",snapshotFrom:"self",clients:[{name:`Acme Plumbing ${stamp}`,ownerEmail:`dana+${stamp}@example.com`,ownerName:"Dana Ortiz"},{name:`Bright Dental ${stamp}`,ownerEmail:`lee+${stamp}@example.com`,ownerName:"Lee Park"},{name:"Broken",ownerEmail:"not-an-email"}]})},A);
check("bulk create: 2 created, 1 failed with reason", cr.r.status===201 && cr.b.created.length===2 && cr.b.failed.length===1 && /valid owner email/.test(cr.b.failed[0].error), JSON.stringify(cr.b.failed));
const acme=cr.b.created[0];
check("each client got an invite link + snapshot installed", acme.inviteUrl?.includes("/login?invite=") && acme.snapshot && acme.snapshot.calendar_event_types===1 && acme.snapshot.crm_forms===1 && acme.snapshot.crm_pipelines>=1 && acme.snapshot.crm_pipeline_stages>=3, JSON.stringify(acme.snapshot));
check("Stripe quantity sync attempted only with a subscription (none yet)", !seen.some(s=>s.url.startsWith("/v1/subscription_items")));
let g=(await api("/api/agency",{},A)).b;
check("console lists 2 clients with pending owners and counts", g.isAgency && g.clients.length===2 && g.clients.every(c=>c.owner_pending===true && c.users===2) && g.clients[0].contacts===0, JSON.stringify(g.clients.map(c=>({n:c.name,p:c.owner_pending,u:c.users}))));
// agency person enters a client
const ent=await api("/api/agency",{method:"POST",body:JSON.stringify({action:"enter",tenantId:acme.tenantId})},A);
check("enter client as support", ent.b.entered===acme.tenantId && (await api("/api/access",{},A)).b.company.id===acme.tenantId && (await api("/api/access",{},A)).b.member.manage_users===1);
const snapEt=(await api("/api/calendar/event-types",{},A)).b;
check("inside the client, the snapshot event type exists with a unique slug", JSON.stringify(snapEt).includes("Estimate visit") && JSON.stringify(snapEt).includes(`estimate-${stamp}-1`));
check("client billing rolls up to the agency", (await api("/api/billing",{},A)).b.state.status==="AGENCY" && (await api("/api/billing",{},A)).b.state.writable===true);
check("client sees agency branding (white label)", (await api("/api/tenants/settings",{},A)).b.branding.brandName==="Northwind Growth" && (await api("/api/tenants/settings",{},A)).b.branding.whiteLabel===true);
await api("/api/tenants/switch",{method:"POST",body:JSON.stringify({tenantId:agId})},A);
check("cannot enter a company that isn't a client", (await api("/api/agency",{method:"POST",body:JSON.stringify({action:"enter",tenantId:"nope"})},A)).r.status===404);
// client owner accepts invite and signs in
const tok=acme.inviteUrl.split("invite=")[1];
check("invite token validates", (await api(`/api/auth/invite?token=${tok}`)).r.ok);
const acc=await api("/api/auth/invite",{method:"PATCH",body:JSON.stringify({token:tok,password:"Password123!",confirmPassword:"Password123!"})});
check("client owner sets password", acc.r.ok, JSON.stringify(acc.b).slice(0,100));
const li=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:`dana+${stamp}@example.com`,password:"Password123!"})});
check("client owner signs into their own company as OWNER", li.r.ok && (await api("/api/access",{},li.cookie)).b.company.id===acme.tenantId && (await api("/api/access",{},li.cookie)).b.member.role==="OWNER");
check("client owner can't see the agency console", (await api("/api/agency",{},li.cookie)).b.isAgency===false);
check("other agency's client is invisible to this client", (await api("/api/agency",{method:"POST",body:JSON.stringify({action:"enable"})},li.cookie)).r.ok && (await api("/api/agency",{},li.cookie)).b.clients.length===0);
g=(await api("/api/agency",{},A)).b;
check("console shows Acme owner no longer pending", g.clients.find(c=>c.id===acme.tenantId).owner_pending===false);
// agency checkout uses quantity = client count; after a sub exists, adding a client bumps quantity
const co=await api("/api/billing",{method:"POST",body:JSON.stringify({action:"checkout",plan:"agency"})},A);
check("agency checkout: agency price × 2 clients", co.r.ok && seen.find(s=>s.url==="/v1/checkout/sessions")?.form["line_items[0][price]"]==="price_agency" && seen.find(s=>s.url==="/v1/checkout/sessions")?.form["line_items[0][quantity]"]==="2", JSON.stringify(seen.find(s=>s.url==="/v1/checkout/sessions")?.form));
// simulate the webhook-synced subscription row directly, then add a client
const {DatabaseSync}=await import("node:sqlite"); const {readdirSync}=await import("node:fs"); const dir=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"; const f=readdirSync(dir).find(x=>x.endsWith(".sqlite")); const db=new DatabaseSync(`${dir}/${f}`);
db.prepare("INSERT INTO tenant_subscriptions (id,tenant_id,stripe_subscription_id,plan,status,amount_cents,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(`sub_row_${stamp}`,agId,`sub_ag_${stamp}`,"agency","ACTIVE",9700,new Date().toISOString(),new Date().toISOString()); db.close();
await api("/api/agency",{method:"POST",body:JSON.stringify({action:"create",clients:[{name:`Third Co ${stamp}`,ownerEmail:`third+${stamp}@example.com`}]})},A);
const upd=seen.find(s=>s.url==="/v1/subscription_items/si_1");
check("adding a client updates Stripe quantity to 3", upd && upd.form.quantity==="3", JSON.stringify(upd?.form));
// push snapshot to selected clients
const ps=await api("/api/agency",{method:"POST",body:JSON.stringify({action:"snapshot",to:[acme.tenantId]})},A);
check("push snapshot to a client again adds copies", ps.r.ok && ps.b.applied[acme.tenantId]?.calendar_event_types===1 && ps.b.items.crm_forms===1, JSON.stringify(ps.b).slice(0,160));
// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm`,{waitUntil:"load"}); await page.waitForTimeout(2000); await page.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{});
check("Agency tab in nav", await page.locator(".crmNav button",{hasText:"Agency"}).count()===1);
await page.locator(".crmNav button",{hasText:"Agency"}).click(); await page.waitForTimeout(1800);
check("console renders 3 clients + totals", await page.locator(".agRow").count()===3 && (await page.locator(".agHead h2").textContent()).includes("3 client companies") && (await page.locator(".agTotals").textContent()).includes("invites pending"));
await page.screenshot({path:`${OUT}/agency-console.png`,fullPage:true});
await page.locator(".agCreateGrid textarea").fill(`Fourth Co ${stamp}, fourth+${stamp}@example.com, Four Owner`);
await page.locator(".agCreateSide .coSave").click(); await page.waitForTimeout(2500);
check("UI bulk create shows invite link + row count 4", await page.locator(".agResult").count()===1 && (await page.locator(".agResult").textContent()).includes("items installed") && await page.locator(".agRow").count()===4);
await page.locator(".agRow",{hasText:"Bright Dental"}).locator("button",{hasText:"Open"}).click(); await page.waitForTimeout(3000);
check("Open switches into the client with its name in the sidebar", (await page.locator(".coSwitchBtn b").textContent()).includes("Bright Dental"));
check("white label: client header shows agency brand word", (await page.locator("header .logo").textContent()).includes("Northwind Growth"));
await page.screenshot({path:`${OUT}/agency-client.png`});
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); mock.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
