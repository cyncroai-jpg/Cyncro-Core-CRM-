import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT;
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`C ${stamp}`,displayName:"C",email:`c+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Intro call",slug:`intro-${stamp}`,durationMinutes:30})},c);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
await page.goto(`${BASE}/#crm/calendar`,{waitUntil:"networkidle"}); await page.waitForTimeout(2000);
await page.locator(".calendarCommandBar").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await page.screenshot({path:`${OUT}/cal-toolbar.png`});
console.log("toolbar text:", (await page.locator(".calendarCommandBar").textContent()).replace(/\s+/g," "));
await page.locator(".calendarCommandBar button",{hasText:"Resources"}).first().click(); await page.waitForTimeout(600);
await page.locator(".calOcc").scrollIntoViewIfNeeded(); await page.screenshot({path:`${OUT}/cal-occ.png`});
await page.locator("#calendar-event-settings").scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await page.locator(".simpleEventManager>aside>button").first().click(); await page.waitForTimeout(300);
await page.screenshot({path:`${OUT}/cal-config.png`});
console.log("errors:",errors.length?errors:"none"); await browser.close();
