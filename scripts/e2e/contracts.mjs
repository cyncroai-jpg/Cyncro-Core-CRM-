// Contracts go out by email (mock Resend at :5197 via RESEND_API_BASE), signers sign on the public page, owner countersigns.
import { chromium } from "playwright-core";
import http from "node:http";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mails=[]; const mock=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{mails.push({auth:req.headers.authorization,...JSON.parse(body)});res.setHeader("Content-Type","application/json");res.end(JSON.stringify({id:"em_"+mails.length}))})});
await new Promise(r=>mock.listen(5197,"127.0.0.1",r));
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Sign Co ${stamp}`,displayName:"Sam Owner",email:`signco+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{senderName:"Sam at Sign Co",replyTo:`sam+${stamp}@example.com`,brandColor:"#3366ff"}})},A);
const list0=(await api("/api/crm/contracts",{},A)).b;
check("contracts list reports live transport", list0.emailTransport?.transport==="resend" && list0.emailTransport.from.includes("app-cyncrocore.com"), JSON.stringify(list0.emailTransport));
const c=await api("/api/crm/contracts",{method:"POST",body:JSON.stringify({title:"Website build agreement",clientName:"Dana Client",clientEmail:`dana+${stamp}@example.com`,body:"Scope: 5-page website. Price: $4,000. Timeline: 3 weeks.",signers:[{name:"Pat Partner",email:`pat+${stamp}@example.com`}]})},A);
check("contract created as draft with 2 signers", c.r.status===201 && c.b.contract.status==="DRAFT");
const id=c.b.contract.id;
const send=await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({id,action:"SEND"})},A);
check("SEND emails the first signer only (sequential)", send.b.delivery==="SENT" && send.b.sent===1 && send.b.links.length===1 && send.b.links[0].email===`dana+${stamp}@example.com`, JSON.stringify(send.b));
const m1=mails[0];
check("email: right recipient, branded subject, reply-to, link with token", m1 && m1.to[0]===`dana+${stamp}@example.com` && m1.subject==="Sam at Sign Co sent you a contract to sign: Website build agreement" && m1.reply_to===`sam+${stamp}@example.com` && m1.auth==="Bearer re_test_mock" && /\?contract=[A-Za-z0-9_-]+#sign/.test(m1.html) && m1.html.includes("#3366ff") && m1.html.includes("Hi Dana Client"), JSON.stringify({to:m1?.to,subject:m1?.subject}));
const det=(await api(`/api/crm/contracts?id=${id}`,{},A)).b;
check("status SENT + audit shows EMAIL_SENT", det.contract.status==="SENT" && det.events.some(e=>e.event_type==="EMAIL_SENT"||e.action==="EMAIL_SENT"||JSON.stringify(e).includes("EMAIL_SENT")), JSON.stringify(det.events.map(e=>e.event_type||e.action)).slice(0,120));
const token1=det.signers.find(s=>s.signing_order===1).signing_token, token2=det.signers.find(s=>s.signing_order===2).signing_token;
check("link in email is signer 1's private token", m1.html.includes(`contract=${encodeURIComponent(token1)}`));
// remind
const rem=await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({id,action:"REMIND"})},A);
check("REMIND emails a reminder", rem.b.delivery==="SENT" && mails.length===2 && /Reminder:/.test(mails[1].subject));
// public signing
check("anonymous can open the signing page data", (await api(`/api/crm/contracts?token=${token1}`)).r.ok);
check("second signer can't sign before the first", (await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({token:token2,signerName:"Pat Partner",consentText:"I agree"})})).r.status===409);
const s1=await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({token:token1,signerName:"Dana Client",consentText:"I agree to sign electronically"})});
check("first signer signs", s1.b.signed===true, JSON.stringify(s1.b));
// after signer 1, SEND again routes to signer 2
const send2=await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({id,action:"SEND"})},A);
check("next SEND goes to signer 2", send2.b.sent===1 && send2.b.links[0].email===`pat+${stamp}@example.com` && mails[2].to[0]===`pat+${stamp}@example.com`);
check("signer 2 signs → CLIENT_SIGNED", (await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({token:token2,signerName:"Pat Partner",consentText:"I agree"})})).b.signed===true && (await api(`/api/crm/contracts?id=${id}`,{},A)).b.contract.status==="CLIENT_SIGNED");
check("owner countersigns → SIGNED and locked", (await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({id,action:"COUNTERSIGN",signerName:"Sam Owner"})},A)).b.saved && (await api(`/api/crm/contracts?id=${id}`,{},A)).b.contract.locked_at);
check("signed link can't be reused", (await api("/api/crm/contracts",{method:"PATCH",body:JSON.stringify({token:token1,signerName:"X",consentText:"y"})})).r.status===409);
// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const c2=await api("/api/crm/contracts",{method:"POST",body:JSON.stringify({title:"Retainer",clientName:"Lee Client",clientEmail:`lee+${stamp}@example.com`,body:"Monthly retainer $1,500."})},A);
const d2=(await api(`/api/crm/contracts?id=${c2.b.contract.id}`,{},A)).b; const tok=d2.signers[0].signing_token;
const anon=await browser.newContext({viewport:{width:1200,height:900}}); const sp=await anon.newPage(); sp.on("pageerror",e=>errors.push(e.message));
const reqs=[]; sp.on("request",r=>{ if(r.url().includes("/api/")) reqs.push(r.url().replace(BASE,"")); }); await sp.goto(`${BASE}/?contract=${tok}#sign`,{waitUntil:"load"}); await sp.waitForTimeout(4000); const counts=reqs.reduce((a,u)=>{const k=u.split("?")[0];a[k]=(a[k]||0)+1;return a},{}); check("signing page does not poll in a loop", Object.values(counts).every(n=>n<=3), JSON.stringify(counts)); await sp.screenshot({path:`${OUT}/contract-sign-open.png`});
check("signing page opens without login", !sp.url().includes("/login") && (await sp.textContent("body")).includes("Retainer") && await sp.locator(".secGate").count()===0, sp.url());
await sp.locator(".signatureBox input[type=text], .signatureBox input:not([type=checkbox])").first().fill("Lee Client");
await sp.locator(".signatureConsent input[type=checkbox]").check();
await sp.locator(".signatureBox button, button:has-text('Sign')").first().click(); await sp.waitForTimeout(1200);
check("signs from the browser", await sp.locator(".signatureSuccess").count()>=1 && (await api(`/api/crm/contracts?id=${c2.b.contract.id}`,{},A)).b.contract.status==="CLIENT_SIGNED");
await sp.screenshot({path:`${OUT}/contract-sign.png`});
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm/contracts`,{waitUntil:"networkidle"}); await page.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{}); await page.waitForTimeout(1800);
check("contracts page shows transport banner", await page.locator(".contractTransport.on").count()===1 && (await page.locator(".contractTransport b").textContent()).includes("Contracts email from"));
await page.screenshot({path:`${OUT}/contracts-page.png`,fullPage:true});
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); mock.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
