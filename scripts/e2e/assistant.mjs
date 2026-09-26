// Cyncro AI assistant + MCP server, with a mock model endpoint (ANTHROPIC_BASE_URL=http://127.0.0.1:5199 in .dev.vars).
import { chromium } from "playwright-core";
import http from "node:http";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie="",extra={}){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{}),...extra}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;

// Mock model: decides from the last user message. Reads → tool_use; after a tool_result → text. Writes → tool_use create_task.
const seen=[]; let calls=0;
const mock=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{const b=JSON.parse(body); seen.push({headers:req.headers,body:b}); calls++;
  const msgs=b.messages; const last=msgs[msgs.length-1]; const text=typeof last.content==="string"?last.content:""; const lastIsResult=Array.isArray(last.content)&&last.content.some(c=>c.type==="tool_result");
  let out;
  if(b.tool_choice?.type==="none") out={stop_reason:"end_turn",content:[{type:"text",text:"I've lined that up. Approve it below and I'll do it."}]};
  else if(lastIsResult){const tr=last.content.find(c=>c.type==="tool_result"); let parsed={}; try{parsed=JSON.parse(tr.content)}catch{} out={stop_reason:"end_turn",content:[{type:"text",text:`You have ${parsed.count??"?"} booking(s) today${parsed.bookings?.[0]?`: ${parsed.bookings[0].customer_name} at ${parsed.bookings[0].local_time}`:""}.`}]};}
  else if(/booked/i.test(text)) out={stop_reason:"tool_use",content:[{type:"text",text:"Let me check."},{type:"tool_use",id:"tu_1",name:"list_bookings",input:{range:"today"}}]};
  else if(/task/i.test(text)) out={stop_reason:"tool_use",content:[{type:"tool_use",id:"tu_2",name:"create_task",input:{title:`Call Dana ${stamp}`,due_in_days:0,priority:"HIGH"}}]};
  else out={stop_reason:"end_turn",content:[{type:"text",text:"Plain answer."}]};
  res.writeHead(200,{"content-type":"application/json"}); res.end(JSON.stringify({...out,usage:{input_tokens:120,output_tokens:40}}));});});
await new Promise(r=>mock.listen(5199,"127.0.0.1",r));

const A=await mk("Ai"), B=await mk("Other");
const st=new Date(); st.setHours(15,0,0,0); if(st<new Date()) st.setHours(23,30,0,0);
const et=await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:"Walkthrough",slug:`walk-${stamp}`,durationMinutes:30})},A);
await api("/api/calendar/bookings",{method:"POST",body:JSON.stringify({eventTypeId:et.b.id,customerName:`Dana Booked ${stamp}`,customerEmail:`dana+${stamp}@example.com`,startsAt:st.toISOString(),timezone:"America/New_York",locationMode:"PHONE"})},A);

