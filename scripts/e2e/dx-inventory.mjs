// Dispatch inventory: photo scan (mocked AI unless REAL=1), confirm, manual add/edit/delete, dashboard tile.
import { chromium } from "playwright-core";
import http from "node:http";
import sharp from "sharp";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}

// Mock Anthropic endpoint: records the request and returns a fixed item list wrapped in prose + fences (worst case for the parser).
let seen=null;
const mock=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{seen=JSON.parse(body);
  res.writeHead(200,{"content-type":"application/json"});
  res.end(JSON.stringify({stop_reason:"end_turn",content:[{type:"text",text:'Here is what I found:\n```json\n{"summary":"Truck shelf with plumbing fittings and gloves.","items":[{"name":"PVC elbow 3/4in","category":"parts","quantity":12,"unit":"each","brand":"Charlotte","size":"3/4in","condition":"new","confidence":"high","notes":""},{"name":"Nitrile gloves","category":"SAFETY","quantity":2,"unit":"box","brand":"","size":"L","condition":"opened","confidence":"medium","notes":"one box partial"},{"name":"","category":"OTHER","quantity":1},{"name":"Cordless drill","category":"tools","quantity":1,"unit":"each","brand":"DeWalt","size":"20V","condition":"used","confidence":"low","notes":"battery not visible"}]}\n```'}]}));});});
await new Promise(r=>mock.listen(5199,"127.0.0.1",r));

const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`DX ${stamp}`,displayName:"DX",email:`dx+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; check("signup",s.r.ok);
{ const old=(await api("/api/dispatch/inventory",{},c)).b?.items||[]; if(old.length) await api(`/api/dispatch/inventory?ids=${old.map(i=>i.id).join(",")}`,{method:"DELETE"},c); }
// A synthetic "shelf" photo with readable labels.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#3a3a3a"/><rect x="40" y="380" width="1120" height="18" fill="#8a7a66"/><rect x="40" y="700" width="1120" height="18" fill="#8a7a66"/>
<g font-family="Arial" font-weight="bold" fill="#111"><rect x="60" y="220" width="300" height="160" fill="#e8e0c8"/><text x="80" y="290" font-size="34">PVC ELBOW 3/4"</text><text x="80" y="340" font-size="28">QTY 12</text>
<rect x="420" y="200" width="320" height="180" fill="#5aa0d8"/><text x="440" y="280" font-size="34" fill="#fff">NITRILE GLOVES</text><text x="440" y="330" font-size="28" fill="#fff">SIZE L - 100 CT</text><text x="440" y="365" font-size="24" fill="#fff">2 BOXES</text>
<rect x="800" y="240" width="320" height="140" fill="#f2c200"/><text x="820" y="300" font-size="34">DEWALT 20V</text><text x="820" y="350" font-size="28">CORDLESS DRILL</text></g></svg>`;
const jpg=await sharp(Buffer.from(svg)).jpeg({quality:88}).toBuffer(); const photoPath=`${OUT}/shelf.jpg`; await (await import("node:fs")).default.promises.writeFile(photoPath,jpg);

