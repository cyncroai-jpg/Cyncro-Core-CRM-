import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT;
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const s=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`L ${stamp}`,displayName:"L",email:`l+${stamp}@example.com`,password:"Password123!"})});
const c=s.cookie; await api("/api/automotive?resource=lender-directory",{method:"POST",body:"{}"},c);
await api("/api/automotive?resource=inventory-bulk",{method:"POST",body:JSON.stringify({rows:[
 {stockNumber:"A100",vin:"1HGCV1F34LA000001",year:"2020",make:"Honda",model:"Accord",trim:"Sport",mileage:"41200",color:"Black",askingPrice:"21995",acquisitionCost:"17800",reconCost:"650",kbbValue:"20450",jdpowerValue:"20100",acquiredAt:"2026-07-01"},
 {stockNumber:"B200",vin:"5YJ3E1EA7KF000002",year:"2019",make:"Tesla",model:"Model 3",trim:"Long Range",mileage:"38000",color:"White",askingPrice:"27500",acquisitionCost:"24900",jdpowerValue:"26800",acquiredAt:"2026-05-20"},
 {stockNumber:"C300",vin:"1FTEW1EP5KF000004",year:"2019",make:"Ford",model:"F-150",trim:"XLT",mileage:"52000",askingPrice:"31995",acquisitionCost:"27400",reconCost:"900",kbbValue:"31200",status:"IN_RECON"}]})},c);
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
await ctx.addCookies([{name:"cyncro_session",value:c.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage();
await page.goto(`${BASE}/#finance/lenders`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.screenshot({path:`${OUT}/lenders-view.png`});
await page.goto(`${BASE}/#finance/inventory`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.locator(".fxInvTable tbody tr",{hasText:"A100"}).click(); await page.waitForTimeout(400);
await page.screenshot({path:`${OUT}/inventory-view.png`});
await page.locator(".fxCCActions button",{hasText:"Import CSV"}).click(); await page.waitForTimeout(300);
await page.locator(".fxInvModal textarea").fill('Stock #,Year,Make,Model,Miles,Internet Price,Cost,KBB,Weird\nD400,2021,Kia,Telluride,22000,36500,33100,35900,x\nE500,2022,Toyota,RAV4,18000,29900,26500,29100,y');
await page.waitForTimeout(300); await page.screenshot({path:`${OUT}/import-modal.png`});
await browser.close();
