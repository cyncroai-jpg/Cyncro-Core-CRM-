import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const OUT=process.env.OUT; const stamp=Date.now();
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...(init.headers||{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Shot ${stamp}`,displayName:"Shot",email:`shot+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie;
const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Consultation",slug:`consult-${stamp}`,durationMinutes:30})},c);
const day=new Date();day.setDate(day.getDate()+0);
for(let i=0;i<5;i++){const dd=new Date(day);dd.setDate(dd.getDate()+(i%3));const st=new Date(dd);st.setHours(9+i*2,i%2?30:0,0,0);const r=await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:et.b?.id,customerName:["Sarah R.","Marcus J.","Lena K.","Tom P.","Ava V."][i],customerEmail:`c${i}+${stamp}@example.com`,startsAt:st.toISOString(),timezone:"America/Chicago",locationMode:"VIDEO",videoPlatform:"GOOGLE_MEET"})},c);console.log("booking",r.r.status,JSON.stringify(r.b).slice(0,80));}
await api("/api/dispatch/seed-demo",{method:"POST",body:"{}"},c);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:950}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage();
for(const [h,f] of [["admin","new-calendar.png"],["dispatch","new-dispatch.png"]]){await page.goto(`${BASE}/#${h}`,{waitUntil:"networkidle",timeout:90000});await page.waitForTimeout(3000);await page.screenshot({path:`${OUT}/${f}`});console.log("shot",f)}
await browser.close();
