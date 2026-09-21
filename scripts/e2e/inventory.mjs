// Inventory desk + lender directory end-to-end: paste-import, edit, delete, directory load.
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(name,ok,extra="")=>{ (ok?pass++:fail++); console.log(`${ok?"PASS":"FAIL"} ${name}${extra?" — "+extra:""}`); };
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Inv ${stamp}`,displayName:"Inv",email:`inv+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; check("signup",s.r.ok);

// API-level bulk import (what the modal calls)
const bulk=await api("/api/automotive?resource=inventory-bulk",{method:"POST",body:JSON.stringify({rows:[
  {stockNumber:"A100",vin:"1HGCV1F34LA000001",year:"2020",make:"Honda",model:"Accord",trim:"Sport",mileage:"41200",askingPrice:"21995",acquisitionCost:"17800",reconCost:"650",kbbValue:"20450",acquiredAt:"2026-07-01"},
  {stockNumber:"B200",vin:"5YJ3E1EA7KF000002",year:"2019",make:"Tesla",model:"Model 3",mileage:"38000",askingPrice:"27500",acquisitionCost:"24900",jdpowerValue:"26800"},
  {vin:"WBA5R1C50KAK00003",year:"2019",make:"BMW",model:"330i",mileage:"30100",askingPrice:"29900"},
  {make:"Nothing"},
]})},c);
check("bulk import API", bulk.r.status===201 && bulk.b.inserted===3 && bulk.b.errors.length===1, JSON.stringify(bulk.b));
const again=await api("/api/automotive?resource=inventory-bulk",{method:"POST",body:JSON.stringify({rows:[{stockNumber:"A100",askingPrice:"21495"}]})},c);
check("bulk re-import updates by stock #", again.b.updated===1 && again.b.inserted===0);
const inv0=(await api("/api/automotive?resource=inventory",{},c)).b.inventory;
check("VIN-only row got stock # from VIN tail", inv0.some(v=>v.stock_number==="KAK00003"));

const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#finance/inventory`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("inventory desk renders", await page.locator(".fxInv").count()===1);
check("3 rows in table", await page.locator(".fxInvTable tbody tr").count()===3);
check("gross computed for A100 (21,495-18,450=3,045)", (await page.locator(".fxInvTable tbody tr",{hasText:"A100"}).locator(".fxInvGross b").textContent())==="$3,045");
check("market col shows KBB", (await page.locator(".fxInvTable tbody tr",{hasText:"A100"}).textContent()).includes("KBB"));

