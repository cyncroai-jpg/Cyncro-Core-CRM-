// Per-company app switches: settings, product switcher, product gate, settings panel.
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`HVAC Co ${stamp}`,displayName:"Hal",email:`hal+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
check("all apps on by default", (await api("/api/tenants/settings",{},A)).b.settings.apps.length===7);
const st=await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{apps:["dispatch","growth","bogus"]}})},A);
check("owner limits apps; unknown ids dropped", JSON.stringify(st.b.settings.apps)===JSON.stringify(["dispatch","growth"]), JSON.stringify(st.b.settings.apps));
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#products`,{waitUntil:"load"}); await page.waitForTimeout(1800);
const body=await page.textContent("body");
check("switcher page renders", body.includes("Cyncro Dispatch") && body.includes("Cyncro Dispute"));
await page.goto(`${BASE}/#dispute`,{waitUntil:"load"}); await page.waitForTimeout(1800);
check("dispute is gated when switched off", await page.locator(".productGateShell").count()===1 && (await page.textContent(".productGateLock")).includes("Switched off"));
await page.screenshot({path:`${OUT}/apps-gate.png`});
await page.goto(`${BASE}/#dispatch`,{waitUntil:"load"}); await page.waitForTimeout(2000);
check("dispatch still opens", await page.locator(".productGateShell").count()===0);
await page.goto(`${BASE}/#crm/team-access`,{waitUntil:"load"}); await page.waitForTimeout(2000);
check("apps toggles in company settings: 2 on", await page.locator(".coApp").count()===7 && await page.locator(".coApp.on").count()===2);
await page.locator(".coApp",{hasText:"Dispute"}).locator("input").check(); await page.locator(".coSettings .coSave").click(); await page.waitForTimeout(1000);
check("toggle saves", (await api("/api/tenants/settings",{},A)).b.settings.apps.includes("dispute"));
await page.goto(`${BASE}/#dispute`,{waitUntil:"load"}); await page.waitForTimeout(2000);
check("dispute opens after enabling", await page.locator(".productGateShell").count()===0);
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
