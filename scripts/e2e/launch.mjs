// Launch prep: company switcher, per-company permissions, welcome walkthrough, legal pages, signup copy.
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const aEmail=`ava+${stamp}@example.com`;
const A=(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Ava Co ${stamp}`,displayName:"Ava",email:aEmail,password:"Password123!"})})).cookie;
const suB=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Bo Co ${stamp}`,displayName:"Bo",email:`bo+${stamp}@example.com`,password:"Password123!"})}); const B=suB.cookie, bId=suB.b.tenantId;
const aId=(await api("/api/access",{},A)).b.company.id;
// Bo invites Ava into Bo Co with limited access (via Team Access save)
const inv=await api("/api/access",{method:"POST",body:JSON.stringify({email:aEmail,displayName:"Ava",role:"MEMBER",crmAccess:true,calendarAccess:false,prospectingAccess:false,manageUsers:false,canCreate:true,canEdit:false,canDelete:false,canExport:false,compensationAccess:false,invoiceAccess:false,contractAccess:false,attributionAccess:false,workAccess:true})},B);
check("Bo adds Ava to Bo Co with limited access", inv.r.ok, JSON.stringify(inv.b));
const list=(await api("/api/tenants",{},A)).b.tenants;
check("Ava belongs to 2 companies", list.length===2 && list.some(t=>t.id===bId) && list.some(t=>t.id===aId));
let acc=(await api("/api/access",{},A)).b;
check("Ava's default is still her own company as OWNER", acc.company.id===aId && acc.member.role==="OWNER" && acc.member.compensation_access===1);
check("cannot switch to a company she's not in", (await api("/api/tenants/switch",{method:"POST",body:JSON.stringify({tenantId:"nope"})},A)).r.status===403);
check("switch to Bo Co", (await api("/api/tenants/switch",{method:"POST",body:JSON.stringify({tenantId:bId})},A)).b.switched===true);
acc=(await api("/api/access",{},A)).b;
check("in Bo Co, Ava's permissions are Bo Co's (member, no commissions, no edit)", acc.company.id===bId && acc.member.role!=="OWNER" && acc.member.compensation_access===0 && acc.member.can_edit===0 && acc.member.crm_access===1 && acc.member.manage_users===0, JSON.stringify({role:acc.member.role,comp:acc.member.compensation_access,edit:acc.member.can_edit}));
check("Bo Co data is what she sees now", (await api("/api/tenants/settings",{},A)).b.company.id===bId);
check("switch back to Ava Co", (await api("/api/tenants/switch",{method:"POST",body:JSON.stringify({tenantId:aId})},A)).b.switched && (await api("/api/access",{},A)).b.company.id===aId && (await api("/api/access",{},A)).b.member.role==="OWNER");
// Bo's member list shows company-scoped flags for Ava
const bm=(await api("/api/access",{},B)).b.members.find(m=>m.email===aEmail);
check("Bo's team list shows Ava with Bo Co flags", bm && bm.compensation_access===0 && bm.can_edit===0 && bm.company_permissions===undefined, JSON.stringify(bm&&{c:bm.compensation_access,e:bm.can_edit}));
// legal pages + signup copy
const terms=await fetch(BASE+"/terms"), priv=await fetch(BASE+"/privacy");
check("terms and privacy pages load", terms.ok && priv.ok);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const anon=await browser.newContext({viewport:{width:1200,height:900}}); const lp=await anon.newPage(); lp.on("pageerror",e=>errors.push(e.message));
await lp.goto(BASE+"/terms",{waitUntil:"load"}); await lp.waitForTimeout(800);
check("terms page renders readable", (await lp.locator("h1").textContent())==="Terms of Service" && await lp.locator(".legalPage h2").count()>=8);
await lp.screenshot({path:`${OUT}/launch-terms.png`});
await lp.goto(BASE+"/privacy",{waitUntil:"load"}); await lp.waitForTimeout(600);
check("privacy page renders", (await lp.locator("h1").textContent())==="Privacy Policy");
await lp.goto(BASE+"/login",{waitUntil:"load"}); await lp.waitForTimeout(800);
await lp.locator("button",{hasText:/Create|Sign up|Start/}).first().click().catch(()=>{}); await lp.waitForTimeout(500);
check("signup shows legal line with links", await lp.locator(".loginLegal a[href='/terms']").count()===1 && await lp.locator(".loginLegal a[href='/privacy']").count()===1 && await lp.locator(".loginSub").count()===1);
await lp.screenshot({path:`${OUT}/launch-signup.png`});
// welcome modal for a brand-new owner
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:B.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm`,{waitUntil:"load"}); await page.waitForTimeout(2200);
check("welcome modal shows for a fresh owner", await page.locator(".wlCard").count()===1 && (await page.locator(".wlCard h2").textContent()).includes("set up Bo Co"), await page.locator(".wlCard h2").textContent().catch(()=>"none"));
await page.screenshot({path:`${OUT}/launch-welcome.png`});
await page.locator(".wlGrid input").first().fill(`Bo Company ${stamp}`); await page.locator(".wlGrid select").selectOption("America/Chicago"); await page.locator(".wlGrid input").nth(1).fill("(555) 010-7777");
await page.locator(".wlActions .coSave").click(); await page.waitForTimeout(1200);
check("step 2 after save; settings persisted", await page.locator(".wlSteps button").count()===4 && (await api("/api/tenants/settings",{},B)).b.settings.timezone==="America/Chicago" && (await api("/api/tenants/settings",{},B)).b.company.name===`Bo Company ${stamp}`);
await page.screenshot({path:`${OUT}/launch-welcome2.png`});
await page.locator(".wlSteps button",{hasText:"Invite your team"}).click(); await page.waitForTimeout(1500);
check("next-step button navigates and closes", page.url().includes("team-access") && await page.locator(".wlCard").count()===0, page.url());
await page.goto(`${BASE}/#crm`,{waitUntil:"load"}); await page.reload({waitUntil:"load"}); await page.waitForTimeout(2000);
check("welcome does not come back", await page.locator(".wlCard").count()===0);
check("sidebar shows the real company name", (await page.locator(".coSwitchBtn b").textContent()).startsWith("Bo Company"));
// switcher for Ava (2 companies)
const ctx2=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx2.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const p2=await ctx2.newPage(); p2.on("pageerror",e=>errors.push(e.message));
await p2.goto(`${BASE}/#crm`,{waitUntil:"load"}); await p2.waitForTimeout(2200);
await p2.locator(".wlActions .cyAiMini").click().catch(()=>{}); await p2.waitForTimeout(300);
check("switcher hints at 2 companies", (await p2.locator(".coSwitchBtn small").textContent()).includes("2 companies"));
await p2.locator(".coSwitchBtn").click(); await p2.waitForTimeout(400);
check("menu lists both with roles", await p2.locator(".coSwitchMenu li").count()===2 && (await p2.locator(".coSwitchMenu").textContent()).includes("owner") && (await p2.locator(".coSwitchMenu").textContent()).includes("Bo Company"));
await p2.screenshot({path:`${OUT}/launch-switcher.png`});
await p2.locator(".coSwitchMenu li button",{hasText:"Bo Company"}).click(); await p2.waitForTimeout(3000);
check("switching reloads into Bo Co", (await p2.locator(".coSwitchBtn b").textContent()).startsWith("Bo Company") && (await api("/api/access",{},A)).b.company.id===bId);
check("commissions tab hidden for Ava in Bo Co (no compensation access)", await p2.locator(".crmNav button",{hasText:"Commissions"}).count()===0 && await p2.locator(".crmNav button",{hasText:"Pipeline"}).count()===1);
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