// Paste-import via modal
await page.locator(".fxCCActions button",{hasText:"Import CSV"}).click(); await page.waitForTimeout(300);
check("import modal opens", await page.locator(".fxInvModal").count()===1);
await page.locator(".fxInvModal textarea").fill('Stock #,VIN,Year,Make,Model,Miles,"Internet Price",Cost,Recon,KBB,Weird Col\nC300,1FTEW1EP5KF000004,2019,Ford,"F-150, XLT",52000,"$31,995","$27,400",900,31200,zzz\nD400,,2021,Kia,Telluride,22000,36500,33100,,,');
await page.waitForTimeout(300);
const mapTxt=await page.locator(".fxInvMap").textContent();
check("header aliases mapped", mapTxt.includes("Internet Price → Asking $") && mapTxt.includes("Cost → Acquisition $") && mapTxt.includes("Miles → Mileage") && mapTxt.includes("Weird Col → skipped"), mapTxt.slice(0,200));
check("preview shows 2 rows", (await page.locator(".fxInvPreview small").first().textContent()).includes("2 rows"));
await page.locator(".fxInvModal .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1500);
check("modal closed after import", await page.locator(".fxInvModal").count()===0);
check("5 rows after paste import", await page.locator(".fxInvTable tbody tr").count()===5);
const f150=await page.locator(".fxInvTable tbody tr",{hasText:"C300"}).textContent();
check("quoted CSV field with comma preserved + $ parsed", f150.includes("F-150, XLT") && f150.includes("$31,995") && f150.includes("$28,300"), f150.slice(0,160));

// Edit in profit desk
await page.locator(".fxInvTable tbody tr",{hasText:"B200"}).click(); await page.waitForTimeout(300);
check("desk header shows selected unit", (await page.locator(".fxInvDesk .fxCCHead b").textContent()).includes("Tesla"));
const ask=page.locator(".fxInvFields.money label.hot input"); await ask.fill("28500");
await page.locator(".fxInvFields.money label",{hasText:"KBB"}).locator("input").fill("27000");
await page.waitForTimeout(200);
check("ladder live-updates before save", (await page.locator(".fxInvLadder").textContent()).includes("$28,500"));
await page.locator(".fxInvDesk .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1200);
const b200=(await api("/api/automotive?resource=inventory",{},c)).b.inventory.find(v=>v.stock_number==="B200");
check("PATCH persisted asking + KBB", b200.asking_price_cents===2850000 && b200.kbb_value_cents===2700000, JSON.stringify({a:b200.asking_price_cents,k:b200.kbb_value_cents}));

// Quick status change in row
await page.locator(".fxInvTable tbody tr",{hasText:"A100"}).locator("select.fxInvStatus").selectOption("SOLD"); await page.waitForTimeout(1000);
const a100=(await api("/api/automotive?resource=inventory",{},c)).b.inventory.find(v=>v.stock_number==="A100");
check("row status select persisted", a100.status==="SOLD");

// Search + export
await page.locator(".fxInvSearch input").fill("kia"); await page.waitForTimeout(300);
check("search filters", await page.locator(".fxInvTable tbody tr").count()===1);
const dl=page.waitForEvent("download"); await page.locator(".fxCCActions button",{hasText:"Export CSV"}).click(); const d=await dl; const csv=await (await import("node:fs")).default.promises.readFile(await d.path(),"utf8");
check("export CSV has header + filtered row", csv.startsWith("Stock #,VIN") && csv.includes("D400") && !csv.includes("A100"));
await page.locator(".fxInvSearch input").fill(""); await page.waitForTimeout(300);

// Delete one via row X, then bulk delete via checkboxes
await page.locator(".fxInvTable tbody tr",{hasText:"D400"}).locator(".fxInvX").click(); await page.waitForTimeout(1000);
check("row delete", await page.locator(".fxInvTable tbody tr").count()===4);
await page.locator(".fxInvTable tbody tr",{hasText:"C300"}).locator('input[type=checkbox]').check();
await page.locator(".fxInvTable tbody tr",{hasText:"KAK00003"}).locator('input[type=checkbox]').check();
await page.locator(".fxCCActions button",{hasText:"Delete 2 selected"}).click(); await page.waitForTimeout(1200);
check("bulk delete", await page.locator(".fxInvTable tbody tr").count()===2);

// Add vehicle from desk
await page.locator(".fxCCActions button",{hasText:"Add vehicle"}).click(); await page.waitForTimeout(200);
await page.locator(".fxInvFields label",{hasText:/^Stock #/}).locator("input").fill("NEW1");
await page.locator(".fxInvFields label",{hasText:/^Make/}).locator("input").fill("Lexus");
await page.locator(".fxInvFields.money label.hot input").fill("41000");
await page.locator(".fxInvDesk .fxInvSave .fxCCPrimary").click(); await page.waitForTimeout(1200);
check("add vehicle from desk", await page.locator(".fxInvTable tbody tr",{hasText:"NEW1"}).count()===1);
await page.screenshot({path:`${OUT}/inventory.png`,fullPage:true});

// Lenders
await page.goto(`${BASE}/#finance/lenders`,{waitUntil:"networkidle"}); await page.waitForTimeout(1200);
check("lender directory renders empty state", await page.locator(".fxLendEmpty").count()===1);
await page.locator(".fxLendEmpty .fxCCPrimary").click(); await page.waitForTimeout(6000);
const cards=await page.locator(".fxLendCard").count();
check("directory loaded (>=85 lenders)", cards>=85, String(cards));
const txt=await page.locator(".fxLend").textContent();
check("Florida credit unions present", ["Suncoast","VyStar","Space Coast","MIDFLORIDA","GTE"].every(n=>txt.includes(n)));
check("grouped into 4 types", await page.locator(".fxLendGroup").count()===4);
await page.locator(".fxLendChips button",{hasText:"Credit unions"}).click(); await page.waitForTimeout(300);
check("type chip filters", await page.locator(".fxLendGroup").count()===1);
await page.locator(".fxInvSearch select").selectOption("Florida"); await page.waitForTimeout(300);
const flCU=await page.locator(".fxLendCard").count(); check("Florida CU filter", flCU>=30, String(flCU));
// edit terms on first card
const card=page.locator(".fxLendCard").first(); const name=await card.locator(".fxLendHead b").textContent();
await card.locator("button",{hasText:"Edit terms"}).click(); await page.waitForTimeout(200);
await card.locator("label",{hasText:"Min score"}).locator("input").fill("640");
await card.locator("label",{hasText:"Buy rate"}).locator("input").fill("5.75");
await card.locator("button",{hasText:"Save terms"}).click(); await page.waitForTimeout(1200);
const saved=(await api("/api/automotive?resource=lenders",{},c)).b.lenders.find(l=>l.name===name);
check("lender terms PATCH persisted", saved && saved.min_credit_score===640 && saved.buy_rate===5.75, JSON.stringify(saved&&{s:saved.min_credit_score,r:saved.buy_rate}));
await page.locator(".fxLendCard",{hasText:name}).locator(".fxLendSwitch").click(); await page.waitForTimeout(1000);
check("active toggle", (await api("/api/automotive?resource=lenders",{},c)).b.lenders.find(l=>l.name===name).active===0);
await page.locator(".fxLendCard",{hasText:name}).locator("button",{hasText:"Remove"}).click(); await page.waitForTimeout(1200);
check("lender removed", !(await api("/api/automotive?resource=lenders",{},c)).b.lenders.some(l=>l.name===name));
const reload=await api("/api/automotive?resource=lender-directory",{method:"POST",body:"{}"},c);
check("directory reload only re-adds the removed one", reload.b.added===1, JSON.stringify(reload.b));
await page.locator(".fxLendChips button",{hasText:"All"}).click(); await page.locator(".fxInvSearch select").selectOption("ALL"); await page.waitForTimeout(400);
await page.screenshot({path:`${OUT}/lenders.png`,fullPage:true});
console.log("page errors:",errors.length?errors.slice(0,4):"none");
check("no page errors", errors.length===0);
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
