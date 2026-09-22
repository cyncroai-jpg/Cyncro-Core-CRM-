import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Acme"), B=await mk("Bolt");
// CSV import lands in the importer's company and is visible there
const imp=await api("/api/crm/contacts/import",{method:"POST",body:JSON.stringify({rows:[{fullName:`Imp One ${stamp}`,email:`imp1+${stamp}@example.com`,company:"Imp Co"},{fullName:`Imp Two ${stamp}`,phone:"813-555-0199"},{fullName:`Imp One ${stamp}`,email:`imp1+${stamp}@example.com`}],source:"CSV_IMPORT"})},A);
check("import counts", imp.r.status===201 && imp.b.imported===2 && imp.b.duplicates===1, JSON.stringify(imp.b));
const la=(await api("/api/crm/contacts",{},A)).b; const listA=la.contacts||la.results||[];
check("A sees imported contacts", listA.filter(c=>String(c.full_name||c.name||"").includes(`Imp`)).length===2, String(listA.length));
const lb=(await api("/api/crm/contacts",{},B)).b; const listB=lb.contacts||lb.results||[];
check("B cannot see A's imports", !listB.some(c=>String(c.full_name||c.name||"").includes(`Imp One ${stamp}`)));
const one=listA.find(c=>String(c.full_name||"").includes("Imp One")); const two=listA.find(c=>String(c.full_name||"").includes("Imp Two"));
check("B cannot merge A's contacts", (await api("/api/crm/contacts/merge",{method:"POST",body:JSON.stringify({winnerId:one.id,loserId:two.id})},B)).r.status===404);
// conversations API
const cv=await api("/api/crm/conversations",{},A);
check("threads list both contacts", cv.r.ok && cv.b.threads.length>=2 && cv.b.channels && cv.b.channels.sms.connected===false, JSON.stringify(cv.b.channels));
const call=await api("/api/crm/conversations",{method:"POST",body:JSON.stringify({contactId:one.id,kind:"CALL",body:"Left voicemail about the quote"})},A);
check("log call", call.r.status===201 && call.b.sent===false);
const em=await api("/api/crm/conversations",{method:"POST",body:JSON.stringify({contactId:one.id,kind:"EMAIL",subject:"Hi",body:"Test"})},A);
check("email without sender gives clear 409 (or sends if configured)", em.r.status===409 || em.r.status===201, String(em.r.status)+" "+JSON.stringify(em.b));
check("B cannot log on A's contact", (await api("/api/crm/conversations",{method:"POST",body:JSON.stringify({contactId:one.id,kind:"NOTE",body:"x"})},B)).r.status===404);

const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
await page.goto(`${BASE}/#crm/conversations`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("hub renders", await page.locator(".cvHub").count()===1);
check("team datalist mounted with the owner", (await page.locator("datalist#cyncro-team option").count())>=1);
await page.locator(".cvThread",{hasText:"Imp One"}).click(); await page.waitForTimeout(700);
check("timeline shows the logged call", (await page.locator(".cvTimeline").textContent()).includes("voicemail"));
await page.locator(".cvKinds button",{hasText:"Note"}).click(); await page.locator(".cvCompose textarea").fill("Wants a callback Tuesday"); await page.locator(".cvCompose .fxCCPrimary").click(); await page.waitForTimeout(1200);
check("note appears in timeline", (await page.locator(".cvTimeline").textContent()).includes("callback Tuesday"));
await page.locator(".cvKinds button",{hasText:"Send email"}).click(); await page.waitForTimeout(200);
const emailBtnDisabled=await page.locator(".cvCompose .fxCCPrimary").isDisabled(); const chOn=(await page.locator(".cvChannels li").first().getAttribute("class"))||"";
check("email button honest about sender state", chOn.includes("on") ? true : emailBtnDisabled);
await page.locator(".fxLendChips button",{hasText:"Mine"}).click(); await page.waitForTimeout(300);
check("Mine filter keeps owner's contacts", await page.locator(".cvThread").count()>=2);
await page.screenshot({path:`${OUT}/crm-conversations.png`,fullPage:true});
console.log("page errors:",errors.length?errors.slice(0,3):"none"); check("no page errors",errors.length===0);
await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
