import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Edit ${stamp}`,displayName:"Edit",email:`edit+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Consult",slug:`consult-${stamp}`,durationMinutes:30})},c);
const st=new Date();st.setHours(10,0,0,0);
const bk=await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:et.b?.id,customerName:"Drag Me",customerEmail:`dm+${stamp}@example.com`,startsAt:st.toISOString(),timezone:"America/Chicago",locationMode:"VIDEO",videoPlatform:"GOOGLE_MEET"})},c);
const bookingId=bk.b?.booking?.id; console.log("seed booking",bk.r.status,bookingId);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:950}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
const out=[]; const ok=(x,l,e="")=>out.push(`${x?"PASS":"FAIL"} ${l}${e?" · "+e:""}`);
const getStart=async()=>{const r=await api(`/api/calendar/bookings?from=${encodeURIComponent(new Date(Date.now()-30*864e5).toISOString())}`,{},c);return (r.b?.bookings||[]).find(b=>b.id===bookingId)?.starts_at};
await page.goto(`${BASE}/#admin`,{waitUntil:"networkidle"});await page.waitForTimeout(2500);
// 1) Click empty slot on timeline → booking modal opens prefilled
const col=page.locator(".calCCCol").nth(2); const box=await col.boundingBox();
await page.mouse.click(box.x+box.width/2, box.y+box.height*0.6); await page.waitForTimeout(600);
const prefilled=await page.locator('.bookingmodal input[type="datetime-local"]').first().inputValue().catch(()=>"");
ok(prefilled.length>0,"click empty slot opens Create appointment prefilled",prefilled);
await page.locator(".modalback").first().click({position:{x:5,y:5}});await page.waitForTimeout(300);
// 2) Drag the block on the timeline down by 2 hours
const before=await getStart();
const block=page.locator(".calCCBlock").first(); const bb=await block.boundingBox();
const colBox=await page.locator(".calCCCol").first().boundingBox();
const twoHours=colBox.height*(2/12);
await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2); await page.mouse.down();
for(let i=1;i<=8;i++){await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2+twoHours*i/8);await page.waitForTimeout(30)}
const ghost=await page.locator(".calCCGhost").count();
await page.mouse.up(); await page.waitForTimeout(1200);
const after=await getStart();
ok(ghost>0,"drag shows ghost preview");
ok(before&&after&&new Date(after).getTime()-new Date(before).getTime()===2*3600*1000,"timeline drag reschedules +2h",`${before} → ${after}`);
// 3) Grid: drag booking to next day (HTML5 dnd)
await page.waitForTimeout(500);
const gridBtn=page.locator(".roleCalendarGrid button").first(); const cells=page.locator(".roleCalendarGrid > div");
const idx=await page.evaluate(()=>{const cells=[...document.querySelectorAll(".roleCalendarGrid > div")];return cells.findIndex(c=>c.querySelector("button"))});
const target=cells.nth(idx+1);
const b0=await getStart();
await gridBtn.dispatchEvent("dragstart",{dataTransfer:await page.evaluateHandle(()=>new DataTransfer())});
await target.dispatchEvent("dragover",{dataTransfer:await page.evaluateHandle(()=>new DataTransfer())});
await target.dispatchEvent("drop",{dataTransfer:await page.evaluateHandle(()=>new DataTransfer())});
await page.waitForTimeout(1200);
const b1=await getStart();
ok(b0&&b1&&new Date(b1).getTime()-new Date(b0).getTime()===24*3600*1000,"grid drag moves to next day",`${b0} → ${b1}`);
// 4) Empty grid cell click opens booking modal
const emptyCell=cells.nth(idx+3); await emptyCell.click({position:{x:20,y:60}}); await page.waitForTimeout(500);
ok((await page.locator(".bookingmodal").count())>0,"empty grid cell opens Create appointment");
if(await page.locator(".modalback").count()){await page.locator(".modalback").first().click({position:{x:5,y:5}});await page.waitForTimeout(300);}
// 5) Quick move +30 min from modal
await page.locator(".roleCalendarGrid button").first().click();await page.waitForTimeout(600);
const q0=await getStart();
await page.locator(".bookingQuick button",{hasText:"+30 min"}).click();await page.waitForTimeout(1200);
const q1=await getStart();
ok(q0&&q1&&new Date(q1).getTime()-new Date(q0).getTime()===30*60*1000,"quick move +30 min",`${q0} → ${q1}`);
// 6) Status: Completed
await page.locator(".roleCalendarGrid button").first().click();await page.waitForTimeout(600);
await page.locator(".bookingQuick button.ok").click();await page.waitForTimeout(1200);
const r=await api(`/api/calendar/bookings?from=${encodeURIComponent(new Date(Date.now()-30*864e5).toISOString())}`,{},c);
ok((r.b?.bookings||[]).find(b=>b.id===bookingId)?.status==="COMPLETED","status → Completed from modal");
await page.screenshot({path:process.env.OUT+"/cal-edit.png"});
console.log(out.join("\n"));console.log("errors:",errors.length?errors.slice(0,4):"none");await browser.close();
