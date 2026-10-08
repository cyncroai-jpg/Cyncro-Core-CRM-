import { chromium } from "playwright-core";
import { createHmac } from "node:crypto";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie="",extra={}){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const B32="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s){const o=[];let bits=0,v=0;for(const ch of s.toUpperCase().replace(/[^A-Z2-7]/g,"")){v=(v<<5)|B32.indexOf(ch);bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8}}return Buffer.from(o)}
function totp(secret,at=Date.now()){const c=Math.floor(at/30000);const msg=Buffer.alloc(8);let x=c;for(let i=7;i>=0;i--){msg[i]=x&255;x=Math.floor(x/256)}const mac=createHmac("sha1",b32(secret)).update(msg).digest();const off=mac[19]&15;const code=((mac[off]&127)<<24|mac[off+1]<<16|mac[off+2]<<8|mac[off+3])%1e6;return String(code).padStart(6,"0")}
const email=`sec+${stamp}@example.com`, pw="Password123!";
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Sec ${stamp}`,displayName:"Sec Owner",email,password:pw})});
check("signup ok", su.r.ok, JSON.stringify(su.b).slice(0,100)); const cookieA=su.cookie;
// headers
const hp=await fetch(BASE+"/api/auth/2fa",{headers:{Cookie:cookieA}});
check("security headers on API", hp.headers.get("x-content-type-options")==="nosniff" && hp.headers.get("cache-control")?.includes("no-store") && hp.headers.get("referrer-policy"), [...hp.headers.keys()].join());
const hs=await fetch(BASE+"/s?slug=anything"); const hh=await fetch(BASE+"/login");
check("frame protection except embeddable pages", hh.headers.get("x-frame-options")==="SAMEORIGIN" && !hs.headers.get("x-frame-options"));
// lockout: 5 wrong passwords
let last; for(let i=0;i<5;i++){ last=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password:"wrong"+i})},"",{"cf-connecting-ip":"10.0.0.9"}); }
check("5th failure locks", last.r.status===401 && /locked/.test(last.b.error), JSON.stringify(last.b));
const lk=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password:pw})},"",{"cf-connecting-ip":"10.0.0.9"});
check("right password refused while locked (423)", lk.r.status===423, JSON.stringify(lk.b));
// warning hint before lock
const e2=`sec2+${stamp}@example.com`; await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Sec2 ${stamp}`,displayName:"Two",email:e2,password:pw})});
for(let i=0;i<2;i++) await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:e2,password:"nope"})},"",{"cf-connecting-ip":"10.0.0.8"});
check("remaining-attempts hint", /2 attempts left/.test((await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:e2,password:"nope"})},"",{"cf-connecting-ip":"10.0.0.8"})).b.error));
const ok2=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:e2,password:pw})},"",{"cf-connecting-ip":"10.0.0.8"});
check("good login clears failures and sets session", ok2.r.ok && ok2.cookie.startsWith("cyncro_session="));
// per-IP login rate limit (30/15m)
let r429=null; for(let i=0;i<31;i++){const r=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:"nobody@x.com",password:"x"})},"",{"cf-connecting-ip":"10.0.0.77"}); if(r.r.status===429){r429=r;break}}
check("login IP rate limit → 429 with Retry-After", r429 && r429.r.headers.get("retry-after"), r429?JSON.stringify(r429.b):"never hit");
// signup rate limit 10/h/ip
let s429=false; for(let i=0;i<11;i++){const r=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`x${i}`,displayName:"x",email:`rl${i}+${stamp}@example.com`,password:pw})},"",{"cf-connecting-ip":"10.0.0.66"}); if(r.r.status===429){s429=true;break}}
check("signup rate limited", s429);
// reset per-email limit 3/h
let rr=[]; for(let i=0;i<4;i++) rr.push((await api("/api/auth/reset",{method:"POST",body:JSON.stringify({email:e2})},"",{"cf-connecting-ip":`10.0.1.${i}`})).r.status);
check("reset per-email limit", rr[3]===429, rr.join());
// 2FA setup/verify for e2 (its session)
const C=ok2.cookie;
const st0=(await api("/api/auth/2fa",{},C)).b; check("2fa off by default", st0.enabled===false && st0.companyRequires===false);
const setup=(await api("/api/auth/2fa?action=setup",{method:"POST",body:"{}"},C)).b;
check("setup returns secret + otpauth", /^[A-Z2-7]{32}$/.test(setup.secret||"") && setup.otpauth?.startsWith("otpauth://totp/Cyncro%20Core:"), JSON.stringify(setup).slice(0,80));
check("wrong code rejected", (await api("/api/auth/2fa?action=verify",{method:"POST",body:JSON.stringify({code:"000000"})},C)).r.status===400);
const ver=await api("/api/auth/2fa?action=verify",{method:"POST",body:JSON.stringify({code:totp(setup.secret)})},C);
check("correct code enables + 8 backup codes", ver.r.ok && ver.b.backupCodes?.length===8 && /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(ver.b.backupCodes[0]), JSON.stringify(ver.b).slice(0,120));
const st1=(await api("/api/auth/2fa",{},C)).b; check("status shows on with 8 codes", st1.enabled===true && st1.backupCodesLeft===8);
// login now requires second step
const l1=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:e2,password:pw})},"",{"cf-connecting-ip":"10.0.0.8"});
check("password alone → challenge, no cookie", l1.b.requires2fa===true && l1.b.challenge && !l1.cookie, JSON.stringify(l1.b).slice(0,60));
check("bad code on challenge → 401", (await api("/api/auth/login",{method:"POST",body:JSON.stringify({challenge:l1.b.challenge,code:"111111"})},"",{"cf-connecting-ip":"10.0.0.8"})).r.status===401);
const l2=await api("/api/auth/login",{method:"POST",body:JSON.stringify({challenge:l1.b.challenge,code:totp(setup.secret)})},"",{"cf-connecting-ip":"10.0.0.8","user-agent":"Mozilla/5.0 (iPhone) Safari/605"});
check("TOTP completes sign-in", l2.r.ok && l2.cookie.startsWith("cyncro_session="));
check("challenge is single-use", (await api("/api/auth/login",{method:"POST",body:JSON.stringify({challenge:l1.b.challenge,code:totp(setup.secret)})},"",{"cf-connecting-ip":"10.0.0.8"})).r.status===410);
// backup code login
const l3=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:e2,password:pw})},"",{"cf-connecting-ip":"10.0.0.8"});
const l4=await api("/api/auth/login",{method:"POST",body:JSON.stringify({challenge:l3.b.challenge,code:ver.b.backupCodes[0]})},"",{"cf-connecting-ip":"10.0.0.8"});
check("backup code signs in", l4.r.ok && l4.cookie);
check("backup code burned", (await api("/api/auth/2fa",{},l4.cookie)).b.backupCodesLeft===7);
const l5=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:e2,password:pw})},"",{"cf-connecting-ip":"10.0.0.8"});
check("burned backup code refused", (await api("/api/auth/login",{method:"POST",body:JSON.stringify({challenge:l5.b.challenge,code:ver.b.backupCodes[0]})},"",{"cf-connecting-ip":"10.0.0.8"})).r.status===401);
// regenerate codes needs a current code
check("codes regen needs code", (await api("/api/auth/2fa?action=codes",{method:"POST",body:JSON.stringify({code:"000000"})},l4.cookie)).r.status===400);
const rg=(await api("/api/auth/2fa?action=codes",{method:"POST",body:JSON.stringify({code:totp(setup.secret)})},l4.cookie)).b; check("codes regenerated", rg.backupCodes?.length===8);
// sessions
const ss=(await api("/api/auth/sessions",{},l4.cookie)).b.sessions;
check("sessions listed with device + current", ss.length>=2 && ss.some(s=>s.current) && ss.some(s=>s.device==="Safari on iOS"), JSON.stringify(ss.map(s=>s.device)));
const other=ss.find(s=>!s.current);
check("revoke one session", (await api(`/api/auth/sessions?id=${other.id}`,{method:"DELETE"},l4.cookie)).b.removed===1);
check("revoked cookie no longer works", (await api("/api/auth/2fa",{},l2.cookie)).r.status===401);
check("cannot revoke own session via id", (await api(`/api/auth/sessions?id=${ss.find(s=>s.current).id}`,{method:"DELETE"},l4.cookie)).b.removed===0);
await api("/api/auth/sessions?others=1",{method:"DELETE"},l4.cookie);
check("sign out everywhere else leaves one", (await api("/api/auth/sessions",{},l4.cookie)).b.sessions.length===1);
// disable needs password; then off
check("disable needs password", (await api("/api/auth/2fa?action=disable",{method:"POST",body:JSON.stringify({password:"bad"})},l4.cookie)).r.status===400);
check("disable with password", (await api("/api/auth/2fa?action=disable",{method:"POST",body:JSON.stringify({password:pw})},l4.cookie)).b.enabled===false);
// company security (owner of Sec2 is e2)
const cs=(await api("/api/tenants/security",{},l4.cookie)).b;
check("company security lists members + protections", cs.members?.length===1 && cs.members[0].two_factor===0 && Object.keys(cs.protections).length===5 && cs.require2fa===false, JSON.stringify(cs).slice(0,160));
check("require2fa toggled by owner", (await api("/api/tenants/security",{method:"PATCH",body:JSON.stringify({require2fa:true})},l4.cookie)).b.require2fa===true);
check("2fa status reflects company requirement", (await api("/api/auth/2fa",{},l4.cookie)).b.companyRequires===true);
const setupB=(await api("/api/auth/2fa?action=setup",{method:"POST",body:"{}"},l4.cookie)).b; await api("/api/auth/2fa?action=verify",{method:"POST",body:JSON.stringify({code:totp(setupB.secret)})},l4.cookie);
check("cannot disable while company requires", (await api("/api/auth/2fa?action=disable",{method:"POST",body:JSON.stringify({password:pw})},l4.cookie)).r.status===403);
// export
const ex=await fetch(BASE+"/api/tenants/export",{headers:{Cookie:l4.cookie}}); const exb=await ex.json();
check("owner export is JSON of tables", ex.ok && exb.company && exb.contacts && Object.keys(exb).length>=24 && ex.headers.get("content-disposition")?.includes("attachment"), Object.keys(exb).join());
check("export without session denied", (await fetch(BASE+"/api/tenants/export")).status===401);
// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const errors=[];
// login flow with 2fa in browser (e2 has 2fa on, sessions revoked earlier except l4)
const anon=await browser.newContext({viewport:{width:1300,height:900}}); const lp=await anon.newPage(); lp.on("pageerror",e=>errors.push(e.message));
await lp.goto(`${BASE}/login`,{waitUntil:"networkidle"}); await lp.waitForTimeout(600);
await lp.fill("#email",e2); await lp.fill("#password",pw); await lp.locator("button[type=submit]").click(); await lp.waitForTimeout(1200);
check("login UI shows code step", (await lp.locator("h1").textContent()).includes("Enter your sign-in code"));
await lp.screenshot({path:`${OUT}/sec-2fa-login.png`});
await lp.fill("#otp","123456"); await lp.locator("button[type=submit]").click(); await lp.waitForTimeout(900);
check("wrong code shows error", (await lp.locator(".loginError").textContent()).includes("isn't right"));
await lp.fill("#otp",totp(setupB.secret)); await lp.locator("button[type=submit]").click(); await lp.waitForURL(/#crm/,{timeout:10000}).catch(()=>{}); await lp.waitForTimeout(1500); await lp.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{});
check("right code lands in CRM", lp.url().includes("#crm"), lp.url());
// profile security section
await lp.locator(".crmUser").first().click();
await lp.waitForTimeout(600);
const hasPanel=await lp.locator(".secPanel").count();
check("profile modal has Security section", hasPanel===1 && (await lp.locator(".secPanel").textContent()).includes("PROTECTED"), String(hasPanel));
if(hasPanel) await lp.screenshot({path:`${OUT}/sec-profile.png`});
await lp.keyboard.press("Escape");
await lp.goto(`${BASE}/#crm/team-access`,{waitUntil:"networkidle"}); await lp.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{}); await lp.waitForTimeout(1500);
check("company security panel renders", await lp.locator(".coSecurity").count()===1 && (await lp.locator(".coSecurity h2").textContent()).includes("1 of 1 teammates") && await lp.locator(".secList li").count()===5);
check("export link visible to owner", await lp.locator(".coSecurity a[href='/api/tenants/export']").count()===1);
await lp.screenshot({path:`${OUT}/sec-company.png`,fullPage:true});
// gate: invite-less path → use the first company (Sec) owner? That account is locked; use company Sec2 by adding a second user is complex; test gate via A's company instead
const Ac=await api("/api/tenants/security",{method:"PATCH",body:JSON.stringify({require2fa:true})},cookieA);
check("A owner requires 2fa", Ac.b.require2fa===true);
const g=await browser.newContext({viewport:{width:1300,height:900}}); await g.addCookies([{name:"cyncro_session",value:cookieA.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const gp=await g.newPage(); gp.on("pageerror",e=>errors.push(e.message)); await gp.goto(`${BASE}/#crm`,{waitUntil:"networkidle"}); await gp.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{}); await gp.waitForTimeout(1800);
check("gate blocks user without 2fa", await gp.locator(".secGate").count()===1 && (await gp.locator(".secGateCard h2").textContent()).includes("Turn on two-factor"));
await gp.screenshot({path:`${OUT}/sec-gate.png`});
await gp.locator(".secGate button",{hasText:"Turn on two-factor"}).click(); await gp.waitForTimeout(900);
const key=(await gp.locator(".secKey code").first().textContent()).replace(/\s/g,"");
await gp.locator(".secGate input").fill(totp(key)); await gp.locator(".secGate button",{hasText:"Verify and turn on"}).click(); await gp.waitForTimeout(1200);
check("gate setup shows backup codes then lifts", await gp.locator(".secCodes code").count()===8 || await gp.locator(".secGate").count()===0);
check("2fa on for A via gate", (await api("/api/auth/2fa",{},cookieA)).b.enabled===true);
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
