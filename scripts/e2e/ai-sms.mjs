// Cyncro AI acting without asking (company setting) and Cyncro over SMS (teammate texts the Twilio number).
// Needs in .dev.vars: ANTHROPIC_BASE_URL=http://127.0.0.1:5199, TWILIO_API_BASE=http://127.0.0.1:5196, TWILIO_ACCOUNT_SID/AUTH_TOKEN unset-or-mock, TWILIO_PHONE_NUMBER.
import http from "node:http";
import { createHmac } from "node:crypto";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const when=new Date(); when.setDate(when.getDate()+2); when.setHours(15,0,0,0);
const model=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{const b=JSON.parse(body); const last=b.messages[b.messages.length-1]; const text=typeof last.content==="string"?last.content:""; const lastIsResult=Array.isArray(last.content)&&last.content.some(c=>c.type==="tool_result");
  let out;
  if(b.tool_choice?.type==="none") out={stop_reason:"end_turn",content:[{type:"text",text:"Queued for your approval."}]};
  else if(lastIsResult){const tr=last.content.find(c=>c.type==="tool_result").content; out={stop_reason:"end_turn",content:[{type:"text",text:/^Done:/.test(tr)?`Booked. ${tr.slice(0,60)}`:`Result: ${tr.slice(0,80)}`}]};}
  else if(/book/i.test(text)) out={stop_reason:"tool_use",content:[{type:"tool_use",id:"tu_b",name:"book_appointment",input:{contact:`Mark Client ${stamp}`,event_type:`Consult ${stamp}`,starts_at:when.toISOString(),location_mode:"PHONE"}}]};
  else if(/move/i.test(text)) out={stop_reason:"tool_use",content:[{type:"tool_use",id:"tu_m",name:"move_deal",input:{deal:"nothing",stage:"QUALIFIED"}}]};
  else out={stop_reason:"end_turn",content:[{type:"text",text:"Plain answer."}]};
  res.writeHead(200,{"content-type":"application/json"}); res.end(JSON.stringify({...out,usage:{input_tokens:50,output_tokens:20}}));});});
const texts=[]; const twilio=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{texts.push(Object.fromEntries(new URLSearchParams(body)));res.writeHead(201,{"content-type":"application/json"});res.end(JSON.stringify({sid:"SM"+texts.length,status:"queued"}))})});
await new Promise(r=>model.listen(5199,"127.0.0.1",r)); await new Promise(r=>twilio.listen(5196,"127.0.0.1",r));
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Auto Co ${stamp}`,displayName:"Avery Owner",email:`avery+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
await api("/api/calendar/event-types",{method:"POST",body:JSON.stringify({name:`Consult ${stamp}`,slug:`consult-${stamp}`,durationMinutes:30})},A);
await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Mark Client ${stamp}`,email:`mark+${stamp}@example.com`,phone:"5550109999"})},A);
// 1) default: booking is a proposal
let a=await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"book Mark 3pm",screen:"CRM"})},A);
check("approval mode: booking waits as pending", a.r.ok && a.b.pending.length===1 && a.b.acted.length===0 && /approval/i.test(a.b.reply), JSON.stringify(a.b).slice(0,160));
await api("/api/ai/assistant",{method:"DELETE"},A);
// 2) owner turns on act-without-asking
const st=await api("/api/tenants/settings",{method:"PATCH",body:JSON.stringify({settings:{aiAutoAct:true}})},A);
check("setting saved", st.b.settings.aiAutoAct===true);
a=await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"book Mark 3pm",screen:"CRM"})},A);
check("auto mode: booking happens immediately, model confirms", a.r.ok && a.b.pending.length===0 && a.b.acted.length===1 && a.b.acted[0].ok===true && /Booked/.test(a.b.reply), JSON.stringify(a.b).slice(0,200));
const bk=(await api("/api/calendar/bookings?range=upcoming",{},A)).b;
check("booking really exists on the calendar", JSON.stringify(bk).includes(`Mark Client ${stamp}`));
check("auto action is logged as done", (await api("/api/ai/assistant",{},A)).b.pending.length===0);
a=await api("/api/ai/assistant",{method:"POST",body:JSON.stringify({message:"move the deal",screen:"CRM"})},A);
check("high-risk write still waits for approval even in auto mode", a.b.pending.length===1 && a.b.acted.length===0);
await api("/api/ai/assistant",{method:"DELETE"},A);
// 3) SMS: teammate sets mobile, texts the company number
check("phone saved on profile", (await api("/api/auth/profile",{method:"PATCH",body:JSON.stringify({displayName:"Avery Owner",phone:"+15550107777"})},A)).r.ok && (await api("/api/auth/profile",{},A)).b.phone==="+15550107777");
const sms=async(from,body)=>{const params={From:from,To:"+15550100000",Body:body}; const base="https://127.0.0.1:5177/api/webhooks/twilio"+Object.keys(params).sort().map(k=>k+params[k]).join(""); const sig=createHmac("sha1","mocktoken").update(base).digest("base64"); return fetch(BASE+"/api/webhooks/twilio",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","x-twilio-signature":sig},body:new URLSearchParams(params)});};
let r=await sms("+15550107777","book Mark 3pm");
check("teammate text answered by SMS", r.ok && texts.length===1 && texts[0].To==="+15550107777" && /Booked|Failed|taken/.test(texts[0].Body), JSON.stringify(texts[0]));
r=await sms("+15550107777","move the deal");
check("SMS proposal asks for YES", texts.length===2 && /Reply YES to confirm/.test(texts[1].Body), texts[1]?.Body);
r=await sms("+15550107777","YES");
check("YES approves the last pending action", texts.length===3 && /Done|Couldn|no longer|not/.test(texts[2].Body), texts[2]?.Body);
r=await sms("+15550107777","yes");
check("nothing left → says so", texts.length===4 && /Nothing is waiting/.test(texts[3].Body), texts[3]?.Body);
r=await sms("+15550101234","hi there");
check("unknown number is treated as a customer, no AI reply", r.ok && texts.length===4);
console.log(`\n${pass} passed, ${fail} failed`); model.close(); twilio.close(); process.exit(fail?1:0);
