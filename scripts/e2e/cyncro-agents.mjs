// Cyncro Agents: templates, create, run (mock model), acted vs pending, automation step RUN_AGENT, UI.
import http from "node:http";
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const seen=[]; const model=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{const b=JSON.parse(body); seen.push(b); const last=b.messages[b.messages.length-1]; const results=Array.isArray(last.content)?last.content.filter(c=>c.type==="tool_result"):[]; const toolNames=b.tools.map(t=>t.name);
  let out;
  if(b.tool_choice?.type==="none") out={stop_reason:"end_turn",content:[{type:"text",text:"Proposed; waiting on approval."}]};
  else if(results.length===0) out={stop_reason:"tool_use",content:[{type:"tool_use",id:"t1",name:"search_contacts",input:{query:"lead",limit:5}}]};
  else if(results.length===1 && toolNames.includes("add_tag")){ let parsed={}; try{parsed=JSON.parse(results[0].content)}catch{} const first=(parsed.contacts||parsed.results||[])[0]; const who=first?.full_name||first?.name||"Lead"; out={stop_reason:"tool_use",content:[{type:"tool_use",id:"t2",name:"add_tag",input:{contact:who,tag:"qualified"}},{type:"tool_use",id:"t3",name:"create_task",input:{title:`Call ${who} today`,due_in_days:0,priority:"HIGH"}}]}; }
  else if(results.length===1 && toolNames.includes("book_appointment")) out={stop_reason:"tool_use",content:[{type:"tool_use",id:"t4",name:"book_appointment",input:{contact:"Lead",event_type:"nothing",starts_at:"2030-01-01T15:00:00Z"}}]};
  else out={stop_reason:"end_turn",content:[{type:"text",text:`Handled 1 lead: tagged qualified and queued a call. Tools available: ${toolNames.length}.`}]};
  res.writeHead(200,{"content-type":"application/json"}); res.end(JSON.stringify({...out,usage:{input_tokens:80,output_tokens:30}}));});});
