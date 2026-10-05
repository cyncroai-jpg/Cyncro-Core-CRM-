// Visits every CRM tab as a fresh company owner and reports page errors, failed API calls, and error text on screen.
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Sweep ${stamp}`,displayName:"Sweep Owner",email:`sweep+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
const acct=await api("/api/crm/accounts",{method:"POST",body:JSON.stringify({name:`Acme ${stamp}`,category:"Client"})},A);
await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:"Dana Lead",email:`dana+${stamp}@example.com`,accountId:acct.b.account?.id})},A);
await api("/api/crm/opportunities",{method:"POST",body:JSON.stringify({accountId:acct.b.account?.id,name:"Acme build",stage:"CLOSED WON",value:5000,collected:5000,commissionRate:25})},A);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("dialog",d=>d.accept());
const report={};
let cur="boot"; const note=(k,v)=>{(report[cur] ||= {pageErrors:[],failed:[],console:[]})[k].push(v)};
page.on("pageerror",e=>note("pageErrors",e.message));
page.on("console",m=>{ if(m.type()==="error") note("console",m.text().slice(0,200)); });
page.on("response",r=>{ const u=r.url(); if(u.includes("/api/") && r.status()>=400) note("failed",`${r.request().method()} ${u.replace(BASE,"")} → ${r.status()}`); });
await page.goto(`${BASE}/#crm`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
const names=await page.locator(".crmNav button span").allTextContents();
console.log("TABS:", names.join(" | "));
for(const n of names){
  cur=n; report[cur] ||= {pageErrors:[],failed:[],console:[]};
  const btn=page.locator(".crmNav button",{has:page.locator("span",{hasText:new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}$`)})}).first();
  await btn.click().catch(e=>note("pageErrors","click failed: "+e.message.slice(0,80)));
  await page.waitForTimeout(1800);
  const main=page.locator(".crmMain, main, .crmContent").first();
  const text=((await main.textContent().catch(()=>""))||"").replace(/\s+/g," ");
  report[cur].textLen=text.length;
  const bad=text.match(/(could not|couldn't|unable to|failed|not found|something went wrong|error)[^.]{0,60}/i);
  if(bad) report[cur].errorText=bad[0];
  await page.screenshot({path:`${OUT}/sweep-${n.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.png`}).catch(()=>{});
}
await browser.close();
for(const [k,v] of Object.entries(report)){ const issues=[...v.pageErrors.map(x=>"JS: "+x),...v.failed.map(x=>"API: "+x),...v.console.filter(c=>!/favicon|Download the React DevTools/.test(c)).slice(0,3).map(x=>"CONSOLE: "+x),...(v.errorText?["TEXT: "+v.errorText]:[])]; console.log(`${issues.length?"⚠":"✓"} ${k} (${v.textLen||0} chars)`); for(const i of issues) console.log("   ",i); }