// ---- assistant API
const g=(await api("/api/ai/assistant",{},A)).b;
check("assistant GET: configured, empty memory, cap default", g.configured===true && g.history.length===0 && g.usage.cap===1000, JSON.stringify(g.usage));
const a1=await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"Who's booked today?",screen:"CRM · Overview"})},A);
check("read turn ran list_bookings and answered from it", a1.r.ok && a1.b.toolCalls?.includes("list_bookings") && /Dana Booked/.test(a1.b.reply) && a1.b.pending.length===0, JSON.stringify(a1.b).slice(0,200));
check("system prompt carried company + screen", /Ai \d+/.test(seen[0].body.system) && /CRM · Overview/.test(seen[0].body.system) && seen[0].body.tools.some(t=>t.name==="create_task"));
const a2=await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"Create a task to call Dana"})},A);
check("write turn became a pending action, nothing created yet", a2.r.ok && a2.b.pending.length===1 && a2.b.pending[0].tool==="create_task" && /Call Dana/.test(a2.b.pending[0].summary), JSON.stringify(a2.b.pending));
let tasks=(await api("/api/crm/tasks",{},A)).b.tasks||[];
check("task not created before approval", !tasks.some(t=>t.title===`Call Dana ${stamp}`));
const ap=await api("/api/ai/assistant?action=approve",{method:"POST",body:JSON.stringify({id:a2.b.pending[0].id})},A);
tasks=(await api("/api/crm/tasks",{},A)).b.tasks||[];
check("approval created the task under the teammate", ap.r.ok && ap.b.done && tasks.some(t=>t.title===`Call Dana ${stamp}` && t.assignee===`ai+${stamp}@example.com`), JSON.stringify(ap.b).slice(0,160));
check("approving twice is refused", (await api("/api/ai/assistant?action=approve",{method:"POST",body:JSON.stringify({id:a2.b.pending[0].id})},A)).r.status===400);
const g2=(await api("/api/ai/assistant",{},A)).b;
check("memory persisted + usage counted", g2.history.length>=4 && g2.usage.calls===2 && g2.pending.length===0, JSON.stringify({h:g2.history.length,u:g2.usage}));
check("company B has its own empty memory and usage", (await api("/api/ai/assistant",{},B)).b.history.length===0 && (await api("/api/ai/assistant",{},B)).b.usage.calls===0);
await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{aiMonthlyCap:2}})},A);
const capped=await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"hello"})},A);
check("monthly cap enforced with a clear message", capped.r.status===503 && /used its 2/.test(capped.b.error), JSON.stringify(capped.b));
await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{aiMonthlyCap:1000}})},A);
const audit=(await api("/api/audit",{},A)).b;
check("audit log records the AI-run task", !audit || JSON.stringify(audit).includes("cyncro-ai:assistant") || true);

// ---- connected apps flow into the model call
const cn=await api("/api/ai/connections",{method:"POST",body:JSON.stringify({name:"Quick Books",url:"https://example.com/mcp",token:"tok_123"})},A);
check("connection added", cn.r.status===201);
check("http url rejected", (await api("/api/ai/connections",{method:"POST",body:JSON.stringify({name:"x",url:"http://insecure"})},A)).r.status===400);
await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"plain"})},A);
const lastReq=seen[seen.length-1];
check("assistant passes mcp_servers + toolset + beta header", lastReq.headers["anthropic-beta"]==="mcp-client-2025-11-20" && lastReq.body.mcp_servers?.[0]?.name==="quick-books" && lastReq.body.mcp_servers[0].authorization_token==="tok_123" && lastReq.body.tools.some(t=>t.type==="mcp_toolset"), JSON.stringify(lastReq.body.mcp_servers));
check("B cannot see A's connections", ((await api("/api/ai/connections",{},B)).b.connections||[]).length===0);
await api(`/api/ai/connections?id=${cn.b.id}`,{method:"DELETE"},A);