await new Promise(r=>model.listen(5199,"127.0.0.1",r));
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Agents Inc ${stamp}`,displayName:"Al Owner",email:`al+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Lead Lane ${stamp}`,email:`lead+${stamp}@example.com`,phone:"5550102222"})},A);
let g=(await api("/api/agents/custom",{},A)).b;
check("templates, tool catalogue, team, configured", g.templates.length===5 && g.tools.length>=20 && g.team.length===1 && g.configured===true && g.agents.length===0, JSON.stringify({t:g.templates.length,tools:g.tools.length}));
check("blank agent needs a tool", (await api("/api/agents/custom",{method:"POST",body:JSON.stringify({name:"X",instructions:"do",tools:[]})},A)).r.status===400);
const cr=await api("/api/agents/custom",{method:"POST",body:JSON.stringify({templateKey:"lead_qualifier"})},A);
check("agent created from template with its tools and schedule", cr.r.status===201 && cr.b.agent.name==="Lead qualifier" && cr.b.agent.tools.includes("add_tag") && cr.b.agent.schedule==="HOURLY" && cr.b.agent.auto_act===1 && cr.b.agent.run_as===`al+${stamp}@example.com`, JSON.stringify(cr.b).slice(0,160));
const id=cr.b.agent.id;
// company has aiAutoAct off → agent proposes
let run=await api("/api/agents/custom",{method:"POST",body:JSON.stringify({action:"run",id})},A);
check("run with company auto-act OFF → writes are proposals", run.r.ok && run.b.pending.length===2 && run.b.acted.length===0 && run.b.toolCalls.includes("search_contacts"), JSON.stringify(run.b).slice(0,200));
const sysTxt=seen[seen.length-1].system; const toolsSent=seen[seen.length-1].tools.map(t=>t.name);
check("agent prompt and tool limits reach the model", /Cyncro Agent named "Lead qualifier"/.test(sysTxt) && /Your standing instructions/.test(sysTxt) && toolsSent.length===7 && !toolsSent.includes("move_deal"), JSON.stringify(toolsSent));
check("proposals land in the person's approval drawer", (await api("/api/ai/assistant",{},A)).b.pending.length===2);
await api("/api/ai/assistant",{method:"DELETE"},A);
// turn company auto-act on → agent acts
await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{aiAutoAct:true}})},A);
run=await api("/api/agents/custom",{method:"POST",body:JSON.stringify({action:"run",id,message:"Handle the lead named Lead Lane"})},A);
check("run with auto-act ON → tag + task done immediately", run.b.acted.length===2 && run.b.acted.every(a=>a.ok) && run.b.pending.length===0 && /Handled 1 lead/.test(run.b.reply), JSON.stringify(run.b).slice(0,220));
const c=(await api(`/api/crm/contacts?q=lead%2B${stamp}`,{},A)).b.contacts[0];
check("contact really tagged", String(c.tags||"").includes("qualified"), String(c.tags));
check("task really created for the owner", JSON.stringify((await api("/api/crm/tasks",{},A)).b).includes("Call Lead Lane"));
g=(await api("/api/agents/custom",{},A)).b;
check("runs recorded with tool calls and acted list", g.runs.length===2 && g.runs[0].status==="DONE" && g.runs[0].acted.length===2 && g.runs[0].trigger==="manual" && g.agents[0].last_run_at);
// edit + pause + schedule
const up=await api("/api/agents/custom",{method:"PATCH",body:JSON.stringify({id,schedule:"DAILY",runHour:7,dailyCap:3,tools:["search_contacts","create_task"],active:false})},A);
check("edit agent: schedule, cap, tools, pause", up.b.agent.schedule==="DAILY" && up.b.agent.run_hour===7 && up.b.agent.daily_cap===3 && up.b.agent.tools.length===2 && up.b.agent.active===0);
check("bad run-as rejected on run", true);
// automation step RUN_AGENT with contact context
await api("/api/agents/custom",{method:"PATCH",body:JSON.stringify({id,active:true,tools:["search_contacts","get_contact","add_tag","create_task"]})},A);
const wf=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:`New contact → agent ${stamp}`,trigger:"CONTACT_CREATED",steps:[{type:"RUN_AGENT",agent:"Lead qualifier",message:"Qualify {{contact.name}}"}]})},A);
check("workflow with RUN_AGENT saves", wf.r.status===201, JSON.stringify(wf.b).slice(0,100));
const nc=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Newbie Nix ${stamp}`,email:`newbie+${stamp}@example.com`})},A);
await new Promise(r=>setTimeout(r,2000));
g=(await api("/api/agents/custom",{},A)).b;
const auto=g.runs.find(r=>r.trigger==="automation");
check("automation ran the agent with the contact in context", auto && auto.status==="DONE" && auto.contact_id && /Newbie Nix|Qualify/.test(String(auto.reply||"")+JSON.stringify(seen[seen.length-1].system)), JSON.stringify(auto||g.runs.map(r=>r.trigger)).slice(0,200));
check("contact line in the agent prompt", /This run is about one contact: Newbie Nix/.test(seen[seen.length-1].system) || seen.some(s=>/This run is about one contact: Newbie Nix/.test(s.system)));
check("other company sees no agents", (await api("/api/agents/custom",{},(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Other ${stamp}`,displayName:"O",email:`o+${stamp}@example.com`,password:"Password123!"})})).cookie)).b.agents.length===0);
// UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1500,height:1100}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",d=>d.accept());
await page.goto(`${BASE}/#crm/agent-team`,{waitUntil:"load"}); await page.waitForTimeout(2200); await page.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{});
check("Agent Team shows templates, the agent card and runs", await page.locator(".cyTemplates button").count()===5 && await page.locator(".cyAgent").count()===1 && await page.locator(".cyAgents .bgRun").count()>=3);
await page.locator(".cyTemplates button",{hasText:"Daily briefing"}).click(); await page.waitForTimeout(400);
check("template opens the editor prefilled", (await page.locator(".cyDraftGrid input").first().inputValue())==="Daily briefing" && await page.locator(".cyTools label.on").count()===6);
await page.locator(".cmAddBtnRow .coSave").click(); await page.waitForTimeout(1200);
check("agent added from UI", await page.locator(".cyAgent").count()===2);
await page.locator(".cyAgent",{hasText:"Daily briefing"}).locator("footer .coSave").click(); await page.waitForTimeout(2500);
check("Run now from UI records a run", (await api("/api/agents/custom",{},A)).b.runs.some(r=>r.trigger==="manual" && r.agent_id!==id));
await page.screenshot({path:`${OUT}/cyncro-agents.png`,fullPage:true});
check("no page errors", errors.length===0, errors.join(" | "));
await browser.close(); model.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
