// Two companies must never see each other's dispatch data.
const BASE="http://127.0.0.1:5177"; const stamp=Date.now();
let pass=0, fail=0; const check=(n,ok,x="")=>{(ok?pass++:fail++);console.log(`${ok?"PASS":"FAIL"} ${n}${x?" — "+x:""}`)};
async function api(p,init={},cookie=""){const r=await fetch(BASE+p,{...init,headers:{"Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})}});let b=null;try{b=await r.json()}catch{}return{r,b,cookie:(r.headers.get("set-cookie")||"").split(";")[0]}}
const mk=async(n)=>(await api("/api/tenants/signup",{method:"POST",body:JSON.stringify({tenantName:`${n} ${stamp}`,displayName:n,email:`${n.toLowerCase()}+${stamp}@example.com`,password:"Password123!"})})).cookie;
const A=await mk("Alpha"), B=await mk("Bravo");
const ca=await api("/api/dispatch/customers",{method:"POST",body:JSON.stringify({name:"Alpha Customer",address:"1 Alpha St, Tampa, FL"})},A);
check("A creates customer",ca.r.status===201);
const ja=await api("/api/dispatch/jobs",{method:"POST",body:JSON.stringify({customerId:ca.b.id,serviceType:"AC repair",address:"1 Alpha St, Tampa, FL",scheduledAt:new Date().toISOString(),revenue:100})},A);
check("A creates job",ja.r.status===201);
const ta=await api("/api/dispatch/technicians",{method:"POST",body:JSON.stringify({name:"Alpha Tech",hourlyRate:40})},A);
await api("/api/dispatch/jobs/notes",{method:"POST",body:JSON.stringify({jobId:ja.b.id,body:"alpha note"})},A);
await api("/api/dispatch/inventory",{method:"POST",body:JSON.stringify({name:"Alpha part",quantity:3})},A);
const seed=await api("/api/dispatch/seed-demo",{method:"POST",body:"{}"},B); check("B seeds its own demo",seed.r.status===201||seed.b?.seeded===false,JSON.stringify(seed.b));
// B cannot see A
const lb=(await api("/api/dispatch/jobs",{},B)).b.jobs; check("B job list excludes A's job", !lb.some(j=>j.id===ja.b.id) && lb.every(j=>j.customer_name!=="Alpha Customer"));
check("B cannot read A's job by id", (await api(`/api/dispatch/jobs?id=${ja.b.id}`,{},B)).r.status===404);
check("B cannot read A's customer", (await api(`/api/dispatch/customers?id=${ca.b.id}`,{},B)).r.status===404);
check("B tech list excludes A's tech", !(await api("/api/dispatch/technicians",{},B)).b.technicians.some(t=>t.id===ta.b.id));
check("B inventory excludes A's part", !(await api("/api/dispatch/inventory",{},B)).b.items.some(i=>i.name==="Alpha part"));
check("B cannot add note to A's job", (await api("/api/dispatch/jobs/notes",{method:"POST",body:JSON.stringify({jobId:ja.b.id,body:"intrusion"})},B)).r.status===404);
check("B cannot add material to A's job", (await api("/api/dispatch/materials",{method:"POST",body:JSON.stringify({jobId:ja.b.id,name:"x"})},B)).r.status===404);
check("B cannot clock on A's job", (await api("/api/dispatch/jobs/time",{method:"POST",body:JSON.stringify({jobId:ja.b.id})},B)).r.status===404);
check("B cannot invoice A's job", (await api("/api/dispatch/invoices",{method:"POST",body:JSON.stringify({jobId:ja.b.id})},B)).r.status===404);
await api("/api/dispatch/jobs",{method:"PATCH",body:JSON.stringify({id:ja.b.id,status:"CANCELLED"})},B);
check("B PATCH on A's job is a no-op", (await api(`/api/dispatch/jobs?id=${ja.b.id}`,{},A)).b.job.status!=="CANCELLED");
await api(`/api/dispatch/jobs?id=${ja.b.id}`,{method:"DELETE"},B);
check("B DELETE on A's job is refused", (await api(`/api/dispatch/jobs?id=${ja.b.id}`,{},A)).r.status===200);
check("B cannot create job for A's customer", (await api("/api/dispatch/jobs",{method:"POST",body:JSON.stringify({customerId:ca.b.id,serviceType:"x",address:"y",scheduledAt:new Date().toISOString()})},B)).r.status===404);
// A still sees its own
const la=(await api("/api/dispatch/jobs?summary=1",{},A)).b.jobs; check("A sees own job with note count", la.some(j=>j.id===ja.b.id && j.notes_count===1));
check("A analytics loads", (await api("/api/dispatch/analytics",{},A)).r.status===200);
check("anonymous is denied", (await api("/api/dispatch/jobs")).r.status===403);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail?1:0);
