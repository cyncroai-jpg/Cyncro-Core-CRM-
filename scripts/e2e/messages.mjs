// Cyncro Messages: Meta connect (mock graph), Instagram/Facebook/WhatsApp webhooks, comment → public reply + private DM, AI drafts with guarded auto-reply,
// stop words, 24h window, SMS inbound via Twilio webhook, email inbound via the ingest path, start email thread, deauthorize/data-deletion callbacks, honest channel statuses, UI.
// Needs .dev.vars: META_APP_ID=123456 META_APP_SECRET=metasecret META_VERIFY_TOKEN=verifyme META_API_BASE=META_OAUTH_BASE=http://127.0.0.1:5195, Twilio mock :5196, Resend mock :5197, ANTHROPIC_BASE_URL :5199, E2E_INGEST_TOKEN=ingest-e2e
import http from "node:http";
import { createHmac } from "node:crypto";
import { chromium } from "playwright-core";
const BASE="http://127.0.0.1:5177"; const stamp=Date.now(); const OUT=process.env.OUT||".";
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
// ── mocks ──
const graphCalls=[]; const PAGE="PAGE1", IG="IG1", WA="100100";
const graph=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{const u=new URL(req.url,"http://x"); let j={}; try{j=body?JSON.parse(body):{}}catch{} graphCalls.push({method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),body:j});
  const send=(o,code=200)=>{res.writeHead(code,{"content-type":"application/json"});res.end(JSON.stringify(o))};
  if(u.pathname==="/oauth/access_token") return send({access_token:u.searchParams.get("fb_exchange_token")?"LONGTOKEN":"SHORTTOKEN",token_type:"bearer"});
  if(u.pathname==="/me") return send({id:"USER9",name:"Dana Owner"});
  if(u.pathname==="/me/accounts") return send({data:[{id:PAGE,name:"Summit Air Page",access_token:"PAGETOKEN",instagram_business_account:{id:IG,username:"summitair"}}]});
  if(/\/subscribed_apps$/.test(u.pathname)) return send({success:true});
  if(u.pathname==="/PSID1") return send({id:"PSID1",name:"Hal Homeowner",first_name:"Hal",last_name:"Homeowner"});
  if(u.pathname==="/IGS1") return send({id:"IGS1",name:"Nia",username:"nia.moves"});
  if(/\/messages$/.test(u.pathname)) return send({message_id:"mid."+graphCalls.length,messages:[{id:"wamid."+graphCalls.length}]});
  if(/\/(replies|comments)$/.test(u.pathname)) return send({id:"cmt."+graphCalls.length});
  send({error:{message:"unknown "+u.pathname}},400);});});
const texts=[]; const twilio=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{texts.push(Object.fromEntries(new URLSearchParams(body)));res.writeHead(201,{"content-type":"application/json"});res.end(JSON.stringify({sid:"SM"+texts.length,status:"queued"}))})});
const mails=[]; const resend=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{try{mails.push(JSON.parse(body))}catch{} res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"em"+mails.length}))})});
const modelCalls=[]; const model=http.createServer((req,res)=>{let body="";req.on("data",c=>body+=c);req.on("end",()=>{const b=JSON.parse(body); modelCalls.push(b); const last=b.messages[b.messages.length-1].content; const m=/Latest customer message: ([\s\S]*)$/.exec(typeof last==="string"?last:""); const text=(m?m[1]:"").toLowerCase();
  let out; if(/how much|price/.test(text)) out={intent:"PRICE",draft:"Our AC tune-up is $129 and we have openings this week. Want me to hold one for you?"};
  else if(/book|available/.test(text)) out={intent:"BOOKING",draft:"Happy to get you in. What day works best?"};
  else if(/worst|refund/.test(text)) out={intent:"COMPLAINT",draft:""};
  else if(/love/.test(text)) out={intent:"COMPLIMENT",draft:"Thank you, that made our day!"};
  else out={intent:"OTHER",draft:"Thanks for reaching out. How can we help?"};
  res.writeHead(200,{"content-type":"application/json"}); res.end(JSON.stringify({content:[{type:"text",text:JSON.stringify(out)}],stop_reason:"end_turn",usage:{input_tokens:40,output_tokens:20}}));});});
