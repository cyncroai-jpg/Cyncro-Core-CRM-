// New automation steps: CREATE_INVOICE and CREATE_JOB run from a won deal.
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Steps Co ${stamp}`,displayName:"Stu",email:`stu+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
const meta=(await api("/api/crm/automations",{},A)).b;
check("builder lists the new step types", (meta.stepTypes||[]).some(t=>t[0]==="CREATE_INVOICE") && (meta.stepTypes||[]).some(t=>t[0]==="CREATE_JOB"));
const wf=await api("/api/crm/automations",{method:"POST",body:JSON.stringify({name:`Won → invoice + job ${stamp}`,trigger:"DEAL_WON",steps:[{type:"CREATE_INVOICE",description:"{{deal.name}} · {{amount}}",dueInDays:5},{type:"CREATE_JOB",serviceType:"Install",inDays:2,revenueDollars:4000},{type:"ADD_TAG",tag:"customer"}]})},A);
check("workflow with new steps saves", wf.r.status===201, JSON.stringify(wf.b).slice(0,120));
const acct=await api("/api/crm/accounts",{method:"POST",body:JSON.stringify({name:`Won Co ${stamp}`})},A);
const ct=await api("/api/crm/contacts",{method:"POST",body:JSON.stringify({fullName:`Wendy Won ${stamp}`,email:`wendy+${stamp}@example.com`,phone:"5550101111",accountId:acct.b.account.id})},A);
const cid=ct.b.contact?.id||ct.b.id;
const deal=await api("/api/crm/opportunities",{method:"POST",body:JSON.stringify({accountId:acct.b.account.id,primaryContactId:cid,name:`Kitchen remodel ${stamp}`,stage:"QUALIFIED",value:4000})},A);
const mv=await api("/api/crm/opportunities",{method:"PATCH",body:JSON.stringify({id:deal.b.opportunity.id,updates:{stage:"CLOSED WON"}})},A);
check("deal moved to won", mv.r.ok);
await new Promise(r=>setTimeout(r,1500));
const inv=(await api("/api/crm/invoices",{},A)).b.invoices.find(i=>i.client_email===`wendy+${stamp}@example.com`);
check("invoice created from the deal value with the deal name", inv && inv.amount_cents===400000 && inv.status==="DRAFT" && inv.description.includes("Kitchen remodel") && inv.description.includes("$4,000"), JSON.stringify(inv||null).slice(0,500));
const jobs=(await api("/api/dispatch/jobs",{},A)).b.jobs||[];
const job=jobs.find(j=>j.service_type==="Install");
check("dispatch job booked for the customer 2 days out", job && job.status==="BOOKED" && job.revenue_cents===400000 && new Date(job.scheduled_at)>new Date(Date.now()+86400000), JSON.stringify(job||jobs.length));
const tl=(await api(`/api/crm/contacts/across?id=${cid}`,{},A)).b;
check("contact page shows both across products", tl.jobs.length===1 && tl.invoices.length===1);
const w=(await api("/api/crm/automations",{},A)).b.workflows.find(x=>x.id===wf.b.id);
check("enrollment completed without failure", Number(w.failed_enrollments||0)===0 && Number(w.enrolled_count||w.active_enrollments||1)>=1, JSON.stringify({f:w.failed_enrollments,e:w.enrolled_count}));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
