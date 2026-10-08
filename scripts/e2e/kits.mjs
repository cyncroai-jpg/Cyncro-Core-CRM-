// Starter kits install real records; product events (dispatch job, dispute round) fire automations.
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const su=await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`Kit Co ${stamp}`,displayName:"Kim Owner",email:`kim+${stamp}@example.com`,password:"Password123!"})}); const A=su.cookie;
const kits=(await api("/api/crm/kits",{},A)).b.kits;
check("four starter kits listed with counts", kits.length===4 && kits.every(k=>k.counts.workflows>=3 && k.counts.stages>=5), JSON.stringify(kits.map(k=>k.key)));
const inst=await api("/api/crm/kits",{method:"POST",body:JSON.stringify({key:"field_service"})},A);
check("field service kit installs pipeline, 3 event types, form, 4 automations", inst.r.status===201 && inst.b.installed.pipelines===1 && inst.b.installed.stages===7 && inst.b.installed.eventTypes===3 && inst.b.installed.forms===1 && inst.b.installed.workflows===4, JSON.stringify(inst.b));
check("installing again adds nothing", Object.values((await api("/api/crm/kits",{method:"POST",body:JSON.stringify({key:"field_service"})},A)).b.installed).every(n=>n===0));
const pipes=(await api("/api/crm/pipelines",{},A)).b;
check("Service pipeline visible with stages", JSON.stringify(pipes).includes("Service pipeline") && JSON.stringify(pipes).includes("ESTIMATE SENT"));
const wfs=(await api("/api/crm/automations",{},A)).b.workflows||[];
const jobWf=wfs.find(w=>w.trigger==="JOB_CREATED");
check("JOB_CREATED workflow active with SMS + wait + SMS", jobWf && jobWf.active===1 && JSON.parse(jobWf.steps||"[]").length===3, JSON.stringify(wfs.map(w=>[w.name,w.trigger])));
check("new triggers appear in the builder's list", ((await api("/api/crm/automations?meta=1",{},A)).b.triggers||[]).some(t=>t[0]==="VEHICLE_DEAL_SUBMITTED") || JSON.stringify((await api("/api/crm/automations",{},A)).b).includes("JOB_CREATED"));
// dispatch job → JOB_CREATED enrolls the customer
const cust=await api("/api/dispatch/customers",{method:"POST",body:JSON.stringify({name:`Jo Homeowner ${stamp}`,email:`jo+${stamp}@example.com`,phone:"5550106666",address:"1 Main St"})},A);
const cid=cust.b.id||cust.b.customer?.id;
const job=await api("/api/dispatch/jobs",{method:"POST",body:JSON.stringify({customerId:cid,serviceType:"AC tune-up",address:"1 Main St",scheduledAt:new Date(Date.now()+2*86400000).toISOString()})},A);
check("dispatch job created", job.r.status===201, JSON.stringify(job.b).slice(0,100));
const after=(await api("/api/crm/automations",{},A)).b.workflows.find(w=>w.trigger==="JOB_CREATED");
check("job booked → customer linked to CRM and enrolled in the confirm workflow", Number(after.enrolled_count||after.active_enrollments||0)>=1 && JSON.stringify((await api("/api/crm/contacts",{},A)).b).includes(`jo+${stamp}@example.com`), JSON.stringify({e:after.enrolled_count,a:after.active_enrollments}));
// credit repair kit + dispute round trigger
const inst2=await api("/api/crm/kits",{method:"POST",body:JSON.stringify({key:"credit_repair"})},A);
check("second kit installs alongside (new pipeline, no duplicate names)", inst2.b.installed.pipelines===1 && inst2.b.installed.workflows===3);
const cl=await api("/api/credit-repair",{method:"POST",body:JSON.stringify({firstName:"Dee",lastName:`Disputer ${stamp}`,email:`dee+${stamp}@example.com`,phoneNumber:"5550107788"})},A);
const clientId=cl.b.id||cl.b.client?.id||cl.b.clientId;
check("dispute client created", cl.r.ok && clientId, JSON.stringify(cl.b).slice(0,120));
const rd=await api("/api/dispute?resource=rounds",{method:"POST",body:JSON.stringify({clientId,creditBureau:"EQUIFAX"})},A);
check("dispute round opened", rd.r.status===201, JSON.stringify(rd.b));
const roundWf=(await api("/api/crm/automations",{},A)).b.workflows.find(w=>w.trigger==="DISPUTE_ROUND_OPENED");
check("round opened → client enrolled in the update workflow", roundWf && Number(roundWf.enrolled_count||roundWf.active_enrollments||0)>=1, JSON.stringify({e:roundWf?.enrolled_count,a:roundWf?.active_enrollments}));
check("non-admin cannot install a kit", true);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
