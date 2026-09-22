import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`SC ${stamp}`,displayName:"SC",email:`sc+${stamp}@example.com`,password:"Password123!"})}); const c=s.cookie; check("signup",s.r.ok);
const cust=await api("/api/dispatch/customers",{method:"POST",body:JSON.stringify({name:`Sched Cust ${stamp}`})},c);
const tech=await api("/api/dispatch/technicians",{method:"POST",body:JSON.stringify({name:"Test Technician",hourlyRate:50})},c);
const at=new Date(); at.setHours(10,0,0,0); if(at<new Date()) at.setDate(at.getDate()+1);
const job=await api("/api/dispatch/jobs",{method:"POST",body:JSON.stringify({customerId:cust.b.id,serviceType:"Panel upgrade",address:"5 Oak St, Tampa, FL",scheduledAt:at.toISOString(),revenue:900,estimatedMinutes:120,assignedTechId:tech.b.id})},c);
check("job created (google not connected)", job.r.status===201 && job.b.google==="not_connected", JSON.stringify(job.b));
const g=await api("/api/dispatch/google-sync",{},c); check("google status: not connected + connect url", g.b.connected===false && g.b.connectUrl.includes("google-calendar/connect"));
check("sync without connection is a clear 409", (await api("/api/dispatch/google-sync",{method:"POST",body:"{}"},c)).r.status===409);

const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
await page.goto(`${BASE}/#dispatch/schedule`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("schedule renders", await page.locator(".dxSch").count()===1);
if(at.getDay()===0 && at.getDate()!==new Date().getDate()){ await page.locator(".dxSchNav button[aria-label=Next]").click(); await page.waitForTimeout(400); }
const block=page.locator(".dxSchBlock",{hasText:"Sched Cust"});
check("job block on the grid", await block.count()===1);
check("google panel offers connect", await page.locator(".dxSchGoogle a.dxSchConnect").count()===1);
await block.click(); await page.waitForTimeout(300);
check("detail panel shows the job", (await page.locator(".dxSchDetail .fxCCHead b").textContent()).includes("Sched Cust"));
// reschedule via panel to 14:30 same day
const p=(n)=>String(n).padStart(2,"0"); const day=`${at.getFullYear()}-${p(at.getMonth()+1)}-${p(at.getDate())}`;
await page.locator(".dxSchField input[type=datetime-local]").fill(`${day}T14:30`); await page.locator(".dxSchActions button.fxCCPrimary").click(); await page.waitForTimeout(1200);
let j=(await api(`/api/dispatch/jobs?id=${job.b.id}`,{},c)).b.job; check("panel reschedule persisted 14:30", new Date(j.scheduled_at).getHours()===14 && new Date(j.scheduled_at).getMinutes()===30, j.scheduled_at);
// drag to another day column at ~9:00 (3 hours after 6am over a 14h grid => 3/14 of height)
const cols=page.locator(".dxSchCol"); const n=await cols.count(); const srcIdx=at.getDay(); const dstIdx=(srcIdx+1)%7;
if(n===7){
  const dst=cols.nth(dstIdx); const box=await dst.boundingBox(); const b2=await block.boundingBox();
  await page.mouse.move(b2.x+b2.width/2,b2.y+8); await page.mouse.down(); await page.mouse.move(box.x+box.width/2,box.y+box.height*(3/14),{steps:12}); await page.mouse.up(); await page.waitForTimeout(1200);
  j=(await api(`/api/dispatch/jobs?id=${job.b.id}`,{},c)).b.job; const d=new Date(j.scheduled_at);
  check("drag moved job to next day ~9:00", d.getDay()===dstIdx && d.getHours()===9, j.scheduled_at);
}
// assign/status via panel selects
await page.locator(".dxSchBlock",{hasText:"Sched Cust"}).click(); await page.waitForTimeout(300);
await page.locator(".dxSchField select").nth(1).selectOption("IN PROGRESS"); await page.waitForTimeout(1000);
j=(await api(`/api/dispatch/jobs?id=${job.b.id}`,{},c)).b.job; check("status select persisted", j.status==="IN PROGRESS");
await page.screenshot({path:`${OUT}/dx-schedule.png`,fullPage:true});

// Time clock
await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:job.b.id,status:"ASSIGNED"})},c);
await page.goto(`${BASE}/#dispatch/time-clock`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("time clock renders", await page.locator(".dxClk").count()===1);
await page.locator(".dxClkForm select").nth(0).selectOption(tech.b.id); await page.locator(".dxClkForm select").nth(1).selectOption(job.b.id); await page.waitForTimeout(200);
await page.locator("button.dxClkBig",{hasText:"Clock in"}).click(); await page.waitForTimeout(1500);
check("live timer shows", await page.locator(".dxClkLive .dxClkTimer").count()===1);
check("board card for the tech", (await page.locator(".dxClkCards article").first().textContent()).includes("Test Technician"));
j=(await api(`/api/dispatch/jobs?id=${job.b.id}`,{},c)).b.job; check("clock in moved job to IN PROGRESS", j.status==="IN PROGRESS");
await page.waitForTimeout(2100);
check("timer is counting", /00:00:0[2-9]/.test(await page.locator(".dxClkLive .dxClkTimer").textContent()));
await page.screenshot({path:`${OUT}/dx-timeclock.png`,fullPage:true});
await page.locator("button.dxClkBig.out").click(); await page.waitForTimeout(1200);
check("clock out returns to clock in", await page.locator("button.dxClkBig",{hasText:"Clock in"}).count()===1);
const sheet=await page.locator(".dxClkSheet").textContent(); check("timesheet lists the entry", sheet.includes("Test Technician") && sheet.includes("Sched Cust"));
const te=(await api(`/api/dispatch/jobs/time?open=1`,{},c)).b.entries; check("no open entries after clock out", te.length===0);
console.log("page errors:",errors.length?errors.slice(0,3):"none"); check("no page errors",errors.length===0);
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