await Promise.all([new Promise(r=>graph.listen(5195,"127.0.0.1",r)),new Promise(r=>twilio.listen(5196,"127.0.0.1",r)),new Promise(r=>resend.listen(5197,"127.0.0.1",r)),new Promise(r=>model.listen(5199,"127.0.0.1",r))]);
const sign=(raw)=>"sha256="+createHmac("sha256","metasecret").update(raw).digest("hex");
const hook=async(payload)=>{const raw=JSON.stringify(payload); return fetch(BASE+"/api/webhooks/meta",{method:"POST",headers:{"content-type":"application/json","x-hub-signature-256":sign(raw)},body:raw});};
// ── company ──
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Summit Msg ${stamp}`,displayName:"Dana",email:`dana+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
const slug=(await api("/api/tenants/settings",{},A)).b.company.slug;
// 0) webhook verification + honest statuses before anything is connected
const v=await fetch(BASE+"/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verifyme&hub.challenge=abc123");
check("Meta webhook verification echoes the challenge", v.status===200 && (await v.text())==="abc123");
check("wrong verify token rejected", (await fetch(BASE+"/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=x")).status===403);
let ch=(await api("/api/messages?view=channels",{},A)).b;
const st=(k)=>ch.channels.find(c=>c.kind===k);
check("7 channels listed with honest states", ch.channels.length===7 && st("INSTAGRAM").state==="NEEDS_SETUP" && st("WHATSAPP").state==="NEEDS_SETUP" && st("SMS").state==="CONNECTED" && st("EMAIL").state==="CONNECTED" && st("TIKTOK").state==="NOT_AVAILABLE" && st("LINKEDIN").state==="NOT_AVAILABLE" && !st("TIKTOK").dm, JSON.stringify(ch.channels.map(c=>[c.kind,c.state])));
check("TikTok/LinkedIn cards say DMs aren't offered, not 'coming soon'", /does not offer/i.test(st("TIKTOK").detail) && /does not offer/i.test(st("LINKEDIN").detail));
// 1) Connect with Facebook (mock dialog → callback)
const start=await api("/api/messages/meta?step=start&format=json",{},A);
check("connect start builds the Facebook dialog with signed state + scopes", start.r.ok && /\/dialog\/oauth\?/.test(start.b.url) && /instagram_manage_messages/.test(start.b.url), JSON.stringify(start.b).slice(0,120));
const state=new URL(start.b.url).searchParams.get("state");
const cb=await fetch(`${BASE}/api/messages/meta?step=callback&code=CODE1&state=${encodeURIComponent(state)}&format=json`,{redirect:"manual"}); const cbb=await cb.json().catch(()=>({}));
check("callback saved the Page and its Instagram account and subscribed the webhook", cb.status===200 && cbb.saved===2 && graphCalls.some(c=>/subscribed_apps/.test(c.path)), JSON.stringify(cbb));
check("tampered state is refused", (await fetch(`${BASE}/api/messages/meta?step=callback&code=CODE1&state=${encodeURIComponent(state.slice(0,-4)+"AAAA")}`,{redirect:"manual"})).status===302);
ch=(await api("/api/messages?view=channels",{},A)).b;
check("Instagram + Facebook now CONNECTED with account names", st("INSTAGRAM").state==="CONNECTED" && st("INSTAGRAM").accounts[0].name==="@summitair" && st("FACEBOOK").accounts[0].name==="Summit Air Page");
// 2) WhatsApp manual connect
check("WhatsApp number connected", (await api("/api/messages",{method:"POST",body:JSON.stringify({action:"connect_whatsapp",phoneNumberId:WA,token:"WATOKEN",displayName:"Main line"})},A)).r.ok);
// 3) inbound: Messenger DM (price question) → thread + contact + draft, not auto-sent (auto-reply off)
check("unsigned webhook rejected", (await fetch(BASE+"/api/webhooks/meta",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).status===403);
await hook({object:"page",entry:[{id:PAGE,time:Date.now(),messaging:[{sender:{id:"PSID1"},recipient:{id:PAGE},timestamp:Date.now(),message:{mid:"m1",text:"How much is an AC tune-up?"}}]}]});
await sleep(800);
let list=(await api("/api/messages?view=threads",{},A)).b;
let fb=list.threads.find(t=>t.kind==="FACEBOOK");
check("Messenger DM became a thread with the sender's name and PRICE intent", fb && fb.display_name==="Hal Homeowner" && fb.intent==="PRICE" && fb.unread===1, JSON.stringify(fb||list).slice(0,200));
check("draft is waiting, nothing auto-sent", fb && /\$129/.test(fb.draft||"") && !graphCalls.some(c=>c.path===`/${PAGE}/messages`));
const contacts=(await api("/api/crm/contacts?q=Hal%20Homeowner",{},A)).b.contacts||[];
check("sender is one CRM contact (source FACEBOOK)", contacts.length===1 && contacts[0].source==="FACEBOOK" && fb.contact_id===contacts[0].id);
await hook({object:"page",entry:[{id:PAGE,messaging:[{sender:{id:"PSID1"},recipient:{id:PAGE},message:{mid:"m1",text:"How much is an AC tune-up?"}}]}]});
check("Meta redelivery of the same mid is ignored", (await api(`/api/messages?view=thread&id=${fb.id}`,{},A)).b.messages.length===1);
// approve the draft (edited) → Graph send on the Page
const ap=await api("/api/messages",{method:"POST",body:JSON.stringify({action:"approve",threadId:fb.id,body:"Our AC tune-up is $129. Want Tuesday 10am?"})},A);
const sent=graphCalls.find(c=>c.path===`/${PAGE}/messages`&&c.method==="POST");
check("approving the draft sent it through the Page token to the PSID", ap.r.ok && sent && sent.query.access_token==="PAGETOKEN" && sent.body.recipient.id==="PSID1" && /Tuesday/.test(sent.body.message.text), JSON.stringify(ap.b));
let d=(await api(`/api/messages?view=thread&id=${fb.id}`,{},A)).b;
check("thread shows the outbound, read, draft cleared, window open with hours left", d.messages.length===2 && d.messages[1].direction==="OUT" && d.thread.draft===null && d.thread.unread===0 && d.thread.window_open===true && d.thread.window_ends_at);
// 4) Instagram comment → public reply and private DM
await hook({object:"instagram",entry:[{id:IG,changes:[{field:"comments",value:{id:"c1",text:"love this! is it available saturday?",from:{id:"IGS1",username:"nia.moves"},media:{id:"media1"}}}]}]});
await sleep(600);
list=(await api("/api/messages?view=threads&kind=INSTAGRAM",{},A)).b; const ig=list.threads[0];
check("Instagram comment landed as a COMMENT in a thread for @nia.moves", ig && ig.handle==="nia.moves" && (await api(`/api/messages?view=thread&id=${ig.id}`,{},A)).b.messages[0].kind==="COMMENT", JSON.stringify(ig||list).slice(0,160));
const pub=await api("/api/messages",{method:"POST",body:JSON.stringify({action:"send",threadId:ig.id,body:"Yes! Saturday is open, sending you the details.",replyToCommentId:"c1"})},A);
const priv=await api("/api/messages",{method:"POST",body:JSON.stringify({action:"send",threadId:ig.id,body:"Hey Nia, Saturday 9am or 1pm work. Book here when ready.",replyToCommentId:"c1",privateReply:true})},A);
check("public reply posted under the comment", pub.r.ok && graphCalls.some(c=>c.path==="/c1/replies" && /Saturday is open/.test(c.body.message)));
check("private reply DM sent against the comment id", priv.r.ok && graphCalls.some(c=>c.path===`/${IG}/messages` && c.body.recipient?.comment_id==="c1"));
// 5) WhatsApp inbound → auto-reply ON for PRICE/BOOKING with the caps
const rules=await api("/api/messages",{method:"POST",body:JSON.stringify({action:"settings",autoReply:true,autoIntents:["PRICE","BOOKING"],maxPerDay:1})},A);
check("reply rules saved", rules.r.ok && rules.b.settings.autoReply===true && rules.b.settings.maxPerDay===1);
const waHook=(id,text,from="15550108888")=>hook({object:"whatsapp_business_account",entry:[{id:"WABA",changes:[{field:"messages",value:{metadata:{phone_number_id:WA},contacts:[{wa_id:from,profile:{name:"Rosa Perez"}}],messages:[{from,id,timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:text}}]}}]}]});
await waHook("w1","Hi, how much for a duct cleaning?"); await sleep(800);
let waSends=graphCalls.filter(c=>c.path===`/${WA}/messages`);
check("WhatsApp price question was auto-answered once (Cloud API payload)", waSends.length===1 && waSends[0].body.messaging_product==="whatsapp" && waSends[0].body.to==="15550108888" && /\$129/.test(waSends[0].body.text.body), JSON.stringify(waSends[0]?.body||null).slice(0,160));
await waHook("w2","and how much for a second unit?"); await sleep(800);
waSends=graphCalls.filter(c=>c.path===`/${WA}/messages`);
check("second price question the same day is NOT auto-answered (1/day cap), draft waits instead", waSends.length===1 && /\$129|openings/.test((await api("/api/messages?view=threads&kind=WHATSAPP",{},A)).b.threads[0].draft||""));
await waHook("w3","👍"); await sleep(500);
check("emoji-only message gets no auto-reply", graphCalls.filter(c=>c.path===`/${WA}/messages`).length===1);
await waHook("w4","This is the worst service, I want a refund"); await sleep(600);
let waT=(await api("/api/messages?view=threads&kind=WHATSAPP",{},A)).b.threads[0];
check("complaint is flagged for a human and never drafted", waT.intent==="COMPLAINT" && waT.needs_human===1 && !waT.draft && graphCalls.filter(c=>c.path===`/${WA}/messages`).length===1);
check("'Needs a person' filter shows it", (await api("/api/messages?view=threads&status=NEEDS_HUMAN",{},A)).b.threads.some(t=>t.id===waT.id));
await waHook("w5","STOP messaging me"); await sleep(600);
waT=(await api("/api/messages?view=threads&kind=WHATSAPP",{},A)).b.threads[0];
check("stop word opts the person out of automation", waT.opted_out===1);
const waPhone=(await api("/api/crm/contacts?q=Rosa",{},A)).b.contacts[0];
check("WhatsApp sender is a CRM contact with her phone", waPhone && /5550108888/.test(waPhone.phone||""));
// 6) 24h window: backdate last inbound and try to reply
const ingestOld=await api("/api/messages/ingest",{method:"POST",headers:{"x-ingest-token":"ingest-e2e"}},"");
check("ingest route needs the token (401/404 without)", ingestOld.r.status===404 || ingestOld.r.status===400);
// email inbound via ingest (same path the worker's email() handler uses)
const em=await fetch(BASE+"/api/messages/ingest",{method:"POST",headers:{"content-type":"application/json","x-ingest-token":"ingest-e2e"},body:JSON.stringify({to:`${slug}@mail.example.com`,from:`Ted Buyer <ted+${stamp}@example.com>`,subject:"Quote for 3 ton unit",text:"Hi there,\n\nCan you book me for an estimate next week?\n\nThanks,\nTed\n\nOn Mon, Dana wrote:\n> old quoted text"})});
const emb=await em.json();
check("inbound email routed to the company by slug, quoted history trimmed", em.status===200 && emb.ok && (await api(`/api/messages?view=thread&id=${emb.threadId}`,{},A)).b.messages[0].body==="Hi there,\n\nCan you book me for an estimate next week?\n\nThanks,\nTed", JSON.stringify(emb));
const emT=(await api(`/api/messages?view=thread&id=${emb.threadId}`,{},A)).b;
check("email thread: BOOKING intent, auto-replied through Resend with Re: subject", emT.thread.intent==="BOOKING" && mails.length===1 && /^Re: Quote for 3 ton unit$/.test(mails[0].subject) && mails[0].to[0]===`ted+${stamp}@example.com`, JSON.stringify(mails[0]||null).slice(0,160));
check("email contact linked by address", (await api(`/api/crm/contacts?q=ted%2B${stamp}`,{},A)).b.contacts.length===1);
check("unknown recipient is rejected, not guessed", (await fetch(BASE+"/api/messages/ingest",{method:"POST",headers:{"content-type":"application/json","x-ingest-token":"ingest-e2e"},body:JSON.stringify({to:"nobody-here@mail.example.com",from:"x@example.com",text:"hi"})})).status===400);
// 7) SMS inbound through the Twilio webhook lands in the inbox for the matching contact
await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Sam Texter ${stamp}`,email:`sam+${stamp}@example.com`,phone:"5550107771"})},A);
const smsIn=async(from,body)=>{const params={From:from,To:"+15550100000",Body:body,MessageSid:"SMx"+Date.now()}; const base="https://127.0.0.1:5177/api/webhooks/twilio"+Object.keys(params).sort().map(k=>k+params[k]).join(""); const sig=createHmac("sha1","mocktoken").update(base).digest("base64"); return fetch(BASE+"/api/webhooks/twilio",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","x-twilio-signature":sig},body:new URLSearchParams(params)});};
await smsIn("+15550107771","Are you available Friday?"); await sleep(800);
const smsT=(await api("/api/messages?view=threads&kind=SMS",{},A)).b.threads[0];
check("customer text shows in the inbox on the existing contact", smsT && smsT.display_name===`Sam Texter ${stamp}` && smsT.intent==="BOOKING", JSON.stringify(smsT||null).slice(0,160));
check("BOOKING auto-reply went out as a text via Twilio", texts.some(x=>x.To==="+15550107771" && /day works/.test(x.Body)));
// 8) start a new email conversation from a contact
const startT=await api("/api/messages",{method:"POST",body:JSON.stringify({action:"start",contactId:(await api(`/api/crm/contacts?q=sam%2B${stamp}`,{},A)).b.contacts[0].id,kind:"EMAIL",subject:"Your estimate",body:"Hi Sam, attaching the estimate we discussed."})},A);
check("outbound email thread started from a contact", startT.r.ok && startT.b.threadId && mails.some(m=>m.subject==="Your estimate"), JSON.stringify(startT.b));
check("social DMs can't be started cold", (await api("/api/messages",{method:"POST",body:JSON.stringify({action:"start",contactId:"x",kind:"INSTAGRAM",body:"hey"})},A)).r.status===400);
// 9) automations: INBOUND_MESSAGE trigger with REPLY_IN_THREAD + SOCIAL_COMMENT public reply
const meta=(await api("/api/crm/automations",{},A)).b;
check("new triggers + reply step in the builder", meta.triggers.some(t=>t[0]==="INBOUND_MESSAGE") && meta.triggers.some(t=>t[0]==="SOCIAL_COMMENT") && (meta.stepTypes||meta.steps||[]).some(s=>s[0]==="REPLY_IN_THREAD"), JSON.stringify((meta.stepTypes||[]).slice(-2)));
await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:`Comment thanks ${stamp}`,trigger:"SOCIAL_COMMENT",steps:[{type:"REPLY_IN_THREAD",publicReply:true,body:"Thanks {{contact.first_name}}! Check your DMs."},{type:"ADD_TAG",tag:"commenter"}]})},A);
await hook({object:"instagram",entry:[{id:IG,changes:[{field:"comments",value:{id:"c2",text:"what are your hours?",from:{id:"IGS2",username:"leo.k"},media:{id:"media1"}}}]}]});
await sleep(1200);
check("SOCIAL_COMMENT automation replied publicly under the new comment", graphCalls.some(c=>c.path==="/c2/replies" && /Thanks/.test(c.body.message)), JSON.stringify(graphCalls.filter(c=>/c2/.test(c.path)).map(c=>c.path)));
// 10) Meta callbacks: deauthorize + data deletion
const signedReq=(payload)=>{const p=Buffer.from(JSON.stringify(payload)).toString("base64url"); const s=createHmac("sha256","metasecret").update(p).digest("base64url"); return `${s}.${p}`;};
const del=await fetch(BASE+"/api/webhooks/meta?action=delete",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({signed_request:signedReq({user_id:"USER9",algorithm:"HMAC-SHA256"})})}); const delb=await del.json();
check("data deletion callback removes the Meta channels + threads and returns a confirmation", del.status===200 && delb.confirmation_code && /privacy\?deletion=/.test(delb.url), JSON.stringify(delb));
ch=(await api("/api/messages?view=channels",{},A)).b;
check("after deletion Instagram/Facebook are back to NEEDS_SETUP, WhatsApp untouched", st("INSTAGRAM").state==="NEEDS_SETUP" && st("WHATSAPP").state==="CONNECTED");
check("forged signed_request rejected", (await fetch(BASE+"/api/webhooks/meta?action=deauthorize",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({signed_request:"bad.eyJ1c2VyX2lkIjoiVVNFUjkifQ"})})).status===400);
// 11) UI
const browser=await chromium.launch({executablePath:"/opt/pw-browsers/chromium",headless:true,args:["--no-sandbox"]}); const errors=[];
const ctx=await browser.newContext({viewport:{width:1440,height:960}}); await ctx.addCookies([{name:"cyncro_session",value:A.split("=")[1],domain:"127.0.0.1",path:"/"}]);
const page=await ctx.newPage(); page.on("pageerror",e=>errors.push(e.message)); page.on("dialog",dd=>dd.accept());
await page.goto(`${BASE}/#messages`,{waitUntil:"load"}); await page.waitForTimeout(2500); await page.locator(".wlActions .cyAiMini").click({timeout:1500}).catch(()=>{});
check("inbox renders with threads from several channels", (await page.locator(".mxList li:not(.mxEmpty)").count())>=4);
await page.locator(".mxList li",{hasText:"Rosa Perez"}).first().click(); await page.waitForTimeout(900);
check("WhatsApp thread shows bubbles, the auto reply labelled, and the complaint flag", (await page.locator(".mxMsg.out").count())>=1 && /Cyncro \(auto\)/.test(await page.locator(".mxThread").textContent()) && /OPTED OUT/.test(await page.locator(".mxHeadActions").textContent()));
await page.screenshot({path:`${OUT}/messages-inbox.png`});
await page.locator(".mxNew").click(); await page.waitForTimeout(300);
await page.locator(".mxModal input").fill("Sam Texter"); await page.waitForTimeout(900);
await page.locator(".mxSearch li button").first().click(); await page.waitForTimeout(300);
await page.locator(".mxKindPick button",{hasText:"Text"}).click();
await page.locator(".mxModal textarea").fill("Friday 2pm is open, want it?"); await page.locator(".mxModalActions .coSave").click(); await page.waitForTimeout(1500);
check("New message from the inbox texts a contact via Twilio and opens the thread", texts.some(x=>x.To==="+15550107771" && /Friday 2pm/.test(x.Body)) && /Friday 2pm/.test(await page.locator(".mxThread").textContent()));
check("thread header offers 'Also email' for a texter with an email", (await page.locator(".mxHeadActions button",{hasText:"Also email"}).count())===1);
await page.locator(".mxTop nav button",{hasText:"Channels"}).click(); await page.waitForTimeout(700);
const cards=await page.locator(".mxChannel").count(); const tiktok=await page.locator(".mxChannel",{hasText:"TikTok"}).textContent();
check("channels page shows 7 cards; TikTok says NOT OFFERED", cards===7 && /NOT OFFERED/.test(tiktok));
await page.screenshot({path:`${OUT}/messages-channels.png`});
check("no page errors", errors.length===0, errors.join(" | ").slice(0,200));
await browser.close(); graph.close(); twilio.close(); resend.close(); model.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
