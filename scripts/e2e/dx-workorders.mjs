import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`WO ${stamp}`,displayName:"WO",email:`wo+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; check("signup",s.r.ok);
// fresh customer + job so the test is independent of shared state
const cust=await api("/api/dispatch/customers",{method:"POST",body:JSON.stringify({name:`Ada Test ${stamp}`,phone:"+18135550100",email:`ada+${stamp}@example.com`})},c);
check("customer created",cust.r.status===201,JSON.stringify(cust.b));
const job=await api("/api/dispatch/jobs",{method:"POST",body:JSON.stringify({customerId:cust.b.id,serviceType:"AC tune-up",address:"100 Main St, Tampa, FL",scheduledAt:new Date(Date.now()+3600e3).toISOString(),revenue:249,description:"Seasonal tune-up"})},c);
check("job created",job.r.status===201,JSON.stringify(job.b));
const sum=(await api("/api/dispatch/jobs?summary=1",{},c)).b.jobs.find(j=>j.id===job.b.id);
check("summary row has counts", sum && sum.notes_count===0 && sum.materials_count===0 && Number(sum.labor_minutes)===0 && sum.invoice_status===null, JSON.stringify(sum&&{n:sum.notes_count,m:sum.materials_count,l:sum.labor_minutes}));

const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#dispatch/work-orders`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("work orders view renders", await page.locator(".dxWO").count()===1);
await page.locator(".dxWO .fxInvSearch input").fill(`Ada Test ${stamp}`); await page.waitForTimeout(300);
check("search narrows to the new job", await page.locator(".dxWORow").count()===1);
await page.locator(".dxWORow").first().click(); await page.waitForTimeout(800);
const desk=page.locator(".dxWODesk");
check("desk shows the job", (await desk.locator(".fxCCHead b").textContent()).includes("Ada Test"));
check("readiness 1/6 (scope only)", (await desk.locator(".dxWOChecks>small").textContent()).includes("1/6"));
check("stage BOOKED is current", (await desk.locator(".dxWOStages span.now small").textContent())==="booked");
// note
await desk.locator(".dxWOAdd:not(.three) input").fill("Filter replaced, coil cleaned"); await desk.locator(".dxWOAdd:not(.three) button").click(); await page.waitForTimeout(1000);
check("note appears in feed", (await desk.locator(".dxWOFeed").first().textContent()).includes("coil cleaned"));
// material
await desk.locator(".dxWOAdd.three input").nth(0).fill("Filter 16x25x1"); await desk.locator(".dxWOAdd.three input").nth(1).fill("2"); await desk.locator(".dxWOAdd.three input").nth(2).fill("12.5");
await desk.locator(".dxWOAdd.three button").click(); await page.waitForTimeout(1000);
check("materials total $25", (await desk.locator(".dxWOFacts").textContent()).includes("Materials$25"));
check("gross after parts $224", (await desk.locator(".dxWOFacts").textContent()).includes("$224"));
// clock in / out
await desk.locator("button",{hasText:"Clock in"}).click(); await page.waitForTimeout(1000);
check("clock out button after clock in", await desk.locator("button",{hasText:"Clock out"}).count()===1);
await desk.locator("button",{hasText:"Clock out"}).click(); await page.waitForTimeout(1000);
check("time entry listed", (await desk.textContent()).includes("TIME ENTRIES"));
// advance status to complete (booked→assigned→in progress→complete)
for(const s of ["assigned","in progress","complete"]){ await desk.locator("button.fxCCPrimary",{hasText:`Mark ${s}`}).click(); await page.waitForTimeout(900); }
check("stage COMPLETE current", (await desk.locator(".dxWOStages span.now small").textContent())==="complete");
check("readiness now 5/6 (no tech)", (await desk.locator(".dxWOChecks>small").textContent()).includes("5/6"));
check("row pill says ready", (await page.locator(".dxWORow em").first().textContent())==="ready");
await page.screenshot({path:`${OUT}/dx-wo.png`,fullPage:true});
await desk.locator("button",{hasText:"Create invoice"}).click(); await page.waitForTimeout(1200);
check("invoice issued shown", (await desk.locator(".dxWOFacts").textContent()).toLowerCase().includes("issued"));
check("stage INVOICED current", (await desk.locator(".dxWOStages span.now small").textContent())==="invoiced");
await desk.locator("button",{hasText:"Mark paid"}).click(); await page.waitForTimeout(1200);
check("row pill says paid", (await page.locator(".dxWORow em").first().textContent())==="paid");
const kp=await page.locator(".dxWOKpis").textContent(); check("KPI collected is at least $249", Number(((kp.match(/COLLECTED\$([0-9,]+)/)||[])[1]||"0").replace(/,/g,""))>=249, kp.replace(/\s+/g," ").slice(0,140));
// filters
await page.locator(".dxWOChips button",{hasText:"Invoiced"}).click(); await page.waitForTimeout(300); check("Invoiced filter keeps paid row", await page.locator(".dxWORow").count()===1);
await page.locator(".dxWOChips button",{hasText:"Needs action"}).click(); await page.waitForTimeout(300); check("Needs action filter hides it", await page.locator(".dxWORow").count()===0);
await page.locator(".dxWOChips button",{hasText:"All"}).click();
await page.locator(".dxWODesk .fxCCMini",{hasText:"Open job"}).click(); await page.waitForTimeout(600);
check("Open job goes to Jobs tab", page.url().includes("#dispatch/jobs"));
console.log("page errors:",errors.length?errors.slice(0,3):"none"); check("no page errors",errors.length===0);
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
