import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
async function api(p,init={}){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json"}});return{r,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Nav ${stamp}`,displayName:"Nav",email:`nav+${stamp}@example.com`,password:"Password123!"})});
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:950}});
await ctx.addCookies([{name:"cyncro_session",value:s.cookie.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
const out=[]; const ok=(c,l,extra="")=>out.push(`${c?"PASS":"FAIL"} ${l}${extra?" · "+extra:""}`);
const hash=()=>new URL(page.url()).hash;
// Finance: sidebar Inventory → back → Command
await page.goto(`${BASE}/#finance`,{waitUntil:"networkidle"});await page.waitForTimeout(1500);
await page.locator("aside nav button",{hasText:/Inventory/}).first().click();await page.waitForTimeout(600);
ok(hash()==="#finance/inventory","finance: Inventory click updates URL",hash());
await page.locator("aside nav button",{hasText:/Lenders/}).first().click();await page.waitForTimeout(600);
ok(hash()==="#finance/lenders","finance: Lenders click updates URL",hash());
await page.goBack();await page.waitForTimeout(600);
ok(hash()==="#finance/inventory"&&(await page.locator("text=/inventory/i").count())>0,"finance: back returns to Inventory",hash());
await page.goBack();await page.waitForTimeout(600);
ok(hash()==="#finance"&&(await page.locator(".fxCC").count())>0,"finance: back again returns to Command",hash());
await page.goForward();await page.waitForTimeout(600);
ok(hash()==="#finance/inventory","finance: forward works",hash());
// Deep link
await page.goto(`${BASE}/#finance/deal-queue`,{waitUntil:"networkidle"});await page.waitForTimeout(1200);
ok((await page.locator("text=/deal queue/i").count())>0&&(await page.locator(".fxCC").count())===0,"finance: deep link opens Deal Queue");
// Dispatch
await page.goto(`${BASE}/#dispatch`,{waitUntil:"networkidle"});await page.waitForTimeout(1500);
await page.locator(".dxCCDock button",{hasText:/Jobs/}).first().click();await page.waitForTimeout(600);
ok(hash()==="#dispatch/jobs","dispatch: dock Jobs updates URL",hash());
await page.goBack();await page.waitForTimeout(600);
ok(hash()==="#dispatch"&&(await page.locator(".dxCC").count())>0,"dispatch: back returns to Dashboard",hash());
// CRM
await page.goto(`${BASE}/#crm`,{waitUntil:"networkidle"});await page.waitForTimeout(1500);
await page.locator(".crmNav button",{hasText:/Contacts/}).first().click().catch(()=>{});await page.waitForTimeout(600);
ok(hash()==="#crm/contacts","crm: Contacts updates URL",hash());
await page.goBack();await page.waitForTimeout(600);
ok(hash()==="#crm","crm: back returns to Overview",hash());
// Products switcher
await page.locator(".productSwitcherBtn",{hasText:/Products/}).click();await page.waitForTimeout(600);
ok(hash()==="#products"&&(await page.locator("text=/all products|choose a product|cyncro platform/i").count())>0,"products switcher in history",hash());
await page.goBack();await page.waitForTimeout(600);
ok(hash()==="#crm"&&(await page.locator(".crmNav").count())>0,"back from switcher returns to CRM",hash());
console.log(out.join("\n"));console.log("errors:",errors.length?errors.slice(0,4):"none");await browser.close();
