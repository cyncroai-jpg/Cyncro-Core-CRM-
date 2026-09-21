import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const withEt=process.env.NO_ET!=="1";
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`MB ${stamp}`,displayName:"MB",email:`mb+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; if(withEt) await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Consult",slug:`consult-${stamp}`,durationMinutes:30})},c);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:950}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); const net=[]; page.on("response",r=>{if(r.url().includes("/api/calendar/bookings")&&r.request().method()==="POST")net.push(r.status())});
await page.goto(`${BASE}/#admin`,{waitUntil:"networkidle"});await page.waitForTimeout(2000);
await page.locator(".calendarCommandBar button",{hasText:/Book appointment/}).click();await page.waitForTimeout(500);
const m=page.locator(".bookingmodal");
console.log("modal open:",await m.count(),"event options:",await m.locator("select").first().locator("option").count());
const opts=await m.locator("select").first().locator("option").allTextContents(); console.log("options:",opts);
if(opts.length<=1){console.log("no event types → hint shown:",await m.locator(".modalHint").count());await m.locator(".modalHint button").click();await page.waitForTimeout(1200);console.log("after quick-create, options:",await m.locator("select").first().locator("option").count(),"selected:",await m.locator("select").first().inputValue());}
const inputs=m.locator(".crmForm input");
await m.locator("label",{hasText:/^Customer name/}).locator("input").fill("Manual Test");
await m.locator("label",{hasText:/^Email/}).locator("input").fill(`mt+${stamp}@example.com`);
const dt=await m.locator('input[type="datetime-local"]').inputValue(); console.log("datetime prefilled:",dt);
const btns=await m.locator("button").allTextContents(); console.log("buttons:",btns);
await m.locator("button",{hasText:/Create|Book|Save/}).last().click().catch(e=>console.log("click err",e.message.slice(0,80)));
await page.waitForTimeout(1500);
console.log("POST statuses:",net,"modal still open:",await page.locator(".bookingmodal").count());
console.log("notice:",await page.locator(".calToast span").textContent().catch(()=>"(none)"));
await page.screenshot({path:process.env.OUT+"/manual-book.png"});
console.log("errors:",errors.length?errors.slice(0,4):"none");await browser.close();