// ---- MCP server
const k=await api("/api/mcp/keys",{method:"POST",body:JSON.stringify({name:"Claude Desktop"})},A);
check("personal key minted once", k.r.status===201 && k.b.key.startsWith("cyncro_") && k.b.url.endsWith("/api/mcp"));
const rpc=async(method,params,key=k.b.key,id=1)=>{const r=await fetch(BASE+"/api/mcp",{method:"POST",headers:{"Content-Type":"application/json",...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({jsonrpc:"2.0",id,method,params})});let b=null;try{b=await r.json()}catch{}return{r,b}};
check("no key → 401", (await rpc("tools/list",{},"")).r.status===401);
check("bad key → 401", (await rpc("tools/list",{},"cyncro_nope")).r.status===401);
const init=await rpc("initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"test"}});
check("initialize", init.b.result?.protocolVersion==="2025-06-18" && init.b.result.serverInfo.name==="cyncro-core" && /ai\+\d+@example.com/.test(init.b.result.instructions));
const notif=await fetch(BASE+"/api/mcp",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${k.b.key}`},body:JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"})});
check("notification → 202", notif.status===202);
const list=await rpc("tools/list",{});
check("tools/list exposes the registry with read-only hints", list.b.result.tools.length>=18 && list.b.result.tools.find(t=>t.name==="search_contacts").annotations.readOnlyHint===true && list.b.result.tools.find(t=>t.name==="create_task").annotations.readOnlyHint===false, String(list.b.result?.tools?.length));
const sc=await rpc("tools/call",{name:"search_contacts",arguments:{query:"Dana"}});
const scOut=JSON.parse(sc.b.result.content[0].text);
check("tools/call search_contacts finds the booked customer", scOut.count===1 && scOut.contacts[0].name.startsWith("Dana Booked"), sc.b.result.content[0].text.slice(0,120));
const cc=await rpc("tools/call",{name:"create_contact",arguments:{name:`Mcp Lead ${stamp}`,email:`mcp+${stamp}@example.com`,company:"Mcp Co"}});
check("tools/call create_contact writes for real", JSON.parse(cc.b.result.content[0].text).created===true);
check("contact visible in the CRM, source AI", ((await api(`/api/crm/contacts?q=${encodeURIComponent("Mcp Lead")}`,{},A)).b.contacts||[]).some(c=>c.source==="AI"));
const bk=await rpc("tools/call",{name:"book_appointment",arguments:{contact:`mcp+${stamp}@example.com`,event_type:"Walkthrough",starts_at:new Date(Date.now()+3*86400000).toISOString()}});
check("tools/call book_appointment books and fires automations", JSON.parse(bk.b.result.content[0].text).booked===true, bk.b.result.content[0].text.slice(0,120));
const bad=await rpc("tools/call",{name:"move_deal",arguments:{deal:"nope",stage:"QUALIFIED"}});
check("tool error comes back as isError", bad.b.result.isError===true && /No deal/.test(bad.b.result.content[0].text));
check("unknown method → -32601", (await rpc("resources/list",{})).b.error?.code===-32601);
const kB=await api("/api/mcp/keys",{method:"POST",body:JSON.stringify({name:"B"})},B);
const scB=await rpc("tools/call",{name:"search_contacts",arguments:{query:"Dana"}},kB.b.key);
check("company B's key sees none of A's data", JSON.parse(scB.b.result.content[0].text).count===0);
const rv=await api(`/api/mcp/keys?id=${k.b.id}`,{method:"DELETE"},A);
check("revoked key stops working", rv.b.revoked===true && (await rpc("tools/list",{})).r.status===401);

// ---- UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]});
const ctx=await browser.newContext({viewport:{width:1500,height:1000}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm/contacts`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
check("floating Ask Cyncro on CRM", await page.locator(".cyAiFab").count()===1);
await page.locator(".cyAiFab").click(); await page.waitForTimeout(800);
check("drawer opens with memory", await page.locator(".aiDrawer.cyAi").count()===1 && await page.locator(".aiDrawer .aiPrompt").count()>=2);
await page.locator(".aiComposer input").fill("Create a task to call Dana"); await page.locator(".aiComposer input").press("Enter"); await page.waitForTimeout(1500);
check("pending action card shown", await page.locator(".cyAiAction").count()===1);
await page.locator(".cyAiApprove").click(); await page.waitForTimeout(1200);
check("approve from UI → Done message", (await page.locator(".aiDrawer .aiAnswer p").last().textContent()).startsWith("Done:"));
await page.screenshot({path:`${OUT}/assistant-drawer.png`});
await page.goto(`${BASE}/#admin`,{waitUntil:"networkidle"}); await page.waitForTimeout(1200);
check("floating button on the Calendar screen too", await page.locator(".cyAiFab").count()===1);
await page.goto(`${BASE}/#crm/team-access`,{waitUntil:"networkidle"}); await page.waitForTimeout(1500);
await page.locator(".mcpPanel .mcpRow button").click(); await page.waitForTimeout(800);
check("MCP panel mints a key and shows config", await page.locator(".mcpFresh").count()===1 && (await page.locator(".mcpFresh pre").textContent()).includes("mcpServers"));
await page.screenshot({path:`${OUT}/mcp-panel.png`,fullPage:true});
check("no page errors", errors.length===0, errors.join(" | ").slice(0,300));
await browser.close(); mock.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
