import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Alpha"), B=await mk("Bravo");
// chat isolation
const ch=await api("/api/chat/channels",{method:"POST",body:JSON.stringify({name:`ops-${stamp}`,type:"PUBLIC"})},A);
check("A creates a channel", ch.r.ok && ch.b.channel?.id, JSON.stringify(ch.b));
const msg=await api("/api/chat/messages",{method:"POST",body:JSON.stringify({channelId:ch.b.channel.id,body:"secret plan"})},A);
check("A posts with company display name", msg.r.ok && msg.b.message.author_name==="Alpha", JSON.stringify(msg.b).slice(0,120));
check("B cannot list A's channel", !((await api("/api/chat/channels",{},B)).b.channels||[]).some(c=>c.id===ch.b.channel.id));
check("B cannot read A's messages", (await api(`/api/chat/messages?channel=${ch.b.channel.id}`,{},B)).r.status===403);
check("B cannot post into A's channel", (await api("/api/chat/messages",{method:"POST",body:JSON.stringify({channelId:ch.b.channel.id,body:"hi"})},B)).r.status===403);
check("B search finds nothing of A", ((await api("/api/chat/search?q=secret",{},B)).b.results||[]).length===0 && ((await api("/api/chat/search?q=secret",{},A)).b.results||[]).length===1);
check("members list is company-only", ((await api("/api/chat/members",{},B)).b.allMembers||[]).every(m=>m.email.startsWith("bravo")));
check("B cannot rename A's channel", (await api("/api/chat/channels",{method:"PATCH",body:JSON.stringify({id:ch.b.channel.id,name:"x"})},B)).r.status===404);
// growth gate: neither new company is the platform owner
check("legacy growth API fenced off", (await api("/api/growth/overview",{},A)).r.status===403 && (await api("/api/growth/overview",{},B)).r.status===403);
check("public growth pixel still open", (await fetch(BASE+"/api/growth/track",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).status!==403);
// password reset (no email transport → honest 503; token check invalid)
const rs=await api("/api/auth/reset",{method:"POST",body:JSON.stringify({email:`alpha+${stamp}@example.com`})});
check("reset request without email transport says so", rs.r.status===503 && /Email sending/.test(rs.b.error), JSON.stringify(rs.b));
check("bogus reset token invalid", (await api("/api/auth/reset?token=nope")).b.valid===false && (await api("/api/auth/reset",{method:"PATCH",body:JSON.stringify({token:"nope",password:"Password123!"})})).r.status===410);
// settings + onboarding
const on=(await api("/api/crm/onboarding",{},A)).b;
check("onboarding computed from real data", on.total===9 && on.done===0 && on.steps.find(s=>s.key==="team").done===false, JSON.stringify({done:on.done,total:on.total}));
const setr=await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({name:`Alpha Co ${stamp}`,settings:{timezone:"America/Chicago",phone:"(555) 010-2000",businessHours:{days:[1,2,3],start:"08:00",end:"16:30"},brandColor:"#3366ff"}})},A);
check("settings saved and validated", setr.r.ok && setr.b.settings.timezone==="America/Chicago" && setr.b.settings.businessHours.end==="16:30" && setr.b.settings.brandColor==="#3366ff", JSON.stringify(setr.b));
check("bad timezone falls back", (await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{timezone:"Mars/Olympus"}})},A)).b.settings.timezone==="America/New_York");
check("B cannot see A's settings values", (await api("/api/tenants/settings",{},B)).b.settings.phone==="" );
check("onboarding ticks company step", (await api("/api/crm/onboarding",{},A)).b.steps.find(s=>s.key==="company").done===true);

// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const anon=await browser.newContext({viewport:{width:1300,height:900}}); const lp=await anon.newPage(); const errors=[]; lp.on("pageerror",e=>errors.push(e.message));
await lp.goto(`${BASE}/login`,{waitUntil:"networkidle"}); await lp.waitForTimeout(800);
await lp.locator("button",{hasText:"Forgot password?"}).click(); await lp.waitForTimeout(300);
check("forgot screen shows", (await lp.locator("h1").textContent()).includes("Forgot your password"));
await lp.fill("#email",`alpha+${stamp}@example.com`); await lp.locator("button[type=submit]").click(); await lp.waitForTimeout(800);
check("forgot screen reports honest error", (await lp.locator(".loginError").textContent()).includes("Email sending"));
await lp.screenshot({path:`${OUT}/mu-forgot.png`});
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm`,{waitUntil:"networkidle"}); await page.waitForTimeout(1800);
check("onboarding checklist on overview", await page.locator(".obCard").count()===1 && (await page.locator(".obCard").textContent()).includes("1 OF 9 DONE"));
await page.screenshot({path:`${OUT}/mu-overview.png`});
await page.goto(`${BASE}/#crm/team-access`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("company settings panel loaded with saved values", await page.locator(".coSettings").count()===1 && (await page.locator(".coGrid select").first().inputValue())==="America/New_York" || (await page.locator(".coGrid input").first().inputValue()).startsWith("Alpha Co"));
await page.locator(".coGrid input").nth(1).fill("(555) 999-0000"); await page.locator(".coSave").click(); await page.waitForTimeout(800);
check("company settings save from UI", (await api("/api/tenants/settings",{},A)).b.settings.phone==="(555) 999-0000");
await page.screenshot({path:`${OUT}/mu-company.png`,fullPage:true});
// builder with branches
await page.goto(`${BASE}/#crm/automations`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.locator(".fxLendChips button",{hasText:"Recipes"}).click(); await page.waitForTimeout(500);
check("14 recipes incl. goals", await page.locator(".auRecipeGrid article").count()===14 && (await page.locator(".auRecipeGrid").textContent()).includes("exits on"));
await page.locator(".auRecipeGrid article",{hasText:"Book or chase"}).locator("button").click(); await page.waitForTimeout(1200);
await page.locator(".auDetail button",{hasText:"Edit"}).click(); await page.waitForTimeout(600);
check("builder renders WAIT_FOR lanes", await page.locator(".auLane.nested").count()===2 && (await page.locator(".auLaneTag").allTextContents()).join()==="Happened,Timed out");
check("goal + settings controls present", await page.locator(".auGoal select").count()===2 && (await page.locator(".auGoal select").first().inputValue())==="");
await page.locator(".auLane.nested").nth(0).locator(".auLaneAdd").selectOption("LEAD_SCORE"); await page.waitForTimeout(300);
check("added a step inside the Happened lane", await page.locator(".auLane.nested").nth(0).locator(".auStep").count()===2);
await page.locator(".auGoal select").first().selectOption("BOOKING_CREATED");
await page.locator(".auPalette button",{hasText:"If / else branch"}).click(); await page.waitForTimeout(300);
check("IF_ELSE added with Yes/No lanes", (await page.locator(".auLaneTag").allTextContents()).includes("Yes"));
await page.screenshot({path:`${OUT}/mu-builder.png`,fullPage:true});
await page.locator(".fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1200);
const saved=(await api("/api/crm/automations",{},A)).b.workflows.find(w=>w.name==="Book or chase");
check("saved nested steps + goal from the UI", saved && saved.exit_trigger==="BOOKING_CREATED" && JSON.parse(saved.steps)[1].then.length===2 && JSON.parse(saved.steps).some(s=>s.type==="IF_ELSE"), JSON.stringify({exit:saved?.exit_trigger,steps:saved&&JSON.parse(saved.steps).map(s=>s.type)}));
// bulk enroll from the UI
await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Bulk One ${stamp}`,email:`b1+${stamp}@example.com`,source:"REFERRAL"})},A);
await page.locator(".auBulk input").first().fill("REFERRAL"); await page.locator(".auBulk button").click(); await page.waitForTimeout(1500);
const det=(await api(`/api/crm/automations?id=${saved.id}`,{},A)).b;
check("bulk enroll from the UI enrolled the REFERRAL contact", det.enrollments.some(e=>e.contact_name.startsWith("Bulk One")), JSON.stringify(det.enrollments.map(e=>e.contact_name)));
check("no page errors", errors.length===0, errors.join(" | ").slice(0,300));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