const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#dispatch/inventory`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("inventory view renders", await page.locator(".dxInv").count()===1);
check("AI ready badge (key configured)", (await page.locator(".dxInvScan .fxCCHead").textContent()).includes("AI READY"));
check("analyze disabled before photo", await page.locator(".dxInvAnalyze").isDisabled());
await page.locator('input[type=file]:not([capture])').setInputFiles(photoPath); await page.waitForTimeout(800);
check("preview shown after choosing photo", await page.locator(".dxInvDrop img").count()===1);
check("analyze enabled after photo", !(await page.locator(".dxInvAnalyze").isDisabled()));
await page.locator(".dxInvScanSide input").fill("plumbing truck");
await page.locator(".dxInvAnalyze").click();
await page.waitForSelector(".dxInvResults",{timeout:process.env.REAL?120000:15000});
const rows=await page.locator(".dxInvResults tbody tr").count();
if(process.env.REAL){ console.log("REAL scan rows:", await page.locator(".dxInvResults tbody").innerText()); check("real scan returned items", rows>=2, String(rows)); }
else {
  check("mock request carried image + hint", seen && seen.messages[0].content[0].type==="image" && seen.messages[0].content[0].source.media_type==="image/jpeg" && seen.messages[0].content[1].text.includes("plumbing truck") && seen.model==="claude-opus-5", JSON.stringify({m:seen?.model}));
  check("parser dropped nameless row → 3 items", rows===3, String(rows));
  check("categories normalised", (await page.locator(".dxInvResults tbody tr").nth(0).locator("select").inputValue())==="PARTS" && (await page.locator(".dxInvResults tbody tr").nth(2).locator("select").inputValue())==="TOOLS");
  check("confidence pills", (await page.locator(".dxInvResults .fxPill").allTextContents()).join(",")==="high,medium,low");
  await page.locator(".dxInvResults tbody tr").nth(2).locator('input[type=checkbox]').uncheck();
  await page.locator(".dxInvResults tbody tr").nth(0).locator("input.num").fill("14");
  check("summary sentence shown", (await page.locator(".dxInvResults .fxCCHead small").textContent()).includes("plumbing fittings"));
}
await page.screenshot({path:`${OUT}/dx-inv-scan.png`,fullPage:true});
await page.locator(".dxInvResults .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1500);
let inv=(await api("/api/dispatch/inventory",{},c)).b;
if(!process.env.REAL){
  check("2 kept items saved with SCAN source + location", inv.items.length===2 && inv.items.every(i=>i.source==="SCAN"&&i.location==="TRUCK"), JSON.stringify(inv.items.map(i=>[i.name,i.quantity,i.location])));
  check("edited quantity persisted (14)", inv.items.find(i=>i.name==="PVC elbow 3/4in")?.quantity===14);
  // second scan of same shelf tops up instead of duplicating
  const again=await api("/api/dispatch/inventory",{method:"POST",body:JSON.stringify({source:"SCAN",items:[{name:"pvc ELBOW 3/4in",category:"PARTS",quantity:6,location:"TRUCK"},{name:"PVC elbow 3/4in",category:"PARTS",quantity:3,location:"WAREHOUSE"}]})},c);
  inv=(await api("/api/dispatch/inventory",{},c)).b;
  check("re-scan merges by name+location (14+6=20) and separate location inserts", again.b.merged===1 && again.b.inserted===1 && inv.items.find(i=>i.location==="TRUCK"&&i.name==="PVC elbow 3/4in").quantity===20, JSON.stringify(again.b));
}
// manual add with min qty → low flag
await page.locator(".fxCCActions button",{hasText:"Add item"}).click(); await page.waitForTimeout(200);
await page.locator(".dxInvForm input[name=name]").fill(`Copper fitting ${stamp}`);
await page.locator(".dxInvForm input[name=quantity]").fill("2");
await page.locator(".dxInvForm input[name=minQuantity]").fill("5");
await page.locator(".dxInvForm input[name=unitCost]").fill("1.25");
await page.locator(".dxInvForm .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1200);
const row=page.locator(".dxInv section:not(.dxInvScan) tbody tr",{hasText:`Copper fitting ${stamp}`});
check("manual item shows low pill", (await row.textContent()).includes("low"));
await row.locator("button[aria-label^=Increase]").click(); await page.waitForTimeout(300); await row.locator("button[aria-label^=Increase]").click(); await page.waitForTimeout(1000);
inv=(await api("/api/dispatch/inventory",{},c)).b;
check("+ button persisted (2→4)", inv.items.find(i=>i.name===`Copper fitting ${stamp}`).quantity===4);
check("summary counts low + value", inv.summary.low===1 && inv.summary.valueCents>0 && inv.summary.lastScan, JSON.stringify(inv.summary));
// edit
await row.locator("button",{hasText:"Edit"}).click(); await page.waitForTimeout(200);
await page.locator(".dxInvForm input[name=minQuantity]").fill("1"); await page.locator(".dxInvForm .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1200);
check("edit cleared low flag", !(await page.locator(".dxInv section:not(.dxInvScan) tbody tr",{hasText:`Copper fitting ${stamp}`}).textContent()).includes("low"));
// low filter + search
await page.locator(".dxInv .fxInvSearch input[aria-label=\"Search inventory\"]").fill("glove"); await page.waitForTimeout(300);
if(!process.env.REAL) check("search filters", await page.locator(".dxInv section:not(.dxInvScan) tbody tr").count()===1);
await page.locator(".dxInv .fxInvSearch input[aria-label=\"Search inventory\"]").fill("");
// dashboard tile
await page.goto(`${BASE}/#dispatch`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
const tile=await page.locator(".dxCCStock").textContent();
check("dashboard stock tile shows count", tile.includes(String(inv.summary.count)) && tile.includes("STOCK ON HAND"), tile.replace(/\s+/g," ").slice(0,120));
check("dock has Inventory", (await page.locator(".dxCCDock").textContent()).includes("Inventory"));
await page.screenshot({path:`${OUT}/dx-dash-stock.png`});
await page.locator(".dxCCStock").click(); await page.waitForTimeout(600);
check("tile opens inventory view", (await page.locator(".dxInv").count())===1 && page.url().includes("#dispatch/inventory"));
// delete
const first=page.locator(".dxInv section:not(.dxInvScan) tbody tr").first(); const name=await first.locator("td b").first().textContent();
await first.locator(".fxInvX").click(); await page.waitForTimeout(1000);
check("delete", !(await api("/api/dispatch/inventory",{},c)).b.items.some(i=>i.name===name));
await page.screenshot({path:`${OUT}/dx-inv.png`,fullPage:true});
console.log("page errors:",errors.length?errors.slice(0,3):"none"); check("no page errors",errors.length===0);
await browser.close(); mock.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
