"use client";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

const times = [
  "9:00 AM",
  "9:30 AM",
  "10:30 AM",
  "1:00 PM",
  "2:30 PM",
  "4:00 PM",
];
type Tab =
  | "home"
  | "book"
  | "admin"
  | "studio"
  | "crm"
  | "messages"
  | "prospecting"
  | "dispatch"
  | "dispute"
  | "finance"
  | "apex"
  | "sign"
  | "form"
  | "prime";
export default function Home() {
  const [tab, setTab] = useState<Tab>("home"),
    [permissions, setPermissions] = useState<{
      role: string;
      crm_access: number;
      calendar_access: number;
      prospecting_access: number;
    } | null>(null),
    [step, setStep] = useState(1),
    [location, setLocation] = useState(""),
    [time, setTime] = useState(""),
    [view, setView] = useState("Month"),
    [date, setDate] = useState(18);
  const canAccess = (destination: Tab) =>
    destination === "home" ||
    !permissions ||
    permissions.role === "OWNER" ||
    (destination === "crm" && Boolean(permissions.crm_access)) ||
    (["book", "admin", "studio"].includes(destination) &&
      Boolean(permissions.calendar_access)) ||
    (destination === "prospecting" && Boolean(permissions.prospecting_access));
  const navigate = (destination: Tab) => {
    if (!canAccess(destination)) {
      setTab("crm");
      window.history.pushState(null, "", "#crm");
      return;
    }
    setTab(destination);
    window.history.pushState(
      null,
      "",
      destination === "home" ? window.location.pathname : `#${destination}`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const validTabs: Tab[] = [
      "home",
      "book",
      "admin",
      "studio",
      "crm",
      "messages",
      "prospecting",
      "dispatch",
      "dispute",
      "finance",
      "apex",
      "sign",
      "form",
      "prime",
    ];
    const syncRoute = () => {
      const route = window.location.hash.slice(1) as Tab;
      setTab(validTabs.includes(route) ? route : "home");
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, []);
  useEffect(() => {
    void fetch("/api/access").then(async (response) => {
      const data = (await response.json()) as {
        member?: {
          role: string;
          crm_access: number;
          calendar_access: number;
          prospecting_access: number;
        };
      };
      if (response.ok && data.member) setPermissions(data.member);
    });
  }, []);
  return (
    <main
      className="cyncroApp readable themeDark"
    >
      <header className={tab === "home" ? "frontHeader" : ""}>
        <button className="logo logoButton" onClick={() => navigate("home")}>
          <i>Cyncro</i> Core
        </button>
        <nav>
          {[
            ["home", "Overview"],
            ["book", "Booking experience"],
            ["studio", "Core Studio"],
            ["crm", "Cyncro CRM"],
            ["messages", "Messages"],
            ["prospecting", "Prospecting"],
            ["dispatch", "Dispatch"],
            ["dispute", "Dispute"],
            ["finance", "Finance"],
            ["apex", "Apex Funds"],
            ["prime", "Prime AI"],
            ["admin", "Operations"],
          ]
            .filter((x) => canAccess(x[0] as Tab))
            .map((x) => (
              <button
                className={tab === x[0] ? "navon" : ""}
                onClick={() => navigate(x[0] as Tab)}
                key={x[0]}
              >
                {x[1]}
              </button>
            ))}
          <span>● DEMO LIVE</span>
        </nav>
      </header>
      {tab === "home" ? (
        <FrontExperience
          onExperience={() => navigate("book")}
          onPlatform={() => navigate("studio")}
          onOperations={() => navigate("admin")}
          onNavigate={navigate}
        />
      ) : tab === "book" ? (
        <PublicBookingExperience />
      ) : tab === "studio" ? (
        <Studio onPreview={() => navigate("book")} />
      ) : tab === "crm" ? (
        <UniversalCRM
          onOpenCalendar={() => navigate("admin")}
          onOpenProspecting={() => navigate("prospecting")}
          isOwner={!permissions || permissions.role === "OWNER"}
        />
      ) : tab === "messages" ? (
        <CyncroMessagesComingSoon />
      ) : tab === "prospecting" ? (
        <CyncroProspecting onOpenCRM={() => navigate("crm")} />
      ) : tab === "dispatch" ? (
        <CyncroDispatch />
      ) : tab === "dispute" ? (
        <CyncroDispute />
      ) : tab === "finance" ? (
        <CyncroFinance />
      ) : tab === "apex" ? (
        <ApexFunds />
      ) : tab === "sign" ? (
        <ContractSigning />
      ) : tab === "form" ? (
        <CyncroFormClient />
      ) : tab === "prime" ? (
        <CyncroPrime />
      ) : tab === "admin" ? (
        <Admin onCreate={() => navigate("studio")} />
      ) : (
        <section className="wrap">
          <p className="eyebrow">CYNCRO MEDIA • PRIVATE BOOKING</p>
          <div className="card">
            <aside>
              <div className="mark">C</div>
              <small>Cyncro Media</small>
              <h1>
                Executive
                <br />
                Strategy Session
              </h1>
              <p>
                A focused private session to map your goals, systems, and next
                move.
              </p>
              <hr />
              <b>◷ 30 minutes</b>
              <small>Eastern Time</small>
              <hr />
              <b>✦ Instant confirmation</b>
              <small>Email details included</small>
              <footer>◆ Conflict-protected scheduling</footer>
            </aside>
            <article>
              <div className="progress">
                <b>{step}</b> of 3
              </div>
              {step === 1 && (
                <>
                  <label>STEP 1 OF 3</label>
                  <h2>How would you like to meet?</h2>
                  <p>Choose the setting that works best for you.</p>
                  <div className="locations">
                    {[
                      ["Video call", "Meet, Zoom, or FaceTime"],
                      ["Phone call", "We’ll call your number"],
                      ["In person", "Confirm the meeting address"],
                    ].map((x) => (
                      <button
                        onClick={() => {
                          setLocation(x[0]);
                          setStep(2);
                        }}
                        key={x[0]}
                      >
                        <i>◇</i>
                        <b>{x[0]}</b>
                        <small>{x[1]}</small>
                        <em>→</em>
                      </button>
                    ))}
                  </div>
                  <div className="note">
                    <b>Your time is protected.</b> Availability updates in real
                    time with automatic double-booking protection.
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="row">
                    <div>
                      <label>STEP 2 OF 3</label>
                      <h2>Select a date & time</h2>
                    </div>
                    <div className="toggle">
                      {["Month", "Week"].map((x) => (
                        <button
                          className={view === x ? "on" : ""}
                          onClick={() => setView(x)}
                          key={x}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="calendar">
                    <div>
                      <h3>‹　 August 2026　 ›</h3>
                      <div className="days">
                        {"SMTWTFS".split("").map((x, i) => (
                          <small key={i}>{x}</small>
                        ))}
                        {Array.from({ length: 31 }, (_, i) => (
                          <button
                            className={i + 1 === date ? "selected" : ""}
                            onClick={() => {
                              setDate(i + 1);
                              setTime("");
                            }}
                            key={i}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="times">
                      <b>August {date}, 2026</b>
                      {times.map((x) => (
                        <button
                          className={time === x ? "selected" : ""}
                          onClick={() => setTime(x)}
                          key={x}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="actions">
                    <button onClick={() => setStep(1)}>Back</button>
                    <button disabled={!time} onClick={() => setStep(3)}>
                      Continue →
                    </button>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <label>STEP 3 OF 3</label>
                  <h2>Complete your booking</h2>
                  <div className="held">Held for you • 04:58</div>
                  <div className="summary">
                    August {date}, 2026 at {time}
                    <small>30 min · {location}</small>
                  </div>
                  <div className="form">
                    <input placeholder="First name" />
                    <input placeholder="Last name" />
                    <input placeholder="Email address" />
                    <input placeholder="Phone number" />
                    {location === "Video call" && (
                      <select>
                        <option>Google Meet</option>
                        <option>Zoom</option>
                        <option>Apple FaceTime</option>
                      </select>
                    )}
                    {location === "In person" && (
                      <input placeholder="Meeting address" />
                    )}
                  </div>
                  <div className="actions">
                    <button onClick={() => setStep(2)}>Back</button>
                    <button onClick={() => setStep(4)}>
                      Confirm booking →
                    </button>
                  </div>
                </>
              )}
              {step === 4 && (
                <div className="success">
                  <div>✓</div>
                  <label>BOOKING CONFIRMED</label>
                  <h2>You’re officially on the calendar.</h2>
                  <p>
                    August {date}, 2026 at {time} · {location}
                  </p>
                  <div className="note">
                    A full confirmation with meeting details has been sent to
                    your email.
                  </div>
                  <button
                    onClick={() => {
                      setStep(1);
                      setTime("");
                    }}
                  >
                    Book another session
                  </button>
                </div>
              )}
            </article>
          </div>
        </section>
      )}
    </main>
  );
}

type CyncroFormField={id:string;label:string;type:string;required:boolean;options:string[]};
type CyncroFormRow={id:string;title:string;description?:string;status:string;public_token:string;fields_json:string;requires_signature:number;submission_count?:number};

function CRMForms({onFlash}:{onFlash:(message:string)=>void}){
  const empty={title:"New client questionnaire",description:"Complete the information below so our team can prepare your next step.",status:"DRAFT",requiresSignature:true,fields:[{id:crypto.randomUUID(),label:"What can we help you accomplish?",type:"LONG",required:true,options:[]}] as CyncroFormField[]};
  const [forms,setForms]=useState<CyncroFormRow[]>([]),[selected,setSelected]=useState(""),[editId,setEditId]=useState(""),[editing,setEditing]=useState(false),[draft,setDraft]=useState(empty),[submissions,setSubmissions]=useState<Record<string,unknown>[]>([]);
  const active=forms.find(f=>f.id===selected);
  const load=async()=>{const r=await fetch(`/api/crm/forms?fresh=${Date.now()}`,{cache:"no-store"}),d=await r.json() as {forms?:CyncroFormRow[];error?:string};if(!r.ok)return onFlash(d.error||"Forms could not load");setForms(d.forms||[]);if(!selected&&d.forms?.[0])setSelected(d.forms[0].id)};
  useEffect(()=>{void load()},[]);
  useEffect(()=>{if(!selected){setSubmissions([]);return}void fetch(`/api/crm/forms?id=${selected}`).then(r=>r.json()).then(d=>setSubmissions(d.submissions||[]))},[selected]);
  const openEdit=(row?:CyncroFormRow)=>{setEditId(row?.id||"");if(row){setDraft({title:row.title,description:row.description||"",status:row.status,requiresSignature:Boolean(row.requires_signature),fields:JSON.parse(row.fields_json||"[]")})}else setDraft({...empty,fields:empty.fields.map(x=>({...x,id:crypto.randomUUID()}))});setEditing(true)};
  const save=async()=>{const method=editId?"PATCH":"POST",body=editId?{id:editId,...draft}:draft;const r=await fetch("/api/crm/forms",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d=await r.json() as {id?:string;error?:string};if(!r.ok)return onFlash(d.error||"Form could not save");setEditing(false);if(d.id)setSelected(d.id);await load();onFlash("Form saved")};
  const share=async(row:CyncroFormRow)=>{const url=`${location.origin}${location.pathname}?form=${row.public_token}#form`;await navigator.clipboard?.writeText(url);onFlash("Client form link copied")};
  const addField=(type:string)=>setDraft({...draft,fields:[...draft.fields,{id:crypto.randomUUID(),label:type==="FILE"?"Upload supporting files":type==="CHECKBOX"?"Select all that apply":"New question",type,required:false,options:type==="SELECT"||type==="CHECKBOX"?["Option 1","Option 2"]:[]}]});
  return <section className="formsOS">
    <div className="formsHero"><div><small>CYNCRO FORMS + INTAKE</small><h2>Questionnaires, signatures, and files—connected to the client.</h2><p>Build branded intake forms, collect documents and images, record electronic consent, and keep every response inside Cyncro.</p></div><button onClick={()=>{setSelected("");openEdit()}}>＋ New form</button></div>
    <div className="formsMetrics">{[[forms.length,"FORMS"],[forms.reduce((n,f)=>n+Number(f.submission_count||0),0),"SUBMISSIONS"],[forms.filter(f=>f.status==="PUBLISHED").length,"LIVE LINKS"],["20MB","PER FILE"]].map(x=><article key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></article>)}</div>
    <div className="formsLayout"><aside className="formsList"><header><b>Form library</b><button onClick={()=>void load()}>↻</button></header>{forms.map(row=><button className={selected===row.id?"active":""} key={row.id} onClick={()=>setSelected(row.id)}><span><b>{row.title}</b><small>{row.status} · {row.submission_count||0} responses</small></span><em>→</em></button>)}{!forms.length&&<p>Create your first questionnaire.</p>}</aside>
      <main className="formsStage">{editing?<><header><div><small>FORM BUILDER</small><h3>Edit every question and requirement</h3></div><button onClick={()=>setEditing(false)}>Close</button></header><div className="formSettings"><input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Form title"/><textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Client instructions"/><div className="fieldTools">{["SHORT","LONG","EMAIL","PHONE","NUMBER","DATE","SELECT","CHECKBOX","FILE"].map(t=><button key={t} onClick={()=>addField(t)}>＋ {t.toLowerCase()}</button>)}</div>{draft.fields.map((field,index)=><article className="fieldEditor" key={field.id}><i>{index+1}</i><input value={field.label} onChange={e=>{const fields=[...draft.fields];fields[index]={...field,label:e.target.value};setDraft({...draft,fields})}}/><select value={field.type} onChange={e=>{const fields=[...draft.fields];fields[index]={...field,type:e.target.value};setDraft({...draft,fields})}}>{["SHORT","LONG","EMAIL","PHONE","NUMBER","DATE","SELECT","CHECKBOX","FILE"].map(t=><option key={t}>{t}</option>)}</select><label><input type="checkbox" checked={field.required} onChange={e=>{const fields=[...draft.fields];fields[index]={...field,required:e.target.checked};setDraft({...draft,fields})}}/> Required</label><button className="dangerText" onClick={()=>setDraft({...draft,fields:draft.fields.filter(x=>x.id!==field.id)})}>Delete</button>{["SELECT","CHECKBOX"].includes(field.type)&&<input className="fieldOptions" value={field.options.join(", ")} onChange={e=>{const fields=[...draft.fields];fields[index]={...field,options:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)};setDraft({...draft,fields})}} placeholder="Options separated by commas"/>}</article>)}<div className="formPublish"><label><input type="checkbox" checked={draft.requiresSignature} onChange={e=>setDraft({...draft,requiresSignature:e.target.checked})}/> Require electronic signature</label><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select><button onClick={()=>void save()}>Save form</button></div></div></>:active?<><header><div><small>{active.status}</small><h3>{active.title}</h3></div><div><button onClick={()=>openEdit(active)}>Edit form</button><button onClick={()=>void share(active)}>Copy client link</button><button className="dangerText" onClick={async()=>{if(!confirm("Delete this form and its responses?"))return;await fetch(`/api/crm/forms?id=${active.id}`,{method:"DELETE"});setSelected("");await load();onFlash("Form deleted")}}>Delete</button></div></header><div className="formSummary"><p>{active.description}</p><div>{(JSON.parse(active.fields_json||"[]") as CyncroFormField[]).map((f,i)=><span key={f.id}><i>{i+1}</i><b>{f.label}</b><small>{f.type}{f.required?" · REQUIRED":""}</small></span>)}</div></div><section className="submissionLedger"><header><b>Client responses</b><span>{submissions.length} received</span></header>{submissions.map(s=><article key={String(s.id)}><div><b>{String(s.respondent_name)}</b><small>{String(s.respondent_email)}</small></div><span>{new Date(String(s.submitted_at)).toLocaleString()}</span><em>{Number(s.file_count||0)} files</em><strong>{s.signature_name?"SIGNED":"SUBMITTED"}</strong></article>)}{!submissions.length&&<p>No responses yet. Publish and share the client link.</p>}</section></>:<div className="formEmpty"><i>▤</i><h3>Build your first client intake</h3><p>Add questions, uploads, and a signature, then send one clean link.</p><button onClick={()=>openEdit()}>Create form</button></div>}</main></div>
  </section>
}

function CyncroFormClient(){
  const token=typeof window!=="undefined"?new URLSearchParams(location.search).get("form")||"":"";
  const [form,setForm]=useState<Record<string,unknown>|null>(null),[answers,setAnswers]=useState<Record<string,unknown>>({}),[name,setName]=useState(""),[email,setEmail]=useState(""),[signature,setSignature]=useState(""),[accepted,setAccepted]=useState(false),[files,setFiles]=useState<Record<string,File[]>>({}),[error,setError]=useState(""),[saving,setSaving]=useState(false),[done,setDone]=useState(false);
  useEffect(()=>{if(!token)return setError("Form link is missing.");void fetch(`/api/crm/forms?token=${encodeURIComponent(token)}`).then(async r=>{const d=await r.json();if(!r.ok)setError(d.error||"Form unavailable");else setForm(d.form)})},[token]);
  const fields:CyncroFormField[]=form?JSON.parse(String(form.fields_json||"[]")):[];
  const submit=async()=>{setError("");for(const f of fields)if(f.required&&!answers[f.id]&&!(files[f.id]?.length))return setError(`Please complete: ${f.label}`);if(Number(form?.requires_signature)===1&&(!signature.trim()||!accepted))return setError("Type your signature and accept the electronic consent.");setSaving(true);const r=await fetch("/api/crm/forms",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"SUBMIT",token,respondentName:name,respondentEmail:email,answers,signatureName:signature})}),d=await r.json() as {submissionId?:string;error?:string};if(!r.ok){setSaving(false);return setError(d.error||"Submission failed")};for(const [questionId,list] of Object.entries(files))for(const file of list){const data=new FormData();data.append("token",token);data.append("submissionId",d.submissionId||"");data.append("questionId",questionId);data.append("file",file);const up=await fetch("/api/crm/forms/uploads",{method:"POST",body:data});if(!up.ok){setSaving(false);return setError("Your answers were saved, but one file could not upload.")}}setSaving(false);setDone(true)};
  if(done)return <section className="publicForm"><main className="formThankYou"><i>✓</i><small>SUBMISSION RECEIVED</small><h1>Everything is safely with our team.</h1><p>Your answers, signature, and uploaded files were recorded.</p></main></section>;
  return <section className="publicForm"><main><header><small>CYNCRO SECURE INTAKE</small><h1>{String(form?.title||"Loading form…")}</h1><p>{String(form?.description||"")}</p></header>{error&&<div className="bookingError">{error}</div>}{form&&<div className="publicFormBody"><div className="respondentGrid"><label>Your full name<input value={name} onChange={e=>setName(e.target.value)} required/></label><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label></div>{fields.map((f,index)=><label className="publicQuestion" key={f.id}><span><i>{index+1}</i><b>{f.label}</b>{f.required&&<em>Required</em>}</span>{f.type==="LONG"?<textarea onChange={e=>setAnswers({...answers,[f.id]:e.target.value})}/>:f.type==="SELECT"?<select onChange={e=>setAnswers({...answers,[f.id]:e.target.value})}><option value="">Choose one…</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:f.type==="CHECKBOX"?<div className="checkChoices">{f.options.map(o=><label key={o}><input type="checkbox" onChange={e=>{const old=Array.isArray(answers[f.id])?answers[f.id] as string[]:[];setAnswers({...answers,[f.id]:e.target.checked?[...old,o]:old.filter(x=>x!==o)})}}/>{o}</label>)}</div>:f.type==="FILE"?<div className="uploadZone"><input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" onChange={e=>setFiles({...files,[f.id]:Array.from(e.target.files||[])})}/><b>Choose pictures or documents</b><small>{files[f.id]?.map(x=>x.name).join(", ")||"Up to 20MB per file"}</small></div>:<input type={f.type==="EMAIL"?"email":f.type==="PHONE"?"tel":f.type.toLowerCase()} onChange={e=>setAnswers({...answers,[f.id]:e.target.value})}/>}</label>)}{Number(form.requires_signature)===1&&<section className="formSignature"><small>ELECTRONIC SIGNATURE</small><label>Type your full legal name<input value={signature} onChange={e=>setSignature(e.target.value)}/></label><label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> I confirm my responses are accurate and adopt my typed name as my electronic signature.</label></section>}<button className="formSubmit" disabled={saving} onClick={()=>void submit()}>{saving?"Securely submitting…":"Submit questionnaire →"}</button></div>}</main></section>
}

function ApexFunds() {
  const [view, setView] = useState<"pipeline" | "network" | "recovery">(
    "pipeline",
  );
  const [notice, setNotice] = useState("");
  const applications = [
    {
      applicant: "Meridian Transport",
      amount: "$425,000",
      lenders: 14,
      best: "9.2% · 60 mo",
      stage: "OFFERS READY",
      score: 742,
    },
    {
      applicant: "Northline Dental Group",
      amount: "$180,000",
      lenders: 9,
      best: "10.1% · 48 mo",
      stage: "UNDERWRITING",
      score: 701,
    },
    {
      applicant: "Atlas Commercial Roofing",
      amount: "$310,000",
      lenders: 17,
      best: "—",
      stage: "STIPS REQUIRED",
      score: 668,
    },
    {
      applicant: "Harbor Hospitality",
      amount: "$750,000",
      lenders: 21,
      best: "12.4% · 72 mo",
      stage: "LENDER REVIEW",
      score: 689,
    },
  ];
  const lenders = [
    [
      "Northstar Capital",
      "Preferred",
      "7 min ago",
      "9.2–13.8%",
      "24–72 mo",
      "ACTIVE",
    ],
    [
      "Cobalt Funding",
      "Equipment",
      "11 min ago",
      "10.4–16.2%",
      "36–60 mo",
      "ACTIVE",
    ],
    [
      "Summit Commercial",
      "SBA / Term",
      "18 min ago",
      "Prime + 2.75%",
      "60–120 mo",
      "ACTIVE",
    ],
    [
      "Velocity Advance",
      "Working capital",
      "24 min ago",
      "Factor 1.18–1.34",
      "6–18 mo",
      "ACTIVE",
    ],
  ];
  const recovery = [
    [
      "Pinnacle Auto Group",
      "Utilization 79%",
      "+46 pts est.",
      "45–60 days",
      "$240,000",
    ],
    [
      "Luna Wellness Partners",
      "2 reporting errors",
      "+31 pts est.",
      "30–45 days",
      "$125,000",
    ],
    [
      "Coastal Build Co.",
      "Thin business file",
      "Fundability plan",
      "60–90 days",
      "$390,000",
    ],
  ];
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  return (
    <section className="apexFunds">
      <aside className="apexRail">
        <div className="apexBrand">
          <i>▲</i>
          <span>
            <small>FINTECH INFRASTRUCTURE</small>
            <b>Apex Funds</b>
          </span>
        </div>
        <nav>
          <small>COMMAND CENTER</small>
          {(
            [
              ["pipeline", "Deal Intelligence", "28"],
              ["network", "Lender Network", "104"],
              ["recovery", "Approval Recovery", "12"],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              onClick={() => setView(key)}
            >
              <i>{key === "pipeline" ? "⌁" : key === "network" ? "◎" : "↗"}</i>
              <span>{label}</span>
              <em>{count}</em>
            </button>
          ))}
          <small>OPERATIONS</small>
          <button onClick={() => flash("Application intake opened")}>
            <i>＋</i>
            <span>New application</span>
          </button>
          <button onClick={() => flash("Document center opened")}>
            <i>▱</i>
            <span>Documents</span>
          </button>
          <button onClick={() => flash("Broker analytics opened")}>
            <i>⌗</i>
            <span>Broker analytics</span>
          </button>
        </nav>
        <div className="apexRailStatus">
          <span>●</span>
          <div>
            <small>NETWORK STATUS</small>
            <b>Integration ready</b>
            <p>
              Connect lender APIs and secure feeds to activate live
              synchronization.
            </p>
          </div>
        </div>
      </aside>
      <main>
        <header className="apexTop">
          <div>
            <small>APEX FUNDS · BROKER OPERATING SYSTEM</small>
            <h1>
              {view === "pipeline"
                ? "Every deal. Every lender. One truth."
                : view === "network"
                  ? "The entire lender network—normalized."
                  : "Turn declines into fundable deals."}
            </h1>
          </div>
          <button onClick={() => flash("Lender connection workflow opened")}>
            ＋ CONNECT LENDER
          </button>
        </header>
        {notice && <div className="apexNotice">✓ {notice}</div>}
        <div className="apexMetrics">
          {[
            ["$6.42M", "ACTIVE REQUESTS", "↑ 18.4%"],
            ["28", "OPEN APPLICATIONS", "7 need action"],
            ["104", "LENDER CONNECTIONS", "96 healthy"],
            ["$840K", "RECOVERABLE PIPELINE", "12 applicants"],
          ].map((metric) => (
            <article key={metric[1]}>
              <small>{metric[1]}</small>
              <b>{metric[0]}</b>
              <span>{metric[2]}</span>
            </article>
          ))}
        </div>
        {view === "pipeline" && (
          <>
            <section className="apexCommandCard">
              <header>
                <div>
                  <small>LIVE DEAL INTELLIGENCE</small>
                  <h2>Applications across the network</h2>
                </div>
                <span>STATUS NORMALIZATION ACTIVE</span>
              </header>
              <div className="apexTable apexDeals">
                <div>
                  <b>APPLICANT</b>
                  <b>REQUEST</b>
                  <b>LENDERS</b>
                  <b>BEST CURRENT OFFER</b>
                  <b>STATUS</b>
                </div>
                {applications.map((app) => (
                  <button
                    key={app.applicant}
                    onClick={() => flash(`${app.applicant} deal room opened`)}
                  >
                    <span>
                      <i>{app.applicant.slice(0, 2).toUpperCase()}</i>
                      <strong>{app.applicant}</strong>
                      <small>Credit {app.score}</small>
                    </span>
                    <b>{app.amount}</b>
                    <b>{app.lenders} matched</b>
                    <b>{app.best}</b>
                    <em>{app.stage}</em>
                  </button>
                ))}
              </div>
            </section>
            <div className="apexSplit">
              <section className="apexCommandCard">
                <header>
                  <div>
                    <small>DECISION VELOCITY</small>
                    <h2>One application, multiple outcomes</h2>
                  </div>
                </header>
                <div className="apexOfferFlow">
                  <span>
                    APPLICATION<i>1</i>
                  </span>
                  <b>→</b>
                  <span>
                    LENDERS<i>14</i>
                  </span>
                  <b>→</b>
                  <span>
                    RESPONSES<i>9</i>
                  </span>
                  <b>→</b>
                  <span>
                    QUALIFIED OFFERS<i>4</i>
                  </span>
                </div>
                <div className="apexOfferBest">
                  <small>BEST FIT IDENTIFIED</small>
                  <b>Northstar Capital</b>
                  <span>9.2% · 60 months · $8,864 estimated monthly</span>
                  <button onClick={() => flash("Offer comparison opened")}>
                    COMPARE ALL OFFERS →
                  </button>
                </div>
              </section>
              <section className="apexCommandCard apexAction">
                <small>NEXT BEST ACTION</small>
                <h2>3 stipulations block $935K in approvals.</h2>
                <p>
                  Apex normalized the lender requests and grouped duplicate
                  documents so your broker sends each item once.
                </p>
                <button onClick={() => flash("Stipulation workspace opened")}>
                  RESOLVE STIPULATIONS
                </button>
              </section>
            </div>
          </>
        )}
        {view === "network" && (
          <section className="apexCommandCard">
            <header>
              <div>
                <small>CONNECTED LENDER NETWORK</small>
                <h2>Rates, terms, programs, and health</h2>
              </div>
              <span>104 CONNECTIONS</span>
            </header>
            <div className="apexTable apexLenders">
              <div>
                <b>LENDER</b>
                <b>PROGRAM</b>
                <b>LAST UPDATE</b>
                <b>RATE / FACTOR</b>
                <b>TERM</b>
                <b>HEALTH</b>
              </div>
              {lenders.map((item) => (
                <button
                  key={item[0]}
                  onClick={() => flash(`${item[0]} connection opened`)}
                >
                  {item.map((value, index) =>
                    index === 5 ? (
                      <em key={value}>{value}</em>
                    ) : (
                      <span key={value}>{value}</span>
                    ),
                  )}
                </button>
              ))}
            </div>
            <div className="apexNetworkFoot">
              <div>
                <b>96</b>
                <span>Healthy</span>
              </div>
              <div>
                <b>6</b>
                <span>Attention</span>
              </div>
              <div>
                <b>2</b>
                <span>Reconnect</span>
              </div>
              <p>
                Production connections require each lender&apos;s approved API,
                secure file feed, or authorized portal integration.
              </p>
            </div>
          </section>
        )}
        {view === "recovery" && (
          <>
            <section className="apexRecoveryHero">
              <div>
                <small>BUILT-IN APPROVAL RECOVERY</small>
                <h2>A decline is a diagnosis—not the end of the deal.</h2>
                <p>
                  Identify the approval blocker, create a documented remediation
                  path, monitor progress, and return the applicant to the right
                  lenders when fundability improves.
                </p>
              </div>
              <div>
                <b>$840K</b>
                <span>recoverable opportunity</span>
                <small>
                  Never promise deletion or approval. Every action remains
                  documented and reviewable.
                </small>
              </div>
            </section>
            <section className="apexCommandCard">
              <header>
                <div>
                  <small>RECOVERY QUEUE</small>
                  <h2>Applicants with a path back to funding</h2>
                </div>
                <span>12 ACTIVE PLANS</span>
              </header>
              <div className="apexTable apexRecovery">
                <div>
                  <b>APPLICANT</b>
                  <b>PRIMARY BLOCKER</b>
                  <b>PROJECTED IMPACT</b>
                  <b>REVIEW WINDOW</b>
                  <b>DEAL VALUE</b>
                </div>
                {recovery.map((item) => (
                  <button
                    key={item[0]}
                    onClick={() => flash(`${item[0]} recovery plan opened`)}
                  >
                    {item.map((value, index) =>
                      index === 2 ? (
                        <em key={value}>{value}</em>
                      ) : (
                        <span key={value}>{value}</span>
                      ),
                    )}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </section>
  );
}

function ContractSigning() {
  type Contract = {
    title: string;
    client_name: string;
    body: string;
    contract_status?: string;
    status?: string;
    signer_name?: string;
    signed_at?: string;
    signing_order?: number;
    signer_role?: string;
    expires_at?: string;
    owner_signer_name?: string;
    owner_signed_at?: string;
  };
  const [contract, setContract] = useState<Contract | null>(null),
    [name, setName] = useState(""),
    [accepted, setAccepted] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const token =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("contract") || ""
      : "";
  useEffect(() => {
    if (!token) {
      setError("Signature link is missing.");
      return;
    }
    void fetch(`/api/crm/contracts?token=${encodeURIComponent(token)}`).then(
      async (response) => {
        const data = (await response.json()) as {
          contract?: Contract;
          error?: string;
        };
        if (!response.ok) {
          setError(data.error || "Contract unavailable");
          return;
        }
        setContract(data.contract || null);
        setName(data.contract?.signer_name || "");
      },
    );
  }, [token]);
  const sign = async () => {
    if (!accepted || !name.trim()) {
      setError("Type your legal name and accept the agreement.");
      return;
    }
    const consentText =
      "I reviewed and agree to this contract and adopt my typed name as my electronic signature.";
    const response = await fetch("/api/crm/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signerName: name, consentText }),
      }),
      data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Signature could not be recorded");
      return;
    }
    setDone(true);
  };
  const completed =
    contract?.status === "SIGNED" || contract?.contract_status === "SIGNED";
  return (
    <section className="contractSigning">
      <main>
        {done ? (
          <div className="signatureSuccess">
            <i>✓</i>
            <small>AGREEMENT SIGNED</small>
            <h1>Your signature is recorded.</h1>
            <p>
              The audit trail now contains your consent, date, time, and network
              record.
            </p>
          </div>
        ) : (
          <>
            <header>
              <small>CYNCRO SECURE AGREEMENT</small>
              <h1>{contract?.title || "Loading agreement…"}</h1>
              <p>Prepared for {contract?.client_name || "client"}</p>
              {contract?.signing_order && (
                <span>
                  SIGNER {contract.signing_order} ·{" "}
                  {contract.signer_role || "CLIENT"}
                </span>
              )}
              {contract?.expires_at && (
                <span>
                  EXPIRES {new Date(contract.expires_at).toLocaleDateString()}
                </span>
              )}
            </header>
            {error && <div className="bookingError">{error}</div>}
            {contract && (
              <>
                <article>{contract.body}</article>
                {completed ? (
                  <div className="signatureSuccess">
                    <b>Agreement completed</b>
                    <span>
                      {contract.owner_signed_at &&
                        `Countersigned ${new Date(contract.owner_signed_at).toLocaleString()}`}
                    </span>
                  </div>
                ) : contract.status === "SIGNED" ? (
                  <div className="signatureSuccess">
                    <b>Already signed by {contract.signer_name}</b>
                    <span>
                      {contract.signed_at &&
                        new Date(contract.signed_at).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <div className="signatureBox">
                    <label>
                      Legal signature
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Type your full legal name"
                      />
                    </label>
                    <label className="signatureConsent">
                      <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(event) => setAccepted(event.target.checked)}
                      />{" "}
                      I have reviewed and agree to this contract. My typed name
                      is my electronic signature.
                    </label>
                    <button onClick={() => void sign()}>
                      Adopt and sign agreement
                    </button>
                    <small>
                      Signing creates a timestamped audit event. Cyncro records
                      consent and network information for evidence.
                    </small>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </section>
  );
}

function PublicBookingExperience() {
  type EventType = {
    id: string;
    name: string;
    slug: string;
    description?: string;
    duration_minutes: number;
    location_modes: string;
    video_platforms: string;
    host_name?: string;
  };
  type Slot = { startsAt: string; endsAt: string; remaining: number };
  const [events, setEvents] = useState<EventType[]>([]);
  const [eventId, setEventId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [locationMode, setLocationMode] = useState("VIDEO");
  const [videoPlatform, setVideoPlatform] = useState("GOOGLE_MEET");
  const [startsAt, setStartsAt] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const selected = events.find((item) => item.id === eventId);
  const selectedDuration = selected?.duration_minutes || 0;
  const modes: string[] = selected
    ? JSON.parse(selected.location_modes || "[]")
    : [];
  const platforms: string[] = selected
    ? JSON.parse(selected.video_platforms || "[]")
    : [];
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/calendar/event-types");
        const data = (await response.json()) as {
          eventTypes?: EventType[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(data.error || "Booking page unavailable");
        const list = data.eventTypes || [];
        setEvents(list);
        const slug = new URLSearchParams(window.location.search).get("event");
        setEventId(
          list.find((item) => item.slug === slug)?.id || list[0]?.id || "",
        );
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Booking page unavailable",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!eventId) return;
    void (async () => {
      setError("");
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const response = await fetch(
        `/api/calendar/availability?eventTypeId=${encodeURIComponent(eventId)}&from=${encodeURIComponent(from.toISOString())}&days=21`,
      );
      const data = (await response.json()) as {
        slots?: Slot[];
        error?: string;
      };
      if (!response.ok) {
        setError(data.error || "Availability could not be loaded");
        return;
      }
      setSlots(data.slots || []);
      setStartsAt("");
    })();
  }, [eventId]);
  useEffect(() => {
    if (!selected) return;
    const nextModes: string[] = JSON.parse(selected.location_modes || "[]");
    const nextPlatforms: string[] = JSON.parse(
      selected.video_platforms || "[]",
    );
    if (!nextModes.includes(locationMode))
      setLocationMode(nextModes[0] || "PHONE");
    if (!nextPlatforms.includes(videoPlatform))
      setVideoPlatform(nextPlatforms[0] || "GOOGLE_MEET");
  }, [selected]);
  const book = async () => {
    if (!selected || !startsAt || !form.name.trim() || !form.email.trim()) {
      setError("Choose a time and enter your name and email.");
      return;
    }
    if (locationMode === "IN_PERSON" && !form.address.trim()) {
      setError("Enter the meeting address.");
      return;
    }
    setSaving(true);
    setError("");
    const response = await fetch("/api/calendar/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId: selected.id,
        customerName: form.name,
        customerEmail: form.email,
        customerPhone: form.phone,
        startsAt,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locationMode,
        videoPlatform: locationMode === "VIDEO" ? videoPlatform : null,
        meetingAddress: locationMode === "IN_PERSON" ? form.address : null,
        notes: form.notes,
      }),
    });
    const data = (await response.json()) as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Booking could not be completed");
      return;
    }
    setConfirmed(true);
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "booking", action: "created" },
      }),
    );
  };
  if (loading)
    return (
      <section className="liveBooking">
        <div className="bookingState">Loading live availability…</div>
      </section>
    );
  if (confirmed)
    return (
      <section className="liveBooking">
        <div className="bookingSuccess">
          <i>✓</i>
          <small>BOOKING CONFIRMED</small>
          <h1>You’re on the calendar.</h1>
          <p>
            {selected?.name} · {new Date(startsAt).toLocaleString()}
          </p>
          <b>
            {locationMode === "VIDEO"
              ? videoPlatform.replaceAll("_", " ")
              : locationMode === "PHONE"
                ? "Phone call"
                : form.address}
          </b>
          <span>
            Your booking is now visible in Cyncro CRM and on the assigned
            manager’s calendar.
          </span>
          <button
            onClick={() => {
              setConfirmed(false);
              setStartsAt("");
            }}
          >
            Book another appointment
          </button>
        </div>
      </section>
    );
  return (
    <section className="liveBooking">
      <aside>
        <small>CYNCRO PRIVATE SCHEDULING</small>
        <h1>{selected?.name || "Choose an appointment"}</h1>
        <p>
          {selected?.description ||
            "Select how you want to meet, then choose a live available time."}
        </p>
        <div>
          <b>{selected?.duration_minutes || 0} minutes</b>
          <span>Live availability</span>
          <span>Conflict protected</span>
          {selected?.host_name && <span>With {selected.host_name}</span>}
        </div>
      </aside>
      <main>
        <div className="liveBookingTop">
          <label>
            Event type
            <select
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              {events.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <span>1 · Meeting　2 · Time　3 · Details</span>
        </div>
        {!events.length ? (
          <div className="bookingState">No published event types yet.</div>
        ) : (
          <>
            <div className="bookingBlock fixedDurationBlock">
              <small>APPOINTMENT LENGTH</small>
              <div>
                <b>
                  {selectedDuration < 60
                    ? `${selectedDuration} minutes`
                    : selectedDuration % 60
                      ? `${Math.floor(selectedDuration / 60)} hr ${selectedDuration % 60} min`
                      : `${selectedDuration / 60} ${selectedDuration === 60 ? "hour" : "hours"}`}
                </b>
                <span>Set by the event organizer</span>
              </div>
            </div>
            <div className="bookingBlock">
              <small>HOW WOULD YOU LIKE TO MEET?</small>
              <div className="meetingChoice">
                {[
                  ["VIDEO", "Video call", "Meet, Zoom, or FaceTime"],
                  ["PHONE", "Phone call", "We’ll call your number"],
                  ["IN_PERSON", "In person", "Meet at a confirmed address"],
                ]
                  .filter((item) => modes.includes(item[0]))
                  .map((item) => (
                    <button
                      className={locationMode === item[0] ? "active" : ""}
                      onClick={() => setLocationMode(item[0])}
                      key={item[0]}
                    >
                      <b>{item[1]}</b>
                      <span>{item[2]}</span>
                    </button>
                  ))}
              </div>
              {locationMode === "VIDEO" && (
                <label className="bookingInput">
                  Video platform
                  <select
                    value={videoPlatform}
                    onChange={(event) => setVideoPlatform(event.target.value)}
                  >
                    {[
                      ["GOOGLE_MEET", "Google Meet"],
                      ["ZOOM", "Zoom"],
                      ["FACETIME", "Apple FaceTime"],
                    ]
                      .filter((item) => platforms.includes(item[0]))
                      .map((item) => (
                        <option value={item[0]} key={item[0]}>
                          {item[1]}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <div className="bookingBlock">
              <small>CHOOSE A LIVE AVAILABLE TIME</small>
              <div className="liveSlots">
                {slots.slice(0, 30).map((slot) => (
                  <button
                    className={startsAt === slot.startsAt ? "active" : ""}
                    onClick={() => setStartsAt(slot.startsAt)}
                    key={slot.startsAt}
                  >
                    <b>
                      {new Date(slot.startsAt).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </b>
                    <span>
                      {new Date(slot.startsAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                ))}
              </div>
              {!slots.length && (
                <p className="bookingState">
                  No open times in the next 21 days.
                </p>
              )}
            </div>
            <div className="bookingBlock">
              <small>YOUR DETAILS</small>
              <div className="bookingDetails">
                <input
                  placeholder="Full name"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
                <input
                  placeholder="Phone number"
                  value={form.phone}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
                {locationMode === "IN_PERSON" && (
                  <input
                    placeholder="Meeting address"
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                  />
                )}
                <textarea
                  placeholder="Anything we should know?"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </div>
            </div>
            {error && <div className="bookingError">{error}</div>}
            <button
              className="confirmLiveBooking"
              disabled={saving || !startsAt}
              onClick={() => void book()}
            >
              {saving ? "Confirming…" : "Confirm booking →"}
            </button>
          </>
        )}
      </main>
    </section>
  );
}

function FrontExperience({
  onExperience,
  onPlatform,
  onOperations,
  onNavigate,
}: {
  onExperience: () => void;
  onPlatform: () => void;
  onOperations: () => void;
  onNavigate: (destination: Tab) => void;
}) {
  const journeys = {
    "Sales & consulting": {
      promise: "Turn qualified interest into protected, high-value meetings.",
      event: "Executive Strategy Session",
      route: "Best-fit host",
      value: "$5,000 opportunity",
      signals: ["Qualification", "Host routing", "CRM attribution"],
    },
    "Classes & events": {
      promise: "Sell every seat, automate the waitlist, and protect capacity.",
      event: "AI Systems Intensive",
      route: "Studio A · 9 of 12 seats",
      value: "$8,973 collected",
      signals: ["Seat inventory", "Deposit paid", "Waitlist active"],
    },
    "Service businesses": {
      promise:
        "Match every customer to the right team, territory, and resource.",
      event: "On-Site Consultation",
      route: "Palm Beach · Crew 02",
      value: "Route optimized",
      signals: ["Territory match", "Drive buffer", "Equipment locked"],
    },
    "Teams & resources": {
      promise: "Coordinate people, rooms, and equipment without conflicts.",
      event: "Production Review",
      route: "2 hosts · Boardroom · Display",
      value: "3 resources secured",
      signals: ["Collective availability", "Room lock", "Conflict scan"],
    },
  } as const;
  const [journey, setJourney] =
    useState<keyof typeof journeys>("Sales & consulting");
  const platformModules = [
    {
      name: "Universal Calendar",
      label: "SELL + SCHEDULE",
      headline: "Turn availability into revenue—not administrative work.",
      copy: "Create branded booking links, control capacity, collect payments, route hosts and resources, manage waitlists, and protect every calendar from conflicts.",
      capabilities: [
        "Month + week command views",
        "Capacity, deposits + waitlists",
        "Smart routing + conflict protection",
      ],
      proof: "96%",
      proofLabel: "confirmation rate",
      image: "/module-images/cyncro-calendar.webp",
      imageAlt:
        "Universal calendar command center with month, week, and capacity views",
      route: "book" as Tab,
      action: "Experience the calendar",
    },
    {
      name: "Cyncro CRM",
      label: "KNOW + CONVERT",
      headline:
        "One living customer record from first signal to lifetime value.",
      copy: "Unify contacts, pipelines, conversations, lead scoring, attribution, journeys, tasks, and revenue intelligence without stitching together five disconnected tools.",
      capabilities: [
        "Contact + opportunity graph",
        "Pipeline and lifecycle automation",
        "Instagram, Facebook, SMS + email",
      ],
      proof: "360°",
      proofLabel: "customer context",
      image: "/module-images/cyncro-crm.webp",
      imageAlt:
        "Customer intelligence command center with pipeline and relationship signals",
      route: "crm" as Tab,
      action: "Open Cyncro CRM",
    },
    {
      name: "Cyncro Prospecting AI",
      label: "FIND + PRIORITIZE",
      headline: "Turn an entire market into a ranked call list.",
      copy: "Search real businesses in any legitimate industry, capture public business data, analyze each website, identify conversion gaps, score the opportunity, assign ownership, and give every salesperson a concise reason to call.",
      capabilities: [
        "Real-business search across any category",
        "Public website, email + phone intelligence",
        "AI opportunity scoring + CALL FIRST queue",
      ],
      proof: "0–100",
      proofLabel: "opportunity score",
      image: "/module-images/cyncro-crm.webp",
      imageAlt:
        "Cyncro Prospecting AI showing ranked businesses, website signals, and call priorities",
      route: "prospecting" as Tab,
      action: "Open Prospecting AI",
    },
    {
      name: "Cyncro Messages",
      label: "CONNECT + CONVERT · COMING SOON",
      headline:
        "Give every human and AI agent a number, an inbox, and complete customer context.",
      copy: "A Cyncro-owned messaging platform for local and toll-free numbers, shared inboxes, intelligent routing, AI agents, compliant campaigns, appointment booking, and CRM-native conversations.",
      capabilities: [
        "Human + AI agent workspaces",
        "Dedicated, shared + campaign numbers",
        "CRM routing, consent + revenue attribution",
      ],
      proof: "SOON",
      proofLabel: "private preview",
      image: "/module-images/cyncro-crm.webp",
      imageAlt: "Cyncro Messages unified team inbox and agent routing preview",
      route: "messages" as Tab,
      action: "Preview Cyncro Messages",
    },
    {
      name: "Cyncro Prime AI",
      label: "COMMAND + ORCHESTRATE",
      headline: "Give one instruction. Move the entire company.",
      copy: "A coordinated operating layer of 12 specialist agents for sales, marketing, analytics, scheduling, operations, customer success, revenue, and brand execution.",
      capabilities: [
        "12 governed specialist agents",
        "Cross-module decision briefs",
        "Human approvals + audit trails",
      ],
      proof: "12",
      proofLabel: "agents aligned",
      image: "/module-images/cyncro-prime.webp",
      imageAlt:
        "Cyncro Prime orchestration core connected to twelve specialist agents",
      route: "prime" as Tab,
      action: "Meet Cyncro Prime",
    },
    {
      name: "Cyncro Dispatch",
      label: "ROUTE + DELIVER",
      headline: "Run every field operation from booking to paid invoice.",
      copy: "Assign jobs, optimize routes, track technicians, manage work orders, capture photos and signatures, clock labor, collect payments, and understand profitability.",
      capabilities: [
        "Live GPS + route optimization",
        "Tech mobile workflow + offline sync",
        "Work orders, inventory + QuickBooks",
      ],
      proof: "LIVE",
      proofLabel: "field visibility",
      image: "/module-images/cyncro-dispatch.webp",
      imageAlt:
        "Field service routing map with technicians, jobs, and live operations",
      route: "dispatch" as Tab,
      action: "Enter Dispatch",
    },
    {
      name: "Cyncro Finance",
      label: "STRUCTURE + FUND",
      headline: "Give every automotive deal a faster, cleaner path to funding.",
      copy: "Track finance and sales performance, lender points, inventory, taxes, leases, deal jackets, stipulations, scanned documents, and profitability in one workspace.",
      capabilities: [
        "Lender + manager performance",
        "50-state tax and lease lab",
        "Digital deal jackets + scanning",
      ],
      proof: "$2.8M",
      proofLabel: "tracked deal value",
      image: "/module-images/cyncro-finance.webp",
      imageAlt:
        "Automotive finance desk with deal analytics, inventory, and lender signals",
      route: "finance" as Tab,
      action: "Explore Finance",
    },
    {
      name: "Apex Funds",
      label: "CONNECT + FUND",
      headline: "One command center for the entire lender network.",
      copy: "Purpose-built fintech infrastructure for lending brokers. Normalize live application status, rates, terms, stipulations, and lender decisions across every connected lender—then recover declined applicants instead of losing the deal.",
      capabilities: [
        "Multi-lender status synchronization",
        "Offer, rate + term comparison",
        "Built-in approval recovery workflows",
      ],
      proof: "100+",
      proofLabel: "lenders connected",
      image: "/module-images/cyncro-finance.webp",
      imageAlt:
        "Apex Funds lender network dashboard with applications, offers, and recovery workflows",
      route: "apex" as Tab,
      action: "Open Apex Funds",
    },
    {
      name: "Cyncro Dispute",
      label: "MANAGE + DOCUMENT",
      headline: "Operate a modern dispute business with control built in.",
      copy: "Manage clients, reports, disputes, templates, mail, billing, tasks, teams, and compliance workflows from a premium end-to-end command center.",
      capabilities: [
        "Case and bureau workflows",
        "Template + mail operations",
        "Compliance review + client portal",
      ],
      proof: "100%",
      proofLabel: "case visibility",
      image: "/module-images/cyncro-dispute.webp",
      imageAlt:
        "Secure dispute operations workspace with document and case workflows",
      route: "dispute" as Tab,
      action: "Open Dispute",
    },
    {
      name: "Social Automation",
      label: "LISTEN + RESPOND",
      headline:
        "Turn every comment, keyword, and DM into a managed opportunity.",
      copy: "Connect Instagram and Facebook, trigger intelligent keyword flows, qualify conversations, route leads, book appointments, and write every interaction back to CRM.",
      capabilities: [
        "Keyword + comment triggers",
        "AI qualification and handoff",
        "Unified social inbox + attribution",
      ],
      proof: "24/7",
      proofLabel: "conversation capture",
      image: "/module-images/cyncro-social.webp",
      imageAlt:
        "Social conversation automation flowing from messages into customer records",
      route: "crm" as Tab,
      action: "See social automation",
    },
  ];
  const active = journeys[journey];
  const platformComparison = [
    {
      capability: "Primary strength",
      cyncro: "Business operations + intelligence",
      highlevel: "Agency sales + marketing",
      clickfunnels: "Funnels + online selling",
    },
    {
      capability: "CRM + visual pipelines",
      cyncro: "Included",
      highlevel: "Included",
      clickfunnels: "Included",
    },
    {
      capability: "Funnels + landing pages",
      cyncro: "Framer-ready connection",
      highlevel: "Built in",
      clickfunnels: "Core strength",
    },
    {
      capability: "Calendars + booking links",
      cyncro: "Included · multi-host",
      highlevel: "Included",
      clickfunnels: "Included",
    },
    {
      capability: "Public-business prospecting",
      cyncro: "Built in · score + scrape",
      highlevel: "Not a core workflow",
      clickfunnels: "Not a core workflow",
    },
    {
      capability: "Team commissions + payout export",
      cyncro: "Built in · custom rules",
      highlevel: "Requires configuration",
      clickfunnels: "Not a core workflow",
    },
    {
      capability: "Invoices + editable contracts",
      cyncro: "Built in · connection-ready",
      highlevel: "Included",
      clickfunnels: "Sales-focused tools",
    },
    {
      capability: "Industry operating systems",
      cyncro: "Dispatch · Finance · Dispute",
      highlevel: "General-purpose",
      clickfunnels: "General-purpose",
    },
    {
      capability: "Lending-broker infrastructure",
      cyncro: "Apex Funds",
      highlevel: "Not purpose-built",
      clickfunnels: "Not purpose-built",
    },
    {
      capability: "Unified agent messaging",
      cyncro: "Cyncro Messages · coming soon",
      highlevel: "Included",
      clickfunnels: "Marketing messaging",
    },
  ];
  const cyncroLayers = [
    [
      "ACQUIRE",
      "Prospecting AI",
      "Public-business search, website scraping, scoring, ranking + ownership",
    ],
    [
      "CONVERT",
      "CRM + Calendar",
      "Contacts, pipelines, booking links, routing, reminders + Framer capture",
    ],
    [
      "COMMUNICATE",
      "Social + Messages",
      "Social automations, shared inboxes, agent numbers + compliant routing",
    ],
    [
      "TRANSACT",
      "Revenue Operations",
      "Proposals, contracts, signatures, invoices, payments + commissions",
    ],
    [
      "OPERATE",
      "Dispatch",
      "Work orders, field teams, routes, photos, labor, fulfillment + profitability",
    ],
    [
      "SPECIALIZE",
      "Industry Systems",
      "Automotive Finance, Dispute operations + Apex Funds lending infrastructure",
    ],
    [
      "UNDERSTAND",
      "Intelligence",
      "Attribution, forecasts, agent performance, exceptions + next-best actions",
    ],
    [
      "CONTROL",
      "Team + Governance",
      "Workspaces, roles, permissions, approvals, audit history + owner controls",
    ],
  ];
  const agentWorkforce = [
    [
      "N",
      "Nova",
      "Appointment Conversion",
      "Answers, qualifies, routes and books",
      "BOOKINGS",
    ],
    [
      "P",
      "Prospector",
      "Market Intelligence",
      "Finds, scrapes, scores and ranks",
      "PIPELINE",
    ],
    [
      "R",
      "Revenue",
      "Deal Intelligence",
      "Forecasts and recommends next moves",
      "REVENUE",
    ],
    [
      "F",
      "Follow-Up",
      "Lifecycle Nurture",
      "Personalizes sequences and handoffs",
      "REPLIES",
    ],
    [
      "C",
      "Calendar",
      "Capacity + Routing",
      "Protects availability and reduces no-shows",
      "ATTENDANCE",
    ],
    [
      "D",
      "Deal Desk",
      "Documents + Payment",
      "Prepares contracts, invoices and follow-up",
      "CASH FLOW",
    ],
    [
      "O",
      "Operations",
      "Fulfillment Control",
      "Coordinates dispatch, jobs and exceptions",
      "DELIVERY",
    ],
    [
      "A",
      "Apex",
      "Lending Intelligence",
      "Compares lenders and recovery paths",
      "FUNDING",
    ],
    [
      "M",
      "Manager",
      "Workforce Oversight",
      "Tracks workload, payouts and performance",
      "ACCOUNTABILITY",
    ],
  ];
  return (
    <div className="frontExperience">
      <section className="frontHero">
        <div className="frontGlow" />
        <div className="heroCopy">
          <div className="heroKicker">
            <span>●</span> ONE INTELLIGENT CORE FOR THE ENTIRE CUSTOMER
            LIFECYCLE
          </div>
          <h1>
            Every customer.
            <br />
            <em>Every workflow.</em>
            <br />
            One intelligent core.
          </h1>
          <p className="heroSalesCopy">
            Cyncro unifies scheduling, CRM, AI agents, field service, automotive
            finance, dispute operations, social conversations, and business
            intelligence—so nothing gets lost between the lead and the outcome.
          </p>
          <div className="heroActions">
            <button className="frontPrimary" onClick={onExperience}>
              Experience Cyncro <span>↗</span>
            </button>
            <button className="frontSecondary" onClick={onPlatform}>
              Enter Core Studio <span>→</span>
            </button>
          </div>
          <div className="heroAssurance">
            <span>Built for complex operations</span>
            <span>Engineered around your business</span>
            <span>One unified system</span>
          </div>
          <div
            className="heroImpactRail"
            aria-label="Cyncro platform highlights"
          >
            <div>
              <b>9</b>
              <span>Connected systems</span>
            </div>
            <div>
              <b>12</b>
              <span>Specialist AI agents</span>
            </div>
            <div>
              <b>ONE</b>
              <span>Customer truth</span>
            </div>
          </div>
        </div>
        <div className="heroProduct" aria-label="Live Cyncro booking operation">
          <div className="productTop">
            <div>
              <small>LIVE OPERATION</small>
              <b>New booking processed</b>
            </div>
            <span>12:48:09</span>
          </div>
          <div className="productClient">
            <div className="clientAvatar">AL</div>
            <div>
              <small>CUSTOMER</small>
              <b>Alexandra Lewis</b>
              <span>Qualified · High intent</span>
            </div>
            <i>✓</i>
          </div>
          <div className="productRoute">
            <div className="routeLine">
              <i>1</i>
              <span>
                <small>REQUEST</small>
                <b>Executive Strategy Session</b>
              </span>
              <em>30 min</em>
            </div>
            <div className="routeLine">
              <i>2</i>
              <span>
                <small>INTELLIGENCE</small>
                <b>Availability + conflict scan</b>
              </span>
              <em className="passed">Passed</em>
            </div>
            <div className="routeLine">
              <i>3</i>
              <span>
                <small>ROUTING</small>
                <b>Best-fit host assigned</b>
              </span>
              <em>Account Owner</em>
            </div>
            <div className="routeLine">
              <i>4</i>
              <span>
                <small>AUTOMATION</small>
                <b>Contact + confirmation created</b>
              </span>
              <em className="passed">Live</em>
            </div>
          </div>
          <div className="productFooter">
            <div>
              <small>REVENUE SIGNAL</small>
              <b>$5,000</b>
            </div>
            <div>
              <small>SOURCE</small>
              <b>Private link</b>
            </div>
            <span>Operation complete</span>
          </div>
        </div>
      </section>

      <section className="frontProof">
        {[
          ["01", "BOOK", "A seamless customer experience"],
          ["02", "DECIDE", "Capacity, routing, and rules applied"],
          ["03", "OPERATE", "Teams and resources coordinated"],
          ["04", "GROW", "Revenue and attribution measured"],
        ].map((item) => (
          <article key={item[0]}>
            <span>{item[0]}</span>
            <b>{item[1]}</b>
            <p>{item[2]}</p>
          </article>
        ))}
      </section>

      <section className="prospectingFrontSpotlight">
        <div className="prospectingFrontCopy">
          <label>CYNCRO PROSPECTING AI</label>
          <h2>Know exactly who to call—and why.</h2>
          <p>
            Search real businesses in any industry. Cyncro collects available
            public business information, reviews each company’s website, detects
            missing conversion systems, ranks the opportunity, and prepares the
            salesperson’s next move.
          </p>
          <div className="prospectingFrontFlow">
            {[
              "SEARCH",
              "REAL BUSINESSES",
              "ANALYZE",
              "SCORE",
              "CALL FIRST",
            ].map((item, index) => (
              <span key={item}>
                <i>{index + 1}</i>
                {item}
              </span>
            ))}
          </div>
          <button
            className="frontPrimary"
            onClick={() => onNavigate("prospecting")}
          >
            Open Prospecting AI <span>↗</span>
          </button>
        </div>
        <div className="prospectingFrontPanel">
          <small>LIVE OPPORTUNITY BRIEF</small>
          <div className="prospectingScore">
            <b>96</b>
            <span>CALL FIRST</span>
          </div>
          <h3>ABC Med Spa</h3>
          <p>
            Strong market demand. High review volume. Website has no visible
            automated qualification or SMS follow-up path.
          </p>
          <div>
            <span>Recommended Cyncro solution</span>
            <b>AI Receptionist + Appointment Setter + SMS Follow-Up + CRM</b>
          </div>
          <button onClick={() => onNavigate("prospecting")}>
            View ranked prospects →
          </button>
        </div>
      </section>

      <section className="platformUniverse">
        <div className="sectionLead platformLead">
          <label>THE FULL CYNCRO PLATFORM</label>
          <h2>
            Stop buying disconnected software.
            <br />
            <span>Run the operation as one.</span>
          </h2>
          <p>
            Every module is powerful alone. Together, they share the same
            customer, the same history, and the same intelligence.
          </p>
        </div>
        <div className="platformModuleGrid">
          {platformModules.map((module, index) => (
            <article
              className={`platformModuleCard moduleCard${index + 1}`}
              key={module.name}
            >
              <div className="moduleCardHead">
                <span>0{index + 1}</span>
                <small>{module.label}</small>
                <i>CONNECTED</i>
              </div>
              <h3>{module.name}</h3>
              <figure className="moduleVisual">
                <img
                  src={module.image}
                  alt={module.imageAlt}
                  decoding="async"
                />
                <figcaption>
                  <span>LIVE PRODUCT ENVIRONMENT</span>
                  <i>◆ CYNCRO CORE</i>
                </figcaption>
              </figure>
              <h4>{module.headline}</h4>
              <p>{module.copy}</p>
              <div className="moduleCapabilities">
                {module.capabilities.map((capability) => (
                  <span key={capability}>✓ {capability}</span>
                ))}
              </div>
              <div className="moduleCardFooter">
                <div>
                  <small>PLATFORM SIGNAL</small>
                  <strong>{module.proof}</strong>
                  <span>{module.proofLabel}</span>
                </div>
                <button onClick={() => onNavigate(module.route)}>
                  {module.action} <span>↗</span>
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="platformConnection">
          <span>LEAD CAPTURE</span>
          <i>→</i>
          <span>CALENDAR</span>
          <i>→</i>
          <span>CRM</span>
          <i>→</i>
          <span>OPERATIONS</span>
          <i>→</i>
          <span>REVENUE</span>
          <i>→</i>
          <span>RETENTION</span>
        </div>
      </section>

      <section className="cyncroDepth" aria-labelledby="depth-title">
        <div className="depthLead">
          <label>THIS IS THE REAL CYNCRO</label>
          <h2 id="depth-title">
            One platform.
            <br />
            <span>Eight operating layers.</span>
          </h2>
          <p>
            Cyncro does not stop when a lead converts. It connects acquisition,
            sales, communication, transactions, fulfillment, industry
            operations, intelligence, and governance around one customer truth.
          </p>
        </div>
        <div className="depthGrid">
          {cyncroLayers.map((layer, index) => (
            <article key={layer[0]}>
              <div className="depthNumber">0{index + 1}</div>
              <small>{layer[0]}</small>
              <h3>{layer[1]}</h3>
              <p>{layer[2]}</p>
              <span>
                CONNECTED TO CORE <i>◆</i>
              </span>
            </article>
          ))}
        </div>
        <div className="depthCoreRail">
          <span>ONE CUSTOMER RECORD</span>
          <i>◆</i>
          <span>ONE TEAM</span>
          <i>◆</i>
          <span>ONE REVENUE TRUTH</span>
          <i>◆</i>
          <span>ONE INTELLIGENCE LAYER</span>
        </div>
      </section>

      <section className="agentWorkforce" aria-labelledby="agents-title">
        <div className="agentWorkforceHead">
          <div>
            <label>CYNCRO AGENT WORKFORCE</label>
            <h2 id="agents-title">
              Not chatbots.
              <br />
              <span>Digital operators.</span>
            </h2>
          </div>
          <div className="agentDifference">
            <small>WHY THEY STAND OUT</small>
            <p>
              Every agent has a defined job, governed access, a human escalation
              path, and a measurable business outcome.
            </p>
            <div>
              <span>PERMISSIONS</span>
              <span>APPROVALS</span>
              <span>AUDIT TRAIL</span>
              <span>ROI</span>
            </div>
          </div>
        </div>
        <div className="agentWorkforceGrid">
          {agentWorkforce.map((agent, index) => (
            <article key={agent[1]}>
              <div className="agentIdentity">
                <i>{agent[0]}</i>
                <span>
                  <small>AGENT 0{index + 1}</small>
                  <b>{agent[1]}</b>
                </span>
                <em>● ACTIVE</em>
              </div>
              <h3>{agent[2]}</h3>
              <p>{agent[3]}</p>
              <footer>
                <small>MEASURED BY</small>
                <strong>{agent[4]}</strong>
              </footer>
            </article>
          ))}
        </div>
        <div className="agentOrchestration">
          <div>
            <small>SHARED CONTEXT</small>
            <b>Every agent sees the same governed customer history.</b>
          </div>
          <span>→</span>
          <div>
            <small>COORDINATED ACTION</small>
            <b>Agents work across modules instead of isolated automations.</b>
          </div>
          <span>→</span>
          <div>
            <small>HUMAN CONTROL</small>
            <b>Your team approves, intervenes, and owns the outcome.</b>
          </div>
        </div>
      </section>

      <section
        className="platformComparison"
        aria-labelledby="comparison-title"
      >
        <div className="comparisonIntro">
          <div>
            <label>NOW COMPARE THE FULL SYSTEM</label>
            <h2 id="comparison-title">
              Others optimize the funnel.
              <br />
              <span>Cyncro operates the company.</span>
            </h2>
          </div>
          <p>
            ClickFunnels is strongest around conversion funnels. HighLevel
            centers agency sales and marketing. Cyncro reaches across the full
            lifecycle—from finding the opportunity through delivering the work,
            managing the money, and improving the next decision.
          </p>
        </div>

        <div className="comparisonFrame">
          <div className="comparisonBrands" aria-hidden="true">
            <span>CAPABILITY</span>
            <strong>
              <i>◆</i> CYNCRO
            </strong>
            <b>HighLevel</b>
            <b>ClickFunnels</b>
          </div>
          <div className="comparisonRows">
            {platformComparison.map((row) => (
              <article key={row.capability}>
                <h3>{row.capability}</h3>
                <div className="cyncroComparisonCell">
                  <small>CYNCRO</small>
                  <span>{row.cyncro}</span>
                </div>
                <div>
                  <small>HIGHLEVEL</small>
                  <span>{row.highlevel}</span>
                </div>
                <div>
                  <small>CLICKFUNNELS</small>
                  <span>{row.clickfunnels}</span>
                </div>
              </article>
            ))}
          </div>
          <footer className="comparisonVerdict">
            <div>
              <small>THE CYNCRO ADVANTAGE</small>
              <strong>Not another CRM. The operating layer above it.</strong>
            </div>
            <p>
              One customer record connecting acquisition, appointments,
              operations, payouts, documents, specialized workflows, and revenue
              intelligence.
            </p>
            <button onClick={onPlatform}>
              Explore the platform <span>↗</span>
            </button>
          </footer>
        </div>
        <p className="comparisonNote">
          Product positioning based on publicly described platform capabilities.
          Some Cyncro features require external connections; Cyncro Messages and
          live lender synchronization remain preview capabilities.
        </p>
      </section>

      <section className="journeySection">
        <div className="sectionLead">
          <label>BUILT AROUND THE WAY YOU OPERATE</label>
          <h2>One system. Your business model.</h2>
          <p>
            Choose what you schedule and watch Cyncro configure the operation
            around it.
          </p>
        </div>
        <div className="journeyPicker">
          <div className="journeyTabs">
            {(Object.keys(journeys) as (keyof typeof journeys)[]).map(
              (item) => (
                <button
                  className={journey === item ? "active" : ""}
                  onClick={() => setJourney(item)}
                  key={item}
                >
                  <span>{item}</span>
                  <i>→</i>
                </button>
              ),
            )}
          </div>
          <div className="journeyCanvas">
            <div className="journeyTitle">
              <div>
                <small>LIVE USE CASE</small>
                <h3>{journey}</h3>
              </div>
              <span>Configured instantly</span>
            </div>
            <h4>{active.promise}</h4>
            <div className="journeyOperation">
              <div>
                <small>EVENT</small>
                <b>{active.event}</b>
              </div>
              <div>
                <small>ASSIGNMENT</small>
                <b>{active.route}</b>
              </div>
              <div>
                <small>BUSINESS OUTCOME</small>
                <b>{active.value}</b>
              </div>
            </div>
            <div className="signalRow">
              {active.signals.map((signal) => (
                <span key={signal}>✓ {signal}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="operationStory">
        <div className="sectionLead centered">
          <label>ONE BOOKING. THE ENTIRE OPERATION MOVES.</label>
          <h2>
            What customers see is simple.
            <br />
            What Cyncro handles is extraordinary.
          </h2>
        </div>
        <div className="operationFlow">
          {[
            ["Customer", "Chooses the experience, location, date, and time."],
            [
              "Intelligence",
              "Checks rules, capacity, conflicts, resources, and fit.",
            ],
            ["Revenue", "Collects the payment, deposit, package, or approval."],
            [
              "Operations",
              "Creates the contact, assigns the team, and locks resources.",
            ],
            [
              "Growth",
              "Launches reminders, follow-up, attribution, and analytics.",
            ],
          ].map((item, index) => (
            <article key={item[0]}>
              <span>0{index + 1}</span>
              <div>
                <h3>{item[0]}</h3>
                <p>{item[1]}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="frontCapabilities">
        <div className="capabilityStatement">
          <label>THE CYNCRO DIFFERENCE</label>
          <h2>
            Scheduling is the surface.
            <br />
            <span>Infrastructure is the product.</span>
          </h2>
          <button onClick={onPlatform}>Explore Core Studio →</button>
        </div>
        <div className="capabilityEditorial">
          {[
            [
              "01",
              "Revenue",
              "Payments, deposits, packages, coupons, and cancellation protection.",
            ],
            [
              "02",
              "Capacity",
              "Seats, waitlists, rooms, equipment, buffers, and resource locking.",
            ],
            [
              "03",
              "Intelligence",
              "Qualification, territory rules, host matching, and load balancing.",
            ],
            [
              "04",
              "Lifecycle",
              "Confirmations, reminders, approvals, follow-up, and contact history.",
            ],
            [
              "05",
              "Control",
              "Week and month views, rescheduling, analytics, and attribution.",
            ],
          ].map((item) => (
            <article key={item[0]}>
              <span>{item[0]}</span>
              <h3>{item[1]}</h3>
              <p>{item[2]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="frontFinal">
        <div>
          <label>THIS IS NOT ANOTHER BOOKING LINK.</label>
          <h2>
            It is the operating system
            <br />
            behind every appointment.
          </h2>
          <p>
            Experience the customer journey or step inside the command center.
          </p>
        </div>
        <div className="finalActions">
          <button className="frontPrimary" onClick={onExperience}>
            Start the experience ↗
          </button>
          <button className="frontSecondary" onClick={onOperations}>
            Open operations →
          </button>
        </div>
      </section>
    </div>
  );
}

const sampleEvents = [
  {
    name: "Executive Strategy Session",
    type: "1-on-1",
    duration: "30 min",
    capacity: 1,
    price: "Free",
    bookings: 38,
    status: "Published",
    slug: "executive-strategy",
  },
  {
    name: "AI Systems Intensive",
    type: "Group",
    duration: "2 hours",
    capacity: 12,
    price: "$997",
    bookings: 9,
    status: "Published",
    slug: "ai-systems-intensive",
  },
  {
    name: "Private Implementation Day",
    type: "Application",
    duration: "6 hours",
    capacity: 1,
    price: "$5,000",
    bookings: 4,
    status: "Paused",
    slug: "implementation-day",
  },
];
function Studio({ onPreview }: { onPreview: () => void }) {
  const [editing, setEditing] = useState(false),
    [section, setSection] = useState("Basics"),
    [saved, setSaved] = useState(false),
    [schedule, setSchedule] = useState("Recurring"),
    [capacity, setCapacity] = useState(12),
    [deposit, setDeposit] = useState(true),
    [waitlist, setWaitlist] = useState(true),
    [published, setPublished] = useState(true),
    [events, setEvents] = useState(sampleEvents),
    [customDates, setCustomDates] = useState([
      "August 28, 2026 · 10:00 AM – 12:00 PM · 12 seats",
      "September 4, 2026 · 1:00 PM – 3:00 PM · 12 seats",
    ]),
    [selectedHosts, setSelectedHosts] = useState(["Account Owner"]),
    [selectedResources, setSelectedResources] = useState(["Executive Studio"]),
    [questionCount, setQuestionCount] = useState(2),
    [reminder24, setReminder24] = useState(true),
    [reminder1, setReminder1] = useState(true),
    [brandName, setBrandName] = useState("Cyncro Media"),
    [bookingHeadline, setBookingHeadline] = useState(
      "Build your next advantage.",
    ),
    [buttonLabel, setButtonLabel] = useState("Reserve my session"),
    [accentColor, setAccentColor] = useState("#b51f38"),
    [pageStyle, setPageStyle] = useState("Editorial"),
    [industry, setIndustry] = useState("Consulting & professional services"),
    [intakeDepth, setIntakeDepth] = useState("Guided"),
    [eventName, setEventName] = useState("AI Systems Intensive"),
    [eventSlug, setEventSlug] = useState("ai-systems-intensive"),
    [eventDescription, setEventDescription] = useState(
      "A high-impact group intensive to build and deploy your AI systems.",
    ),
    [durationMinutes, setDurationMinutes] = useState(120),
    [saveError, setSaveError] = useState("");
  const toggleChoice = (
    value: string,
    current: string[],
    setCurrent: (next: string[]) => void,
  ) =>
    setCurrent(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  const copyLink = (slug = "ai-systems-intensive") => {
    const url = `${window.location.origin}${window.location.pathname}?event=${encodeURIComponent(slug)}#book`;
    void navigator.clipboard?.writeText(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  const saveEventType = async () => {
    setSaveError("");
    const response = await fetch("/api/calendar/event-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: eventName,
        slug: eventSlug,
        description: eventDescription,
        durationMinutes,
        capacity,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        locationModes: ["VIDEO", "PHONE", "IN_PERSON"],
        videoPlatforms: ["GOOGLE_MEET", "ZOOM", "FACETIME"],
      }),
    });
    const data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !data.id) {
      setSaveError(data.error || "Event type could not be saved.");
      return;
    }
    const availability = await fetch("/api/calendar/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId: data.id,
        timezone: "America/New_York",
        rules: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: "09:00",
          endTime: "17:00",
        })),
      }),
    });
    if (!availability.ok) {
      const result = (await availability.json()) as { error?: string };
      setSaveError(result.error || "Availability could not be saved.");
      return;
    }
    setEvents((current) => [
      {
        name: eventName,
        type: capacity > 1 ? "Group" : "1-on-1",
        duration: `${durationMinutes} min`,
        capacity,
        price: "Free",
        bookings: 0,
        status: "Published",
        slug: eventSlug,
      },
      ...current,
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    setEditing(false);
  };
  if (editing)
    return (
      <section className="studio">
        <div className="studiohead">
          <div>
            <label>CORE STUDIO · UNIVERSAL CALENDAR</label>
            <h1>Create a booking experience</h1>
            <p>
              Everything your customer sees and everything the engine enforces.
            </p>
          </div>
          <div>
            <button className="secondary" onClick={() => setEditing(false)}>
              Close
            </button>
            <button className="primary" onClick={() => void saveEventType()}>
              {saved ? "✓ Saved" : "Save & publish"}
            </button>
          </div>
        </div>
        <div className="editor">
          <div className="side">
            {[
              "Basics",
              "Brand & experience",
              "Availability",
              "Capacity & price",
              "Hosts & resources",
              "Questions",
              "Rules & messages",
              "Link settings",
            ].map((x) => (
              <button
                className={section === x ? "active" : ""}
                onClick={() => setSection(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="editbody">
            {saveError && (
              <div className="prospectingAlert error">! {saveError}</div>
            )}
            {section === "Basics" && (
              <Panel
                title="Event basics"
                sub="Choose the experience and create the booking link."
              >
                <div className="fields">
                  <Field label="Event name">
                    <input
                      value={eventName}
                      onChange={(event) => setEventName(event.target.value)}
                    />
                  </Field>
                  <Field label="Booking link">
                    <div className="prefix">
                      cyncro.ai/book/
                      <input
                        value={eventSlug}
                        onChange={(event) =>
                          setEventSlug(
                            event.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "-"),
                          )
                        }
                      />
                    </div>
                  </Field>
                  <Field wide label="Description">
                    <textarea
                      rows={4}
                      value={eventDescription}
                      onChange={(event) =>
                        setEventDescription(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Booking experience">
                    <select>
                      <option>Instant booking</option>
                      <option>Request approval</option>
                      <option>Application only</option>
                    </select>
                  </Field>
                  <Field label="Location">
                    <select>
                      <option>Video call</option>
                      <option>Phone call</option>
                      <option>In person</option>
                      <option>Customer address</option>
                    </select>
                  </Field>
                </div>
              </Panel>
            )}
            {section === "Brand & experience" && (
              <Panel
                title="Brand & customer experience"
                sub="Make every booking page feel purpose-built for the business, audience, and offer."
              >
                <div className="experienceEditor">
                  <div className="experienceControls">
                    <div className="templateBlock">
                      <small>START FROM A BUSINESS MODEL</small>
                      <div className="templateChoices">
                        {[
                          "Consulting & professional services",
                          "Classes, events & memberships",
                          "Field service & installations",
                          "Healthcare & wellness",
                          "Enterprise teams & resources",
                          "Custom operating model",
                        ].map((item) => (
                          <button
                            className={industry === item ? "active" : ""}
                            onClick={() => setIndustry(item)}
                            key={item}
                          >
                            <i>{industry === item ? "✓" : "◇"}</i>
                            <span>{item}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fields experienceFields">
                      <Field label="Business or brand name">
                        <input
                          value={brandName}
                          onChange={(event) => setBrandName(event.target.value)}
                        />
                      </Field>
                      <Field label="Booking-page headline">
                        <input
                          value={bookingHeadline}
                          onChange={(event) =>
                            setBookingHeadline(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Primary button text">
                        <input
                          value={buttonLabel}
                          onChange={(event) =>
                            setButtonLabel(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Brand accent">
                        <div className="colorControl">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(event) =>
                              setAccentColor(event.target.value)
                            }
                          />
                          <input
                            value={accentColor.toUpperCase()}
                            onChange={(event) =>
                              setAccentColor(event.target.value)
                            }
                          />
                        </div>
                      </Field>
                    </div>
                    <div className="experienceOptionGroup">
                      <small>PAGE EXPERIENCE</small>
                      <div className="segmentedChoices">
                        {["Minimal", "Editorial", "Immersive"].map((item) => (
                          <button
                            className={pageStyle === item ? "active" : ""}
                            onClick={() => setPageStyle(item)}
                            key={item}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="experienceOptionGroup">
                      <small>CUSTOMER INTAKE</small>
                      <div className="segmentedChoices">
                        {["Fast", "Guided", "Application"].map((item) => (
                          <button
                            className={intakeDepth === item ? "active" : ""}
                            onClick={() => setIntakeDepth(item)}
                            key={item}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="experienceModules">
                      <small>CHOOSE WHAT CUSTOMERS SEE</small>
                      {[
                        [
                          "Service or event selection",
                          "Let customers choose the right experience.",
                        ],
                        [
                          "Location and video preference",
                          "Offer office, customer address, phone, Meet, Zoom, or FaceTime.",
                        ],
                        [
                          "Team member selection",
                          "Allow selection or let Cyncro route automatically.",
                        ],
                        [
                          "Pricing and deposit",
                          "Show price, packages, balance, or approval requirements.",
                        ],
                        [
                          "Custom intake questions",
                          "Collect information conditionally by answer.",
                        ],
                        [
                          "Confirmation next steps",
                          "Display preparation, documents, directions, or upsells.",
                        ],
                      ].map((item, index) => (
                        <label key={item[0]}>
                          <input type="checkbox" defaultChecked={index !== 2} />
                          <span>
                            <b>{item[0]}</b>
                            <small>{item[1]}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="experiencePreviewWrap">
                    <div className="previewToolbar">
                      <span>LIVE CUSTOMER PREVIEW</span>
                      <div>
                        <button>Desktop</button>
                        <button>Mobile</button>
                      </div>
                    </div>
                    <div
                      className={`experiencePreview ${pageStyle.toLowerCase()}`}
                      style={
                        {
                          "--custom-accent": accentColor,
                        } as React.CSSProperties
                      }
                    >
                      <div className="previewBrand">
                        <i>{brandName.slice(0, 1) || "C"}</i>
                        <b>{brandName || "Your brand"}</b>
                      </div>
                      <small>{industry.toUpperCase()}</small>
                      <h2>{bookingHeadline || "Your booking headline"}</h2>
                      <p>Choose the experience that best fits what you need.</p>
                      <div className="previewOffer active">
                        <div>
                          <b>Executive Strategy Session</b>
                          <span>30 minutes · Video or in person</span>
                        </div>
                        <i>✓</i>
                      </div>
                      <div className="previewOffer">
                        <div>
                          <b>Private Implementation Day</b>
                          <span>6 hours · Application required</span>
                        </div>
                        <i>→</i>
                      </div>
                      <div className="previewSteps">
                        <span className="active">1</span>
                        <i />
                        <span>2</span>
                        <i />
                        <span>3</span>
                        <em>{intakeDepth} flow</em>
                      </div>
                      <button className="previewCta">
                        {buttonLabel || "Continue"} →
                      </button>
                      <footer>
                        Powered by Cyncro Core · Conflict protected
                      </footer>
                    </div>
                    <div className="customizationSummary">
                      <div>
                        <small>LAYOUT</small>
                        <b>{pageStyle}</b>
                      </div>
                      <div>
                        <small>INTAKE</small>
                        <b>{intakeDepth}</b>
                      </div>
                      <div>
                        <small>MODEL</small>
                        <b>{industry.split(" ")[0]}</b>
                      </div>
                      <span>Updates appear instantly</span>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
            {section === "Availability" && (
              <Panel
                title="Availability & time slots"
                sub="Use a recurring schedule or select exact event dates."
              >
                <div className="choice">
                  <button
                    className={schedule === "Recurring" ? "chosen" : ""}
                    onClick={() => setSchedule("Recurring")}
                  >
                    Recurring schedule
                  </button>
                  <button
                    className={schedule === "Custom" ? "chosen" : ""}
                    onClick={() => setSchedule("Custom")}
                  >
                    Custom dates
                  </button>
                </div>
                {schedule === "Recurring" ? (
                  <div className="weekrows">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((d, i) => (
                      <div key={d}>
                        <input type="checkbox" defaultChecked={i < 5} />
                        <b>{d}</b>
                        <input type="time" defaultValue="09:00" />
                        <span>to</span>
                        <input type="time" defaultValue="17:00" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="customdates">
                    <button
                      className="primary"
                      onClick={() =>
                        setCustomDates([
                          ...customDates,
                          "September 11, 2026 · 10:00 AM – 12:00 PM · 12 seats",
                        ])
                      }
                    >
                      + Add date & time
                    </button>
                    {customDates.map((item, index) => (
                      <div key={`${item}-${index}`}>
                        <b>{item.split(" · ")[0]}</b>
                        <span>{item.split(" · ").slice(1).join(" · ")}</span>
                        <button
                          onClick={() =>
                            setCustomDates(
                              customDates.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="fields compact">
                  <Field label="Duration">
                    <select
                      value={durationMinutes}
                      onChange={(event) =>
                        setDurationMinutes(Number(event.target.value))
                      }
                    >
                      <option value={120}>2 hours</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </Field>
                  <Field label="Slot interval">
                    <select>
                      <option>30 minutes</option>
                      <option>15 minutes</option>
                    </select>
                  </Field>
                  <Field label="Buffer before">
                    <select>
                      <option>15 minutes</option>
                      <option>None</option>
                    </select>
                  </Field>
                  <Field label="Buffer after">
                    <select>
                      <option>15 minutes</option>
                      <option>None</option>
                    </select>
                  </Field>
                </div>
              </Panel>
            )}
            {section === "Capacity & price" && (
              <Panel
                title="Capacity, payment & waitlist"
                sub="Control seats and collect payment before confirmation."
              >
                <div className="fields">
                  <Field label="Seat capacity">
                    <div className="stepper">
                      <button
                        onClick={() => setCapacity(Math.max(1, capacity - 1))}
                      >
                        −
                      </button>
                      <b>{capacity}</b>
                      <button onClick={() => setCapacity(capacity + 1)}>
                        +
                      </button>
                    </div>
                  </Field>
                  <Field label="Maximum sessions per day">
                    <input type="number" defaultValue="3" />
                  </Field>
                  <Field label="Full price">
                    <input defaultValue="$997.00" />
                  </Field>
                  <Field label="Currency">
                    <select>
                      <option>USD</option>
                    </select>
                  </Field>
                </div>
                <Switch
                  label="Require a deposit"
                  desc="Collect a partial payment to reserve the seat."
                  value={deposit}
                  set={setDeposit}
                />
                {deposit && (
                  <Field label="Deposit due today">
                    <input defaultValue="$297.00" />
                  </Field>
                )}
                <Switch
                  label="Enable automatic waitlist"
                  desc="Offer cancelled seats to the next customer automatically."
                  value={waitlist}
                  set={setWaitlist}
                />
              </Panel>
            )}
            {section === "Hosts & resources" && (
              <Panel
                title="Hosts & resources"
                sub="Assign people, rooms, equipment, or vehicles."
              >
                <div className="selectcards">
                  <button
                    className={
                      selectedHosts.includes("Account Owner")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "Account Owner",
                        selectedHosts,
                        setSelectedHosts,
                      )
                    }
                  >
                    <b>
                      {selectedHosts.includes("Account Owner") ? "✓ " : ""}
                      Account Owner
                    </b>
                    <span>Priority host · 100% weight</span>
                  </button>
                  <button
                    className={
                      selectedHosts.includes("Christopher Sydoriak")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "Christopher Sydoriak",
                        selectedHosts,
                        setSelectedHosts,
                      )
                    }
                  >
                    <b>
                      {selectedHosts.includes("Christopher Sydoriak")
                        ? "✓ "
                        : ""}
                      Christopher Sydoriak
                    </b>
                    <span>Available host · Round robin</span>
                  </button>
                </div>
                <h3>Required resources</h3>
                <div className="selectcards">
                  <button
                    className={
                      selectedResources.includes("Executive Studio")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "Executive Studio",
                        selectedResources,
                        setSelectedResources,
                      )
                    }
                  >
                    <b>
                      {selectedResources.includes("Executive Studio")
                        ? "✓ "
                        : ""}
                      Executive Studio
                    </b>
                    <span>Room · capacity 14</span>
                  </button>
                  <button
                    className={
                      selectedResources.includes("LED Presentation Wall")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "LED Presentation Wall",
                        selectedResources,
                        setSelectedResources,
                      )
                    }
                  >
                    <b>
                      {selectedResources.includes("LED Presentation Wall")
                        ? "✓ "
                        : ""}
                      LED Presentation Wall
                    </b>
                    <span>Equipment · capacity 1</span>
                  </button>
                </div>
                <Field label="Assignment method">
                  <select>
                    <option>Weighted round robin</option>
                    <option>Single host</option>
                    <option>Collective</option>
                    <option>Group session</option>
                  </select>
                </Field>
              </Panel>
            )}
            {section === "Questions" && (
              <Panel
                title="Custom intake questions"
                sub="Collect exactly what you need before the booking."
              >
                <div className="questions">
                  <div>
                    <span>Required</span>
                    <input defaultValue="What would you like to accomplish?" />
                    <select>
                      <option>Long answer</option>
                    </select>
                    <button>•••</button>
                  </div>
                  <div>
                    <span>Optional</span>
                    <input defaultValue="What systems do you currently use?" />
                    <select>
                      <option>Short answer</option>
                    </select>
                    <button>•••</button>
                  </div>
                  {questionCount > 2 && (
                    <div>
                      <span>Optional</span>
                      <input defaultValue="Is there anything else we should know?" />
                      <select>
                        <option>Long answer</option>
                      </select>
                      <button onClick={() => setQuestionCount(2)}>
                        Remove
                      </button>
                    </div>
                  )}
                  <button
                    className="primary"
                    onClick={() => setQuestionCount(3)}
                  >
                    + Add question
                  </button>
                </div>
              </Panel>
            )}
            {section === "Rules & messages" && (
              <Panel
                title="Policies, reminders & confirmation"
                sub="Set expectations and automate every follow-up."
              >
                <div className="fields">
                  <Field label="Cancellation notice">
                    <select>
                      <option>24 hours</option>
                      <option>2 hours</option>
                    </select>
                  </Field>
                  <Field label="Reschedule notice">
                    <select>
                      <option>24 hours</option>
                      <option>2 hours</option>
                    </select>
                  </Field>
                  <Field wide label="Confirmation message">
                    <textarea
                      rows={4}
                      defaultValue="You’re confirmed! Check your email for event access and preparation details."
                    />
                  </Field>
                </div>
                <Switch
                  label="24-hour reminder"
                  desc="Email every registered attendee."
                  value={reminder24}
                  set={setReminder24}
                />
                <Switch
                  label="1-hour reminder"
                  desc="Send final location or video details."
                  value={reminder1}
                  set={setReminder1}
                />
              </Panel>
            )}
            {section === "Link settings" && (
              <Panel
                title="Publishing & link controls"
                sub="Control who can find this event and when the link works."
              >
                <Field label="Visibility">
                  <select>
                    <option>Public</option>
                    <option>Unlisted</option>
                    <option>Private</option>
                  </select>
                </Field>
                <Switch
                  label="Published"
                  desc="Customers can access and book this event."
                  value={published}
                  set={setPublished}
                />
                <Field label="Link expires">
                  <input type="datetime-local" />
                </Field>
                <div className="linkpreview">
                  <small>YOUR BOOKING LINK</small>
                  <b>cyncro.ai/book/demo/ai-systems-intensive</b>
                  <div>
                    <button onClick={() => copyLink()}>Copy link</button>
                    <button onClick={onPreview}>Open preview ↗</button>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </section>
    );
  return (
    <section className="studio">
      <div className="studiohead">
        <div>
          <label>CORE STUDIO</label>
          <h1>Universal Calendar</h1>
          <p>
            Create, customize, control, publish, and measure every scheduling
            experience around the customer and the business.
          </p>
        </div>
        <div>
          <button
            className="secondary"
            onClick={() => {
              setSection("Brand & experience");
              setEditing(true);
            }}
          >
            Customize experience
          </button>
          <button
            className="primary"
            onClick={() => {
              setSection("Basics");
              setEditing(true);
            }}
          >
            + Create event
          </button>
        </div>
      </div>
      <div className="studiostats">
        {[
          ["ACTIVE LINKS", "2"],
          ["TOTAL BOOKINGS", "51"],
          ["SEATS AVAILABLE", "16"],
          ["REVENUE BOOKED", "$12.9K"],
        ].map((x) => (
          <div key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>Live calendar control</span>
          </div>
        ))}
      </div>
      <div className="eventgrid">
        {events.map((e, i) => (
          <article key={e.name}>
            <div className="eventtop">
              <span>{e.status}</span>
              <em>{e.type}</em>
            </div>
            <h2>{e.name}</h2>
            <p>/book/demo/{e.slug}</p>
            <div className="eventmetrics">
              <div>
                <small>DURATION</small>
                <b>{e.duration}</b>
              </div>
              <div>
                <small>CAPACITY</small>
                <b>{e.capacity}</b>
              </div>
              <div>
                <small>PRICE</small>
                <b>{e.price}</b>
              </div>
              <div>
                <small>BOOKINGS</small>
                <b>{e.bookings}</b>
              </div>
            </div>
            <div className="eventbuttons">
              <button onClick={() => setEditing(true)}>Edit</button>
              <button onClick={() => copyLink(e.slug)}>Copy link</button>
              <button
                onClick={() =>
                  setEvents(
                    events.map((item, index) =>
                      index === i
                        ? {
                            ...item,
                            status:
                              item.status === "Published"
                                ? "Paused"
                                : "Published",
                          }
                        : item,
                    ),
                  )
                }
              >
                {e.status === "Published" ? "Pause" : "Publish"}
              </button>
              <button
                onClick={() =>
                  setEvents([
                    ...events,
                    {
                      ...e,
                      name: `${e.name} Copy`,
                      slug: `${e.slug}-copy`,
                      bookings: 0,
                      status: "Paused",
                    },
                  ])
                }
              >
                Duplicate
              </button>
            </div>
          </article>
        ))}
      </div>
      <AdvancedSuite onCreate={() => setEditing(true)} />
      <CapabilityComparison />
    </section>
  );
}

function AdvancedSuite({ onCreate }: { onCreate: () => void }) {
  const [area, setArea] = useState("Control center"),
    [notice, setNotice] = useState(""),
    [guard, setGuard] = useState(true),
    [routing, setRouting] = useState("Smart load balance"),
    [range, setRange] = useState("30 days");
  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 1900);
  };
  const areas = [
    "Control center",
    "Availability",
    "Automations",
    "Offers & payments",
    "Team & resources",
    "Integrations",
    "Analytics",
  ];
  return (
    <div className="advanced">
      <div className="advancedTitle">
        <div>
          <label>ADVANCED SCHEDULING OS</label>
          <h2>Calendar Command Center</h2>
          <p>
            Every rule, workflow, team member, payment, and customer touchpoint
            in one operating system.
          </p>
        </div>
        <div className="health">
          <i /> All systems operational
        </div>
      </div>
      <div className="advancedNav">
        {areas.map((a) => (
          <button
            className={area === a ? "active" : ""}
            onClick={() => setArea(a)}
            key={a}
          >
            {a}
          </button>
        ))}
      </div>
      {notice && <div className="toast">✓ {notice}</div>}
      {area === "Control center" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>LIVE OPERATIONS</small>
                <h3>Today’s scheduling pulse</h3>
              </div>
              <button onClick={() => flash("Schedule optimized")}>
                Run optimization
              </button>
            </div>
            <div className="pulse">
              <div>
                <b>8</b>
                <span>Confirmed</span>
              </div>
              <div>
                <b>2</b>
                <span>Pending approval</span>
              </div>
              <div>
                <b>3</b>
                <span>Waitlisted</span>
              </div>
              <div>
                <b>94%</b>
                <span>Capacity used</span>
              </div>
            </div>
            <div className="timeline">
              <span>9 AM</span>
              <i style={{ width: "32%" }}>Strategy · Account Owner</i>
              <span>11 AM</span>
              <i style={{ width: "50%" }}>AI Intensive · Studio</i>
              <span>2 PM</span>
              <i style={{ width: "40%" }}>Implementation · Chris</i>
            </div>
          </div>
          <div className="suitecard">
            <small>CONFLICT ENGINE</small>
            <h3>Protection active</h3>
            <p>
              2-way calendar sync, resource locks, buffers, travel time, and
              capacity are checked before every confirmation.
            </p>
            <Switch
              label="Smart conflict guard"
              desc="Block unsafe bookings automatically."
              value={guard}
              set={setGuard}
            />
          </div>
          <div className="suitecard">
            <small>QUICK ACTIONS</small>
            <h3>Operate faster</h3>
            <div className="quickgrid">
              <button onClick={onCreate}>＋ New event</button>
              <button onClick={() => flash("Booking created")}>
                ＋ Manual booking
              </button>
              <button onClick={() => flash("Hours overridden")}>
                Override hours
              </button>
              <button onClick={() => flash("Share page copied")}>
                Share booking page
              </button>
            </div>
          </div>
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>EXCEPTIONS</small>
                <h3>Needs your attention</h3>
              </div>
              <b className="redbadge">3 items</b>
            </div>
            {[
              ["Payment retry", "Jordan Blake · $297 deposit", "Resolve"],
              ["Host conflict", "Aug 19 · 1:00 PM", "Reassign"],
              [
                "Waitlist ready",
                "2 seats opened in AI Intensive",
                "Offer seats",
              ],
            ].map((r) => (
              <div className="exception" key={r[0]}>
                <i>!</i>
                <div>
                  <b>{r[0]}</b>
                  <span>{r[1]}</span>
                </div>
                <button onClick={() => flash(`${r[0]} resolved`)}>
                  {r[2]}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {area === "Availability" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>AVAILABILITY ENGINE</small>
                <h3>Layered scheduling rules</h3>
              </div>
              <button onClick={() => flash("Rule added")}>+ Add rule</button>
            </div>
            {[
              [
                "Standard business hours",
                "Mon–Fri · 9:00 AM–5:00 PM",
                "Active",
              ],
              ["VIP evening access", "Tue + Thu · 6:00 PM–8:00 PM", "Priority"],
              ["Holiday blackout", "Dec 23–Jan 2", "Blocked"],
              [
                "Travel protection",
                "45 min before in-person meetings",
                "Active",
              ],
            ].map((r) => (
              <div className="rule" key={r[0]}>
                <span className="drag">⋮⋮</span>
                <div>
                  <b>{r[0]}</b>
                  <small>{r[1]}</small>
                </div>
                <em>{r[2]}</em>
                <button>•••</button>
              </div>
            ))}
          </div>
          <div className="suitecard">
            <small>BOOKING LIMITS</small>
            <h3>Fatigue protection</h3>
            <div className="miniFields">
              <label>
                Meetings per day
                <input defaultValue="6" />
              </label>
              <label>
                Consecutive meetings
                <input defaultValue="3" />
              </label>
              <label>
                Minimum notice
                <select>
                  <option>4 hours</option>
                  <option>24 hours</option>
                </select>
              </label>
              <label>
                Booking horizon
                <select>
                  <option>60 days</option>
                  <option>90 days</option>
                </select>
              </label>
            </div>
          </div>
          <div className="suitecard">
            <small>TIME ZONES</small>
            <h3>Global booking intelligence</h3>
            <p>
              Detect customer time zone, handle daylight saving changes, and
              display host-local availability.
            </p>
            <div className="zone">
              <b>Host</b>
              <span>America/New_York</span>
            </div>
            <div className="zone">
              <b>Visitor</b>
              <span>Auto-detected</span>
            </div>
          </div>
        </div>
      )}
      {area === "Automations" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>WORKFLOW BUILDER</small>
                <h3>Booking journey automation</h3>
              </div>
              <button onClick={() => flash("Workflow step added")}>
                + Add step
              </button>
            </div>
            <div className="flow">
              <div>
                <i>1</i>
                <b>Booking confirmed</b>
                <span>Instantly</span>
              </div>
              <em>→</em>
              <div>
                <i>2</i>
                <b>Email + SMS</b>
                <span>Confirmation</span>
              </div>
              <em>→</em>
              <div>
                <i>3</i>
                <b>Reminder</b>
                <span>24 hours before</span>
              </div>
              <em>→</em>
              <div>
                <i>4</i>
                <b>Follow-up</b>
                <span>2 hours after</span>
              </div>
            </div>
          </div>
          {[
            [
              "No-show rescue",
              "If attendee misses → send rebooking link",
              "82% recovery",
            ],
            [
              "Abandoned booking",
              "If slot selected but not booked → follow up",
              "14 recovered",
            ],
            [
              "VIP preparation",
              "If event value > $2,000 → notify assigned host",
              "Active",
            ],
            [
              "Review request",
              "After completed booking → request feedback",
              "4.9 avg",
            ],
          ].map((x) => (
            <div className="suitecard automation" key={x[0]}>
              <small>AUTOMATION</small>
              <h3>{x[0]}</h3>
              <p>{x[1]}</p>
              <div>
                <em>{x[2]}</em>
                <button onClick={() => flash(`${x[0]} toggled`)}>Active</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {area === "Offers & payments" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>MONETIZATION</small>
                <h3>Offers, packages & subscriptions</h3>
              </div>
              <button onClick={() => flash("Offer builder opened")}>
                + Create offer
              </button>
            </div>
            <div className="offers">
              {[
                ["Executive Access", "5 sessions", "$3,500", "12 sold"],
                [
                  "AI Advisory",
                  "Monthly subscription",
                  "$1,997/mo",
                  "8 active",
                ],
                ["Implementation Day", "Single booking", "$5,000", "4 booked"],
              ].map((o) => (
                <div key={o[0]}>
                  <span>LIVE</span>
                  <h3>{o[0]}</h3>
                  <p>{o[1]}</p>
                  <b>{o[2]}</b>
                  <small>{o[3]}</small>
                  <button>Edit offer</button>
                </div>
              ))}
            </div>
          </div>
          <div className="suitecard">
            <small>PAYMENT RULES</small>
            <h3>Revenue protection</h3>
            {[
              "Stripe checkout",
              "Deposits + balances",
              "Coupons and promo codes",
              "Tax calculation",
              "Refund rules",
              "Failed payment retries",
            ].map((x) => (
              <div className="checkline" key={x}>
                ✓ <span>{x}</span>
              </div>
            ))}
          </div>
          <div className="suitecard">
            <small>REVENUE TODAY</small>
            <h3>$7,291 collected</h3>
            <div className="bar">
              <i style={{ width: "76%" }} />
            </div>
            <p>$2,394 outstanding · 3 scheduled retries</p>
            <button
              className="outline"
              onClick={() => flash("Revenue report opened")}
            >
              View transactions
            </button>
          </div>
        </div>
      )}
      {area === "Team & resources" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>ROUTING ENGINE</small>
                <h3>People and resource assignment</h3>
              </div>
              <select
                value={routing}
                onChange={(e) => setRouting(e.target.value)}
              >
                <option>Smart load balance</option>
                <option>Round robin</option>
                <option>Highest priority</option>
                <option>Collective availability</option>
              </select>
            </div>
            <div className="teamlist">
              {[
                ["AO", "Account Owner", "6 bookings", "78% utilized"],
                ["CS", "Christopher Sydoriak", "4 bookings", "62% utilized"],
                ["AM", "Amara M.", "2 bookings", "41% utilized"],
              ].map((m, i) => (
                <div key={m[1]}>
                  <i>{m[0]}</i>
                  <b>{m[1]}</b>
                  <span>{m[2]}</span>
                  <div className="bar">
                    <i style={{ width: `${78 - i * 18}%` }} />
                  </div>
                  <small>{m[3]}</small>
                  <button>Manage</button>
                </div>
              ))}
            </div>
          </div>
          <div className="suitecard">
            <small>RESOURCE POOL</small>
            <h3>Rooms & equipment</h3>
            {[
              ["Executive Studio", "Available"],
              ["LED Presentation Wall", "In use until 2 PM"],
              ["Mobile Demo Kit", "Available"],
            ].map((r) => (
              <div className="resource" key={r[0]}>
                <i />
                <div>
                  <b>{r[0]}</b>
                  <small>{r[1]}</small>
                </div>
              </div>
            ))}
            <button className="outline" onClick={() => flash("Resource added")}>
              + Add resource
            </button>
          </div>
          <div className="suitecard">
            <small>COVERAGE</small>
            <h3>Routing health</h3>
            <p>
              All active event types have a primary host, fallback host, and
              required resource coverage.
            </p>
            <b className="score">100%</b>
          </div>
        </div>
      )}
      {area === "Integrations" && (
        <div className="suitegrid integrations">
          {[
            ["Google Calendar", "2-way sync", "Connected"],
            ["Microsoft Outlook", "2-way sync", "Connect"],
            ["Zoom", "Auto-create meetings", "Connected"],
            ["Google Meet", "Auto-create meetings", "Connected"],
            ["Stripe", "Payments + refunds", "Connected"],
            ["HighLevel CRM", "Contacts + pipelines", "Connected"],
            ["Zapier / Make", "Workflow triggers", "Connect"],
            ["Webhooks + API", "Developer access", "Configure"],
          ].map((x) => (
            <div className="suitecard" key={x[0]}>
              <i className="appicon">{x[0].slice(0, 2)}</i>
              <div>
                <h3>{x[0]}</h3>
                <p>{x[1]}</p>
              </div>
              <button
                className={x[2] === "Connected" ? "connected" : ""}
                onClick={() => flash(`${x[0]} settings opened`)}
              >
                {x[2]}
              </button>
            </div>
          ))}
        </div>
      )}
      {area === "Analytics" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>PERFORMANCE</small>
                <h3>Booking intelligence</h3>
              </div>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option>7 days</option>
                <option>30 days</option>
                <option>90 days</option>
              </select>
            </div>
            <div className="analyticsStats">
              {[
                ["Conversion", "68%", "+12.4%"],
                ["Booked revenue", "$42.8K", "+18.2%"],
                ["No-show rate", "3.1%", "-2.4%"],
                ["Avg. lead time", "6.2 days", "+0.8d"],
              ].map((x) => (
                <div key={x[0]}>
                  <small>{x[0]}</small>
                  <b>{x[1]}</b>
                  <em>{x[2]}</em>
                </div>
              ))}
            </div>
            <div className="chart">
              {[38, 54, 42, 66, 58, 82, 74, 91, 77, 94, 88, 100].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
              <span>BOOKING VOLUME · {range.toUpperCase()}</span>
            </div>
          </div>
          <div className="suitecard">
            <small>TOP EVENT</small>
            <h3>AI Systems Intensive</h3>
            <b className="score">74%</b>
            <p>Page-to-booking conversion</p>
            <div className="checkline">
              51 <span>visitors converted</span>
            </div>
          </div>
          <div className="suitecard">
            <small>ATTRIBUTION</small>
            <h3>Where bookings start</h3>
            {[
              ["Direct link", "44%"],
              ["Instagram", "28%"],
              ["Email", "18%"],
              ["Partner referral", "10%"],
            ].map((x) => (
              <div className="attribution" key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
            <button
              className="outline"
              onClick={() => flash("Analytics exported")}
            >
              Export report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CapabilityComparison() {
  const rows = [
    [
      "Booking links + availability",
      "Native",
      "Native",
      "Native",
      "Native",
      "Native",
    ],
    [
      "Group sessions + capacity",
      "Native",
      "Available",
      "Native",
      "Available",
      "Available",
    ],
    [
      "Waitlists + automatic seat release",
      "Native",
      "Extension",
      "Workflow",
      "Workflow",
      "Manual",
    ],
    [
      "Payments, deposits + packages",
      "Native",
      "Integration",
      "Native",
      "Integration",
      "External",
    ],
    [
      "Attribute + round-robin routing",
      "Native",
      "Teams+",
      "Limited",
      "Org+",
      "Staff logic",
    ],
    [
      "Host + physical resource locking",
      "Native",
      "Host-first",
      "Resources",
      "Host-first",
      "Staff-first",
    ],
    [
      "Customer-selected location or video app",
      "Native",
      "Host-defined",
      "Host-defined",
      "Host-defined",
      "Teams-first",
    ],
    [
      "Reschedule with conflict recheck",
      "Native",
      "Native",
      "Native",
      "Native",
      "Native",
    ],
    [
      "Multi-step email + SMS automation",
      "Native",
      "Plan-based",
      "Available",
      "Plan-based",
      "Email-first",
    ],
    [
      "Contact, booking + attribution record",
      "Unified",
      "Integrations",
      "Client record",
      "Integrations",
      "Microsoft 365",
    ],
    [
      "Month + week operations views",
      "Native",
      "Available",
      "Available",
      "Available",
      "Available",
    ],
    [
      "Custom rules, buffers + blackouts",
      "Native",
      "Available",
      "Available",
      "Available",
      "Available",
    ],
    [
      "White-label brand + interface control",
      "Full control",
      "Partial",
      "Customizable",
      "Plan-based",
      "Limited",
    ],
    [
      "Booking analytics + conversion signals",
      "Native",
      "Plan-based",
      "Reports",
      "Plan-based",
      "Basic",
    ],
  ];
  const tone = (value: string, cyncro: boolean) => {
    if (cyncro) return "matrixBadge matrixBest";
    if (["Native", "Available", "Resources", "Client record"].includes(value))
      return "matrixBadge matrixYes";
    if (["Manual", "External", "Limited", "Basic"].includes(value))
      return "matrixBadge matrixLow";
    return "matrixBadge matrixMid";
  };
  return (
    <section className="comparison" aria-labelledby="comparison-title">
      <div className="comparisonHead">
        <div>
          <label>CAPABILITY BENCHMARK</label>
          <h2 id="comparison-title">More than a scheduling link.</h2>
          <p>
            Cyncro unifies the customer journey, capacity, revenue, routing,
            operations, and follow-up in one calendar operating system.
          </p>
        </div>
        <div className="comparisonCallout">
          <small>CYNCRO ADVANTAGE</small>
          <b>One command center</b>
          <span>No fragmented scheduler stack</span>
        </div>
      </div>
      <div className="capabilityCards">
        {[
          [
            "01",
            "Customer experience",
            "Location choice, custom questions, confirmations",
          ],
          [
            "02",
            "Capacity intelligence",
            "Seats, resources, holds, waitlists, conflict protection",
          ],
          [
            "03",
            "Revenue controls",
            "Payments, deposits, packages, coupons, cancellation rules",
          ],
          [
            "04",
            "Routing engine",
            "Hosts, teams, rooms, equipment, skills, load balancing",
          ],
          [
            "05",
            "Lifecycle automation",
            "Email, SMS, reminders, follow-up, approval paths",
          ],
          [
            "06",
            "Operations + insight",
            "Admin controls, contacts, attribution, conversion analytics",
          ],
        ].map((item) => (
          <article key={item[0]}>
            <span>{item[0]}</span>
            <h3>{item[1]}</h3>
            <p>{item[2]}</p>
          </article>
        ))}
      </div>
      <div className="matrixWrap">
        <table className="capabilityMatrix">
          <thead>
            <tr>
              <th>Capability</th>
              <th className="cyncroColumn">Cyncro</th>
              <th>Calendly</th>
              <th>Acuity</th>
              <th>Cal.com</th>
              <th>MS Bookings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                <th scope="row">{row[0]}</th>
                {row.slice(1).map((value, index) => (
                  <td
                    className={index === 0 ? "cyncroColumn" : ""}
                    key={`${row[0]}-${value}-${index}`}
                  >
                    <span className={tone(value, index === 0)}>{value}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comparisonFoot">
        <p>
          Comparison reflects publicly documented capabilities and typical
          configurations as of August 2026. Plan and integration requirements
          vary.
        </p>
        <div>
          <a
            href="https://calendly.com/features"
            target="_blank"
            rel="noreferrer"
          >
            Calendly
          </a>
          <a
            href="https://help.acuityscheduling.com/hc/en-us/articles/16676870315661-Getting-started-with-Acuity-Scheduling"
            target="_blank"
            rel="noreferrer"
          >
            Acuity
          </a>
          <a href="https://cal.com/pricing" target="_blank" rel="noreferrer">
            Cal.com
          </a>
          <a
            href="https://www.microsoft.com/en-us/microsoft-365/business/scheduling-and-booking-app"
            target="_blank"
            rel="noreferrer"
          >
            Microsoft
          </a>
        </div>
      </div>
    </section>
  );
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p>{sub}</p>
      {children}
    </div>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Switch({
  label,
  desc,
  value,
  set,
}: {
  label: string;
  desc: string;
  value: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <div className="switchrow">
      <div>
        <b>{label}</b>
        <p>{desc}</p>
      </div>
      <button
        className={value ? "switch on" : "switch"}
        onClick={() => set(!value)}
      >
        <i />
      </button>
    </div>
  );
}
type DisputeView =
  | "Command"
  | "Clients"
  | "Leads"
  | "Report Audit"
  | "Cases"
  | "Templates"
  | "Law Library"
  | "Mail"
  | "Inbox"
  | "Tasks"
  | "Billing"
  | "Affiliates"
  | "Client Portal"
  | "Team"
  | "Marketing"
  | "Analytics"
  | "Compliance";

const disputeCases = [
  {
    client: "Amelia Carter",
    item: "Capital One · ending 4412",
    bureau: "Experian",
    issue: "Balance inaccurate",
    round: 1,
    due: "Sep 11",
    status: "INVESTIGATING",
    score: 82,
  },
  {
    client: "Marcus Reed",
    item: "Midland Credit Management",
    bureau: "TransUnion",
    issue: "Not my account",
    round: 2,
    due: "Aug 29",
    status: "RESPONSE DUE",
    score: 94,
  },
  {
    client: "Sofia Bennett",
    item: "Chase · ending 1098",
    bureau: "Equifax",
    issue: "Late payment inaccurate",
    round: 1,
    due: "Sep 08",
    status: "MAILED",
    score: 76,
  },
  {
    client: "Daniel Foster",
    item: "Portfolio Recovery",
    bureau: "All bureaus",
    issue: "Date/status mismatch",
    round: 3,
    due: "Aug 22",
    status: "ESCALATE",
    score: 89,
  },
];

function CyncroDispute() {
  const [view, setView] = useState<DisputeView>("Command");
  const [selectedCase, setSelectedCase] = useState(1);
  const [notice, setNotice] = useState("");
  const [template, setTemplate] = useState(
    "CRA factual dispute — inaccurate account data",
  );
  const [generated, setGenerated] = useState(false);
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1900);
  };
  const nav: { name: DisputeView; icon: string }[] = [
    { name: "Command", icon: "⌂" },
    { name: "Clients", icon: "◎" },
    { name: "Leads", icon: "◫" },
    { name: "Report Audit", icon: "◉" },
    { name: "Cases", icon: "▦" },
    { name: "Templates", icon: "▤" },
    { name: "Law Library", icon: "§" },
    { name: "Mail", icon: "✉" },
    { name: "Inbox", icon: "▣" },
    { name: "Tasks", icon: "✓" },
    { name: "Billing", icon: "$" },
    { name: "Affiliates", icon: "⌘" },
    { name: "Client Portal", icon: "▱" },
    { name: "Team", icon: "♙" },
    { name: "Marketing", icon: "✦" },
    { name: "Analytics", icon: "⌁" },
    { name: "Compliance", icon: "◇" },
  ];
  return (
    <section className="disputeShell">
      {notice && <div className="dispatchToast">✓ {notice}</div>}
      <aside className="disputeSidebar">
        <div className="disputeBrand">
          <span>CD</span>
          <div>
            <b>Cyncro Dispute</b>
            <small>Factual dispute operations</small>
          </div>
        </div>
        <div className="disputeWorkspace">
          <small>ACTIVE ORGANIZATION</small>
          <button>
            <span>VP</span>
            <div>
              <b>Vivid Pinnacle</b>
              <small>Administrator</small>
            </div>
            <i>⌄</i>
          </button>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
              key={item.name}
            >
              <i>{item.icon}</i>
              <span>{item.name}</span>
              {item.name === "Cases" && <em>24</em>}
            </button>
          ))}
        </nav>
        <div className="disputeGuard">
          <span>COMPLIANCE GUARD</span>
          <b>● Active</b>
          <small>CROA disclosures · truth attestation · audit log</small>
        </div>
        <button
          className="exitDispute"
          onClick={() => flash("Workspace switcher opened")}
        >
          Cyncro Core modules ↗
        </button>
      </aside>
      <main className="disputeMain">
        <header className="disputeTopbar">
          <div>
            <small>THURSDAY, AUGUST 13</small>
            <b>{view === "Command" ? "Dispute Command Center" : view}</b>
          </div>
          <div>
            <button onClick={() => flash("Global search opened")}>⌕</button>
            <button onClick={() => flash("No compliance alerts")}>◌</button>
            <button
              onClick={() => {
                setView("Cases");
                flash("New factual dispute case opened");
              }}
            >
              ＋ New case
            </button>
          </div>
        </header>
        <div className="disputeContent">
          {view === "Command" && (
            <DisputeCommand onView={setView} onFlash={flash} />
          )}
          {view === "Cases" && (
            <DisputeCases
              selected={selectedCase}
              setSelected={setSelectedCase}
              onFlash={flash}
            />
          )}
          {view === "Clients" && (
            <DisputeClients onCase={() => setView("Cases")} onFlash={flash} />
          )}
          {view === "Leads" && <DisputeLeads onFlash={flash} />}
          {view === "Report Audit" && <DisputeReportAudit onFlash={flash} />}
          {view === "Templates" && (
            <DisputeTemplates
              template={template}
              setTemplate={setTemplate}
              generated={generated}
              setGenerated={setGenerated}
              onFlash={flash}
            />
          )}
          {view === "Law Library" && <DisputeLawLibrary />}
          {view === "Mail" && <DisputeMail onFlash={flash} />}
          {view === "Inbox" && <DisputeInbox onFlash={flash} />}
          {view === "Tasks" && <DisputeTasks onFlash={flash} />}
          {view === "Billing" && <DisputeBilling onFlash={flash} />}
          {view === "Affiliates" && <DisputeAffiliates onFlash={flash} />}
          {view === "Client Portal" && <DisputeClientPortal onFlash={flash} />}
          {view === "Team" && <DisputeTeam onFlash={flash} />}
          {view === "Marketing" && <DisputeMarketing onFlash={flash} />}
          {view === "Analytics" && <DisputeAnalytics />}
          {view === "Compliance" && <DisputeCompliance onFlash={flash} />}
        </div>
      </main>
    </section>
  );
}

function DisputeCommand({
  onView,
  onFlash,
}: {
  onView: (view: DisputeView) => void;
  onFlash: (message: string) => void;
}) {
  return (
    <>
      <div className="disputeHero">
        <div>
          <span>CONSUMER REPORT ACCURACY OPERATIONS</span>
          <h1>
            Every fact tracked.
            <br />
            <i>Every deadline protected.</i>
          </h1>
          <p>
            Evidence-led dispute management with bureau rounds, furnisher
            investigations, certified mail, response analysis, and compliance
            controls.
          </p>
        </div>
        <button onClick={() => onView("Templates")}>
          ✦ Build compliant dispute
        </button>
      </div>
      <div className="disputeMetrics">
        {[
          ["ACTIVE CLIENTS", "184", "+12 this month"],
          ["OPEN DISPUTES", "327", "24 responses due"],
          ["ITEMS CORRECTED", "68%", "Verified outcomes"],
          ["DEADLINES PROTECTED", "100%", "0 overdue"],
        ].map((m) => (
          <article key={m[0]}>
            <small>{m[0]}</small>
            <b>{m[1]}</b>
            <span>{m[2]}</span>
          </article>
        ))}
      </div>
      <div className="disputeCommandGrid">
        <section className="disputePanel casePulse">
          <header>
            <div>
              <small>PRIORITY CASES</small>
              <h2>What needs action now</h2>
            </div>
            <button onClick={() => onView("Cases")}>All cases →</button>
          </header>
          {disputeCases.map((c, i) => (
            <button onClick={() => onView("Cases")} key={c.client}>
              <span>
                <i>
                  {c.client
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </i>
                <div>
                  <b>{c.client}</b>
                  <small>
                    {c.item} · {c.bureau}
                  </small>
                </div>
              </span>
              <em>{c.issue}</em>
              <strong>{c.status}</strong>
              <time>{c.due}</time>
            </button>
          ))}
        </section>
        <section className="disputePanel deadlineRadar">
          <small>STATUTORY DEADLINE RADAR</small>
          <h2>Investigation clock</h2>
          <div className="deadlineRing">
            <span>
              <b>24</b>
              <small>RESPONSES DUE</small>
            </span>
          </div>
          {[
            ["0–7 days", "5", "urgent"],
            ["8–15 days", "8", "watch"],
            ["16–30 days", "11", "safe"],
          ].map((x) => (
            <article key={x[0]}>
              <i className={x[2]} />
              <span>{x[0]}</span>
              <b>{x[1]}</b>
            </article>
          ))}
          <button onClick={() => onView("Mail")}>
            Open deadline command →
          </button>
        </section>
        <section className="disputePanel evidenceHealth">
          <header>
            <div>
              <small>EVIDENCE READINESS</small>
              <h2>Case strength before submission</h2>
            </div>
            <span>86% avg</span>
          </header>
          {[
            ["Identity + address verified", "100%"],
            ["Report page attached", "92%"],
            ["Specific factual allegation", "88%"],
            ["Supporting documents", "76%"],
            ["Requested correction stated", "94%"],
          ].map((x) => (
            <article key={x[0]}>
              <span>{x[0]}</span>
              <em>
                <i style={{ width: x[1] }} />
              </em>
              <b>{x[1]}</b>
            </article>
          ))}
        </section>
        <section className="disputePanel compliancePulse">
          <small>COMPLIANCE PULSE</small>
          <h2>Built to protect the consumer and the company.</h2>
          <div>
            <span>✓ No advance-fee workflow</span>
            <span>✓ Three-day cancellation tracked</span>
            <span>✓ Truth attestation required</span>
            <span>✓ No blanket disputes</span>
            <span>✓ No false identity-theft claims</span>
            <span>✓ Immutable activity record</span>
          </div>
          <button onClick={() => onView("Compliance")}>
            Open compliance center →
          </button>
        </section>
      </div>
    </>
  );
}

function DisputeCases({
  selected,
  setSelected,
  onFlash,
}: {
  selected: number;
  setSelected: (n: number) => void;
  onFlash: (m: string) => void;
}) {
  const c = disputeCases[selected];
  return (
    <div className="disputeCases">
      <section className="disputePanel disputeCaseList">
        <header>
          <div>
            <small>CASE COMMAND</small>
            <h1>Active disputes</h1>
          </div>
          <button onClick={() => onFlash("Case filters opened")}>Filter</button>
        </header>
        {disputeCases.map((x, i) => (
          <button
            className={selected === i ? "active" : ""}
            onClick={() => setSelected(i)}
            key={x.client}
          >
            <span>
              <b>{x.client}</b>
              <small>
                {x.item}
                <br />
                {x.bureau} · Round {x.round}
              </small>
            </span>
            <em>{x.status}</em>
            <strong>{x.score}%</strong>
          </button>
        ))}
      </section>
      <aside className="disputePanel disputeInspector">
        <header>
          <div>
            <small>CASE FILE</small>
            <h2>{c.client}</h2>
          </div>
          <button onClick={() => onFlash("Case audit trail opened")}>
            •••
          </button>
        </header>
        <span className="caseStatus">● {c.status}</span>
        <h3>{c.item}</h3>
        <p>
          {c.issue} · {c.bureau} · Round {c.round}
        </p>
        <div className="caseStrength">
          <span>
            <b>{c.score}%</b>
            <small>EVIDENCE STRENGTH</small>
          </span>
          <em>
            <i style={{ width: `${c.score}%` }} />
          </em>
        </div>
        <div className="caseFacts">
          {[
            ["DISPUTED FIELD", c.issue],
            ["REPORTED VALUE", "$4,281 / 120+ days late"],
            ["CONSUMER POSITION", "Balance and status are inaccurate"],
            [
              "REQUESTED RESULT",
              "Investigate and correct or delete if unverifiable",
            ],
          ].map((x) => (
            <span key={x[0]}>
              <small>{x[0]}</small>
              <b>{x[1]}</b>
            </span>
          ))}
        </div>
        <div className="caseTimeline">
          {[
            ["REPORT REVIEWED", "Aug 10", "✓"],
            ["EVIDENCE LOCKED", "Aug 11", "✓"],
            ["DISPUTE MAILED", "Aug 12", "✓"],
            ["RESPONSE DUE", c.due, ""],
          ].map((x) => (
            <article className={x[2] ? "done" : ""} key={x[0]}>
              <i>{x[2]}</i>
              <span>
                <b>{x[0]}</b>
                <small>{x[1]}</small>
              </span>
            </article>
          ))}
        </div>
        <button onClick={() => onFlash("Response analyzer opened")}>
          Analyze bureau response
        </button>
        <button onClick={() => onFlash("Escalation path prepared")}>
          Prepare next lawful action
        </button>
      </aside>
    </div>
  );
}

function DisputeClients({
  onCase,
  onFlash,
}: {
  onCase: () => void;
  onFlash: (m: string) => void;
}) {
  return (
    <div className="disputeClients">
      <div className="disputeHero compact">
        <div>
          <span>CLIENT OPERATIONS</span>
          <h1>One consumer. One defensible record.</h1>
          <p>
            Reports, identity documents, consent, contracts, disputes, results,
            communications, and billing.
          </p>
        </div>
        <button onClick={() => onFlash("Secure client invitation created")}>
          ＋ Invite client
        </button>
      </div>
      <section className="disputePanel clientPortfolio">
        <header>
          <span>CLIENT</span>
          <span>ACTIVE ITEMS</span>
          <span>NEXT ACTION</span>
          <span>OUTCOME</span>
          <span>RISK</span>
        </header>
        {[
          [
            "AC",
            "Amelia Carter",
            "7",
            "Experian response · 12d",
            "4 corrected",
            "LOW",
          ],
          [
            "MR",
            "Marcus Reed",
            "11",
            "Furnisher response · 3d",
            "6 corrected",
            "URGENT",
          ],
          [
            "SB",
            "Sofia Bennett",
            "5",
            "Equifax investigation · 10d",
            "2 corrected",
            "LOW",
          ],
          [
            "DF",
            "Daniel Foster",
            "9",
            "CFPB eligibility review",
            "5 corrected",
            "REVIEW",
          ],
        ].map((x) => (
          <button onClick={onCase} key={x[1]}>
            <span>
              <i>{x[0]}</i>
              <b>{x[1]}</b>
            </span>
            <strong>{x[2]}</strong>
            <span>{x[3]}</span>
            <em>{x[4]}</em>
            <small>{x[5]}</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function DisputeTemplates({
  template,
  setTemplate,
  generated,
  setGenerated,
  onFlash,
}: {
  template: string;
  setTemplate: (v: string) => void;
  generated: boolean;
  setGenerated: (v: boolean) => void;
  onFlash: (m: string) => void;
}) {
  const templates = [
    "CRA factual dispute — inaccurate account data",
    "Direct furnisher dispute — Regulation V",
    "Method of verification request",
    "Identity theft block request — verified victims only",
    "Debt collector validation request",
    "Obsolete information dispute",
    "Mixed-file / identity mismatch",
    "CFPB complaint narrative — after dispute eligibility",
  ];
  return (
    <div className="templateWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>COMPLIANCE-AWARE DOCUMENT ENGINE</span>
          <h1>Specific facts. Relevant law. Complete evidence.</h1>
          <p>
            Templates assemble from the client’s actual report data and
            attachments—never generic blanket language.
          </p>
        </div>
        <button
          onClick={() => {
            setGenerated(true);
            onFlash("Fact-specific draft generated");
          }}
        >
          ✦ Generate draft
        </button>
      </div>
      <div className="templateBuilder">
        <section className="disputePanel templateCatalog">
          <small>TEMPLATE LIBRARY</small>
          {templates.map((t) => (
            <button
              className={template === t ? "active" : ""}
              onClick={() => {
                setTemplate(t);
                setGenerated(false);
              }}
              key={t}
            >
              <span>§</span>
              <div>
                <b>{t}</b>
                <small>Attorney-review ready · version controlled</small>
              </div>
            </button>
          ))}
        </section>
        <section className="disputePanel letterComposer">
          <header>
            <div>
              <small>SELECTED WORKFLOW</small>
              <h2>{template}</h2>
            </div>
            <span>Compliance check: PASSED</span>
          </header>
          <div className="composerChecks">
            <span>✓ Specific disputed field</span>
            <span>✓ Supporting document linked</span>
            <span>✓ Requested correction</span>
            <span>✓ Truth attestation</span>
          </div>
          {generated ? (
            <article className="generatedLetter">
              <small>DRAFT · CONSUMER REVIEW REQUIRED</small>
              <p>
                <b>
                  Re: Request for investigation of specifically identified
                  inaccurate information
                </b>
              </p>
              <p>
                I am writing to dispute the accuracy and completeness of the
                account information identified in the attached report excerpt.
                The specific field disputed is the reported balance/status. My
                records supporting this position are attached and indexed.
              </p>
              <p>
                Please conduct a reasonable reinvestigation, forward all
                relevant information to the furnisher, and correct or delete
                information that is inaccurate, incomplete, or cannot be
                verified. Please provide the written results and an updated
                report.
              </p>
              <p>
                <b>Authority map:</b> FCRA §§ 611 and 623; Regulation V §
                1022.43 where applicable.
              </p>
            </article>
          ) : (
            <div className="composerEmpty">
              <span>§</span>
              <h3>Build a defensible dispute</h3>
              <p>
                Select verified facts and evidence, then generate a
                consumer-review draft.
              </p>
            </div>
          )}
          <footer>
            <button onClick={() => onFlash("Attorney review queue opened")}>
              Send for legal review
            </button>
            <button onClick={() => onFlash("Truth attestation requested")}>
              Request consumer approval →
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

const lawCards = [
  [
    "FCRA § 611",
    "15 U.S.C. § 1681i",
    "CRA reinvestigation, relevant information, results, frivolous-dispute notices",
    "CRA dispute · method of verification",
  ],
  [
    "FCRA § 623",
    "15 U.S.C. § 1681s-2",
    "Furnisher accuracy duties and investigations after CRA notice",
    "Furnisher / CRA workflow",
  ],
  [
    "Identity Theft Block",
    "15 U.S.C. § 1681c-2",
    "Block information resulting from documented identity theft",
    "Verified identity-theft cases only",
  ],
  [
    "Obsolescence",
    "15 U.S.C. § 1681c",
    "Time limits for certain adverse information",
    "Obsolete-item review",
  ],
  [
    "Permissible Purpose",
    "15 U.S.C. § 1681b",
    "When a consumer report may be obtained or used",
    "Inquiry / access review",
  ],
  [
    "Disclosures",
    "15 U.S.C. § 1681g",
    "Consumer file disclosure requirements",
    "File disclosure requests",
  ],
  [
    "Regulation V",
    "12 C.F.R. § 1022.43",
    "Direct disputes to furnishers and required contents",
    "Direct furnisher disputes",
  ],
  [
    "CROA",
    "15 U.S.C. §§ 1679–1679j",
    "Advertising, disclosures, contracts, advance fees, cancellation rights",
    "Company compliance",
  ],
  [
    "FDCPA Disputes",
    "15 U.S.C. § 1692g",
    "Debt validation and dispute-related collection duties",
    "Collector correspondence",
  ],
];
function DisputeLawLibrary() {
  return (
    <div className="lawWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>FEDERAL AUTHORITY MAP</span>
          <h1>Law connected to workflow—not pasted blindly.</h1>
          <p>
            Current federal authorities organized by issue, recipient, evidence
            requirements, and procedural timing.
          </p>
        </div>
        <a
          href="https://www.consumerfinance.gov/rules-policy/regulations/1022/43/"
          target="_blank"
          rel="noreferrer"
        >
          Official Regulation V ↗
        </a>
      </div>
      <div className="lawGrid">
        {lawCards.map((x) => (
          <article className="disputePanel" key={x[0]}>
            <header>
              <span>§</span>
              <div>
                <small>{x[1]}</small>
                <h2>{x[0]}</h2>
              </div>
            </header>
            <p>{x[2]}</p>
            <footer>
              <span>{x[3]}</span>
              <button>Open authority →</button>
            </footer>
          </article>
        ))}
      </div>
      <div className="legalNotice">
        Legal reference library—not legal advice. Federal law is only part of
        compliance; state credit-services laws, licensing, bonding,
        telemarketing, privacy, and contract rules require counsel review.
      </div>
    </div>
  );
}

function DisputeMail({ onFlash }: { onFlash: (m: string) => void }) {
  return (
    <div className="mailWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>CERTIFIED MAIL + RESPONSE CONTROL</span>
          <h1>Proof from draft to delivery.</h1>
          <p>
            Document versions, consumer approvals, certified tracking, delivery
            dates, statutory clocks, and returned responses.
          </p>
        </div>
        <button onClick={() => onFlash("Mail batch prepared")}>
          ＋ Prepare mail batch
        </button>
      </div>
      <div className="mailMetrics">
        {[
          ["READY TO MAIL", "18", "$142 postage"],
          ["IN TRANSIT", "34", "100% tracked"],
          ["DELIVERED", "27", "Clocks running"],
          ["RESPONSES DUE", "5", "Next 7 days"],
        ].map((x) => (
          <article className="disputePanel" key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </div>
      <section className="disputePanel mailTable">
        <header>
          <span>CLIENT / RECIPIENT</span>
          <span>DOCUMENT</span>
          <span>TRACKING</span>
          <span>DELIVERED</span>
          <span>DEADLINE</span>
        </header>
        {[
          [
            "Marcus Reed · TransUnion",
            "Round 2 factual dispute",
            "9407 1118 9876 5432",
            "Aug 01",
            "Aug 31",
          ],
          [
            "Amelia Carter · Experian",
            "Round 1 factual dispute",
            "9407 1118 9876 5458",
            "Aug 12",
            "Sep 11",
          ],
          [
            "Sofia Bennett · Equifax",
            "Round 1 factual dispute",
            "9407 1118 9876 5501",
            "In transit",
            "Pending",
          ],
        ].map((x) => (
          <button
            onClick={() => onFlash("Certified-mail evidence opened")}
            key={x[0]}
          >
            {x.map((v) => (
              <span key={v}>{v}</span>
            ))}
          </button>
        ))}
      </section>
    </div>
  );
}

function DisputeAnalytics() {
  return (
    <div className="disputeAnalytics">
      <div className="disputeHero compact">
        <div>
          <span>VERIFIED OUTCOME INTELLIGENCE</span>
          <h1>Measure accuracy outcomes—not empty promises.</h1>
          <p>
            Correction rates, response quality, cycle time, evidence strength,
            bureau behavior, and compliance performance.
          </p>
        </div>
      </div>
      <div className="disputeMetrics">
        {[
          ["VERIFIED CORRECTION RATE", "68%", "Across completed items"],
          ["AVG RESOLUTION TIME", "41d", "−6 days QoQ"],
          ["RESPONSE ANALYZED", "94%", "Within 24 hours"],
          ["CLIENT RETENTION", "91%", "No score guarantees"],
        ].map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </div>
      <div className="analyticsDisputeGrid">
        <section className="disputePanel outcomeBars">
          <small>OUTCOMES BY ISSUE TYPE</small>
          <h2>Verified report changes</h2>
          {[
            ["Identity mismatch", "84%"],
            ["Balance/status error", "72%"],
            ["Duplicate account", "69%"],
            ["Obsolete information", "65%"],
            ["Late payment accuracy", "41%"],
          ].map((x) => (
            <article key={x[0]}>
              <span>{x[0]}</span>
              <em>
                <i style={{ width: x[1] }} />
              </em>
              <b>{x[1]}</b>
            </article>
          ))}
        </section>
        <section className="disputePanel bureauScore">
          <small>BUREAU RESPONSE QUALITY</small>
          <h2>Investigation intelligence</h2>
          {[
            ["Experian", "4.1 / 5", "29d"],
            ["Equifax", "3.8 / 5", "31d"],
            ["TransUnion", "4.0 / 5", "28d"],
            ["Furnishers", "3.4 / 5", "27d"],
          ].map((x) => (
            <article key={x[0]}>
              <b>{x[0]}</b>
              <span>{x[1]} completeness</span>
              <em>{x[2]}</em>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function DisputeCompliance({ onFlash }: { onFlash: (m: string) => void }) {
  return (
    <div className="complianceWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>COMPLIANCE OPERATING SYSTEM</span>
          <h1>Designed to stop bad credit-repair behavior.</h1>
          <p>
            Federal controls plus configurable state-law review, disclosures,
            contracts, consent, billing gates, and audit evidence.
          </p>
        </div>
        <button onClick={() => onFlash("Compliance report generated")}>
          Export compliance report
        </button>
      </div>
      <div className="complianceGrid">
        {[
          [
            "CROA Contract Controls",
            "Written agreement, service description, cost, timing, guarantees, cancellation documents",
            "PASS",
          ],
          [
            "Billing Gate",
            "No charge before the contracted service is fully performed",
            "ENFORCED",
          ],
          [
            "Consumer Rights Disclosure",
            "Required federal disclosure versioned before contract signature",
            "CURRENT",
          ],
          [
            "Three-Day Cancellation",
            "Cancellation window and notice tracked automatically",
            "ENFORCED",
          ],
          [
            "Truth + Accuracy Attestation",
            "Consumer confirms each factual allegation and attachment",
            "REQUIRED",
          ],
          [
            "Identity-Theft Safeguard",
            "No § 605B workflow without identity-theft report and verified evidence",
            "LOCKED",
          ],
          [
            "State Rules Review",
            "State licensing, bonding, fee, contract, and telemarketing matrix",
            "COUNSEL REVIEW",
          ],
          [
            "Template Governance",
            "Authority version, editor, approvals, and use history preserved",
            "AUDITED",
          ],
        ].map((x) => (
          <article className="disputePanel" key={x[0]}>
            <header>
              <span>◇</span>
              <em>{x[2]}</em>
            </header>
            <h2>{x[0]}</h2>
            <p>{x[1]}</p>
            <button onClick={() => onFlash(`${x[0]} control opened`)}>
              Review control →
            </button>
          </article>
        ))}
      </div>
      <div className="complianceWarning">
        <b>Important:</b> Cyncro Dispute does not remove accurate, current
        negative information; does not guarantee score increases or deletions;
        and blocks false identity-theft or blanket dispute workflows.
      </div>
    </div>
  );
}

const suiteData: Record<
  string,
  {
    eyebrow: string;
    title: string;
    description: string;
    action: string;
    metrics: string[][];
    sections: { title: string; subtitle: string; rows: string[][] }[];
  }
> = {
  Leads: {
    eyebrow: "LEAD-TO-CLIENT PIPELINE",
    title: "Turn interest into compliant client relationships.",
    description:
      "Lead capture, consultation audits, nurture, agreement, onboarding, assignment, and attribution.",
    action: "＋ Add lead",
    metrics: [
      ["NEW LEADS", "48", "+22%"],
      ["CONSULTATIONS", "31", "64% booked"],
      ["AGREEMENTS SIGNED", "18", "58% close"],
      ["PIPELINE VALUE", "$27.4K", "This month"],
    ],
    sections: [
      {
        title: "Conversion pipeline",
        subtitle: "Every lead and next action",
        rows: [
          ["Jordan Mills", "Credit audit requested", "CONSULTATION", "$1,497"],
          ["Taylor Brooks", "Agreement opened", "PROPOSAL", "$997"],
          ["Nina Alvarez", "Onboarding incomplete", "SIGNED", "$1,297"],
          ["Owen Hart", "New website lead", "NEW", "$797"],
        ],
      },
      {
        title: "Automated nurture",
        subtitle: "Email + SMS sequences",
        rows: [
          ["Credit audit follow-up", "842 enrolled", "38% reply", "LIVE"],
          ["No-show recovery", "62 enrolled", "21% rebook", "LIVE"],
          ["Agreement reminder", "34 enrolled", "59% signed", "LIVE"],
        ],
      },
    ],
  },
  "Report Audit": {
    eyebrow: "CREDIT REPORT INTELLIGENCE",
    title: "Import once. Understand every bureau difference.",
    description:
      "Three-bureau import, account matching, issue tagging, one-click audit, reimport comparison, score history, and permanent report snapshots.",
    action: "Import credit report",
    metrics: [
      ["REPORTS IMPORTED", "184", "100% encrypted"],
      ["POTENTIAL ISSUES", "1,428", "Fact review required"],
      ["REIMPORT CHANGES", "312", "This month"],
      ["AVG AUDIT TIME", "2m 14s", "−81%"],
    ],
    sections: [
      {
        title: "Tri-bureau audit",
        subtitle: "Account-level comparison",
        rows: [
          ["Capital One 4412", "EX: $4,281", "EQ: $3,994", "TU: $4,281"],
          ["Midland Credit", "EX: Open", "EQ: Missing", "TU: Collection"],
          ["Chase 1098", "EX: 30 late", "EQ: Current", "TU: 60 late"],
        ],
      },
      {
        title: "Reimport change detector",
        subtitle: "Preserved historical snapshots",
        rows: [
          ["Deleted", "28 items", "Verified across report", "PDF saved"],
          ["Updated positive", "41 items", "Status improved", "PDF saved"],
          ["Updated negative", "9 items", "Review required", "Flagged"],
          ["New accounts", "14 items", "Consumer review", "Pending"],
        ],
      },
    ],
  },
  Inbox: {
    eyebrow: "UNIFIED CLIENT COMMUNICATION",
    title: "Every conversation attached to the case.",
    description:
      "Secure portal messages, email, SMS, web chat, assignments, internal notes, templates, and response-time controls.",
    action: "New message",
    metrics: [
      ["OPEN CONVERSATIONS", "32", "8 assigned to you"],
      ["AVG RESPONSE", "6m 18s", "−42%"],
      ["CLIENT SATISFACTION", "96%", "Last 30 days"],
      ["UNREAD", "7", "2 urgent"],
    ],
    sections: [
      {
        title: "Unified inbox",
        subtitle: "SMS · email · portal · chat",
        rows: [
          ["Marcus Reed", "Uploaded TransUnion response", "PORTAL", "2m"],
          ["Amelia Carter", "Question about investigation", "SMS", "8m"],
          ["Sofia Bennett", "New Equifax alert", "EMAIL", "22m"],
        ],
      },
      {
        title: "Communication automations",
        subtitle: "Context-aware and consent controlled",
        rows: [
          ["Welcome + onboarding", "New client", "Email + SMS", "ACTIVE"],
          ["Report ready", "Import complete", "Push + email", "ACTIVE"],
          [
            "Response deadline",
            "7 days remaining",
            "Internal + client",
            "ACTIVE",
          ],
        ],
      },
    ],
  },
  Tasks: {
    eyebrow: "TEAM WORKFLOW CONTROL",
    title: "Nothing falls through the cracks.",
    description:
      "Tasks, events, queues, recurring work, service-level timers, assignments, calendars, and automated handoffs.",
    action: "＋ Create task",
    metrics: [
      ["DUE TODAY", "29", "5 urgent"],
      ["COMPLETED", "94%", "This week"],
      ["OVERDUE", "0", "SLA protected"],
      ["AUTOMATED", "68%", "No manual touch"],
    ],
    sections: [
      {
        title: "Priority work queue",
        subtitle: "Sorted by deadline and risk",
        rows: [
          ["Analyze TU response", "Marcus Reed", "TODAY 3 PM", "URGENT"],
          [
            "Review identity documents",
            "Sofia Bennett",
            "TODAY 5 PM",
            "NORMAL",
          ],
          ["Prepare Round 2 facts", "Daniel Foster", "TOMORROW", "WATCH"],
        ],
      },
      {
        title: "Calendar + events",
        subtitle: "Consultations and follow-ups",
        rows: [
          [
            "Client review call",
            "Amelia Carter",
            "Aug 14 · 10 AM",
            "Account Owner",
          ],
          ["Affiliate onboarding", "Palm Funding", "Aug 14 · 1 PM", "Dana"],
          ["Team compliance review", "All staff", "Aug 15 · 9 AM", "Owner"],
        ],
      },
    ],
  },
  Billing: {
    eyebrow: "COMPLIANT REVENUE OPERATIONS",
    title: "Bill accurately. Recover revenue. Keep proof.",
    description:
      "Invoices, subscriptions, completed-service billing gates, payment links, dunning, refunds, disputes, tax, and accounting reconciliation.",
    action: "＋ Create invoice",
    metrics: [
      ["MRR", "$86,420", "+14.8%"],
      ["COLLECTED", "$79,118", "91.5%"],
      ["PAST DUE", "$4,208", "Saver active"],
      ["CHURN", "2.1%", "−0.8%"],
    ],
    sections: [
      {
        title: "Invoices + subscriptions",
        subtitle: "CROA service-completion gates",
        rows: [
          ["Amelia Carter", "Monthly service completed", "$149", "PAID"],
          ["Marcus Reed", "Round 2 service completed", "$199", "DUE"],
          ["Sofia Bennett", "Onboarding service", "$99", "HELD · CANCELLATION"],
        ],
      },
      {
        title: "Subscription Saver",
        subtitle: "Consent-based payment recovery",
        rows: [
          ["Day 1 reminder", "18 accounts", "Email", "ACTIVE"],
          ["Day 3 card update", "9 accounts", "Portal + SMS", "ACTIVE"],
          ["Day 7 team task", "4 accounts", "Manual review", "ACTIVE"],
        ],
      },
    ],
  },
  Affiliates: {
    eyebrow: "REFERRAL PARTNER OPERATIONS",
    title: "Turn trusted partners into predictable growth.",
    description:
      "Affiliate portal, branded links, attribution, onboarding, lead status, commissions, documents, messaging, and performance analytics.",
    action: "＋ Invite affiliate",
    metrics: [
      ["ACTIVE PARTNERS", "86", "+9 this month"],
      ["REFERRED LEADS", "214", "Last 30 days"],
      ["CLIENTS WON", "74", "34.6%"],
      ["ATTRIBUTED MRR", "$22.8K", "26% total"],
    ],
    sections: [
      {
        title: "Partner leaderboard",
        subtitle: "Quality and revenue attribution",
        rows: [
          ["Palm Funding Group", "42 leads", "18 clients", "$7.8K MRR"],
          ["HomeKey Mortgage", "31 leads", "12 clients", "$4.9K MRR"],
          ["DriveRight Auto", "28 leads", "9 clients", "$3.2K MRR"],
        ],
      },
      {
        title: "Affiliate onboarding",
        subtitle: "Automated education and compliance",
        rows: [
          ["Welcome sequence", "86 enrolled", "100% delivered", "ACTIVE"],
          ["Referral rules attestation", "84 signed", "2 pending", "REQUIRED"],
          ["Monthly partner update", "Aug 15", "86 recipients", "SCHEDULED"],
        ],
      },
    ],
  },
  "Client Portal": {
    eyebrow: "SECURE CLIENT ACCESS",
    title: "Give clients visibility without losing control.",
    description:
      "Mobile-first onboarding, agreements, documents, scores, dispute choices, progress, messages, invoices, notifications, education, and referrals.",
    action: "Preview mobile portal",
    metrics: [
      ["PORTAL ADOPTION", "92%", "169 active"],
      ["ONBOARDING COMPLETE", "88%", "+11%"],
      ["PUSH ENABLED", "81%", "137 clients"],
      ["SELF-SERVICE", "64%", "Fewer status calls"],
    ],
    sections: [
      {
        title: "Onboarding journey",
        subtitle: "English + Spanish",
        rows: [
          [
            "Identity verification",
            "Government ID + proof of address",
            "184/184",
            "REQUIRED",
          ],
          [
            "Consumer rights disclosure",
            "Viewed + acknowledged",
            "181/184",
            "3 PENDING",
          ],
          [
            "Digital agreement",
            "Signed + cancellation notice",
            "178/184",
            "6 PENDING",
          ],
          [
            "Report connection",
            "Monitoring or upload",
            "171/184",
            "13 PENDING",
          ],
        ],
      },
      {
        title: "Client Choice",
        subtitle: "Consumer controls disputed items",
        rows: [
          ["Items selected", "428", "Truth attested", "READY"],
          ["Items awaiting review", "72", "Needs reason", "PENDING"],
          ["Items declined", "39", "Accurate/current", "PROTECTED"],
        ],
      },
    ],
  },
  Team: {
    eyebrow: "PEOPLE + PERMISSIONS",
    title: "Scale the company without exposing client data.",
    description:
      "Role-based access, workload, teams, specialist assignment, approval limits, audit history, training, and performance.",
    action: "＋ Invite teammate",
    metrics: [
      ["TEAM MEMBERS", "18", "4 roles"],
      ["ACTIVE CASELOAD", "18.2", "Per specialist"],
      ["SLA SCORE", "97%", "Top quartile"],
      ["TRAINING CURRENT", "100%", "Quarterly"],
    ],
    sections: [
      {
        title: "Team workload",
        subtitle: "Balanced by capacity and skill",
        rows: [
          ["Account Owner", "Owner", "Full access", "86 cases"],
          ["Dana Pierce", "Compliance manager", "Approval + audit", "42 cases"],
          ["Maya Torres", "Dispute specialist", "Assigned clients", "38 cases"],
          ["Andre Cole", "Client success", "Portal + messaging", "52 clients"],
        ],
      },
      {
        title: "Permission policies",
        subtitle: "Least-privilege access",
        rows: [
          ["Owner", "All modules + billing", "2 users", "ACTIVE"],
          ["Compliance", "Templates + approvals + audit", "3 users", "ACTIVE"],
          ["Specialist", "Assigned clients only", "9 users", "ACTIVE"],
          ["Affiliate", "Referred lead status only", "86 users", "ISOLATED"],
        ],
      },
    ],
  },
  Marketing: {
    eyebrow: "GROWTH AUTOMATION HUB",
    title: "Attract, nurture, convert, review, and refer.",
    description:
      "Landing pages, forms, email/SMS, web chat, social inbox, reputation, referral campaigns, segmentation, attribution, and scheduling.",
    action: "＋ Create campaign",
    metrics: [
      ["LEADS GENERATED", "486", "This month"],
      ["NURTURE CONVERSION", "18.4%", "+4.2%"],
      ["REVIEWS", "4.9★", "312 total"],
      ["CAMPAIGN ROI", "8.7×", "Attributed"],
    ],
    sections: [
      {
        title: "Campaign command",
        subtitle: "Omnichannel journeys",
        rows: [
          ["Credit audit funnel", "Meta + landing page", "184 leads", "LIVE"],
          ["Cold lead reactivation", "SMS + email", "42 appointments", "LIVE"],
          ["Client milestone reviews", "Email + portal", "31 reviews", "LIVE"],
          [
            "Affiliate recruitment",
            "Social + webinar",
            "18 partners",
            "SCHEDULED",
          ],
        ],
      },
      {
        title: "Unified social + chat",
        subtitle: "Instagram · Facebook · SMS · web",
        rows: [
          ["CREDIT keyword", "128 conversations", "42 booked", "ACTIVE"],
          ["Website chat", "94 conversations", "31 qualified", "ACTIVE"],
          ["Facebook comments", "62 triggers", "18 leads", "ACTIVE"],
        ],
      },
    ],
  },
};

function DisputeSuiteView({
  name,
  onFlash,
}: {
  name: keyof typeof suiteData;
  onFlash: (m: string) => void;
}) {
  const data = suiteData[name];
  return (
    <div className="disputeSuiteView">
      <div className="disputeHero compact">
        <div>
          <span>{data.eyebrow}</span>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
        <button onClick={() => onFlash(`${data.action} opened`)}>
          {data.action}
        </button>
      </div>
      <div className="disputeMetrics">
        {data.metrics.map((m) => (
          <article key={m[0]}>
            <small>{m[0]}</small>
            <b>{m[1]}</b>
            <span>{m[2]}</span>
          </article>
        ))}
      </div>
      <div className="suiteSections">
        {data.sections.map((section) => (
          <section className="disputePanel suiteTable" key={section.title}>
            <header>
              <div>
                <small>{section.subtitle.toUpperCase()}</small>
                <h2>{section.title}</h2>
              </div>
              <button
                onClick={() => onFlash(`${section.title} controls opened`)}
              >
                Manage →
              </button>
            </header>
            {section.rows.map((row, i) => (
              <button
                onClick={() => onFlash(`${row[0]} record opened`)}
                key={`${row[0]}-${i}`}
              >
                {row.map((cell, j) => (
                  <span
                    className={j === 0 ? "primary" : ""}
                    key={`${cell}-${j}`}
                  >
                    {cell}
                  </span>
                ))}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
function DisputeLeads({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Leads" onFlash={onFlash} />;
}
function DisputeReportAudit({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Report Audit" onFlash={onFlash} />;
}
function DisputeInbox({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Inbox" onFlash={onFlash} />;
}
function DisputeTasks({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Tasks" onFlash={onFlash} />;
}
function DisputeBilling({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Billing" onFlash={onFlash} />;
}
function DisputeAffiliates({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Affiliates" onFlash={onFlash} />;
}
function DisputeClientPortal({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Client Portal" onFlash={onFlash} />;
}
function DisputeTeam({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Team" onFlash={onFlash} />;
}
function DisputeMarketing({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Marketing" onFlash={onFlash} />;
}

type FinanceView =
  | "Command"
  | "Deal Queue"
  | "Deal Architect"
  | "Performance"
  | "Inventory"
  | "Deal Documents"
  | "Lenders"
  | "Product Menu"
  | "Contracts"
  | "Funding"
  | "Tax & Lease Lab"
  | "Compliance"
  | "Customers"
  | "Analytics";

const financeDeals = [
  {
    customer: "Olivia Bennett",
    vehicle: "2026 Porsche Macan S",
    stock: "P24018",
    score: "742",
    payment: "$1,146",
    gross: "$6,840",
    status: "READY TO PRESENT",
    lender: "Chase Auto",
    risk: "LOW",
    salesperson: "Maya Torres",
    financeManager: "Finance Manager",
    frontGross: "$4,120",
    backGross: "$2,720",
    pointsHeld: "2.00 pts",
    reserve: "$1,425",
  },
  {
    customer: "Noah Williams",
    vehicle: "2025 BMW X5 xDrive40i",
    stock: "B51882",
    score: "681",
    payment: "$984",
    gross: "$5,420",
    status: "LENDER REVIEW",
    lender: "BMW Financial",
    risk: "MEDIUM",
    salesperson: "Andre Cole",
    financeManager: "Dana Pierce",
    frontGross: "$3,240",
    backGross: "$2,180",
    pointsHeld: "1.75 pts",
    reserve: "$1,180",
  },
  {
    customer: "Sophia Carter",
    vehicle: "2026 Mercedes GLC 300",
    stock: "M60117",
    score: "718",
    payment: "$862",
    gross: "$7,190",
    status: "STIPS NEEDED",
    lender: "Mercedes-Benz FS",
    risk: "MEDIUM",
    salesperson: "Maya Torres",
    financeManager: "Finance Manager",
    frontGross: "$4,505",
    backGross: "$2,685",
    pointsHeld: "2.25 pts",
    reserve: "$1,695",
  },
  {
    customer: "Liam Rodriguez",
    vehicle: "2025 Audi Q7 Premium Plus",
    stock: "A74221",
    score: "655",
    payment: "$1,032",
    gross: "$4,980",
    status: "CONTRACTING",
    lender: "Ally",
    risk: "WATCH",
    salesperson: "Jason Cole",
    financeManager: "Jason Cole",
    frontGross: "$2,910",
    backGross: "$2,070",
    pointsHeld: "1.50 pts",
    reserve: "$1,040",
  },
];

function CyncroFinance() {
  const [view, setView] = useState<FinanceView>("Command");
  const [deal, setDeal] = useState(0);
  const [notice, setNotice] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const nav: { name: FinanceView; icon: string }[] = [
    { name: "Command", icon: "⌂" },
    { name: "Deal Queue", icon: "▦" },
    { name: "Deal Architect", icon: "✦" },
    { name: "Performance", icon: "↗" },
    { name: "Inventory", icon: "▥" },
    { name: "Deal Documents", icon: "▤" },
    { name: "Lenders", icon: "◎" },
    { name: "Product Menu", icon: "◇" },
    { name: "Contracts", icon: "▤" },
    { name: "Funding", icon: "$" },
    { name: "Tax & Lease Lab", icon: "%" },
    { name: "Compliance", icon: "◈" },
    { name: "Customers", icon: "♙" },
    { name: "Analytics", icon: "⌁" },
  ];
  return (
    <section className="financeShell">
      {notice && <div className="dispatchToast">✓ {notice}</div>}
      <aside className="financeSidebar">
        <div className="financeBrand">
          <span>CF</span>
          <div>
            <b>Cyncro Finance</b>
            <small>AUTOMOTIVE F&amp;I INTELLIGENCE</small>
          </div>
        </div>
        <button
          className="rooftopPicker"
          onClick={() => flash("Rooftop switcher opened")}
        >
          <span>VP</span>
          <div>
            <small>ACTIVE ROOFTOP</small>
            <b>Vivid Premier Auto</b>
          </div>
          <i>⌄</i>
        </button>
        <nav>
          {nav.map((item) => (
            <button
              key={item.name}
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
            >
              <i>{item.icon}</i>
              <span>{item.name}</span>
              {item.name === "Deal Queue" && <em>18</em>}
            </button>
          ))}
        </nav>
        <div className="financePulse">
          <span>FUNDING PULSE</span>
          <b>$428,600</b>
          <small>14 contracts pending · 2 aging alerts</small>
          <div>
            <i style={{ width: "78%" }} />
          </div>
        </div>
      </aside>
      <main className="financeMain">
        <header className="financeTopbar">
          <div>
            <small>THURSDAY, AUGUST 13</small>
            <b>{view === "Command" ? "Finance Command" : view}</b>
          </div>
          <div>
            <button
              onClick={() =>
                flash("Global vehicle, customer and deal search opened")
              }
            >
              ⌕ Search
            </button>
            <button onClick={() => setAiOpen(!aiOpen)}>✦ Cyncro AI</button>
            <button
              onClick={() => {
                setView("Deal Architect");
                flash("New deal jacket created");
              }}
            >
              ＋ New deal
            </button>
          </div>
        </header>
        <div className="financeContent">
          {view === "Command" && (
            <FinanceCommand
              onView={setView}
              onFlash={flash}
              onDeal={(i) => {
                setDeal(i);
                setView("Deal Architect");
              }}
            />
          )}
          {view === "Deal Queue" && (
            <FinanceDealQueue
              onOpen={(i) => {
                setDeal(i);
                setView("Deal Architect");
              }}
              onFlash={flash}
            />
          )}
          {view === "Deal Architect" && (
            <FinanceArchitect deal={financeDeals[deal]} onFlash={flash} />
          )}
          {view === "Performance" && (
            <FinancePerformance
              onOpen={(i) => {
                setDeal(i);
                setView("Deal Architect");
              }}
              onFlash={flash}
            />
          )}
          {view === "Inventory" && <FinanceInventory onFlash={flash} />}
          {view === "Deal Documents" && (
            <FinanceDealDocuments onFlash={flash} />
          )}
          {view === "Tax & Lease Lab" && <TaxLeaseLab onFlash={flash} />}
          {view !== "Command" &&
            view !== "Deal Queue" &&
            view !== "Deal Architect" &&
            view !== "Performance" &&
            view !== "Inventory" &&
            view !== "Deal Documents" &&
            view !== "Tax & Lease Lab" && (
              <FinanceWorkspace view={view} onFlash={flash} />
            )}
        </div>
      </main>
      {aiOpen && <FinanceAI onClose={() => setAiOpen(false)} onFlash={flash} />}
    </section>
  );
}

function FinanceCommand({
  onView,
  onFlash,
  onDeal,
}: {
  onView: (v: FinanceView) => void;
  onFlash: (m: string) => void;
  onDeal: (i: number) => void;
}) {
  return (
    <>
      <section className="financeHero">
        <div>
          <span>LIVE F&amp;I OPERATING SYSTEM</span>
          <h1>
            Move every deal.
            <br />
            <i>Protect every dollar.</i>
          </h1>
          <p>
            One intelligent command layer for desking, lender strategy, product
            presentation, compliance, contracting, funding and customer
            delivery.
          </p>
        </div>
        <div className="financeHeroActions">
          <button onClick={() => onView("Deal Architect")}>
            ✦ Architect a deal
          </button>
          <button onClick={() => onView("Deal Queue")}>
            Open live queue →
          </button>
        </div>
      </section>
      <section className="financeKpis">
        {[
          ["TODAY'S FRONT GROSS", "$48,920", "+12.8% vs pace"],
          ["BACK GROSS / DEAL", "$2,418", "+$284 MTD"],
          ["PRODUCT PENETRATION", "68.4%", "VSC · GAP · Tire"],
          ["AVG FUNDING TIME", "1.7 days", "−0.6 days"],
        ].map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </section>
      <div className="financeCommandGrid">
        <section className="financePanel liveDeals">
          <header>
            <div>
              <small>REAL-TIME DEAL FLOW</small>
              <h2>Deals requiring attention</h2>
            </div>
            <button onClick={() => onView("Deal Queue")}>View all 18 →</button>
          </header>
          {financeDeals.map((d, i) => (
            <button key={d.stock} onClick={() => onDeal(i)}>
              <span className={`riskDot ${d.risk.toLowerCase()}`} />
              <div>
                <b>{d.customer}</b>
                <small>
                  {d.vehicle} · {d.stock}
                </small>
              </div>
              <div>
                <small>PAYMENT</small>
                <b>{d.payment}</b>
              </div>
              <div>
                <small>BACK GROSS</small>
                <b>{d.gross}</b>
              </div>
              <em>{d.status}</em>
              <i>→</i>
            </button>
          ))}
        </section>
        <section className="financePanel aiBrief">
          <header>
            <div>
              <small>CYNCRO INTELLIGENCE</small>
              <h2>Morning opportunity brief</h2>
            </div>
            <span>LIVE</span>
          </header>
          <h3>$18,420 in recoverable gross</h3>
          <p>
            Seven open deals have a higher approval probability or product
            opportunity than their current structure reflects.
          </p>
          {[
            ["3 deals", "Improve lender fit", "Est. +$5,800"],
            ["4 menus", "Rebuild product mix", "Est. +$7,260"],
            ["2 contracts", "Resolve funding holds", "Release $92K"],
          ].map((x) => (
            <button
              key={x[0]}
              onClick={() => onFlash(`${x[1]} recommendations opened`)}
            >
              <b>{x[0]}</b>
              <span>{x[1]}</span>
              <em>{x[2]}</em>
            </button>
          ))}
          <button
            className="askFinanceAI"
            onClick={() => onFlash("Cyncro AI deal briefing opened")}
          >
            Ask Cyncro AI about the book →
          </button>
        </section>
        <section className="financePanel fundingBoard">
          <header>
            <div>
              <small>FUNDING CONTROL</small>
              <h2>Contract aging</h2>
            </div>
            <button onClick={() => onView("Funding")}>Funding center →</button>
          </header>
          {[
            ["0–1 DAYS", "9", "$286K", "healthy"],
            ["2–3 DAYS", "3", "$96K", "watch"],
            ["4+ DAYS", "2", "$46K", "danger"],
          ].map((x) => (
            <article key={x[0]}>
              <span className={x[3]}>{x[0]}</span>
              <b>{x[1]} deals</b>
              <strong>{x[2]}</strong>
            </article>
          ))}
        </section>
        <section className="financePanel lenderPulse">
          <header>
            <div>
              <small>LENDER NETWORK</small>
              <h2>Approval performance</h2>
            </div>
            <button onClick={() => onView("Lenders")}>Lender matrix →</button>
          </header>
          {[
            ["Chase Auto", "86%", "1.4d"],
            ["Ally", "82%", "1.8d"],
            ["Capital One Auto", "79%", "1.2d"],
            ["Westlake", "71%", "2.6d"],
          ].map((x, i) => (
            <article key={x[0]}>
              <b>{x[0]}</b>
              <div>
                <i style={{ width: x[1] }} />
              </div>
              <span>{x[1]} approval</span>
              <em>{x[2]}</em>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

function FinanceDealQueue({
  onOpen,
  onFlash,
}: {
  onOpen: (i: number) => void;
  onFlash: (m: string) => void;
}) {
  const [filter, setFilter] = useState("All deals");
  return (
    <div className="financeWorkspace">
      <div className="financePageHead">
        <div>
          <span>18 ACTIVE DEALS · $126K GROSS AT WORK</span>
          <h1>Deal Queue</h1>
          <p>
            Every handoff, approval, stipulation, signature and funding deadline
            in one live queue.
          </p>
        </div>
        <button onClick={() => onFlash("Deal imported from CRM")}>
          ＋ Import deal
        </button>
      </div>
      <div className="financeFilters">
        {[
          "All deals",
          "Needs attention",
          "Awaiting lender",
          "Contracting",
          "Funding",
        ].map((x) => (
          <button
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
            key={x}
          >
            {x}
          </button>
        ))}
        <input
          aria-label="Search deals"
          placeholder="Search customer, VIN or stock…"
        />
      </div>
      <section className="financePanel dealTable">
        <header>
          <span>CUSTOMER / VEHICLE</span>
          <span>CREDIT</span>
          <span>STRUCTURE</span>
          <span>LENDER</span>
          <span>STATUS</span>
          <span>GROSS</span>
        </header>
        {[
          ...financeDeals,
          ...financeDeals.slice(0, 2).map((d, i) => ({
            ...d,
            customer: i ? "Ethan Parker" : "Mia Thompson",
            stock: i ? "L51207" : "R88103",
          })),
        ].map((d, i) => (
          <button
            key={`${d.stock}-${i}`}
            onClick={() => onOpen(i % financeDeals.length)}
          >
            <div>
              <b>{d.customer}</b>
              <small>
                {d.vehicle} · {d.stock}
              </small>
            </div>
            <span>
              {d.score}
              <small>{d.risk} RISK</small>
            </span>
            <span>
              {d.payment}
              <small>72 mo · 7.49%</small>
            </span>
            <span>
              {d.lender}
              <small>Top match</small>
            </span>
            <em>{d.status}</em>
            <strong>{d.gross}</strong>
          </button>
        ))}
      </section>
    </div>
  );
}

function FinanceArchitect({
  deal,
  onFlash,
}: {
  deal: (typeof financeDeals)[number];
  onFlash: (m: string) => void;
}) {
  const [term, setTerm] = useState(72);
  const [down, setDown] = useState(7500);
  const [selected, setSelected] = useState([
    "Vehicle Service Contract",
    "GAP Protection",
  ]);
  const payment = Math.round(
    890 + (72 - term) * 8 - down * 0.014 + selected.length * 34,
  );
  return (
    <div className="financeWorkspace">
      <div className="dealIdentity">
        <div>
          <span>ACTIVE DEAL · {deal.stock}</span>
          <h1>{deal.customer}</h1>
          <p>
            {deal.vehicle} · Score {deal.score} · {deal.lender}
          </p>
        </div>
        <div>
          <button onClick={() => onFlash("Customer co-browse link sent")}>
            Invite customer
          </button>
          <button onClick={() => onFlash("Deal saved and compliance checked")}>
            Save deal
          </button>
          <button onClick={() => onFlash("Deal advanced to contracting")}>
            Send to contract →
          </button>
        </div>
      </div>
      <div className="architectGrid">
        <section className="financePanel structurePanel">
          <header>
            <div>
              <small>LIVE DEAL STRUCTURE</small>
              <h2>Build the approval</h2>
            </div>
            <em>AI OPTIMIZED</em>
          </header>
          <div className="vehiclePrice">
            <span>Selling price</span>
            <b>$78,450</b>
            <small>Market position: 97%</small>
          </div>
          <label>
            Cash down <b>${down.toLocaleString()}</b>
            <input
              type="range"
              min="0"
              max="20000"
              step="500"
              value={down}
              onChange={(e) => setDown(Number(e.target.value))}
            />
          </label>
          <div className="termOptions">
            {[60, 72, 84].map((x) => (
              <button
                className={term === x ? "active" : ""}
                onClick={() => setTerm(x)}
                key={x}
              >
                <b>{x}</b>
                <small>months</small>
              </button>
            ))}
          </div>
          <div className="paymentOutput">
            <small>ESTIMATED PAYMENT</small>
            <b>
              ${payment}
              <i>/mo</i>
            </b>
            <span>7.49% APR · ${down.toLocaleString()} down</span>
          </div>
          <div className="dealMath">
            {[
              ["Trade allowance", "$24,600"],
              ["Trade payoff", "−$18,220"],
              ["Taxes + fees", "$5,984"],
              ["Amount financed", "$71,614"],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
        </section>
        <section className="financePanel lenderMatches">
          <header>
            <div>
              <small>REAL-TIME LENDER FIT</small>
              <h2>Approval paths</h2>
            </div>
            <button onClick={() => onFlash("All lender programs compared")}>
              Compare all
            </button>
          </header>
          {[
            ["Chase Auto", "94%", "7.49%", "$1,425", "BEST FIT"],
            ["Capital One Auto", "89%", "7.79%", "$1,180", "FASTEST"],
            ["Ally", "84%", "8.10%", "$1,695", "MAX ADVANCE"],
          ].map((x, i) => (
            <button
              className={i === 0 ? "selected" : ""}
              key={x[0]}
              onClick={() => onFlash(`${x[0]} program selected`)}
            >
              <span>{i + 1}</span>
              <div>
                <b>{x[0]}</b>
                <small>{x[4]}</small>
              </div>
              <strong>
                {x[1]}
                <small>approval</small>
              </strong>
              <em>
                {x[2]}
                <small>buy rate</small>
              </em>
              <i>
                {x[3]}
                <small>reserve</small>
              </i>
            </button>
          ))}
        </section>
        <section className="financePanel productBuilder">
          <header>
            <div>
              <small>PERSONALIZED MENU</small>
              <h2>Protection products</h2>
            </div>
            <span>{selected.length} SELECTED</span>
          </header>
          {[
            ["Vehicle Service Contract", "$2,895", "82% fit"],
            ["GAP Protection", "$995", "91% fit"],
            ["Tire & Wheel", "$1,295", "76% fit"],
            ["Appearance Protection", "$895", "58% fit"],
          ].map((x) => (
            <button
              className={selected.includes(x[0]) ? "selected" : ""}
              onClick={() =>
                setSelected((s) =>
                  s.includes(x[0]) ? s.filter((y) => y !== x[0]) : [...s, x[0]],
                )
              }
              key={x[0]}
            >
              <i>{selected.includes(x[0]) ? "✓" : "＋"}</i>
              <div>
                <b>{x[0]}</b>
                <small>{x[2]} · customer profile match</small>
              </div>
              <strong>{x[1]}</strong>
            </button>
          ))}
          <button
            className="presentMenu"
            onClick={() => onFlash("Interactive customer menu launched")}
          >
            Present customer menu →
          </button>
        </section>
        <section className="financePanel dealGuard">
          <header>
            <div>
              <small>AUTOMATED DEAL GUARD</small>
              <h2>Compliance + funding readiness</h2>
            </div>
            <em>7/8 CLEAR</em>
          </header>
          {[
            ["OFAC / identity verification", "PASS"],
            ["Credit authorization", "SIGNED"],
            ["Adverse action logic", "CLEAR"],
            ["Income verification", "NEEDED"],
            ["Red Flags review", "PASS"],
            ["Menu disclosure", "TRACKED"],
          ].map((x) => (
            <p key={x[0]}>
              <span>{x[0]}</span>
              <b className={x[1] === "NEEDED" ? "warn" : ""}>{x[1]}</b>
            </p>
          ))}
          <button
            onClick={() => onFlash("Secure income verification request sent")}
          >
            Request missing stipulation →
          </button>
        </section>
      </div>
    </div>
  );
}

const stateTaxRules = [
  ["AL", "Alabama", 4],
  ["AK", "Alaska", 0],
  ["AZ", "Arizona", 5.6],
  ["AR", "Arkansas", 6.5],
  ["CA", "California", 7.25],
  ["CO", "Colorado", 2.9],
  ["CT", "Connecticut", 6.35],
  ["DE", "Delaware", 0],
  ["DC", "District of Columbia", 6],
  ["FL", "Florida", 6],
  ["GA", "Georgia", 7],
  ["HI", "Hawaii", 4],
  ["ID", "Idaho", 6],
  ["IL", "Illinois", 6.25],
  ["IN", "Indiana", 7],
  ["IA", "Iowa", 6],
  ["KS", "Kansas", 6.5],
  ["KY", "Kentucky", 6],
  ["LA", "Louisiana", 5],
  ["ME", "Maine", 5.5],
  ["MD", "Maryland", 6],
  ["MA", "Massachusetts", 6.25],
  ["MI", "Michigan", 6],
  ["MN", "Minnesota", 6.875],
  ["MS", "Mississippi", 5],
  ["MO", "Missouri", 4.225],
  ["MT", "Montana", 0],
  ["NE", "Nebraska", 5.5],
  ["NV", "Nevada", 6.85],
  ["NH", "New Hampshire", 0],
  ["NJ", "New Jersey", 6.625],
  ["NM", "New Mexico", 4.875],
  ["NY", "New York", 4],
  ["NC", "North Carolina", 3],
  ["ND", "North Dakota", 5],
  ["OH", "Ohio", 5.75],
  ["OK", "Oklahoma", 3.25],
  ["OR", "Oregon", 0],
  ["PA", "Pennsylvania", 6],
  ["RI", "Rhode Island", 7],
  ["SC", "South Carolina", 5],
  ["SD", "South Dakota", 4.2],
  ["TN", "Tennessee", 7],
  ["TX", "Texas", 6.25],
  ["UT", "Utah", 6.1],
  ["VT", "Vermont", 6],
  ["VA", "Virginia", 4.15],
  ["WA", "Washington", 6.5],
  ["WV", "West Virginia", 6],
  ["WI", "Wisconsin", 5],
  ["WY", "Wyoming", 4],
] as const;

function TaxLeaseLab({ onFlash }: { onFlash: (m: string) => void }) {
  const [state, setState] = useState("FL");
  const [zip, setZip] = useState("33411");
  const [price, setPrice] = useState(78450);
  const [trade, setTrade] = useState(24600);
  const [payoff, setPayoff] = useState(18220);
  const [rebate, setRebate] = useState(1500);
  const [fees, setFees] = useState(1295);
  const [localRate, setLocalRate] = useState(1);
  const [term, setTerm] = useState(36);
  const [miles, setMiles] = useState(10000);
  const [residual, setResidual] = useState(58);
  const [moneyFactor, setMoneyFactor] = useState(0.00215);
  const [driveOff, setDriveOff] = useState(3500);
  const [taxMode, setTaxMode] = useState<"monthly" | "upfront">("monthly");
  const rule = stateTaxRules.find((x) => x[0] === state) ?? stateTaxRules[9];
  const combinedRate = Number(rule[2]) + localRate;
  const equity = Math.max(0, trade - payoff);
  const taxablePurchase = Math.max(0, price - trade - rebate);
  const purchaseTax = taxablePurchase * (combinedRate / 100);
  const outTheDoor = price - equity - rebate + fees + purchaseTax;
  const residualValue = price * (residual / 100);
  const adjustedCap = Math.max(0, price + fees - rebate - equity - driveOff);
  const depreciation = (adjustedCap - residualValue) / term;
  const rentCharge = (adjustedCap + residualValue) * moneyFactor;
  const baseLease = Math.max(0, depreciation + rentCharge);
  const monthlyTax =
    taxMode === "monthly" ? baseLease * (combinedRate / 100) : 0;
  const upfrontTax =
    taxMode === "upfront" ? baseLease * term * (combinedRate / 100) : 0;
  const leasePayment = baseLease + monthlyTax;
  const totalLease = leasePayment * term + driveOff + upfrontTax;
  const apr = moneyFactor * 2400;
  const mileageAdjustment =
    miles === 7500 ? 2 : miles === 10000 ? 0 : miles === 12000 ? -1 : -3;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const scenarios = [
    [
      "Lowest payment",
      term + 3,
      residual + 2 + mileageAdjustment,
      Math.max(0.0001, moneyFactor - 0.0002),
      driveOff + 2500,
    ],
    ["Balanced", term, residual + mileageAdjustment, moneyFactor, driveOff],
    [
      "Lowest drive-off",
      term,
      residual + mileageAdjustment,
      moneyFactor + 0.0001,
      995,
    ],
  ] as const;
  return (
    <div className="financeWorkspace taxLeaseLab">
      <div className="financePageHead taxLabHead">
        <div>
          <span>50-STATE + D.C. DEAL INTELLIGENCE</span>
          <h1>Tax &amp; Lease Intelligence Lab</h1>
          <p>
            Model the complete transaction—not just a payment. Compare
            jurisdiction logic, trade treatment, rebates, fees, residual
            exposure and lease structures in one customer-ready workspace.
          </p>
        </div>
        <div>
          <button onClick={() => onFlash("State rule verification requested")}>
            Verify jurisdiction
          </button>
          <button onClick={() => onFlash("Customer comparison link generated")}>
            Share live comparison →
          </button>
        </div>
      </div>
      <div className="taxConfidence">
        <div>
          <span>◈</span>
          <p>
            <b>Jurisdiction confidence layer</b>
            <small>
              {rule[1]} baseline loaded · ZIP {zip || "required"} · Local rate
              manually confirmed at {localRate.toFixed(2)}%
            </small>
          </p>
        </div>
        <em>ESTIMATE · VERIFY BEFORE CONTRACT</em>
      </div>
      <div className="taxLeaseGrid">
        <section className="financePanel calculatorInputs">
          <header>
            <div>
              <small>TRANSACTION INPUTS</small>
              <h2>Vehicle + jurisdiction</h2>
            </div>
            <button onClick={() => onFlash("VIN decoded and fees refreshed")}>
              Decode VIN
            </button>
          </header>
          <div className="calcFields">
            <label>
              State
              <select value={state} onChange={(e) => setState(e.target.value)}>
                {stateTaxRules.map((x) => (
                  <option key={x[0]} value={x[0]}>
                    {x[1]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Registration ZIP
              <input
                value={zip}
                onChange={(e) =>
                  setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
              />
            </label>
            <CalcInput label="Selling price" value={price} set={setPrice} />
            <CalcInput label="Trade allowance" value={trade} set={setTrade} />
            <CalcInput label="Trade payoff" value={payoff} set={setPayoff} />
            <CalcInput
              label="Rebate / incentive"
              value={rebate}
              set={setRebate}
            />
            <CalcInput label="Taxable fees" value={fees} set={setFees} />
            <label>
              Local + district rate
              <input
                type="number"
                step="0.01"
                value={localRate}
                onChange={(e) => setLocalRate(Number(e.target.value))}
              />
              <small>State baseline {Number(rule[2]).toFixed(3)}%</small>
            </label>
          </div>
          <div className="taxRuleStack">
            {[
              ["State baseline", `${Number(rule[2]).toFixed(3)}%`],
              ["Local override", `${localRate.toFixed(3)}%`],
              ["Combined estimate", `${combinedRate.toFixed(3)}%`],
              ["Trade equity", fmt(equity)],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
        </section>
        <section className="financePanel taxOutput">
          <header>
            <div>
              <small>OUT-THE-DOOR ENGINE</small>
              <h2>{rule[1]} purchase estimate</h2>
            </div>
            <em>ZIP-AWARE READY</em>
          </header>
          <div className="taxHeroNumber">
            <small>ESTIMATED OUT-THE-DOOR</small>
            <b>{fmt(outTheDoor)}</b>
            <span>{combinedRate.toFixed(3)}% modeled combined rate</span>
          </div>
          <div className="taxBreakdown">
            {[
              ["Selling price", fmt(price)],
              ["Net trade equity", `−${fmt(equity)}`],
              ["Rebates", `−${fmt(rebate)}`],
              ["Estimated taxable base", fmt(taxablePurchase)],
              ["Government + dealer fees", fmt(fees)],
              ["Estimated tax", fmt(purchaseTax)],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
          <button
            onClick={() => onFlash("Line-by-line tax worksheet generated")}
          >
            Generate audit-ready worksheet →
          </button>
        </section>
        <section className="financePanel leaseInputs">
          <header>
            <div>
              <small>LEASE STRUCTURE</small>
              <h2>Build the lease</h2>
            </div>
            <span>MF = {moneyFactor.toFixed(5)}</span>
          </header>
          <div className="leaseControls">
            <label>
              Term
              <div>
                {[24, 36, 39, 48].map((x) => (
                  <button
                    className={term === x ? "active" : ""}
                    onClick={() => setTerm(x)}
                    key={x}
                  >
                    {x} mo
                  </button>
                ))}
              </div>
            </label>
            <label>
              Annual mileage
              <div>
                {[7500, 10000, 12000, 15000].map((x) => (
                  <button
                    className={miles === x ? "active" : ""}
                    onClick={() => setMiles(x)}
                    key={x}
                  >
                    {x.toLocaleString()}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Residual{" "}
              <b>
                {residual}% · {fmt(residualValue)}
              </b>
              <input
                type="range"
                min="40"
                max="75"
                value={residual}
                onChange={(e) => setResidual(Number(e.target.value))}
              />
            </label>
            <label>
              Money factor{" "}
              <b>
                {moneyFactor.toFixed(5)} · {apr.toFixed(2)}% APR equiv.
              </b>
              <input
                type="range"
                min="0.0001"
                max="0.005"
                step="0.00005"
                value={moneyFactor}
                onChange={(e) => setMoneyFactor(Number(e.target.value))}
              />
            </label>
            <label>
              Drive-off reduction <b>{fmt(driveOff)}</b>
              <input
                type="range"
                min="0"
                max="10000"
                step="250"
                value={driveOff}
                onChange={(e) => setDriveOff(Number(e.target.value))}
              />
            </label>
            <label>
              Tax method
              <div>
                <button
                  className={taxMode === "monthly" ? "active" : ""}
                  onClick={() => setTaxMode("monthly")}
                >
                  Tax payment
                </button>
                <button
                  className={taxMode === "upfront" ? "active" : ""}
                  onClick={() => setTaxMode("upfront")}
                >
                  Tax upfront
                </button>
              </div>
            </label>
          </div>
        </section>
        <section className="financePanel leaseOutput">
          <header>
            <div>
              <small>LEASE PAYMENT ENGINE</small>
              <h2>Transparent payment anatomy</h2>
            </div>
            <em>
              {term} MO · {miles.toLocaleString()} MI
            </em>
          </header>
          <div className="leasePayment">
            <small>ESTIMATED PAYMENT</small>
            <b>
              {fmt(leasePayment)}
              <i>/mo</i>
            </b>
            <span>{fmt(driveOff + upfrontTax)} estimated due at signing</span>
          </div>
          <div className="paymentAnatomy">
            {[
              ["Monthly depreciation", fmt(depreciation)],
              ["Monthly rent charge", fmt(rentCharge)],
              ["Monthly tax", fmt(monthlyTax)],
              ["Residual value", fmt(residualValue)],
              ["Total lease commitment", fmt(totalLease)],
              ["Effective monthly", fmt(totalLease / term)],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
        </section>
      </div>
      <section className="financePanel scenarioLab">
        <header>
          <div>
            <small>CYNCRO STRUCTURE DNA™</small>
            <h2>Three paths from the same deal</h2>
          </div>
          <button
            onClick={() => onFlash("AI structure optimization completed")}
          >
            ✦ Optimize with AI
          </button>
        </header>
        <div>
          {scenarios.map((s, i) => {
            const rVal = price * (s[2] / 100);
            const cap = Math.max(0, price + fees - rebate - equity - s[4]);
            const base = Math.max(0, (cap - rVal) / s[1] + (cap + rVal) * s[3]);
            const pay = base * (1 + combinedRate / 100);
            return (
              <article className={i === 1 ? "featured" : ""} key={s[0]}>
                <span>{i === 1 ? "RECOMMENDED" : "SCENARIO 0" + (i + 1)}</span>
                <h3>{s[0]}</h3>
                <b>
                  {fmt(pay)}
                  <i>/mo</i>
                </b>
                <p>
                  <span>Due at signing</span>
                  <strong>{fmt(s[4])}</strong>
                </p>
                <p>
                  <span>Term / residual</span>
                  <strong>
                    {s[1]} mo · {s[2]}%
                  </strong>
                </p>
                <p>
                  <span>Total commitment</span>
                  <strong>{fmt(pay * s[1] + s[4])}</strong>
                </p>
                <button onClick={() => onFlash(`${s[0]} scenario selected`)}>
                  Use this structure →
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <div className="taxDisclaimer">
        <b>Important calculation boundary</b>
        <p>
          This tool provides dealership estimates. Final tax and lease figures
          must be verified against current state, county, city, registration
          address, vehicle classification, incentives, lender program, DMV and
          dealer-specific rules before contracting.
        </p>
      </div>
    </div>
  );
}

function FinancePerformance({
  onOpen,
  onFlash,
}: {
  onOpen: (i: number) => void;
  onFlash: (m: string) => void;
}) {
  const [period, setPeriod] = useState("Month to date");
  return (
    <div className="financeWorkspace financePerformance">
      <div className="financePageHead">
        <div>
          <span>SALES + F&amp;I PERFORMANCE</span>
          <h1>See who sold it—and who protected the deal.</h1>
          <p>
            Separate sales and finance-manager production with lender reserve,
            points held, product gross, total PVR and funding status on every
            transaction.
          </p>
        </div>
        <div className="performanceActions">
          {["Today", "Month to date", "Quarter"].map((item) => (
            <button
              className={period === item ? "active" : ""}
              key={item}
              onClick={() => {
                setPeriod(item);
                onFlash(item + " performance loaded");
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <section className="financeKpis">
        {[
          ["TOTAL DEAL GROSS", "$24,430", "+14.2% vs pace"],
          ["FINANCE PVR", "$2,414", "$9,655 back gross"],
          ["LENDER RESERVE", "$5,340", "1.88 avg points held"],
          ["FUNDED DEALS", "37", "96% clean funding"],
        ].map((item) => (
          <article key={item[0]}>
            <small>{item[0]}</small>
            <b>{item[1]}</b>
            <span>{item[2]}</span>
          </article>
        ))}
      </section>
      <div className="performanceSplit">
        <section className="financePanel managerScoreboard">
          <header>
            <div>
              <small>FINANCE MANAGER STATUS</small>
              <h2>F&amp;I production</h2>
            </div>
            <span>{period.toUpperCase()}</span>
          </header>
          {[
            ["Finance Manager", "18 deals", "$2,684 PVR", "2.12 pts", "112%"],
            ["Dana Pierce", "14 deals", "$2,420 PVR", "1.84 pts", "104%"],
            ["Jason Cole", "11 deals", "$2,186 PVR", "1.61 pts", "96%"],
          ].map((row) => (
            <button
              key={row[0]}
              onClick={() => onFlash(row[0] + " performance profile opened")}
            >
              <span className="managerAvatar">{row[0][0]}</span>
              <b>{row[0]}</b>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
              <span>{row[3]}</span>
              <em>{row[4]} TARGET</em>
            </button>
          ))}
        </section>
        <section className="financePanel salesScoreboard">
          <header>
            <div>
              <small>SALES PERFORMANCE</small>
              <h2>Salesperson production</h2>
            </div>
            <button onClick={() => onFlash("Sales coaching report exported")}>
              Export report
            </button>
          </header>
          {[
            ["Maya Torres", "16 units", "$4,312 front avg", "$98.6K total"],
            ["Andre Cole", "13 units", "$3,884 front avg", "$76.2K total"],
            ["Jason Cole", "10 units", "$3,240 front avg", "$54.9K total"],
          ].map((row) => (
            <button
              key={row[0]}
              onClick={() => onFlash(row[0] + " sales profile opened")}
            >
              <b>{row[0]}</b>
              <span>{row[1]}</span>
              <span>{row[2]}</span>
              <strong>{row[3]}</strong>
            </button>
          ))}
        </section>
      </div>
      <section className="financePanel dealProfitLedger">
        <header>
          <div>
            <small>PER-DEAL SALES + FINANCE DATA</small>
            <h2>Deal profitability ledger</h2>
          </div>
          <button onClick={() => onFlash("Profit ledger filters opened")}>
            Filter deals
          </button>
        </header>
        <div className="dealProfitHead">
          {[
            "DEAL / CUSTOMER",
            "SALESPERSON",
            "FRONT GROSS",
            "FINANCE MANAGER",
            "BACK GROSS",
            "POINTS HELD",
            "RESERVE",
            "TOTAL",
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        {financeDeals.map((deal, index) => (
          <button key={deal.stock} onClick={() => onOpen(index)}>
            <span>
              <b>{deal.stock}</b>
              <small>{deal.customer}</small>
            </span>
            <span>{deal.salesperson}</span>
            <strong>{deal.frontGross}</strong>
            <span>{deal.financeManager}</span>
            <strong>{deal.backGross}</strong>
            <em>{deal.pointsHeld}</em>
            <span>{deal.reserve}</span>
            <b>{deal.gross}</b>
          </button>
        ))}
      </section>
    </div>
  );
}

function FinanceInventory({ onFlash }: { onFlash: (m: string) => void }) {
  const [filter, setFilter] = useState("All inventory");
  const inventory = [
    [
      "P24018",
      "2026 Porsche Macan S",
      "12 days",
      "$71,820",
      "$78,450",
      "AVAILABLE",
    ],
    [
      "B51882",
      "2025 BMW X5 xDrive40i",
      "38 days",
      "$66,100",
      "$72,980",
      "PENDING",
    ],
    [
      "M60117",
      "2026 Mercedes GLC 300",
      "21 days",
      "$54,440",
      "$61,290",
      "AVAILABLE",
    ],
    [
      "A74221",
      "2025 Audi Q7 Premium Plus",
      "67 days",
      "$63,280",
      "$69,995",
      "AGED",
    ],
    [
      "L51207",
      "2026 Lexus RX 350",
      "8 days",
      "$48,620",
      "$55,440",
      "IN TRANSIT",
    ],
  ];
  return (
    <div className="financeWorkspace financeInventory">
      <div className="financePageHead">
        <div>
          <span>LIVE VEHICLE INVENTORY</span>
          <h1>Every unit connected to every deal.</h1>
          <p>
            Track availability, age, acquisition cost, asking price, estimated
            margin, floorplan exposure and the customer deal attached to each
            vehicle.
          </p>
        </div>
        <button onClick={() => onFlash("New inventory record opened")}>
          ＋ Add vehicle
        </button>
      </div>
      <section className="financeKpis">
        {[
          ["TOTAL UNITS", "284", "New + pre-owned"],
          ["INVENTORY VALUE", "$18.6M", "Across rooftops"],
          ["AVG AGE", "31 days", "−4 days"],
          ["AGED 60+ DAYS", "18", "$1.12M exposed"],
        ].map((item) => (
          <article key={item[0]}>
            <small>{item[0]}</small>
            <b>{item[1]}</b>
            <span>{item[2]}</span>
          </article>
        ))}
      </section>
      <div className="financeFilters inventoryFilters">
        {["All inventory", "Available", "Pending", "Aged"].map((item) => (
          <button
            className={filter === item ? "active" : ""}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
        <input placeholder="Search VIN, stock, make or model…" />
      </div>
      <section className="financePanel inventoryLedger">
        <header className="inventoryHead">
          {[
            "STOCK / VEHICLE",
            "AGE",
            "ACQUISITION",
            "ASKING",
            "EST. MARGIN",
            "STATUS",
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </header>
        {inventory
          .filter((row) =>
            filter === "All inventory"
              ? true
              : row[5].includes(filter.toUpperCase()),
          )
          .map((row) => {
            const margin =
              Number(row[4].replace(/[$,]/g, "")) -
              Number(row[3].replace(/[$,]/g, ""));
            return (
              <button
                key={row[0]}
                onClick={() => onFlash(row[0] + " inventory record opened")}
              >
                <span>
                  <b>{row[0]}</b>
                  <small>{row[1]}</small>
                </span>
                <span>{row[2]}</span>
                <span>{row[3]}</span>
                <strong>{row[4]}</strong>
                <b>
                  {"$"}
                  {margin.toLocaleString()}
                </b>
                <em>{row[5]}</em>
              </button>
            );
          })}
      </section>
    </div>
  );
}

function FinanceDealDocuments({ onFlash }: { onFlash: (m: string) => void }) {
  const [selectedStock, setSelectedStock] = useState(financeDeals[0].stock);
  const [documents, setDocuments] = useState([
    {
      stock: "P24018",
      name: "Retail Installment Contract.pdf",
      source: "E-SIGNED",
      time: "10:42 AM",
    },
    {
      stock: "P24018",
      name: "Driver License — Olivia Bennett.jpg",
      source: "SCANNED",
      time: "10:38 AM",
    },
    {
      stock: "P24018",
      name: "Proof of Insurance.pdf",
      source: "UPLOADED",
      time: "10:34 AM",
    },
    {
      stock: "B51882",
      name: "Credit Application.pdf",
      source: "UPLOADED",
      time: "9:51 AM",
    },
  ]);
  const deal = financeDeals.find((item) => item.stock === selectedStock)!;
  const attachFiles = (
    event: ChangeEvent<HTMLInputElement>,
    source: "UPLOADED" | "SCANNED",
  ) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setDocuments((current) => [
      ...files.map((file) => ({
        stock: selectedStock,
        name: file.name,
        source,
        time: "Just now",
      })),
      ...current,
    ]);
    onFlash(
      String(files.length) +
        (source === "SCANNED" ? " scan" : " document") +
        (files.length > 1 ? "s" : "") +
        " attached to deal " +
        selectedStock,
    );
    event.target.value = "";
  };
  const dealDocs = documents.filter((item) => item.stock === selectedStock);
  return (
    <div className="financeWorkspace financeDocuments">
      <div className="financePageHead">
        <div>
          <span>SECURE DIGITAL DEAL JACKET</span>
          <h1>Every client document. One verified deal file.</h1>
          <p>
            Upload, scan, classify and attach customer documents directly to the
            deal with source tracking, completion status and an audit-ready
            history.
          </p>
        </div>
        <div className="documentActions">
          <label>
            ＋ Upload documents
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,image/*"
              onChange={(event) => attachFiles(event, "UPLOADED")}
            />
          </label>
          <label className="scanAction">
            ▣ Scan document
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              capture="environment"
              onChange={(event) => attachFiles(event, "SCANNED")}
            />
          </label>
        </div>
      </div>
      <div className="dealJacketGrid">
        <aside className="financePanel dealJacketList">
          <header>
            <div>
              <small>ACTIVE DEAL JACKETS</small>
              <h2>Client deals</h2>
            </div>
            <span>{financeDeals.length}</span>
          </header>
          {financeDeals.map((item) => (
            <button
              className={selectedStock === item.stock ? "active" : ""}
              key={item.stock}
              onClick={() => setSelectedStock(item.stock)}
            >
              <span>{item.customer[0]}</span>
              <div>
                <b>{item.customer}</b>
                <small>{item.vehicle}</small>
              </div>
              <em>
                {documents.filter((doc) => doc.stock === item.stock).length}{" "}
                DOCS
              </em>
            </button>
          ))}
        </aside>
        <section className="financePanel documentVault">
          <header>
            <div>
              <small>DEAL {deal.stock}</small>
              <h2>{deal.customer}</h2>
              <p>
                {deal.vehicle} · {deal.lender} · {deal.financeManager}
              </p>
            </div>
            <span>{dealDocs.length}/12 COMPLETE</span>
          </header>
          <div className="documentProgress">
            <i
              style={{
                width:
                  String(Math.min(100, (dealDocs.length / 12) * 100)) + "%",
              }}
            />
          </div>
          <div className="documentChecklist">
            {dealDocs.map((document, index) => (
              <button
                key={document.name + "-" + String(index)}
                onClick={() => onFlash(document.name + " preview opened")}
              >
                <span>
                  {document.name.toLowerCase().endsWith(".pdf") ? "PDF" : "IMG"}
                </span>
                <div>
                  <b>{document.name}</b>
                  <small>
                    {document.source} · {document.time}
                  </small>
                </div>
                <em>✓ VERIFIED</em>
                <i>⋮</i>
              </button>
            ))}
            {!dealDocs.length && (
              <div className="emptyDocumentVault">
                <span>▤</span>
                <b>No documents attached yet</b>
                <p>
                  Upload a file or scan the first page into this deal jacket.
                </p>
              </div>
            )}
          </div>
        </section>
        <aside className="financePanel dealCompletion">
          <header>
            <small>DEAL COMPLETION</small>
            <h2>Required documents</h2>
          </header>
          {[
            ["Identity", dealDocs.some((doc) => doc.name.includes("License"))],
            [
              "Credit application",
              dealDocs.some((doc) => doc.name.includes("Credit")),
            ],
            [
              "Insurance",
              dealDocs.some((doc) => doc.name.includes("Insurance")),
            ],
            ["Buyer’s order", false],
            [
              "Finance contract",
              dealDocs.some((doc) => doc.name.includes("Contract")),
            ],
            ["Product forms", false],
          ].map((item) => (
            <button
              key={item[0] as string}
              onClick={() => onFlash(String(item[0]) + " requirement opened")}
            >
              <span className={item[1] ? "complete" : ""}>
                {item[1] ? "✓" : "○"}
              </span>
              <b>{item[0]}</b>
              <em>{item[1] ? "COMPLETE" : "NEEDED"}</em>
            </button>
          ))}
          <button
            className="requestDocuments"
            onClick={() =>
              onFlash("Secure upload request sent to " + deal.customer)
            }
          >
            Send client upload request
          </button>
        </aside>
      </div>
    </div>
  );
}

function CalcInput({
  label,
  value,
  set,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
}

const financeWorkspaceData: Record<
  Exclude<
    FinanceView,
    | "Command"
    | "Deal Queue"
    | "Deal Architect"
    | "Performance"
    | "Inventory"
    | "Deal Documents"
    | "Tax & Lease Lab"
  >,
  {
    eyebrow: string;
    title: string;
    desc: string;
    action: string;
    metrics: string[][];
    sections: { title: string; rows: string[][] }[];
  }
> = {
  Lenders: {
    eyebrow: "INTELLIGENT LENDER NETWORK",
    title: "Route every deal to its strongest approval path.",
    desc: "Live program matrix, callback comparison, advance limits, stipulation patterns, reserve and funding-speed intelligence.",
    action: "Compare programs",
    metrics: [
      ["CONNECTED LENDERS", "42", "Live programs"],
      ["APPROVAL RATE", "81.6%", "+6.2%"],
      ["AVG CALLBACK", "4m 12s", "−38%"],
      ["RESERVE MTD", "$84.2K", "Protected"],
    ],
    sections: [
      {
        title: "Lender performance",
        rows: [
          [
            "Chase Auto",
            "86% approval",
            "1.4 day funding",
            "$1,425 avg reserve",
          ],
          [
            "Capital One Auto",
            "79% approval",
            "1.2 day funding",
            "$1,180 avg reserve",
          ],
          ["Ally", "82% approval", "1.8 day funding", "$1,695 avg reserve"],
        ],
      },
      {
        title: "Program opportunities",
        rows: [
          ["Prime loyalty", "6 eligible deals", "Up to −0.50%", "MATCH"],
          ["EV incentive", "3 eligible units", "$2,500 credit", "MATCH"],
          ["First-time buyer", "4 prospects", "Flexible history", "REVIEW"],
        ],
      },
    ],
  },
  "Product Menu": {
    eyebrow: "PERSONALIZED F&I PRESENTATION",
    title: "Build value—not pressure.",
    desc: "AI-personalized product recommendations, transparent option menus, e-signatures, declinations and penetration coaching.",
    action: "Create menu",
    metrics: [
      ["PVR", "$2,418", "+$284"],
      ["VSC PENETRATION", "54.8%", "+7.1%"],
      ["GAP PENETRATION", "46.2%", "Target 50%"],
      ["MENU COMPLETION", "98.6%", "Audited"],
    ],
    sections: [
      {
        title: "Live product performance",
        rows: [
          [
            "Vehicle Service Contract",
            "54.8% penetration",
            "$1,420 avg gross",
            "↑ 7.1%",
          ],
          ["GAP Protection", "46.2% penetration", "$684 avg gross", "↑ 3.8%"],
          ["Tire & Wheel", "31.9% penetration", "$790 avg gross", "↑ 5.2%"],
        ],
      },
      {
        title: "Customer-ready menus",
        rows: [
          ["Olivia Bennett", "Premium protection", "2 selected", "PRESENTING"],
          ["Noah Williams", "Essential protection", "1 selected", "REVIEW"],
          ["Sophia Carter", "Custom menu", "3 selected", "SIGNED"],
        ],
      },
    ],
  },
  Contracts: {
    eyebrow: "DIGITAL DEAL JACKET",
    title: "Contract once. Validate everything.",
    desc: "Remote signing, document generation, version control, missing-field detection, secure vault and accounting handoff.",
    action: "Generate contract",
    metrics: [
      ["CONTRACTING", "8", "Live deals"],
      ["E-SIGN RATE", "78%", "Remote + in-store"],
      ["AVG CONTRACT TIME", "11m", "−43%"],
      ["ERROR RATE", "0.4%", "Auto-validated"],
    ],
    sections: [
      {
        title: "Contract desk",
        rows: [
          ["Liam Rodriguez", "18/21 documents", "3 signatures", "IN PROGRESS"],
          ["Sophia Carter", "21/21 documents", "Complete", "READY TO FUND"],
          ["Noah Williams", "14/21 documents", "Lender pending", "ON HOLD"],
        ],
      },
      {
        title: "Document intelligence",
        rows: [
          [
            "Retail installment contract",
            "All fields validated",
            "Current version",
            "CLEAR",
          ],
          [
            "Buyer’s order",
            "Tax + fees reconciled",
            "Current version",
            "CLEAR",
          ],
          [
            "Privacy + credit notices",
            "Delivery confirmed",
            "Immutable proof",
            "CLEAR",
          ],
        ],
      },
    ],
  },
  Funding: {
    eyebrow: "CONTRACT-IN-TRANSIT CONTROL",
    title: "Turn signed deals into cash faster.",
    desc: "Funding packets, lender checklists, aging alerts, exception ownership, receivables, reserve reconciliation and chargeback risk.",
    action: "Open funding packet",
    metrics: [
      ["PENDING FUNDING", "$428.6K", "14 contracts"],
      ["AVG TIME TO FUND", "1.7 days", "−0.6 days"],
      ["EXCEPTIONS", "4", "2 urgent"],
      ["CHARGEBACK RISK", "$7.8K", "Protected"],
    ],
    sections: [
      {
        title: "Funding queue",
        rows: [
          ["Sophia Carter", "Mercedes-Benz FS", "$68,420", "STIP RECEIVED"],
          ["Liam Rodriguez", "Ally", "$74,880", "CONTRACT REVIEW"],
          ["Emma Davis", "Chase Auto", "$46,210", "FUNDED TODAY"],
        ],
      },
      {
        title: "Exceptions",
        rows: [
          ["Proof of income", "Noah Williams", "Owner: Jason", "2h SLA"],
          ["Insurance binder", "Sophia Carter", "Owner: Maya", "4h SLA"],
          ["Trade title", "Ethan Parker", "Owner: DMV desk", "1 day"],
        ],
      },
    ],
  },
  Compliance: {
    eyebrow: "CONTINUOUS DEAL COMPLIANCE",
    title: "Protect the customer, manager and rooftop.",
    desc: "OFAC, Red Flags, consent, adverse action, disclosures, identity, menu proof, audit trails and policy enforcement.",
    action: "Run deal audit",
    metrics: [
      ["DEALS AUDITED", "100%", "Automatic"],
      ["OPEN EXCEPTIONS", "3", "Owners assigned"],
      ["POLICY SCORE", "98.7", "Enterprise"],
      ["AUDIT EVIDENCE", "7 years", "Retained"],
    ],
    sections: [
      {
        title: "Automated controls",
        rows: [
          ["OFAC screening", "All active deals", "Real time", "ENFORCED"],
          [
            "Red Flags program",
            "Identity + anomaly review",
            "Risk based",
            "ENFORCED",
          ],
          [
            "Adverse action",
            "Trigger + notice tracking",
            "Automated",
            "ENFORCED",
          ],
        ],
      },
      {
        title: "Audit stream",
        rows: [
          [
            "Deal P24018",
            "Menu disclosure signed",
            "Finance Manager",
            "10:42 AM",
          ],
          ["Deal M60117", "Credit consent verified", "System", "10:31 AM"],
          ["Deal A74221", "Rate change approved", "Dana P.", "10:08 AM"],
        ],
      },
    ],
  },
  Customers: {
    eyebrow: "ONE AUTOMOTIVE CUSTOMER RECORD",
    title: "See the complete relationship—not one transaction.",
    desc: "Identity, household, vehicles, trade equity, credit consent, communications, service history, documents and lifetime value.",
    action: "Add customer",
    metrics: [
      ["ACTIVE CUSTOMERS", "12,842", "All rooftops"],
      ["RETURNING BUYERS", "31.4%", "+4.8%"],
      ["POSITIVE EQUITY", "1,208", "Opportunities"],
      ["AVG LIFETIME VALUE", "$8,940", "Sales + service"],
    ],
    sections: [
      {
        title: "Priority customers",
        rows: [
          [
            "Olivia Bennett",
            "2026 Porsche Macan S",
            "$18.4K LTV",
            "IN DELIVERY",
          ],
          ["Noah Williams", "2025 BMW X5", "$11.2K LTV", "FINANCING"],
          ["Sophia Carter", "2026 Mercedes GLC", "$14.8K LTV", "STIPS"],
        ],
      },
      {
        title: "Equity opportunities",
        rows: [
          [
            "118 customers",
            "$5K+ positive equity",
            "0–36 months",
            "HIGH INTENT",
          ],
          ["264 customers", "Lease maturity <120d", "Campaign ready", "ENGAGE"],
          ["82 customers", "Payment reduction path", "AI matched", "REVIEW"],
        ],
      },
    ],
  },
  Analytics: {
    eyebrow: "MULTI-ROOFTOP FINANCE INTELLIGENCE",
    title: "Know exactly where profit moves—and why.",
    desc: "Real-time PVR, penetration, lender, funding, manager, compliance and chargeback analytics with AI explanations.",
    action: "Ask finance data",
    metrics: [
      ["TOTAL GROSS MTD", "$1.28M", "+11.7%"],
      ["BACK GROSS", "$486K", "38% mix"],
      ["DEALS FUNDED", "214", "96% clean"],
      ["FORECAST", "$1.62M", "103% target"],
    ],
    sections: [
      {
        title: "Manager performance",
        rows: [
          ["Finance Manager", "$2,684 PVR", "74% products", "112% target"],
          ["Dana Pierce", "$2,420 PVR", "68% products", "104% target"],
          ["Jason Cole", "$2,186 PVR", "61% products", "96% target"],
        ],
      },
      {
        title: "Rooftop comparison",
        rows: [
          ["Vivid Premier West", "$2,590 PVR", "1.4d fund", "LEADER"],
          ["Vivid Premier Central", "$2,402 PVR", "1.8d fund", "ON PACE"],
          ["Vivid Premier North", "$2,110 PVR", "2.6d fund", "COACH"],
        ],
      },
    ],
  },
};

function FinanceWorkspace({
  view,
  onFlash,
}: {
  view: Exclude<
    FinanceView,
    | "Command"
    | "Deal Queue"
    | "Deal Architect"
    | "Performance"
    | "Inventory"
    | "Deal Documents"
    | "Tax & Lease Lab"
  >;
  onFlash: (m: string) => void;
}) {
  const d = financeWorkspaceData[view];
  return (
    <div className="financeWorkspace">
      <div className="financePageHead">
        <div>
          <span>{d.eyebrow}</span>
          <h1>{d.title}</h1>
          <p>{d.desc}</p>
        </div>
        <button onClick={() => onFlash(`${d.action} opened`)}>
          {d.action} →
        </button>
      </div>
      <section className="financeKpis">
        {d.metrics.map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </section>
      <div className="financeDataGrid">
        {d.sections.map((s) => (
          <section className="financePanel financeDataTable" key={s.title}>
            <header>
              <div>
                <small>LIVE OPERATIONS</small>
                <h2>{s.title}</h2>
              </div>
              <button onClick={() => onFlash(`${s.title} controls opened`)}>
                Manage →
              </button>
            </header>
            {s.rows.map((r, i) => (
              <button
                onClick={() => onFlash(`${r[0]} opened`)}
                key={`${r[0]}-${i}`}
              >
                {r.map((c, j) => (
                  <span className={j === 0 ? "primary" : ""} key={`${c}-${j}`}>
                    {c}
                  </span>
                ))}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function FinanceAI({
  onClose,
  onFlash,
}: {
  onClose: () => void;
  onFlash: (m: string) => void;
}) {
  return (
    <aside className="financeAI">
      <header>
        <div>
          <span>✦</span>
          <div>
            <b>Cyncro Finance AI</b>
            <small>Deal-aware intelligence</small>
          </div>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <div className="aiContext">
        <span>LIVE BOOK CONTEXT</span>
        <b>18 active deals · $126K gross</b>
        <small>42 lender programs · 4 exceptions</small>
      </div>
      <div className="aiConversation">
        <p>Where should I focus right now?</p>
        <article>
          <b>Three actions can protect approximately $18,420 in gross today.</b>
          <ol>
            <li>Move Noah Williams to Capital One’s current tier.</li>
            <li>Resolve Sophia Carter’s income stipulation.</li>
            <li>Re-present GAP on four high-LTV deals.</li>
          </ol>
        </article>
      </div>
      <div className="aiPrompts">
        {[
          "Optimize today’s deal book",
          "Find funding delays",
          "Compare manager PVR",
        ].map((x) => (
          <button key={x} onClick={() => onFlash(`${x} analysis generated`)}>
            {x} →
          </button>
        ))}
      </div>
      <label>
        <input placeholder="Ask about any deal, lender or KPI…" />
        <button onClick={() => onFlash("AI analysis generated")}>↑</button>
      </label>
      <footer>AI recommendations require authorized manager review.</footer>
    </aside>
  );
}

type DispatchRole = "Owner" | "Dispatcher" | "Technician";
type DispatchView =
  | "Dashboard"
  | "Jobs"
  | "Work Orders"
  | "Payments"
  | "GPS Map"
  | "Analytics"
  | "AI Agents"
  | "Equipment"
  | "Team"
  | "Settings";

const dispatchJobs = [
  {
    id: "JOB-2841",
    time: "8:30 AM",
    customer: "Morrison Residence",
    service: "Home theater calibration",
    address: "145 Ocean Breeze Dr, Wellington",
    tech: "Andre Cole",
    status: "IN PROGRESS",
    revenue: "$1,850",
    eta: "On site",
    color: "red",
  },
  {
    id: "JOB-2842",
    time: "11:15 AM",
    customer: "Atlas Dental Group",
    service: "Digital signage service",
    address: "2101 S Congress Ave, Palm Springs",
    tech: "Andre Cole",
    status: "ASSIGNED",
    revenue: "$2,400",
    eta: "24 min",
    color: "amber",
  },
  {
    id: "JOB-2843",
    time: "1:45 PM",
    customer: "Carter Collective",
    service: "Access control installation",
    address: "675 Royal Palm Beach Blvd",
    tech: "Maya Torres",
    status: "ASSIGNED",
    revenue: "$4,200",
    eta: "38 min",
    color: "blue",
  },
  {
    id: "JOB-2844",
    time: "3:30 PM",
    customer: "Villa Rosa HOA",
    service: "Camera system inspection",
    address: "880 Forest Hill Blvd, WPB",
    tech: "Derek Stone",
    status: "BOOKED",
    revenue: "$975",
    eta: "1 hr 12 min",
    color: "green",
  },
];

function CyncroDispatch() {
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<DispatchRole>("Owner");
  const [view, setView] = useState<DispatchView>("Dashboard");
  const [notice, setNotice] = useState("");
  const [jobs, setJobs] = useState(dispatchJobs);
  const [selectedJob, setSelectedJob] = useState(0);
  const [techStatus, setTechStatus] = useState("EN ROUTE");
  const [loginEmail, setLoginEmail] = useState("");
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const login = (nextRole: DispatchRole) => {
    setRole(nextRole);
    setAuthenticated(true);
    setView(nextRole === "Technician" ? "Jobs" : "Dashboard");
    flash(`${nextRole} workspace unlocked`);
  };
  const moveJob = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= jobs.length) return;
    const next = [...jobs];
    [next[index], next[target]] = [next[target], next[index]];
    setJobs(next);
    setSelectedJob(target);
    flash("Route order updated · ETA recalculated");
  };
  const createJob = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const customer = String(data.get("customer") || "").trim();
    const service = String(data.get("service") || "").trim();
    const address = String(data.get("address") || "").trim();
    if (!customer || !service || !address) {
      flash("Customer, service, and address are required");
      return;
    }
    const newJob = {
      id: `JOB-${2841 + jobs.length}`,
      time: String(data.get("time") || "9:00 AM"),
      customer,
      service,
      address,
      tech: String(data.get("tech") || "Unassigned"),
      status: "BOOKED",
      revenue: `$${Number(data.get("revenue") || 0).toLocaleString()}`,
      eta: "Not routed",
      color: "green",
    };
    setJobs((current) => [...current, newJob]);
    setSelectedJob(jobs.length);
    setView("Jobs");
    setJobModalOpen(false);
    flash(`${newJob.id} created`);
  };
  const advanceJob = (index: number) => {
    const lifecycle = [
      "BOOKED",
      "ASSIGNED",
      "IN PROGRESS",
      "COMPLETE",
      "INVOICED",
    ];
    setJobs((current) =>
      current.map((job, jobIndex) => {
        if (jobIndex !== index) return job;
        const next =
          lifecycle[
            Math.min(lifecycle.indexOf(job.status) + 1, lifecycle.length - 1)
          ];
        return { ...job, status: next };
      }),
    );
    flash("Job status advanced");
  };
  const cancelJob = (index: number) => {
    setJobs((current) => current.filter((_, jobIndex) => jobIndex !== index));
    setSelectedJob(0);
    flash("Job cancelled");
  };

  if (!authenticated) {
    return (
      <section className="dispatchGate">
        {notice && <div className="dispatchToast">✓ {notice}</div>}
        <div className="dispatchGateGlow" />
        <div className="dispatchGateCopy">
          <span>CYNCRO FIELD OPERATIONS</span>
          <h1>
            Cyncro <i>Dispatch</i>
          </h1>
          <p>
            The command system for contractors—jobs, crews, GPS, routes,
            customers, revenue, and AI agents operating as one.
          </p>
          <div className="dispatchGateProof">
            <span>◆ Live field visibility</span>
            <span>◆ AI booking + follow-up</span>
            <span>◆ Profit on every job</span>
          </div>
          <div
            className="dispatchProductPreview"
            aria-label="Dispatch live operation preview"
          >
            <header>
              <span>LIVE FIELD OPERATION</span>
              <b>4 crews active</b>
            </header>
            <div className="miniDispatchMap">
              <i className="miniRoute routeOne" />
              <i className="miniRoute routeTwo" />
              {[
                ["AC", "22%", "63%"],
                ["MT", "58%", "28%"],
                ["DS", "76%", "71%"],
              ].map((tech) => (
                <button style={{ left: tech[1], top: tech[2] }} key={tech[0]}>
                  {tech[0]}
                  <small>● moving</small>
                </button>
              ))}
              <span className="miniJob one">1</span>
              <span className="miniJob two">2</span>
              <span className="miniJob three">3</span>
            </div>
            <footer>
              <div>
                <small>BOOKED TODAY</small>
                <b>$9,425</b>
              </div>
              <div>
                <small>ON-TIME RATE</small>
                <b>96.8%</b>
              </div>
              <div>
                <small>DRIVE TIME SAVED</small>
                <b>2h 14m</b>
              </div>
            </footer>
          </div>
        </div>

        <aside className="dispatchLoginCard">
          <div className="dispatchMark">D</div>
          <small>CONTRACTOR ACCESS</small>
          <h2>Enter Dispatch</h2>
          <p>Separate, secure access for every company and field role.</p>
          <label>
            Work email
            <input
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              defaultValue="dispatch2026"
              aria-label="Dispatch password"
            />
          </label>
          <button className="dispatchSignIn" onClick={() => login("Owner")}>
            Sign in to Dispatch →
          </button>
          <button
            className="dispatchSSO"
            onClick={() => flash("Secure sign-in prepared")}
          >
            Continue with company SSO
          </button>
          <div className="demoRolePicker">
            <span>EXPLORE ROLE DEMOS</span>
            <div>
              {(["Owner", "Dispatcher", "Technician"] as DispatchRole[]).map(
                (item) => (
                  <button onClick={() => login(item)} key={item}>
                    {item}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="dispatchPlan">
            <div>
              <small>DISPATCH PROFESSIONAL</small>
              <b>
                $249<em>/month</em>
              </b>
            </div>
            <span>Up to 10 technicians · Cancel anytime</span>
            <button onClick={() => flash("Dispatch checkout opened")}>
              Start contractor account
            </button>
          </div>
          <footer>
            Protected by role-based access · Your crews only see assigned work.
          </footer>
        </aside>
      </section>
    );
  }

  if (role === "Technician") {
    return (
      <section className="techAppStage">
        {notice && <div className="dispatchToast">✓ {notice}</div>}
        <div className="techStageCopy">
          <button
            className="backToDispatch"
            onClick={() => setAuthenticated(false)}
          >
            ← Contractor login
          </button>
          <span>CYNCRO DISPATCH · TECH APP</span>
          <h1>
            Built for the field.
            <br />
            Impossible to mess up.
          </h1>
          <p>
            Only today’s assigned work, the fastest route, clear job steps, and
            one-tap proof of completion.
          </p>
          <div className="offlineReady">
            <i>✓</i>
            <div>
              <b>Offline ready</b>
              <small>
                Jobs, photos, notes, and signatures sync when service returns.
              </small>
            </div>
          </div>
          <div className="techDemoControls">
            <button onClick={() => setTechStatus("ARRIVED")}>
              Simulate arrival
            </button>
            <button onClick={() => setTechStatus("COMPLETE")}>
              Complete job
            </button>
            <button
              onClick={() => {
                setRole("Owner");
                setView("Dashboard");
              }}
            >
              Open owner view
            </button>
          </div>
        </div>
        <div className="phoneShell">
          <div className="phoneBar">
            <span>9:41</span>
            <i>● ● ◼</i>
          </div>
          <header>
            <div>
              <small>THURSDAY · AUG 13</small>
              <h2>Good morning, Andre.</h2>
            </div>
            <span>AC</span>
          </header>
          <div className="techStatusStrip">
            <i>●</i>
            <span>
              <b>
                {techStatus === "COMPLETE"
                  ? "Job completed"
                  : techStatus === "ARRIVED"
                    ? "You’ve arrived at Job 1"
                    : "Route optimized"}
              </b>
              <small>
                {techStatus === "COMPLETE"
                  ? "Invoice + owner SMS sent"
                  : techStatus === "ARRIVED"
                    ? "Geofence verified · Timer started"
                    : "31 minutes of drive time saved"}
              </small>
            </span>
          </div>
          <nav>
            <button className="active">Today</button>
            <button onClick={() => flash("Route map opened")}>Route</button>
            <button onClick={() => flash("Tech profile opened")}>
              Profile
            </button>
          </nav>
          <main>
            <div className="nextJobLabel">
              <span>NEXT JOB</span>
              <em>1 OF 3</em>
            </div>
            <article className="mobileJobCard">
              <div className="mobileJobMap">
                <span>AC</span>
                <i>1</i>
                <em>8 min · 3.2 mi</em>
              </div>
              <div className="mobileJobBody">
                <small>
                  {jobs[0].id} · {jobs[0].time}
                </small>
                <h3>{jobs[0].customer}</h3>
                <p>{jobs[0].service}</p>
                <address>{jobs[0].address}</address>
                <div>
                  <button
                    onClick={() => flash("Turn-by-turn navigation opened")}
                  >
                    Navigate
                  </button>
                  <button onClick={() => setTechStatus("ARRIVED")}>
                    {techStatus === "ARRIVED" ? "✓ Arrived" : "I’ve arrived"}
                  </button>
                </div>
              </div>
            </article>
            <div className="workOrderMobile">
              <header>
                <span>WORK ORDER</span>
                <b>Scope + customer notes</b>
              </header>
              <p>
                Diagnose audio zones, calibrate speakers, verify network
                control, and demonstrate final settings to customer.
              </p>
              <button onClick={() => flash("Before photo captured")}>
                ＋ Before photo
              </button>
              <button onClick={() => flash("Field note saved")}>
                ＋ Add note
              </button>
              <button onClick={() => flash("Signature captured")}>
                ✎ Capture signature
              </button>
            </div>
            <button
              className="completeMobileJob"
              onClick={() => {
                setTechStatus("COMPLETE");
                flash("Job complete · Invoice and SMS triggered");
              }}
            >
              Mark job complete
            </button>
          </main>
          <footer>
            <button className="active">
              ▦<small>Jobs</small>
            </button>
            <button>
              ⌖<small>Route</small>
            </button>
            <button>
              ◎<small>Account</small>
            </button>
          </footer>
        </div>
      </section>
    );
  }

  const navItems: { name: DispatchView; icon: string }[] = [
    { name: "Dashboard", icon: "⌂" },
    { name: "Jobs", icon: "▦" },
    { name: "Work Orders", icon: "▤" },
    { name: "Payments", icon: "$" },
    { name: "GPS Map", icon: "⌖" },
    { name: "Analytics", icon: "⌁" },
    { name: "AI Agents", icon: "✦" },
    { name: "Equipment", icon: "◇" },
    { name: "Team", icon: "◎" },
    { name: "Settings", icon: "⚙" },
  ];
  return (
    <section className="dispatchShell">
      {notice && <div className="dispatchToast">✓ {notice}</div>}
      {jobModalOpen && (
        <div className="dispatchModalBackdrop" role="presentation">
          <form className="dispatchModal" onSubmit={createJob}>
            <header>
              <div>
                <small>JOB COMMAND</small>
                <h2>Create a field job</h2>
              </div>
              <button
                type="button"
                onClick={() => setJobModalOpen(false)}
                aria-label="Close new job form"
              >
                ×
              </button>
            </header>
            <label>
              Customer
              <input
                name="customer"
                placeholder="Customer or company"
                required
              />
            </label>
            <label>
              Service
              <input name="service" placeholder="Service requested" required />
            </label>
            <label>
              Job address
              <input
                name="address"
                placeholder="Full service address"
                required
              />
            </label>
            <div>
              <label>
                Time
                <input name="time" type="time" defaultValue="09:00" required />
              </label>
              <label>
                Estimated revenue
                <input
                  name="revenue"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="500"
                />
              </label>
            </div>
            <label>
              Assign technician
              <select name="tech" defaultValue="Unassigned">
                <option>Unassigned</option>
                <option>Andre Cole</option>
                <option>Maya Torres</option>
                <option>Derek Stone</option>
              </select>
            </label>
            <footer>
              <button type="button" onClick={() => setJobModalOpen(false)}>
                Cancel
              </button>
              <button type="submit">Create job →</button>
            </footer>
          </form>
        </div>
      )}
      <aside className="dispatchSidebar">
        <div className="dispatchBrand">
          <span>D</span>
          <div>
            <b>Cyncro Dispatch</b>
            <small>CTS Audio Video</small>
          </div>
        </div>
        <div className="dispatchRole">
          <small>ACTIVE WORKSPACE</small>
          <button
            onClick={() => setRole(role === "Owner" ? "Dispatcher" : "Owner")}
          >
            <span>{role === "Owner" ? "YL" : "DP"}</span>
            <div>
              <b>{role}</b>
              <small>
                {role === "Owner" ? "Full company access" : "Field operations"}
              </small>
            </div>
            <i>⌄</i>
          </button>
        </div>
        <nav>
          {navItems
            .filter(
              (item) =>
                role === "Owner" ||
                !["Analytics", "Payments", "Settings"].includes(item.name),
            )
            .map((item) => (
              <button
                className={view === item.name ? "active" : ""}
                onClick={() => setView(item.name)}
                key={item.name}
              >
                <i>{item.icon}</i>
                <span>{item.name}</span>
                {item.name === "Jobs" && <em>12</em>}
                {item.name === "AI Agents" && (
                  <em className="agentLive">LIVE</em>
                )}
              </button>
            ))}
        </nav>
        <div className="dispatchSideSystem">
          <small>CONNECTED PLATFORM</small>
          <button onClick={() => flash("Cyncro CRM opened")}>
            <i>◫</i>
            <span>Cyncro CRM</span>
            <em>↗</em>
          </button>
          <button onClick={() => flash("Universal Calendar opened")}>
            <i>□</i>
            <span>Calendar</span>
            <em>↗</em>
          </button>
        </div>
        <div className="dispatchSubscription">
          <span>PRO</span>
          <div>
            <b>Dispatch Professional</b>
            <small>$249/mo · 7 of 10 techs</small>
          </div>
          <button onClick={() => setAuthenticated(false)}>•••</button>
        </div>
      </aside>
      <main className="dispatchMain">
        <header className="dispatchTopbar">
          <div>
            <small>THURSDAY, AUGUST 13</small>
            <b>{view === "Dashboard" ? `${role} Command Center` : view}</b>
          </div>
          <div>
            <button onClick={() => flash("Search opened")}>⌕</button>
            <button onClick={() => flash("No dispatch alerts")}>
              ◌<i />
            </button>
            <button onClick={() => setJobModalOpen(true)}>＋ New job</button>
          </div>
        </header>
        <div className="dispatchContent">
          {view === "Dashboard" && (
            <DispatchDashboard
              jobs={jobs}
              onView={setView}
              onFlash={flash}
              onMove={moveJob}
              role={role}
            />
          )}
          {view === "Jobs" && (
            <DispatchJobs
              jobs={jobs}
              selected={selectedJob}
              setSelected={setSelectedJob}
              onFlash={flash}
              onNew={() => setJobModalOpen(true)}
              onAdvance={advanceJob}
              onCancel={cancelJob}
            />
          )}
          {view === "Work Orders" && (
            <DispatchWorkOrders
              jobs={jobs}
              onFlash={flash}
              onViewJob={(index) => {
                setSelectedJob(index);
                setView("Jobs");
              }}
            />
          )}
          {view === "Payments" && <DispatchPayments onFlash={flash} />}
          {view === "GPS Map" && (
            <DispatchMap jobs={jobs} onFlash={flash} onMove={moveJob} />
          )}
          {view === "Analytics" && <DispatchAnalytics onFlash={flash} />}
          {view === "AI Agents" && <DispatchAgents onFlash={flash} />}
          {view === "Equipment" && <DispatchEquipment onFlash={flash} />}
          {view === "Team" && (
            <DispatchTeam
              onTech={() => setRole("Technician")}
              onFlash={flash}
            />
          )}
          {view === "Settings" && <DispatchSettings onFlash={flash} />}
        </div>
      </main>
    </section>
  );
}

function DispatchDashboard({
  jobs,
  onView,
  onFlash,
  onMove,
  role,
}: {
  jobs: typeof dispatchJobs;
  onView: (view: DispatchView) => void;
  onFlash: (message: string) => void;
  onMove: (index: number, direction: number) => void;
  role: DispatchRole;
}) {
  return (
    <>
      <div className="dispatchPageHead">
        <div>
          <span>LIVE FIELD INTELLIGENCE</span>
          <h1>
            {role === "Owner"
              ? "Your field business, in motion."
              : "Every crew. Every job. Right now."}
          </h1>
          <p>
            Real-time jobs, crews, routes, revenue, and exceptions—one command
            surface.
          </p>
        </div>
        <button onClick={() => onFlash("Daily dispatch brief generated")}>
          ✦ Generate daily brief
        </button>
      </div>
      <div className="dispatchMetrics">
        {[
          ["BOOKED THIS WEEK", "$48,250", "+18.4%"],
          ["COLLECTED", "$36,840", "+$7.2K"],
          ["OUTSTANDING", "$11,410", "8 invoices"],
          ["JOBS COMPLETED", "42", "96.8% on time"],
        ].map((item) => (
          <article key={item[0]}>
            <small>{item[0]}</small>
            <b>{item[1]}</b>
            <span>{item[2]}</span>
          </article>
        ))}
      </div>
      <div className="dispatchDashboardGrid">
        <section className="liveOpsMap dispatchPanel">
          <header>
            <div>
              <small>LIVE GPS COMMAND</small>
              <h2>4 crews · 12 jobs</h2>
            </div>
            <button onClick={() => onView("GPS Map")}>Full map →</button>
          </header>
          <div className="mapSurface">
            <i className="mapRoad r1" />
            <i className="mapRoad r2" />
            <i className="mapRoad r3" />
            {[
              ["AC", "24%", "56%", "On site"],
              ["MT", "61%", "28%", "Moving"],
              ["DS", "77%", "68%", "18 min away"],
            ].map((tech) => (
              <button
                style={{ left: tech[1], top: tech[2] }}
                onClick={() => onFlash(`${tech[0]} location opened`)}
                key={tech[0]}
              >
                <span>{tech[0]}</span>
                <b>{tech[3]}</b>
              </button>
            ))}
            {jobs.map((job, index) => (
              <i className={`jobPin pin${index + 1}`} key={job.id}>
                {index + 1}
              </i>
            ))}
          </div>
          <footer>
            <span>
              <i className="moving" /> Moving
            </span>
            <span>
              <i className="onsite" /> On site
            </span>
            <span>
              <i className="available" /> Available
            </span>
            <b>Updated 8 sec ago</b>
          </footer>
        </section>
        <section className="routeCommand dispatchPanel">
          <header>
            <div>
              <small>ROUTE OPTIMIZATION</small>
              <h2>Andre Cole · 3 jobs</h2>
            </div>
            <span>31 min saved</span>
          </header>
          <div className="routeList">
            {jobs.slice(0, 3).map((job, index) => (
              <article key={job.id}>
                <span>{index + 1}</span>
                <div>
                  <b>
                    {job.time} · {job.customer}
                  </b>
                  <small>{job.service}</small>
                </div>
                <em>{job.eta}</em>
                <div>
                  <button onClick={() => onMove(index, -1)}>↑</button>
                  <button onClick={() => onMove(index, 1)}>↓</button>
                </div>
              </article>
            ))}
          </div>
          <button
            className="optimizeRoute"
            onClick={() => onFlash("Optimal route applied · 31 minutes saved")}
          >
            ✦ Optimize route now
          </button>
        </section>
        <section className="todayDispatch dispatchPanel">
          <header>
            <div>
              <small>TODAY&apos;S DISPATCH</small>
              <h2>Live job board</h2>
            </div>
            <button onClick={() => onView("Jobs")}>All jobs →</button>
          </header>
          {jobs.map((job) => (
            <button onClick={() => onView("Jobs")} key={job.id}>
              <time>{job.time}</time>
              <i className={job.color} />
              <span>
                <b>{job.customer}</b>
                <small>
                  {job.tech} · {job.service}
                </small>
              </span>
              <em>{job.status}</em>
              <strong>{job.revenue}</strong>
            </button>
          ))}
        </section>
        <section className="techProductivity dispatchPanel">
          <header>
            <div>
              <small>TECH PRODUCTIVITY</small>
              <h2>Revenue per billable hour</h2>
            </div>
            <button onClick={() => onView("Analytics")}>Analyze →</button>
          </header>
          {[
            ["AC", "Andre Cole", "$78/hr", "+14%", "84%"],
            ["MT", "Maya Torres", "$72/hr", "+9%", "77%"],
            ["DS", "Derek Stone", "$68/hr", "+6%", "69%"],
          ].map((tech) => (
            <div key={tech[1]}>
              <i>{tech[0]}</i>
              <span>
                <b>{tech[1]}</b>
                <small>
                  {tech[2]} · {tech[3]} WoW
                </small>
              </span>
              <em>
                <i style={{ width: tech[4] }} />
              </em>
              <strong>{tech[4]}</strong>
            </div>
          ))}
        </section>
        <section className="agentRevenue dispatchPanel">
          <header>
            <div>
              <small>AI AGENT PERFORMANCE</small>
              <h2>Revenue created automatically</h2>
            </div>
            <button onClick={() => onView("AI Agents")}>Agent center →</button>
          </header>
          <div className="agentRevenueHero">
            <span>✦</span>
            <div>
              <b>$15,420</b>
              <small>FROM SETTER FOLLOW-UPS THIS MONTH</small>
            </div>
            <em>18.2% close rate</em>
          </div>
          {[
            ["Receptionist", "81% booking conversion", "+6%"],
            ["Setter", "42 leads recovered", "$15.4K"],
            ["Learning system", "3 new insights ready", "Review"],
          ].map((item) => (
            <button onClick={() => onView("AI Agents")} key={item[0]}>
              <span>
                <b>{item[0]}</b>
                <small>{item[1]}</small>
              </span>
              <em>{item[2]}</em>
            </button>
          ))}
        </section>
        <section className="profitPulse dispatchPanel">
          <header>
            <div>
              <small>PROFITABILITY</small>
              <h2>Live job economics</h2>
            </div>
            <button onClick={() => onView("Analytics")}>Details →</button>
          </header>
          <div className="profitRing">
            <span>
              <b>38.4%</b>
              <small>NET MARGIN</small>
            </span>
          </div>
          <div className="profitFacts">
            <span>
              <small>REVENUE</small>
              <b>$48,250</b>
            </span>
            <span>
              <small>LABOR</small>
              <b>$12,840</b>
            </span>
            <span>
              <small>MATERIALS</small>
              <b>$16,880</b>
            </span>
            <span>
              <small>PROFIT</small>
              <b>$18,530</b>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function DispatchJobs({
  jobs,
  selected,
  setSelected,
  onFlash,
  onNew,
  onAdvance,
  onCancel,
}: {
  jobs: typeof dispatchJobs;
  selected: number;
  setSelected: (index: number) => void;
  onFlash: (message: string) => void;
  onNew: () => void;
  onAdvance: (index: number) => void;
  onCancel: (index: number) => void;
}) {
  const job = jobs[selected];
  const [inspectorTab, setInspectorTab] = useState<
    "Overview" | "Notes" | "Photos" | "Time" | "Work order"
  >("Overview");
  const [notes, setNotes] = useState<Record<string, string[]>>({
    "JOB-2841": [
      "Customer reports rear-zone audio dropping after 20 minutes.",
      "Network test passed. Replaced damaged HDMI termination and recalibrated system.",
    ],
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [photos, setPhotos] = useState<Record<string, string[]>>({
    "JOB-2841": ["Before · rack wiring.jpg", "After · calibrated theater.jpg"],
  });
  const [clockedIn, setClockedIn] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState<Record<string, number>>({
    "JOB-2841": 94,
  });
  const addNote = () => {
    const clean = noteDraft.trim();
    if (!clean) return;
    setNotes((current) => ({
      ...current,
      [job.id]: [...(current[job.id] || []), clean],
    }));
    setNoteDraft("");
    onFlash("Technical note saved to work order");
  };
  const addPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPhotos((current) => ({
      ...current,
      [job.id]: [...(current[job.id] || []), ...files.map((file) => file.name)],
    }));
    onFlash(`${files.length} job photo${files.length > 1 ? "s" : ""} added`);
    event.target.value = "";
  };
  const toggleClock = () => {
    const isIn = !!clockedIn[job.id];
    setClockedIn((current) => ({ ...current, [job.id]: !isIn }));
    if (isIn) {
      setElapsed((current) => ({
        ...current,
        [job.id]: (current[job.id] || 0) + 47,
      }));
    }
    onFlash(
      isIn ? "Clocked out · labor entry saved" : "Clocked in · GPS verified",
    );
  };
  if (!job) {
    return (
      <div className="dispatchEmptyState dispatchPanel">
        <small>JOB COMMAND</small>
        <h1>No jobs scheduled</h1>
        <p>Create the first job to begin dispatching your team.</p>
        <button onClick={onNew}>＋ Create job</button>
      </div>
    );
  }
  return (
    <div className="dispatchJobsWorkspace">
      <section className="jobBoard dispatchPanel">
        <header>
          <div>
            <small>JOB COMMAND</small>
            <h1>All field work</h1>
          </div>
          <div>
            <button onClick={() => onFlash("Job filters opened")}>
              Filter
            </button>
            <button onClick={onNew}>＋ Job</button>
          </div>
        </header>
        <div className="jobBoardCols">
          <span>JOB + CUSTOMER</span>
          <span>TECH</span>
          <span>STATUS</span>
          <span>VALUE</span>
        </div>
        {jobs.map((item, index) => (
          <button
            className={selected === index ? "active" : ""}
            onClick={() => setSelected(index)}
            key={item.id}
          >
            <span>
              <i>{index + 1}</i>
              <div>
                <b>{item.customer}</b>
                <small>
                  {item.id} · {item.service}
                  <br />
                  {item.address}
                </small>
              </div>
            </span>
            <strong>{item.tech}</strong>
            <em>{item.status}</em>
            <b>{item.revenue}</b>
          </button>
        ))}
      </section>
      <aside className="jobInspector dispatchPanel">
        <header>
          <div>
            <small>WORK ORDER</small>
            <h2>{job.id}</h2>
          </div>
          <button onClick={() => onFlash("Job actions opened")}>•••</button>
        </header>
        <span className="jobStatusLarge">● {job.status}</span>
        <h3>{job.customer}</h3>
        <p>{job.service}</p>
        <address>{job.address}</address>
        <nav className="jobInspectorTabs" aria-label="Job record sections">
          {(["Overview", "Notes", "Photos", "Time", "Work order"] as const).map(
            (tab) => (
              <button
                className={inspectorTab === tab ? "active" : ""}
                onClick={() => setInspectorTab(tab)}
                key={tab}
              >
                {tab}
              </button>
            ),
          )}
        </nav>
        {inspectorTab === "Overview" && (
          <>
            <div className="jobTimeline">
              {[
                ["BOOKED", "Calendar created job", "8:02 AM"],
                ["ASSIGNED", `${job.tech} assigned`, "8:05 AM"],
                ["EN ROUTE", "GPS tracking started", "8:18 AM"],
                ["ARRIVED", "Geofence verified", "8:29 AM"],
              ].map((event, index) => (
                <div className={index < 3 ? "done" : ""} key={event[0]}>
                  <i>{index < 3 ? "✓" : ""}</i>
                  <span>
                    <b>{event[0]}</b>
                    <small>{event[1]}</small>
                  </span>
                  <time>{event[2]}</time>
                </div>
              ))}
            </div>
            <div className="jobEconomics">
              {[
                ["Revenue", job.revenue],
                ["Labor", "$420"],
                ["Materials", "$315"],
                ["Projected profit", "$1,115"],
              ].map((item) => (
                <span key={item[0]}>
                  <small>{item[0]}</small>
                  <b>{item[1]}</b>
                </span>
              ))}
            </div>
            <button
              onClick={() => onFlash("Customer update queued for SMS delivery")}
            >
              Send customer update
            </button>
            <button onClick={() => onAdvance(selected)}>
              Advance job status
            </button>
            <button className="dangerAction" onClick={() => onCancel(selected)}>
              Cancel job
            </button>
          </>
        )}
        {inspectorTab === "Notes" && (
          <div className="jobRecordPanel">
            <header>
              <div>
                <small>FIELD NOTES</small>
                <b>{(notes[job.id] || []).length} entries</b>
              </div>
              <span>Visible to office + assigned tech</span>
            </header>
            <div className="jobNotesList">
              {(notes[job.id] || []).map((note, index) => (
                <article key={`${job.id}-${index}`}>
                  <i>{index + 1}</i>
                  <div>
                    <p>{note}</p>
                    <small>
                      {job.tech} · Today, {index ? "10:42 AM" : "9:18 AM"}
                    </small>
                  </div>
                </article>
              ))}
              {!(notes[job.id] || []).length && (
                <p className="emptyRecord">
                  No notes yet. Add diagnostics, work performed, unresolved
                  issues, or next steps.
                </p>
              )}
            </div>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add technical notes, findings, parts used, recommendations…"
            />
            <button onClick={addNote}>＋ Save job note</button>
          </div>
        )}
        {inspectorTab === "Photos" && (
          <div className="jobRecordPanel">
            <header>
              <div>
                <small>JOB DOCUMENTATION</small>
                <b>{(photos[job.id] || []).length} uploads</b>
              </div>
              <span>Before · after · serials · test results</span>
            </header>
            <div className="jobPhotoGrid">
              {(photos[job.id] || []).map((photo, index) => (
                <article key={`${photo}-${index}`}>
                  <div>
                    <span>{index % 2 ? "AFTER" : "BEFORE"}</span>▧
                  </div>
                  <b>{photo}</b>
                  <small>Uploaded by {job.tech}</small>
                </article>
              ))}
            </div>
            <label className="photoUploadButton">
              ＋ Upload job photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={addPhotos}
              />
            </label>
          </div>
        )}
        {inspectorTab === "Time" && (
          <div className="jobRecordPanel timeClockPanel">
            <header>
              <div>
                <small>GPS-VERIFIED TIME</small>
                <b>{clockedIn[job.id] ? "Shift active" : "Not clocked in"}</b>
              </div>
              <span>Geofence · labor · drive time</span>
            </header>
            <div className={`clockHero ${clockedIn[job.id] ? "active" : ""}`}>
              <span>{clockedIn[job.id] ? "● LIVE" : "○ READY"}</span>
              <b>
                {Math.floor((elapsed[job.id] || 0) / 60)}h{" "}
                {(elapsed[job.id] || 0) % 60}m
              </b>
              <small>Total labor recorded</small>
            </div>
            <button className="clockAction" onClick={toggleClock}>
              {clockedIn[job.id]
                ? "Clock out and save time"
                : "Clock in to this job"}
            </button>
            <div className="timeEntries">
              <article>
                <span>Arrival verified</span>
                <b>8:29 AM</b>
              </article>
              <article>
                <span>Drive time</span>
                <b>24 min</b>
              </article>
              <article>
                <span>Billable labor</span>
                <b>{elapsed[job.id] || 0} min</b>
              </article>
            </div>
          </div>
        )}
        {inspectorTab === "Work order" && (
          <div className="jobRecordPanel workOrderDetail">
            <header>
              <div>
                <small>WORK ORDER {job.id}</small>
                <b>Authorized scope</b>
              </div>
              <span>Customer sign-off required</span>
            </header>
            <section>
              <small>SCOPE OF WORK</small>
              <p>
                Diagnose reported issue, complete approved service, test all
                affected systems, document equipment and provide customer
                walkthrough.
              </p>
            </section>
            <div>
              <span>
                <small>SCHEDULE</small>
                <b>Today · {job.time}</b>
              </span>
              <span>
                <small>TECHNICIAN</small>
                <b>{job.tech}</b>
              </span>
              <span>
                <small>AUTHORIZED</small>
                <b>{job.revenue}</b>
              </span>
              <span>
                <small>PO / TERMS</small>
                <b>NET 15</b>
              </span>
            </div>
            <label>
              <input type="checkbox" /> Scope completed and tested
            </label>
            <label>
              <input type="checkbox" /> Required photos and serials uploaded
            </label>
            <label>
              <input type="checkbox" /> Customer/site sign-off obtained
            </label>
            <button
              onClick={() => onFlash("Work order sent for customer signature")}
            >
              Request customer signature
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function DispatchWorkOrders({
  jobs,
  onFlash,
  onViewJob,
}: {
  jobs: typeof dispatchJobs;
  onFlash: (message: string) => void;
  onViewJob: (index: number) => void;
}) {
  const [status, setStatus] = useState("All");
  return (
    <div className="workOrdersWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>FIELD DOCUMENT CONTROL</span>
          <h1>Every job, documented and billable.</h1>
          <p>
            Scope, labor, photos, notes, approvals, signatures, and invoice
            readiness in one record.
          </p>
        </div>
        <button onClick={() => onFlash("Blank work-order template created")}>
          ＋ Work order
        </button>
      </div>
      <div className="workOrderMetrics">
        {[
          ["OPEN", "12", "7 assigned"],
          ["AWAITING SIGNATURE", "3", "$8.4K value"],
          ["READY TO INVOICE", "6", "$14.7K"],
          ["DOCUMENTATION SCORE", "96%", "+8% this month"],
        ].map((metric) => (
          <article className="dispatchPanel" key={metric[0]}>
            <small>{metric[0]}</small>
            <b>{metric[1]}</b>
            <span>{metric[2]}</span>
          </article>
        ))}
      </div>
      <section className="dispatchPanel workOrderCommandTable">
        <header>
          <div>
            <small>WORK ORDER COMMAND</small>
            <h2>Operational records</h2>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter work orders"
          >
            <option>All</option>
            <option>Open</option>
            <option>Ready to invoice</option>
            <option>Complete</option>
          </select>
        </header>
        <div className="workOrderTableHead">
          <span>WORK ORDER</span>
          <span>DOCUMENTATION</span>
          <span>LABOR</span>
          <span>PAYMENT</span>
          <span>READINESS</span>
        </div>
        {jobs.map((job, index) => {
          const ready = index === 0 || job.status === "COMPLETE";
          return (
            <button onClick={() => onViewJob(index)} key={job.id}>
              <span>
                <b>
                  {job.id} · {job.customer}
                </b>
                <small>
                  {job.service}
                  <br />
                  {job.tech}
                </small>
              </span>
              <span>
                <b>{index === 0 ? "6/6 complete" : "3/6 complete"}</b>
                <small>
                  {index === 0
                    ? "Notes · photos · signature"
                    : "Missing photos or sign-off"}
                </small>
              </span>
              <span>
                <b>{index === 0 ? "1h 34m" : "Scheduled"}</b>
                <small>{index === 0 ? "$420 labor" : job.time}</small>
              </span>
              <span>
                <b>{ready ? "Invoice ready" : "Not billed"}</b>
                <small>{job.revenue}</small>
              </span>
              <em className={ready ? "ready" : "attention"}>
                {ready ? "READY" : "ACTION NEEDED"}
              </em>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function DispatchPayments({ onFlash }: { onFlash: (message: string) => void }) {
  const [quickBooksConnected, setQuickBooksConnected] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<Record<string, string>>({
    "INV-8821": "PAID",
    "INV-8822": "DUE",
    "INV-8823": "DEPOSIT PAID",
    "INV-8824": "DRAFT",
  });
  const invoices = [
    ["INV-8821", "Morrison Residence", "$1,850", "Card · ending 4028", "PAID"],
    ["INV-8822", "Atlas Dental Group", "$2,400", "Net 15 · Aug 28", "DUE"],
    [
      "INV-8823",
      "Carter Collective",
      "$4,200",
      "$1,500 deposit",
      "DEPOSIT PAID",
    ],
    ["INV-8824", "Villa Rosa HOA", "$975", "Awaiting completion", "DRAFT"],
  ];
  const collect = (id: string) => {
    setPaymentStatus((current) => ({ ...current, [id]: "PAYMENT LINK SENT" }));
    onFlash("Secure payment link created and queued");
  };
  return (
    <div className="dispatchPaymentsWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>REVENUE OPERATIONS</span>
          <h1>From completed work to collected cash.</h1>
          <p>
            Deposits, invoices, payment links, reconciliation, disputes, and
            accounting sync.
          </p>
        </div>
        <button onClick={() => onFlash("Invoice composer opened")}>
          ＋ Create invoice
        </button>
      </div>
      <div className="paymentMetrics">
        {[
          ["COLLECTED THIS WEEK", "$36,840", "+18.2%"],
          ["OUTSTANDING", "$11,410", "8 invoices"],
          ["AVG DAYS TO PAY", "4.2", "−1.8 days"],
          ["AUTO-RECONCILED", "94%", "QuickBooks-ready"],
        ].map((metric) => (
          <article className="dispatchPanel" key={metric[0]}>
            <small>{metric[0]}</small>
            <b>{metric[1]}</b>
            <span>{metric[2]}</span>
          </article>
        ))}
      </div>
      <div className="paymentsGrid">
        <section className="dispatchPanel invoiceCommand">
          <header>
            <div>
              <small>INVOICE COMMAND</small>
              <h2>Job payments</h2>
            </div>
            <button onClick={() => onFlash("Payment report exported")}>
              Export
            </button>
          </header>
          {invoices.map((invoice) => (
            <article key={invoice[0]}>
              <span>
                <b>
                  {invoice[0]} · {invoice[1]}
                </b>
                <small>{invoice[3]}</small>
              </span>
              <strong>{invoice[2]}</strong>
              <em>{paymentStatus[invoice[0]] || invoice[4]}</em>
              <button onClick={() => collect(invoice[0])}>
                {paymentStatus[invoice[0]] === "PAID" ? "Receipt" : "Collect"}
              </button>
            </article>
          ))}
        </section>
        <aside className="dispatchPanel quickBooksCard">
          <header>
            <span className={quickBooksConnected ? "connected" : ""}>QB</span>
            <div>
              <small>ACCOUNTING CONNECTION</small>
              <h2>QuickBooks Online</h2>
            </div>
          </header>
          <p>
            Sync customers, invoices, deposits, taxes, service items, contractor
            labor, materials, and payments without double entry.
          </p>
          <ul>
            <li>✓ Job-to-invoice mapping</li>
            <li>✓ Automatic payment reconciliation</li>
            <li>✓ Expense and material categorization</li>
            <li>✓ Failed-sync review queue</li>
          </ul>
          <div>
            <small>CONNECTION STATUS</small>
            <b>
              {quickBooksConnected
                ? "● Connected · last sync 2 min ago"
                : "○ Ready to connect"}
            </b>
          </div>
          <button
            onClick={() => {
              setQuickBooksConnected(true);
              onFlash("QuickBooks connection demo enabled");
            }}
          >
            {quickBooksConnected
              ? "Run QuickBooks sync"
              : "Connect QuickBooks →"}
          </button>
          <small>
            Live OAuth authorization will activate after credentials are
            configured.
          </small>
        </aside>
      </div>
    </div>
  );
}

function DispatchMap({
  jobs,
  onFlash,
  onMove,
}: {
  jobs: typeof dispatchJobs;
  onFlash: (message: string) => void;
  onMove: (index: number, direction: number) => void;
}) {
  return (
    <div className="dispatchMapWorkspace">
      <section className="fullDispatchMap dispatchPanel">
        <header>
          <div>
            <small>REAL-TIME GPS</small>
            <h1>Field visibility</h1>
          </div>
          <div>
            <button onClick={() => onFlash("Map layers opened")}>Layers</button>
            <button onClick={() => onFlash("Map centered on all crews")}>
              Fit all
            </button>
          </div>
        </header>
        <div className="bigMap">
          <i className="mapRoad r1" />
          <i className="mapRoad r2" />
          <i className="mapRoad r3" />
          <i className="mapRoad r4" />
          {[
            ["AC", "21%", "58%", "On site · 42 min"],
            ["MT", "62%", "30%", "Moving · 34 mph"],
            ["DS", "79%", "70%", "En route · 18 min"],
          ].map((t) => (
            <button
              style={{ left: t[1], top: t[2] }}
              onClick={() => onFlash(`${t[0]} live location selected`)}
              key={t[0]}
            >
              <span>{t[0]}</span>
              <b>{t[3]}</b>
            </button>
          ))}
          {jobs.map((job, index) => (
            <i className={`jobPin pin${index + 1}`} key={job.id}>
              {index + 1}
            </i>
          ))}
        </div>
      </section>
      <aside className="routeDrawer dispatchPanel">
        <small>ROUTE COMMAND</small>
        <h2>Andre Cole</h2>
        <p>Thursday · 3 stops · 42.6 miles</p>
        <div className="routeSummary">
          <span>
            <small>DRIVE</small>
            <b>1h 42m</b>
          </span>
          <span>
            <small>SAVED</small>
            <b>31m</b>
          </span>
          <span>
            <small>ON TIME</small>
            <b>98%</b>
          </span>
        </div>
        {jobs.slice(0, 3).map((job, index) => (
          <article key={job.id}>
            <span>{index + 1}</span>
            <div>
              <b>
                {job.time} · {job.customer}
              </b>
              <small>{job.address}</small>
            </div>
            <em>{job.eta}</em>
            <footer>
              <button onClick={() => onMove(index, -1)}>Move up</button>
              <button onClick={() => onMove(index, 1)}>Move down</button>
            </footer>
          </article>
        ))}
        <button
          className="optimizeRoute"
          onClick={() => onFlash("Route optimized with live traffic")}
        >
          ✦ Re-optimize route
        </button>
        <button onClick={() => onFlash("Optimized route sent to Andre")}>
          Send to technician
        </button>
      </aside>
    </div>
  );
}

function DispatchAnalytics({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  return (
    <div className="dispatchAnalytics">
      <div className="dispatchPageHead">
        <div>
          <span>PROFIT + PERFORMANCE</span>
          <h1>Know what every job is worth.</h1>
          <p>
            Revenue, labor, material, source, technician, and lifecycle
            intelligence.
          </p>
        </div>
        <button onClick={() => onFlash("Analytics report exported")}>
          Export report
        </button>
      </div>
      <div className="dispatchMetrics">
        {[
          ["WEEKLY PROFIT", "$18,530", "38.4% margin"],
          ["AVG PROFIT / JOB", "$882", "+$96 WoW"],
          ["REVENUE / HOUR", "$72.40", "+$6.20"],
          ["LEAD SOURCE ROI", "1,640%", "Google Ads"],
        ].map((i, index) => (
          <article key={i[0]}>
            <small>{i[0]}</small>
            <b>{i[1]}</b>
            <span>{i[2]}</span>
          </article>
        ))}
      </div>
      <div className="analyticsDispatchGrid">
        <section className="dispatchPanel revenueChart">
          <header>
            <div>
              <small>REVENUE BY TECHNICIAN</small>
              <h2>Productivity comparison</h2>
            </div>
            <button onClick={() => onFlash("Date range changed")}>
              This month ▾
            </button>
          </header>
          <div>
            {[
              ["Andre", "$24.8K", "88%"],
              ["Maya", "$21.2K", "76%"],
              ["Derek", "$18.9K", "67%"],
              ["Luis", "$15.4K", "55%"],
            ].map((i) => (
              <article key={i[0]}>
                <span>{i[0]}</span>
                <em>
                  <i style={{ width: i[2] }} />
                </em>
                <b>{i[1]}</b>
              </article>
            ))}
          </div>
        </section>
        <section className="dispatchPanel sourceROI">
          <header>
            <div>
              <small>LEAD SOURCE ECONOMICS</small>
              <h2>Spend to lifetime value</h2>
            </div>
          </header>
          {[
            ["Google Ads", "$500", "10", "3", "$8,100", "1,520%"],
            ["Referral", "$0", "8", "6", "$24,000", "∞"],
            ["Facebook", "$680", "14", "4", "$9,600", "1,312%"],
            ["Organic", "$0", "12", "5", "$14,200", "∞"],
          ].map((i) => (
            <div key={i[0]}>
              <b>{i[0]}</b>
              <span>{i[1]} spend</span>
              <span>{i[2]} leads</span>
              <span>{i[3]} booked</span>
              <strong>{i[4]}</strong>
              <em>{i[5]}</em>
            </div>
          ))}
        </section>
        <section className="dispatchPanel marginBreakdown">
          <header>
            <div>
              <small>JOB PROFITABILITY</small>
              <h2>Margin by service type</h2>
            </div>
          </header>
          {[
            ["Access control", "46.2%", "$8.4K"],
            ["Digital signage", "41.8%", "$6.7K"],
            ["Home theater", "38.4%", "$5.2K"],
            ["Camera systems", "34.1%", "$4.8K"],
          ].map((i) => (
            <button
              onClick={() => onFlash(`${i[0]} profitability opened`)}
              key={i[0]}
            >
              <span>
                <b>{i[0]}</b>
                <small>{i[2]} profit</small>
              </span>
              <em>{i[1]}</em>
              <i>
                <span style={{ width: i[1] }} />
              </i>
            </button>
          ))}
        </section>
        <section className="dispatchPanel learningTrend">
          <small>AGENT LEARNING TREND</small>
          <h2>Every conversation makes the system smarter.</h2>
          <div>
            <span>
              <i style={{ height: "42%" }} />
              <small>W1</small>
              <b>72%</b>
            </span>
            <span>
              <i style={{ height: "55%" }} />
              <small>W2</small>
              <b>75%</b>
            </span>
            <span>
              <i style={{ height: "72%" }} />
              <small>W3</small>
              <b>81%</b>
            </span>
            <span>
              <i style={{ height: "83%" }} />
              <small>W4</small>
              <b>84%</b>
            </span>
          </div>
          <button onClick={() => onFlash("Learning insights opened")}>
            Review 3 new learnings →
          </button>
        </section>
        <section className="dispatchPanel fieldEfficiencyPanel">
          <header>
            <div>
              <small>FIELD EFFICIENCY</small>
              <h2>Paid hours vs. operational time</h2>
            </div>
            <span>92.4% verified</span>
          </header>
          {[
            ["Billable labor", "148h", "74%"],
            ["Drive time", "31h", "16%"],
            ["Unallocated time", "12h", "6%"],
            ["Overtime", "8h", "4%"],
          ].map((row) => (
            <article key={row[0]}>
              <span>
                <b>{row[0]}</b>
                <small>{row[1]}</small>
              </span>
              <em>
                <i style={{ width: row[2] }} />
              </em>
              <strong>{row[2]}</strong>
            </article>
          ))}
        </section>
        <section className="dispatchPanel cashVelocityPanel">
          <small>CASH VELOCITY</small>
          <h2>Work completed to money collected.</h2>
          <div>
            <span>
              <b>1.2d</b>
              <small>Complete → invoice</small>
            </span>
            <span>
              <b>4.2d</b>
              <small>Invoice → paid</small>
            </span>
            <span>
              <b>94%</b>
              <small>Auto-reconciled</small>
            </span>
          </div>
          <article>
            <span>Documentation-ready invoices</span>
            <b>96%</b>
          </article>
          <article>
            <span>Deposit coverage</span>
            <b>72%</b>
          </article>
          <article>
            <span>Payment disputes</span>
            <b>0.8%</b>
          </article>
        </section>
      </div>
    </div>
  );
}

function DispatchAgents({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="dispatchAgents">
      <div className="dispatchPageHead">
        <div>
          <span>AI FIELD WORKFORCE</span>
          <h1>Agents that book, recover, notify, and learn.</h1>
          <p>
            Controlled automation with full conversation history and human
            approval.
          </p>
        </div>
        <button onClick={() => onFlash("New field agent created")}>
          ＋ Create agent
        </button>
      </div>
      <div className="dispatchAgentGrid">
        {[
          [
            "Nova",
            "SMS Receptionist",
            "81%",
            "Qualifies inbound leads, books jobs, collects deposits, and assigns the best technician.",
            "1,284 conversations",
          ],
          [
            "Atlas",
            "Setter Agent",
            "18.2%",
            "Recovers dead leads through Day 3, 7, and 14 follow-up sequences.",
            "$15.4K recovered",
          ],
          [
            "Sage",
            "Learning System",
            "+12%",
            "Analyzes which questions, times, and messages produce the best bookings.",
            "3 insights ready",
          ],
          [
            "Kronos",
            "Dispatch Agent",
            "96.8%",
            "Monitors routes, delays, job status, workload, and customer arrival notifications.",
            "438 actions",
          ],
        ].map((agent, index) => (
          <article className="dispatchPanel" key={agent[0]}>
            <header>
              <span>{agent[0][0]}</span>
              <div>
                <small>AGENT {String(index + 1).padStart(2, "0")}</small>
                <h2>{agent[0]}</h2>
              </div>
              <em>● LIVE</em>
            </header>
            <b>{agent[1]}</b>
            <strong>{agent[2]}</strong>
            <p>{agent[3]}</p>
            <div>
              <small>LAST 30 DAYS</small>
              <b>{agent[4]}</b>
            </div>
            <footer>
              <button
                onClick={() => onFlash(`${agent[0]} conversations opened`)}
              >
                Activity
              </button>
              <button onClick={() => onFlash(`${agent[0]} permissions opened`)}>
                Controls
              </button>
            </footer>
          </article>
        ))}
      </div>
      <section className="agentLearningTable dispatchPanel">
        <header>
          <div>
            <small>LEARNING APPROVAL QUEUE</small>
            <h2>What the agents discovered</h2>
          </div>
          <span>Human approval required</span>
        </header>
        {[
          [
            "Specific times convert 3.1× better",
            "Offer “10 AM tomorrow” before asking an open-ended availability question.",
            "+14% predicted booking rate",
          ],
          [
            "Deposit timing reduces drop-off",
            "Send the deposit link within 45 seconds after appointment confirmation.",
            "−22% abandonment",
          ],
          [
            "Maintenance language wins",
            "“Protect your installation” outperforms “annual service” in warranty reminders.",
            "+18% response rate",
          ],
        ].map((i) => (
          <article key={i[0]}>
            <span>✦</span>
            <div>
              <b>{i[0]}</b>
              <p>{i[1]}</p>
              <small>{i[2]}</small>
            </div>
            <button
              onClick={() => onFlash("Learning approved and prompt updated")}
            >
              Approve
            </button>
            <button onClick={() => onFlash("Learning details opened")}>
              Review
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function DispatchEquipment({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  return (
    <div className="equipmentWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>INSTALLED ASSET REGISTRY</span>
          <h1>Equipment intelligence after the job.</h1>
          <p>
            Every model, serial, installation, warranty, and maintenance
            opportunity.
          </p>
        </div>
        <button onClick={() => onFlash("Equipment registered")}>
          ＋ Register equipment
        </button>
      </div>
      <section className="dispatchPanel equipmentTable">
        <header>
          <span>EQUIPMENT</span>
          <span>CUSTOMER</span>
          <span>INSTALLED</span>
          <span>WARRANTY</span>
          <span>STATUS</span>
        </header>
        {[
          [
            "Sony VPL-XW5000ES",
            "Morrison Residence",
            "Aug 13, 2026",
            "Aug 13, 2029",
            "ACTIVE",
          ],
          [
            "Brivo ACS6000",
            "Carter Collective",
            "Aug 12, 2026",
            "Aug 12, 2028",
            "ACTIVE",
          ],
          [
            'Samsung QMC 75"',
            "Atlas Dental Group",
            "Jul 18, 2026",
            "Jul 18, 2029",
            "ACTIVE",
          ],
          [
            "Luma X20 NVR",
            "Villa Rosa HOA",
            "Sep 21, 2023",
            "Sep 21, 2026",
            "EXPIRING",
          ],
        ].map((i, index) => (
          <button onClick={() => onFlash(`${i[0]} registry opened`)} key={i[0]}>
            <span>
              <i>◇</i>
              <div>
                <b>{i[0]}</b>
                <small>
                  Serial · CY{[842106, 591284, 735902, 418675][index]}
                </small>
              </div>
            </span>
            <strong>{i[1]}</strong>
            <em>{i[2]}</em>
            <em>{i[3]}</em>
            <span className={i[4].toLowerCase()}>{i[4]}</span>
          </button>
        ))}
      </section>
      <div className="equipmentInsights">
        <section className="dispatchPanel">
          <small>WARRANTY AUTOMATION</small>
          <h2>12 upcoming opportunities</h2>
          <p>
            Automatic SMS reminders 30 days before warranty or maintenance
            milestones.
          </p>
          <div>
            <b>35%</b>
            <span>book service</span>
          </div>
          <button onClick={() => onFlash("Warranty campaign opened")}>
            Open reminder system →
          </button>
        </section>
        <section className="dispatchPanel">
          <small>INSTALLED BASE</small>
          <h2>$428K customer equipment</h2>
          <p>186 registered assets across 84 active customer locations.</p>
          <div>
            <b>$82K</b>
            <span>service opportunity</span>
          </div>
          <button onClick={() => onFlash("Installed base analyzed")}>
            Analyze installed base →
          </button>
        </section>
      </div>
    </div>
  );
}

function DispatchTeam({
  onTech,
  onFlash,
}: {
  onTech: () => void;
  onFlash: (message: string) => void;
}) {
  return (
    <div className="teamWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>PEOPLE + ACCESS</span>
          <h1>One team. Exactly the right access.</h1>
          <p>
            Owners see the business, dispatchers command the field, technicians
            see assigned work only.
          </p>
        </div>
        <button onClick={() => onFlash("Team invitation created")}>
          ＋ Invite teammate
        </button>
      </div>
      <div className="teamRoleCards">
        {[
          [
            "OWNER",
            "Full CRM + Dispatch + Analytics",
            "2 users",
            "All records, revenue, settings, billing",
          ],
          [
            "DISPATCHER",
            "Field command access",
            "3 users",
            "Jobs, crews, GPS, routes, customers",
          ],
          [
            "TECHNICIAN",
            "Assigned work only",
            "7 users",
            "Today’s jobs, work orders, photos, notes",
          ],
        ].map((i) => (
          <article className="dispatchPanel" key={i[0]}>
            <small>{i[0]}</small>
            <h2>{i[1]}</h2>
            <b>{i[2]}</b>
            <p>{i[3]}</p>
            <button
              onClick={() =>
                i[0] === "TECHNICIAN"
                  ? onTech()
                  : onFlash(`${i[0]} access opened`)
              }
            >
              Preview access →
            </button>
          </article>
        ))}
      </div>
      <section className="dispatchPanel teamTable">
        <header>
          <span>TEAM MEMBER</span>
          <span>ROLE</span>
          <span>TODAY</span>
          <span>STATUS</span>
          <span>ACCESS</span>
        </header>
        {[
          ["AC", "Andre Cole", "Technician", "3 jobs · $4.2K", "On job"],
          ["MT", "Maya Torres", "Technician", "3 jobs · $5.8K", "Moving"],
          ["DS", "Derek Stone", "Technician", "2 jobs · $2.9K", "Available"],
          ["DP", "Dana Pierce", "Dispatcher", "12 jobs managed", "Online"],
          ["AO", "Account Owner", "Owner", "Full command", "Online"],
        ].map((i) => (
          <article className="teamMemberRow" key={i[1]}>
            <span>
              <i>{i[0]}</i>
              <b>{i[1]}</b>
            </span>
            <em>{i[2]}</em>
            <strong>{i[3]}</strong>
            <span>{i[4]}</span>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onFlash(`${i[1]} permissions opened`);
              }}
            >
              Manage
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function DispatchSettings({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="dispatchSettings">
      <div className="dispatchPageHead">
        <div>
          <span>DISPATCH CONFIGURATION</span>
          <h1>Built around your field operation.</h1>
          <p>
            Service rules, territories, notifications, roles, integrations, and
            billing.
          </p>
        </div>
        <button onClick={() => onFlash("Settings saved")}>Save changes</button>
      </div>
      <div className="settingsDispatchGrid">
        {[
          [
            "Company + Billing",
            "CTS Audio Video · Dispatch Professional",
            "$249/mo · Renews Sep 13",
            "Manage subscription",
          ],
          [
            "Service Territory",
            "Palm Beach County · 42-mile radius",
            "6 ZIP rules · 2 priority zones",
            "Edit territory",
          ],
          [
            "Job Lifecycle",
            "BOOKED → ASSIGNED → IN PROGRESS → COMPLETE → INVOICED",
            "5 automation triggers active",
            "Edit lifecycle",
          ],
          [
            "GPS + Geofencing",
            "5-minute active-job pings · 200m arrival radius",
            "Arrival and departure automation on",
            "Configure tracking",
          ],
          [
            "Customer SMS",
            "Booked, en route, arrival, completion, warranty",
            "6 message templates active",
            "Edit messages",
          ],
          [
            "Integrations",
            "Cyncro CRM, Calendar, Stripe, n8n, OSRM",
            "5 systems connected",
            "Manage connections",
          ],
          [
            "Security + Access",
            "Server-enforced Owner, Dispatcher, and Technician policies",
            "RLS active · sessions verified · secrets redacted",
            "Review security",
          ],
          [
            "Reliability",
            "Graceful failures, retries, idempotency, and offline sync",
            "Request tracing · health checks · 50-operation sync batches",
            "Open reliability center",
          ],
          [
            "Abuse Protection",
            "Layered SMS, GPS, job, and IP rate limits",
            "Signed webhooks · duplicate protection · encrypted SMS",
            "View protection rules",
          ],
        ].map((i) => (
          <article className="dispatchPanel" key={i[0]}>
            <small>{i[0].toUpperCase()}</small>
            <h2>{i[1]}</h2>
            <p>{i[2]}</p>
            <button onClick={() => onFlash(`${i[0]} opened`)}>{i[3]} →</button>
          </article>
        ))}
      </div>
    </div>
  );
}

type ProspectSignal = {
  websiteExists: boolean;
  booking: boolean;
  contactForm: boolean;
  chat: boolean;
  sms: boolean;
  strongCta: boolean;
  facebook: boolean;
  instagram: boolean;
};

type Prospect = {
  id?: string;
  googlePlaceId?: string | null;
  businessName: string;
  category: string;
  address: string;
  phone: string | null;
  website: string | null;
  domain?: string | null;
  rating: number | null;
  reviewCount: number;
  selfReportedRevenue?: number | null;
  estimatedRevenueLow?: number | null;
  estimatedRevenueHigh?: number | null;
  revenueConfidence?: string | null;
  revenueMethodology?: string | null;
  opportunityScore?: number | null;
  rankLabel?: string | null;
  signals?: ProspectSignal | null;
  reasons?: string[];
  whyCall?: string | null;
  whatFound?: string | null;
  recommendedSolution?: string | null;
  callOpener?: string | null;
  nextAction?: string | null;
  emails?: string[];
  extractedPhones?: string[];
  leadership?: string[];
  sourceUrls?: string[];
  lastExtractedAt?: string | null;
  assignedRep?: string | null;
  notes?: string | null;
  status?: string;
  analyzedAt?: string | null;
  source?: string;
};

const prospectStatuses = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "FOLLOW UP",
  "INTERESTED",
  "DEMO BOOKED",
  "PROPOSAL SENT",
  "WON",
  "LOST",
];

function prospectIdentity(prospect: Prospect) {
  return (
    prospect.googlePlaceId ||
    prospect.domain ||
    `${prospect.businessName}|${prospect.address}`.toLowerCase()
  );
}

function CyncroProspecting({ onOpenCRM }: { onOpenCRM: () => void }) {
  const [form, setForm] = useState({
    keyword: "Med spas",
    city: "Miami",
    state: "FL",
    zip: "",
    radius: "",
    maximum: "20",
  });
  const [results, setResults] = useState<Prospect[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [searching, setSearching] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadProspects = async () => {
    try {
      const response = await fetch("/api/prospecting/prospects");
      const data = (await response.json()) as {
        prospects?: Prospect[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Unable to load prospects.");
      const loaded = data.prospects || [];
      setProspects(loaded);
      setSelected((current) =>
        current?.id
          ? loaded.find((item) => item.id === current.id) || current
          : current,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load prospects.",
      );
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProspects(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const savedByIdentity = useMemo(
    () =>
      new Map(
        prospects.map((prospect) => [prospectIdentity(prospect), prospect]),
      ),
    [prospects],
  );
  const ranked = useMemo(
    () =>
      [...prospects].sort(
        (a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1),
      ),
    [prospects],
  );
  const callFirst = ranked
    .filter((item) => (item.opportunityScore || 0) >= 80)
    .slice(0, 3);

  const setField = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const search = async () => {
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/prospecting/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        results?: Prospect[];
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Search failed.");
      }
      setResults(data.results || []);
      setMessage(`${data.results?.length || 0} real businesses found.`);
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : "Search failed.",
      );
    } finally {
      setSearching(false);
    }
  };

  const saveProspect = async (
    prospect: Prospect,
    quiet = false,
    syncCRM = true,
  ) => {
    const alreadySaved = savedByIdentity.get(prospectIdentity(prospect));
    if (alreadySaved) {
      if (syncCRM && alreadySaved.id)
        await fetch("/api/crm/convert-prospect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospectId: alreadySaved.id }),
        });
      return alreadySaved;
    }
    const response = await fetch("/api/prospecting/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prospect),
    });
    const data = (await response.json()) as {
      prospect?: Prospect;
      duplicate?: boolean;
      error?: string;
    };
    if (!response.ok || !data.prospect)
      throw new Error(data.error || "Unable to save prospect.");
    setProspects((current) => {
      const without = current.filter((item) => item.id !== data.prospect?.id);
      return [data.prospect as Prospect, ...without];
    });
    if (syncCRM && data.prospect.id) {
      const crmResponse = await fetch("/api/crm/convert-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: data.prospect.id }),
      });
      const crmData = (await crmResponse.json()) as { error?: string };
      if (!crmResponse.ok)
        throw new Error(crmData.error || "Saved, but CRM import failed.");
      window.dispatchEvent(
        new CustomEvent("cyncro:data-changed", {
          detail: { entity: "contact", action: "imported" },
        }),
      );
    }
    if (!quiet)
      setMessage(
        data.duplicate
          ? "Duplicate prevented—existing prospect opened."
          : `${prospect.businessName} saved to Contacts and Pipeline.`,
      );
    return data.prospect;
  };

  const analyzeProspect = async (prospect: Prospect) => {
    const saved = prospect.id ? prospect : await saveProspect(prospect, true);
    const response = await fetch("/api/prospecting/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saved),
    });
    const analysis = (await response.json()) as Record<string, unknown> & {
      error?: string;
    };
    if (!response.ok)
      throw new Error(
        analysis.error || `Could not analyze ${prospect.businessName}.`,
      );
    const updateResponse = await fetch("/api/prospecting/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: saved.id, updates: analysis }),
    });
    const updateData = (await updateResponse.json()) as {
      prospect?: Prospect;
      error?: string;
    };
    if (!updateResponse.ok || !updateData.prospect)
      throw new Error(updateData.error || "Unable to save analysis.");
    return updateData.prospect;
  };

  const analyzeAll = async () => {
    setAnalyzing(true);
    setError("");
    setMessage("");
    setAnalysisProgress(0);
    try {
      const savedSearchResults: Prospect[] = [];
      for (const result of results)
        savedSearchResults.push(await saveProspect(result, true));
      const unique = new Map<string, Prospect>();
      [...prospects, ...savedSearchResults].forEach((item) =>
        unique.set(item.id || prospectIdentity(item), item),
      );
      const targets = [...unique.values()];
      for (let index = 0; index < targets.length; index += 4) {
        const batch = targets.slice(index, index + 4);
        const analyzed = await Promise.allSettled(batch.map(analyzeProspect));
        const successful = analyzed
          .filter(
            (item): item is PromiseFulfilledResult<Prospect> =>
              item.status === "fulfilled",
          )
          .map((item) => item.value);
        setProspects((current) => {
          const map = new Map(current.map((item) => [item.id, item]));
          successful.forEach((item) => map.set(item.id, item));
          return [...map.values()].sort(
            (a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1),
          );
        });
        setAnalysisProgress(Math.min(index + batch.length, targets.length));
      }
      const analyzedIds = targets
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));
      if (analyzedIds.length) {
        await fetch("/api/crm/convert-prospect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospectIds: analyzedIds }),
        });
        window.dispatchEvent(
          new CustomEvent("cyncro:data-changed", {
            detail: { entity: "contact", action: "analysis-synced" },
          }),
        );
      }
      await loadProspects();
      setMessage(
        `${targets.length} prospects analyzed and ranked. Highest opportunities moved to CALL FIRST.`,
      );
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Analyze All failed.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const updateProspect = async (
    prospect: Prospect,
    updates: Record<string, unknown>,
  ) => {
    if (!prospect.id) return;
    setError("");
    const response = await fetch("/api/prospecting/prospects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: prospect.id, updates }),
    });
    const data = (await response.json()) as {
      prospect?: Prospect;
      error?: string;
    };
    if (!response.ok || !data.prospect) {
      setError(data.error || "Update failed.");
      return;
    }
    setProspects((current) =>
      current
        .map((item) =>
          item.id === data.prospect?.id ? (data.prospect as Prospect) : item,
        )
        .sort(
          (a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1),
        ),
    );
    setSelected(data.prospect);
    setMessage(`${prospect.businessName} updated.`);
  };

  const convertToCRM = async (prospect: Prospect) => {
    if (!prospect.id) return;
    setError("");
    const response = await fetch("/api/crm/convert-prospect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospectId: prospect.id }),
    });
    const data = (await response.json()) as {
      accountId?: string;
      duplicate?: boolean;
      error?: string;
    };
    if (!response.ok || !data.accountId) {
      setError(data.error || "Unable to convert prospect to CRM.");
      return;
    }
    await loadProspects();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "contact", action: "converted" },
      }),
    );
    setMessage(
      data.duplicate
        ? `${prospect.businessName} is already connected to CRM.`
        : `${prospect.businessName} is now a CRM account with an opportunity.`,
    );
  };

  const deleteProspect = async (prospect: Prospect) => {
    if (
      !prospect.id ||
      !window.confirm(`Delete ${prospect.businessName} from Prospecting?`)
    )
      return;
    const response = await fetch(
      `/api/prospecting/prospects?id=${encodeURIComponent(prospect.id)}`,
      { method: "DELETE" },
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Prospect could not be deleted.");
      return;
    }
    setProspects((current) =>
      current.filter((item) => item.id !== prospect.id),
    );
    setSelected(null);
    setMessage(`${prospect.businessName} deleted from Prospecting.`);
  };

  const saveAllToCRM = async () => {
    if (!results.length) return;
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const saved: Prospect[] = [];
      for (const result of results)
        saved.push(await saveProspect(result, true, false));
      const prospectIds = saved
        .map((item) => item.id)
        .filter((id): id is string => Boolean(id));
      const response = await fetch("/api/crm/convert-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectIds }),
      });
      const data = (await response.json()) as {
        imported?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "CRM import failed.");
      await loadProspects();
      window.dispatchEvent(
        new CustomEvent("cyncro:data-changed", {
          detail: { entity: "contact", action: "bulk-imported" },
        }),
      );
      setMessage(
        `${data.imported || 0} businesses saved and imported into Contacts and Pipeline${data.failed ? ` · ${data.failed} need attention` : ""}.`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "CRM import failed.",
      );
    } finally {
      setImporting(false);
    }
  };

  const exportProspects = (records: Prospect[]) => {
    if (!records.length) {
      setError("There is no prospect data to export yet.");
      return;
    }
    const safeCell = (value: unknown) => {
      let output = Array.isArray(value)
        ? value.join(" | ")
        : String(value ?? "");
      if (/^[=+\-@]/.test(output)) output = `'${output}`;
      return `"${output.replace(/"/g, '""')}"`;
    };
    const headers = [
      "Business Name",
      "Category",
      "Address",
      "Phone",
      "Website",
      "Email",
      "Rating",
      "Review Count",
      "Self Reported Annual Revenue",
      "Estimated Annual Revenue Low",
      "Estimated Annual Revenue High",
      "Revenue Confidence",
      "Opportunity Score",
      "Priority",
      "Assigned Rep",
      "Status",
      "Why Call",
      "What We Found",
      "Recommended Solution",
      "Call Opener",
      "Next Action",
      "Notes",
    ];
    const rows = records.map((item) => [
      item.businessName,
      item.category,
      item.address,
      item.phone,
      item.website,
      item.emails || [],
      item.rating,
      item.reviewCount,
      item.selfReportedRevenue,
      item.estimatedRevenueLow,
      item.estimatedRevenueHigh,
      item.revenueConfidence,
      item.opportunityScore,
      item.rankLabel,
      item.assignedRep,
      item.status,
      item.whyCall,
      item.whatFound,
      item.recommendedSolution,
      item.callOpener,
      item.nextAction,
      item.notes,
    ]);
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(safeCell).join(",")).join("\r\n")}`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    link.download = `cyncro-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage(`${records.length} prospects exported for Excel.`);
  };

  return (
    <section className="prospectingShell">
      <aside className="prospectingSidebar">
        <div className="crmWorkspace">
          <span>CM</span>
          <div>
            <b>Cyncro Media</b>
            <small>Internal sales workspace</small>
          </div>
          <i>⌄</i>
        </div>
        <nav aria-label="Prospecting navigation">
          <small>CYNCRO PROSPECTING</small>
          <button className="active">
            <i>⌕</i>
            <span>Find Businesses</span>
            <em>Live</em>
          </button>
          <button
            onClick={() =>
              document
                .getElementById("call-first")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <i>⚡</i>
            <span>Call First</span>
            <em>{callFirst.length}</em>
          </button>
          <button
            onClick={() =>
              document
                .getElementById("prospect-database")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <i>▦</i>
            <span>Saved Prospects</span>
            <em>{prospects.length}</em>
          </button>
          <small>CONNECTED SYSTEMS</small>
          <button onClick={onOpenCRM}>
            <i>◎</i>
            <span>Cyncro CRM</span>
            <em>Open</em>
          </button>
        </nav>
        <div className="prospectingEngine">
          <span>✦</span>
          <div>
            <small>OPPORTUNITY ENGINE</small>
            <b>Score · Rank · Route</b>
          </div>
        </div>
        <div className="crmUser">
          <span>YL</span>
          <div>
            <b>Account Owner</b>
            <small>Founder · Admin</small>
          </div>
          <i>•••</i>
        </div>
      </aside>

      <main className="prospectingMain">
        <header className="prospectingTopbar">
          <div>
            <small>INTERNAL SALES INTELLIGENCE</small>
            <b>Search → Save → Score → Rank → Assign → Call</b>
          </div>
          <button onClick={onOpenCRM}>Open CRM →</button>
        </header>
        <div className="prospectingContent">
          <div className="prospectingHead">
            <div>
              <label>CYNCRO PROSPECTING</label>
              <h1>Find the businesses worth calling first.</h1>
              <p>
                Real business data. Observable website signals. One ranked sales
                queue.
              </p>
            </div>
            <div className="prospectingStats">
              <span>
                <b>{prospects.length}</b>
                <small>SAVED</small>
              </span>
              <span>
                <b>{ranked.filter((x) => x.opportunityScore != null).length}</b>
                <small>SCORED</small>
              </span>
              <span>
                <b>{callFirst.length}</b>
                <small>HOT NOW</small>
              </span>
            </div>
          </div>

          <section className="prospectingSearchPanel">
            <div className="prospectingSectionHead">
              <div>
                <small>REAL BUSINESS SEARCH</small>
                <h2>Build today&apos;s call list</h2>
              </div>
              <span>LIVE BUSINESS SEARCH</span>
            </div>
            <div className="prospectingSearchGrid">
              <label>
                Business type / keyword
                <input
                  value={form.keyword}
                  onChange={(event) => setField("keyword", event.target.value)}
                  placeholder="Med spas"
                />
              </label>
              <label>
                City
                <input
                  value={form.city}
                  onChange={(event) => setField("city", event.target.value)}
                  placeholder="Miami"
                />
              </label>
              <label>
                State
                <input
                  value={form.state}
                  onChange={(event) => setField("state", event.target.value)}
                  placeholder="FL"
                />
              </label>
              <label>
                ZIP <em>OPTIONAL</em>
                <input
                  value={form.zip}
                  onChange={(event) => setField("zip", event.target.value)}
                  placeholder="33101"
                />
              </label>
              <label>
                Radius <em>OPTIONAL</em>
                <select
                  value={form.radius}
                  onChange={(event) => setField("radius", event.target.value)}
                >
                  <option value="">Any</option>
                  <option value="5">5 miles</option>
                  <option value="10">10 miles</option>
                  <option value="25">25 miles</option>
                  <option value="50">50 miles</option>
                </select>
              </label>
              <label>
                Maximum results
                <select
                  value={form.maximum}
                  onChange={(event) => setField("maximum", event.target.value)}
                >
                  <option>10</option>
                  <option>20</option>
                  <option>40</option>
                  <option>60</option>
                </select>
              </label>
            </div>
            <div className="prospectingSearchActions">
              <button
                className="findBusinesses"
                onClick={search}
                disabled={searching}
              >
                {searching ? "SEARCHING LIVE SOURCES…" : "FIND BUSINESSES"}{" "}
                <span>↗</span>
              </button>
              {results.length > 0 && (
                <button
                  className="analyzeAll"
                  onClick={analyzeAll}
                  disabled={analyzing}
                >
                  {analyzing
                    ? `ANALYZING ${analysisProgress}/${Math.max(results.length, prospects.length)}…`
                    : "✦ SCRAPE + ANALYZE ALL"}
                </button>
              )}
              {results.length > 0 && (
                <button
                  className="analyzeAll"
                  onClick={saveAllToCRM}
                  disabled={importing || analyzing}
                >
                  {importing
                    ? "SAVING + IMPORTING…"
                    : "SAVE ALL + IMPORT TO CRM"}
                </button>
              )}
              {(results.length > 0 || prospects.length > 0) && (
                <button
                  className="analyzeAll"
                  onClick={() =>
                    exportProspects(results.length ? results : prospects)
                  }
                >
                  EXPORT CSV
                </button>
              )}
              <p>
                Public business websites only · Contacts, decision-makers,
                conversion signals, scoring, and CRM sync
              </p>
            </div>
            {error && <div className="prospectingAlert error">! {error}</div>}
            {message && (
              <div className="prospectingAlert success">✓ {message}</div>
            )}
          </section>

          <section className="callFirstSection" id="call-first">
            <div className="prospectingSectionHead">
              <div>
                <small>PRIORITY QUEUE</small>
                <h2>Call First</h2>
              </div>
              <span>AUTO-RANKED BY OPPORTUNITY</span>
            </div>
            {callFirst.length ? (
              <div className="callFirstGrid">
                {callFirst.map((prospect, index) => (
                  <article
                    key={prospect.id}
                    className={index === 0 ? "lead" : ""}
                  >
                    <div className="priorityScore">
                      <b>{prospect.opportunityScore}</b>
                      <span>{prospect.rankLabel}</span>
                    </div>
                    <small>{prospect.category}</small>
                    <h3>{prospect.businessName}</h3>
                    <p>
                      {prospect.reviewCount.toLocaleString()} public reviews ·{" "}
                      {prospect.rating
                        ? `${prospect.rating.toFixed(1)}★`
                        : "No rating"}
                    </p>
                    <strong>
                      {prospect.whatFound || prospect.reasons?.[0]}
                    </strong>
                    <em>RECOMMENDED</em>
                    <b className="recommended">
                      {prospect.recommendedSolution}
                    </b>
                    <div>
                      <button onClick={() => setSelected(prospect)}>
                        Open brief
                      </button>
                      {prospect.phone ? (
                        <a href={`tel:${prospect.phone}`}>CALL NOW ↗</a>
                      ) : (
                        <button disabled>No phone</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="emptyQueue">
                <span>⚡</span>
                <div>
                  <b>Your highest-scoring prospects will appear here.</b>
                  <p>Search businesses, then run Scrape + Analyze All.</p>
                </div>
              </div>
            )}
          </section>

          {results.length > 0 && (
            <section className="searchResultsSection">
              <div className="prospectingSectionHead">
                <div>
                  <small>SEARCH RESULTS</small>
                  <h2>{results.length} real businesses</h2>
                </div>
                <span>LIVE RESULTS</span>
              </div>
              <div className="prospectTable">
                <div className="prospectTableHead">
                  <span>BUSINESS</span>
                  <span>CONTACT</span>
                  <span>REPUTATION</span>
                  <span>ACTION</span>
                </div>
                {results.map((result) => {
                  const saved = savedByIdentity.get(prospectIdentity(result));
                  return (
                    <div
                      className="prospectResultRow"
                      key={prospectIdentity(result)}
                    >
                      <div>
                        <span>
                          {result.businessName.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <b>{result.businessName}</b>
                          <small>
                            {result.category} · {result.address}
                          </small>
                        </div>
                      </div>
                      <div>
                        <b>{result.phone || "Phone unavailable"}</b>
                        {result.website ? (
                          <a
                            href={result.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Website ↗
                          </a>
                        ) : (
                          <small>No website</small>
                        )}
                      </div>
                      <div>
                        <b>
                          {result.rating
                            ? `${result.rating.toFixed(1)} ★`
                            : "—"}
                        </b>
                        <small>
                          {result.reviewCount.toLocaleString()} reviews
                        </small>
                      </div>
                      <div>
                        {saved ? (
                          <button
                            className="saved"
                            onClick={() => setSelected(saved)}
                          >
                            ✓ SAVED · OPEN
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              void saveProspect(result).catch((saveError) =>
                                setError(saveError.message),
                              )
                            }
                          >
                            SAVE PROSPECT
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="prospectDatabase" id="prospect-database">
            <div className="prospectingSectionHead">
              <div>
                <small>SALES DATABASE</small>
                <h2>Ranked prospects</h2>
              </div>
              <button
                onClick={analyzeAll}
                disabled={analyzing || (!results.length && !prospects.length)}
              >
                ✦ SCRAPE + ANALYZE ALL
              </button>
              <button
                onClick={() => exportProspects(ranked)}
                disabled={!ranked.length}
              >
                EXPORT SAVED CSV
              </button>
            </div>
            <div className="rankedProspectList">
              <div className="rankedProspectHead">
                <span>SCORE</span>
                <span>BUSINESS</span>
                <span>REP</span>
                <span>STATUS</span>
                <span>NEXT MOVE</span>
              </div>
              {ranked.map((prospect) => (
                <button
                  key={prospect.id}
                  onClick={() => setSelected(prospect)}
                  className={selected?.id === prospect.id ? "active" : ""}
                >
                  <span
                    className={`rankScore ${prospect.opportunityScore && prospect.opportunityScore >= 90 ? "first" : ""}`}
                  >
                    {prospect.opportunityScore ?? "—"}
                    <small>{prospect.rankLabel || "NOT ANALYZED"}</small>
                  </span>
                  <span>
                    <b>{prospect.businessName}</b>
                    <small>
                      {prospect.category} ·{" "}
                      {prospect.reviewCount.toLocaleString()} reviews
                    </small>
                  </span>
                  <span>{prospect.assignedRep || "Unassigned"}</span>
                  <span>
                    <i>{prospect.status || "NEW"}</i>
                  </span>
                  <span>
                    {prospect.nextAction || "Analyze to generate next action"}
                    <em>→</em>
                  </span>
                </button>
              ))}
              {!ranked.length && (
                <div className="noProspects">No prospects saved yet.</div>
              )}
            </div>
          </section>
          <p className="prospectingAttribution">
            Data attribution: © OpenStreetMap contributors
          </p>
        </div>
      </main>

      {selected && (
        <div className="prospectDrawerBack" onClick={() => setSelected(null)}>
          <aside
            className="prospectDrawer"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <small>PROSPECT INTELLIGENCE</small>
                <h2>{selected.businessName}</h2>
                <p>
                  {selected.category} · {selected.address}
                </p>
              </div>
              <button onClick={() => setSelected(null)}>×</button>
            </header>
            <div className="drawerScore">
              <div>
                <b>{selected.opportunityScore ?? "—"}</b>
                <span>CYNCRO OPPORTUNITY SCORE</span>
              </div>
              <strong>{selected.rankLabel || "NOT ANALYZED"}</strong>
            </div>
            <div className="prospectRevenueCard">
              <section>
                <small>SELF-REPORTED ANNUAL REVENUE</small>
                <b>
                  {selected.selfReportedRevenue
                    ? `$${selected.selfReportedRevenue.toLocaleString()}`
                    : "Not provided"}
                </b>
                <span>Entered by your team or confirmed by the business</span>
              </section>
              <section>
                <small>ESTIMATED ANNUAL REVENUE</small>
                <b>
                  {selected.estimatedRevenueLow != null &&
                  selected.estimatedRevenueHigh != null
                    ? `$${selected.estimatedRevenueLow.toLocaleString()}–$${selected.estimatedRevenueHigh.toLocaleString()}`
                    : "Not estimated"}
                </b>
                <span>
                  {selected.revenueConfidence || "LOW"} confidence ·
                  Directional, not verified
                </span>
              </section>
              <p>
                {selected.revenueMethodology ||
                  "Estimate uses public business signals and industry benchmark bands."}
              </p>
            </div>
            {!selected.opportunityScore && (
              <button
                className="drawerAnalyze"
                onClick={() =>
                  void analyzeProspect(selected)
                    .then((item) => {
                      setSelected(item);
                      void loadProspects();
                    })
                    .catch((analysisError) => setError(analysisError.message))
                }
              >
                ✦ SCRAPE WEBSITE + ANALYZE
              </button>
            )}
            <div className="drawerContact">
              <a
                className={selected.phone ? "primary" : "disabled"}
                href={selected.phone ? `tel:${selected.phone}` : undefined}
              >
                ☎ {selected.phone || "NO PHONE"}
              </a>
              {selected.website && (
                <a href={selected.website} target="_blank" rel="noreferrer">
                  WEBSITE ↗
                </a>
              )}
            </div>
            {selected.emails?.length || selected.extractedPhones?.length ? (
              <div className="drawerBrief">
                <section>
                  <small>PUBLIC CONTACTS EXTRACTED</small>
                  {selected.emails?.map((email) => (
                    <p key={email}>
                      <a href={`mailto:${email}`}>{email}</a>
                    </p>
                  ))}
                  {selected.extractedPhones?.map((phone) => (
                    <p key={phone}>
                      <a href={`tel:${phone}`}>{phone}</a>
                    </p>
                  ))}
                </section>
                <section>
                  <small>VERIFICATION</small>
                  <p>
                    Public website extraction · source retained ·{" "}
                    {selected.lastExtractedAt
                      ? "recently checked"
                      : "not checked"}
                  </p>
                </section>
              </div>
            ) : null}
            <div className="drawerBrief">
              {[
                ["WHY CALL THEM", selected.whyCall],
                ["WHAT WE FOUND", selected.whatFound],
                ["RECOMMENDED CYNCRO SOLUTION", selected.recommendedSolution],
                ["CALL OPENER", selected.callOpener],
                ["NEXT ACTION", selected.nextAction],
              ].map(([label, value]) => (
                <section key={label}>
                  <small>{label}</small>
                  <p>{value || "Run analysis to generate this sales brief."}</p>
                </section>
              ))}
            </div>
            {selected.signals && (
              <div className="signalGrid">
                {Object.entries({
                  "Website exists": selected.signals.websiteExists,
                  Booking: selected.signals.booking,
                  "Contact form": selected.signals.contactForm,
                  Chat: selected.signals.chat,
                  SMS: selected.signals.sms,
                  "Strong CTA": selected.signals.strongCta,
                  Facebook: selected.signals.facebook,
                  Instagram: selected.signals.instagram,
                }).map(([label, present]) => (
                  <span key={label} className={present ? "present" : "missing"}>
                    <i>{present ? "✓" : "×"}</i>
                    {label}
                  </span>
                ))}
              </div>
            )}
            {selected.reasons && selected.reasons.length > 0 && (
              <div className="scoreReasons">
                <small>WHY THIS SCORE</small>
                {selected.reasons.map((reason) => (
                  <p key={reason}>• {reason}</p>
                ))}
              </div>
            )}
            <div className="drawerManagement">
              <button
                className="drawerAnalyze"
                onClick={() => void convertToCRM(selected)}
              >
                CONVERT TO CRM ACCOUNT + OPPORTUNITY →
              </button>
              <label>
                Self-reported annual revenue
                <input
                  type="number"
                  min="0"
                  value={selected.selfReportedRevenue || ""}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      selfReportedRevenue: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  placeholder="Example: 1500000"
                />
              </label>
              <label>
                Assigned rep
                <input
                  value={selected.assignedRep || ""}
                  onChange={(event) =>
                    setSelected({
                      ...selected,
                      assignedRep: event.target.value,
                    })
                  }
                  placeholder="Enter salesperson name"
                />
              </label>
              <label>
                Status
                <select
                  value={selected.status || "NEW"}
                  onChange={(event) => {
                    const updated = { ...selected, status: event.target.value };
                    setSelected(updated);
                    void updateProspect(updated, {
                      status: event.target.value,
                    });
                  }}
                >
                  {prospectStatuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Notes
                <textarea
                  value={selected.notes || ""}
                  onChange={(event) =>
                    setSelected({ ...selected, notes: event.target.value })
                  }
                  placeholder="Call notes, objections, follow-up context…"
                />
              </label>
              <button
                onClick={() =>
                  void updateProspect(selected, {
                    assignedRep: selected.assignedRep || "",
                    selfReportedRevenue: selected.selfReportedRevenue || 0,
                    notes: selected.notes || "",
                    status:
                      selected.assignedRep && selected.status === "NEW"
                        ? "ASSIGNED"
                        : selected.status,
                  })
                }
              >
                SAVE ASSIGNMENT + NOTES
              </button>
              <button
                className="prospectDelete"
                onClick={() => void deleteProspect(selected)}
              >
                DELETE PROSPECT
              </button>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

type CRMView =
  | "Overview"
  | "Pipeline"
  | "Accounts"
  | "Contacts"
  | "Calendar"
  | "Conversations"
  | "Social Automations"
  | "Journeys"
  | "Automations"
  | "Data Graph"
  | "Agent Team"
  | "Team Access"
  | "Integrations"
  | "Compensation"
  | "Invoices"
  | "Contracts"
  | "Forms"
  | "Sales Playbooks"
  | "Attribution"
  | "Cyncro Work"
  | "Intelligence";

type CRMContactCard = {
  id?: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  value: string;
  stage: string;
  source: string;
  intent: number;
  last: string;
  notes: string;
  address: string;
  website: string;
};

function UniversalCRM({
  onOpenCalendar,
  onOpenProspecting,
  isOwner,
}: {
  onOpenCalendar: () => void;
  onOpenProspecting: () => void;
  isOwner: boolean;
}) {
  const [view, setView] = useState<CRMView>("Overview"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    [creating, setCreating] = useState(false),
    [importing, setImporting] = useState(false),
    [importRows, setImportRows] = useState<Record<string,string>[]>([]),
    [importFileName, setImportFileName] = useState(""),
    [aiOpen, setAiOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [crmUserName, setCrmUserName] = useState("Account Owner"),
    [currentAccess,setCurrentAccess]=useState<Record<string,unknown>>({role:"OWNER",manage_users:1,can_create:1,can_edit:1,can_delete:1,can_export:1,compensation_access:1,invoice_access:1,contract_access:1,attribution_access:1,work_access:1}),
    [liveContacts, setLiveContacts] = useState<CRMContactCard[]>([]),
    [crmSummary, setCrmSummary] = useState<Record<string, number>>({}),
    [recentActivity, setRecentActivity] = useState<Record<string, unknown>[]>(
      [],
    ),
    [contactsLoaded, setContactsLoaded] = useState(false),
    [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set()),
    [contactRecordOpen,setContactRecordOpen]=useState(false),
    [contactForm, setContactForm] = useState({
      fullName: "",
      company: "",
      email: "",
      phone: "",
      source: "Manual",
      lifecycle: "Lead",
    });
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const openCRMCalendar = () => setView("Calendar");
  const openNewAppointment = () => {
    setView("Calendar");
    window.setTimeout(
      () => window.dispatchEvent(new Event("cyncro:open-new-appointment")),
      80,
    );
  };
  useEffect(() => {
    const saved = window.localStorage.getItem("cyncro-crm-user-name");
    if (saved) setCrmUserName(saved);
    void fetch("/api/access").then(r=>r.ok?r.json():null).then(data=>data?.member&&setCurrentAccess(data.member));
  }, []);
  const saveCRMUserName = (name: string) => {
    const value = name.trim() || "Team Member";
    setCrmUserName(value);
    window.localStorage.setItem("cyncro-crm-user-name", value);
    flash(`Signed in as ${value}`);
  };
  const loadCRMContacts = async () => {
    try {
      const response = await fetch(`/api/crm/contacts?fresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        contacts?: Record<string, unknown>[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || "Unable to load contacts.");
      setLiveContacts(
        (data.contacts || []).map((item) => ({
          id: String(item.id || ""),
          name: String(item.full_name || "Unnamed contact"),
          company: String(item.company_name || "No account"),
          email: String(item.email || "No email"),
          phone: String(item.phone || "No phone"),
          value: new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(Number(item.opportunity_value_cents || 0) / 100),
          stage: String(item.opportunity_stage || item.lifecycle || "Lead"),
          source: String(item.source || "Manual"),
          intent: 50,
          last: "CRM record updated",
          notes: String(item.notes || ""),
          address: String(item.company_address || "No address"),
          website: String(item.company_domain || "No website"),
        })),
      );
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Unable to load contacts.",
      );
    } finally {
      setContactsLoaded(true);
    }
  };
  const loadCRMOverview = async () => {
    const [statsResponse, activityResponse] = await Promise.all([
      fetch("/api/crm/stats"),
      fetch("/api/crm/activities?limit=20"),
    ]);
    if (statsResponse.ok) {
      const data = (await statsResponse.json()) as {
        summary?: Record<string, number>;
      };
      setCrmSummary(data.summary || {});
    }
    if (activityResponse.ok) {
      const data = (await activityResponse.json()) as {
        activities?: Record<string, unknown>[];
      };
      setRecentActivity(data.activities || []);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void loadCRMContacts(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadCRMOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [view]);
  useEffect(() => {
    const refresh = () => {
      void loadCRMContacts();
      void loadCRMOverview();
    };
    window.addEventListener("cyncro:data-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("cyncro:data-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const filteredContacts = liveContacts.filter((contact) =>
    `${contact.name} ${contact.company} ${contact.email}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const contact = liveContacts[selected];
  const toggleContact = (id: string) => setSelectedContactIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exportContacts = () => {
    const chosen = selectedContactIds.size
      ? liveContacts.filter((item) => item.id && selectedContactIds.has(item.id))
      : filteredContacts;
    const rows = [["Contact","Business","Address","Website","Phone","Email","Source"], ...chosen.map((item) => [item.name,item.company,item.address,item.website,item.phone,item.email,item.source])];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `cyncro-contacts-${new Date().toISOString().slice(0,10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
    flash(`${chosen.length} contacts downloaded`);
  };
  const deleteContactFromList = async (item: CRMContactCard) => {
    if (!item.id || !window.confirm(`Delete ${item.name}?`)) return;
    const response = await fetch(`/api/crm/contacts?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    if (!response.ok) return flash("Contact could not be deleted");
    setSelectedContactIds((current) => { const next = new Set(current); next.delete(item.id!); return next; });
    await Promise.all([loadCRMContacts(), loadCRMOverview()]);
    flash("Contact deleted");
  };
  const createContact = async () => {
    const response = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      flash(data.error || "Contact could not be created");
      return;
    }
    setCreating(false);
    setSelected(0);
    setContactForm({
      fullName: "",
      company: "",
      email: "",
      phone: "",
      source: "Manual",
      lifecycle: "Lead",
    });
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "record", action: "created" },
      }),
    );
    await Promise.all([loadCRMContacts(), loadCRMOverview()]);
    setContactRecordOpen(true);
    flash("Contact, account, and pipeline lead created");
  };
  const readLeadFile = async (file: File) => {
    const text=await file.text(), lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
    if(lines.length<2)return flash("CSV needs a header and at least one lead");
    const parse=(line:string)=>{const cells:string[]=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'&&line[i+1]==='"'){value+='"';i++}else if(char==='"')quoted=!quoted;else if(char===","&&!quoted){cells.push(value.trim());value=""}else value+=char}cells.push(value.trim());return cells};
    const headers=parse(lines[0]).map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,""));
    const aliases:Record<string,string[]>={fullName:["fullname","name","contactname"],firstName:["firstname","first"],lastName:["lastname","last"],email:["email","emailaddress"],phone:["phone","phonenumber","mobile"],company:["company","companyname","business","businessname","accountname"],address:["address","streetaddress","companyaddress"],website:["website","domain","url"],source:["source","leadsource"],title:["title","jobtitle"],notes:["notes","note"]};
    const rows=lines.slice(1,1001).map(line=>{const cells=parse(line),row:Record<string,string>={};for(const [key,names] of Object.entries(aliases)){const index=headers.findIndex(h=>names.includes(h));if(index>=0)row[key]=cells[index]||""}return row}).filter(row=>row.fullName||row.firstName||row.email||row.phone);
    setImportRows(rows);setImportFileName(file.name);flash(`${rows.length} leads ready to review`);
  };
  const importLeads=async()=>{const response=await fetch("/api/crm/contacts/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:importRows,source:"CSV_IMPORT",assignedRep:crmUserName})});const data=await response.json() as {error?:string;imported?:number;duplicates?:number;invalid?:number};if(!response.ok)return flash(data.error||"Import failed");setImporting(false);setImportRows([]);await Promise.all([loadCRMContacts(),loadCRMOverview()]);flash(`${data.imported||0} imported · ${data.duplicates||0} duplicates skipped · ${data.invalid||0} invalid`)};
  const completeActivity = async (id: string) => {
    const response = await fetch("/api/crm/activities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "COMPLETED" }),
    });
    if (!response.ok) {
      flash("Task could not be completed");
      return;
    }
    await loadCRMOverview();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "activity", action: "completed" },
      }),
    );
    flash("Task completed everywhere");
  };
  const allViews: { name: CRMView; icon: string; count?: string; permission?:string }[] = [
    { name: "Overview", icon: "⌂" },
    {
      name: "Pipeline",
      icon: "◫",
      count: String(crmSummary.opportunities || 0),
    },
    { name: "Accounts", icon: "▦", count: String(crmSummary.accounts || 0) },
    { name: "Contacts", icon: "◎", count: String(crmSummary.contacts || 0) },
    { name: "Calendar", icon: "□", count: "Live" },
    { name: "Conversations", icon: "◇" },
    { name: "Social Automations", icon: "" },
    { name: "Journeys", icon: "↝" },
    { name: "Automations", icon: "⌁" },
    { name: "Data Graph", icon: "⌘" },
    { name: "Agent Team", icon: "✧", count: "5" },
    { name: "Team Access", icon: "♙", permission:"manage_users" },
    { name: "Compensation", icon: "%", permission:"compensation_access" },
    { name: "Invoices", icon: "$", permission:"invoice_access" },
    { name: "Contracts", icon: "✎", permission:"contract_access" },
    { name: "Forms", icon: "▤", count: "Build" },
    { name: "Sales Playbooks", icon: "◉", count: "Live" },
    { name: "Attribution", icon: "⌁", count: "Live", permission:"attribution_access" },
    { name: "Cyncro Work", icon: "✓", count: "Team", permission:"work_access" },
    { name: "Integrations", icon: "＋", count: "Connect" },
    { name: "Intelligence", icon: "✦" },
  ];
  const views=allViews.filter(item=>!item.permission||currentAccess.role==="OWNER"||Boolean(currentAccess[item.permission]));
  return (
    <section className="crmShell">
      {notice && <div className="crmToast">✓ {notice}</div>}
      <aside className="crmSidebar">
        <div className="crmWorkspace">
          <span>CM</span>
          <div>
            <b>Cyncro Media</b>
            <small>Universal workspace</small>
          </div>
          <i>⌄</i>
        </div>
        <nav className="crmNav" aria-label="CRM navigation">
          <small>CYNCRO CRM · REVENUE OS</small>
          {views.map((item) => (
            <button
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
              key={item.name}
            >
              <i>{item.icon}</i>
              <span>{item.name}</span>
              {item.count && <em>{item.count}</em>}
            </button>
          ))}
          <small>CONNECTED SYSTEMS</small>
          <button onClick={onOpenProspecting}>
            <i>⌕</i>
            <span>Prospecting</span>
            <em className="liveDot">New</em>
          </button>
          <button onClick={openCRMCalendar}>
            <i>□</i>
            <span>Calendar</span>
            <em className="liveDot">Live</em>
          </button>
          <button onClick={() => flash("Payments opened")}>
            <i>◇</i>
            <span>Payments</span>
            <em>$12.9K</em>
          </button>
          <button onClick={() => setView("Attribution")}>
            <i>⌁</i>
            <span>Attribution</span>
          </button>
        </nav>
        <button className="crmAgent" onClick={() => setAiOpen(true)}>
          <span>✦</span>
          <div>
            <small>CYNCRO INTELLIGENCE</small>
            <b>Ask your business</b>
          </div>
          <i>↗</i>
        </button>
        <div className="crmUser">
          <span>
            {crmUserName
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <input
              aria-label="Your CRM display name"
              value={crmUserName}
              onChange={(event) => setCrmUserName(event.target.value)}
              onBlur={(event) => saveCRMUserName(event.target.value)}
            />
            <small>Your CRM name · editable</small>
          </div>
          <i>•••</i>
        </div>
      </aside>

      <main className="crmMain">
        <header className="crmTopbar">
          <div className="universalSearch">
            <button type="button" aria-label="Search CRM" onClick={() => query.trim() ? setView("Contacts") : flash("Type a name, company, email, phone, or deal")}>⌕</button>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && query.trim()) setView("Contacts"); }}
              placeholder="Search any contact, company, deal, message, or booking…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="crmIconButton"
            onClick={() => flash("No new alerts")}
          >
            ◌<i />
          </button>
          <button onClick={openNewAppointment}>＋ New appointment</button>
          <button className="crmCreate" onClick={() => setCreating(true)}>
            ＋ New contact
          </button>
        </header>

        <div className="crmContent">
          <div className="crmPageHead">
            <div>
              <label>CYNCRO CRM</label>
              <h1>{view === "Overview" ? "Good afternoon." : view}</h1>
              <p>
                {view === "Overview"
                  ? "Every customer signal, opportunity, and next move—organized in real time."
                  : `Manage ${view.toLowerCase()} from one connected customer record.`}
              </p>
            </div>
            <div className="crmDate">
              <small>LIVE WORKSPACE</small>
              <b>
                {new Date().toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </b>
              <span>● Data synced across workspace</span>
            </div>
          </div>

          {view === "Overview" && (
            <>
              <div className="crmMetrics">
                {[
                  [
                    "OPEN PIPELINE",
                    new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(Number(crmSummary.pipeline_cents || 0) / 100),
                    "LIVE",
                    `Across ${crmSummary.opportunities || 0} opportunities`,
                  ],
                  [
                    "CLOSED WON",
                    new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 0,
                    }).format(Number(crmSummary.won_cents || 0) / 100),
                    "LIVE",
                    "Recorded revenue",
                  ],
                  [
                    "ACTIVE CONTACTS",
                    String(crmSummary.contacts || 0),
                    "LIVE",
                    "Database contacts",
                  ],
                  [
                    "ACCOUNTS",
                    String(crmSummary.accounts || 0),
                    "LIVE",
                    "Active CRM records",
                  ],
                ].map((metric) => (
                  <article key={metric[0]}>
                    <small>{metric[0]}</small>
                    <div>
                      <b>{metric[1]}</b>
                      <span>{metric[2]}</span>
                    </div>
                    <p>{metric[3]}</p>
                  </article>
                ))}
              </div>
              <div className="crmOverviewGrid">
                <article className="crmPanel crmForecast">
                  <div className="crmPanelHead">
                    <div>
                      <small>REVENUE INTELLIGENCE</small>
                      <h2>Pipeline momentum</h2>
                    </div>
                    <button onClick={() => setView("Pipeline")}>
                      View pipeline →
                    </button>
                  </div>
                  <div className="forecastHero">
                    <div>
                      <small>FORECASTED TO CLOSE</small>
                      <b>$48,250</b>
                      <span>64.3% of open pipeline</span>
                    </div>
                    <div className="forecastRing">
                      <b>78</b>
                      <small>HEALTH</small>
                    </div>
                  </div>
                  <div className="forecastBars">
                    {[
                      ["New", 28, "$8K"],
                      ["Qualified", 47, "$15K"],
                      ["Proposal", 72, "$20K"],
                      ["Negotiation", 90, "$32K"],
                    ].map((item) => (
                      <div key={item[0]}>
                        <span>{item[0]}</span>
                        <i>
                          <b style={{ width: `${item[1]}%` }} />
                        </i>
                        <em>{item[2]}</em>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="crmPanel aiBrief">
                  <div className="aiBriefHead">
                    <span>✦</span>
                    <div>
                      <small>CYNCRO INTELLIGENCE</small>
                      <h2>Your daily brief</h2>
                    </div>
                    <i>LIVE</i>
                  </div>
                  <p>Three actions are most likely to create revenue today.</p>
                  {[
                    [
                      "01",
                      "Follow up with Daniel Kim",
                      "Payment intent increased after opening the proposal twice.",
                      "$32K",
                    ],
                    [
                      "02",
                      "Protect Alexandra’s momentum",
                      "Her strategy session is tomorrow; send the executive brief.",
                      "$18.5K",
                    ],
                    [
                      "03",
                      "Move Marcus to proposal",
                      "All qualification criteria are complete.",
                      "$12K",
                    ],
                  ].map((item) => (
                    <button
                      onClick={() => flash(`${item[1]} queued`)}
                      key={item[0]}
                    >
                      <span>{item[0]}</span>
                      <div>
                        <b>{item[1]}</b>
                        <small>{item[2]}</small>
                      </div>
                      <em>{item[3]}</em>
                    </button>
                  ))}
                  <button className="askAi" onClick={() => setAiOpen(true)}>
                    Ask Cyncro anything <span>↗</span>
                  </button>
                </article>
                <article className="crmPanel crmActivity">
                  <div className="crmPanelHead">
                    <div>
                      <small>LIVE CUSTOMER SIGNALS</small>
                      <h2>What just happened</h2>
                    </div>
                    <button onClick={() => setView("Conversations")}>
                      All activity →
                    </button>
                  </div>
                  {!recentActivity.length && (
                    <div className="noProspects">No customer activity yet.</div>
                  )}
                  {recentActivity
                    .filter((item) => item.activity_type !== "TASK")
                    .slice(0, 4)
                    .map((item) => (
                      <div className="activityRow" key={String(item.id)}>
                        <i>{String(item.activity_type || "•").slice(0, 2)}</i>
                        <div>
                          <b>{String(item.title || "Customer activity")}</b>
                          <small>
                            {String(item.contact_name || "Contact")} ·{" "}
                            {new Date(String(item.created_at)).toLocaleString()}
                          </small>
                        </div>
                        <span>{String(item.status || "COMPLETED")}</span>
                      </div>
                    ))}
                </article>
                <article className="crmPanel crmAgenda">
                  <div className="crmPanelHead">
                    <div>
                      <small>CALENDAR + TASKS</small>
                      <h2>Next on your desk</h2>
                    </div>
                  <button onClick={openCRMCalendar}>Open calendar →</button>
                  </div>
                  {!recentActivity.some(
                    (item) =>
                      item.activity_type === "TASK" &&
                      item.status !== "COMPLETED",
                  ) && <div className="noProspects">No open tasks.</div>}
                  {recentActivity
                    .filter(
                      (item) =>
                        item.activity_type === "TASK" &&
                        item.status !== "COMPLETED",
                    )
                    .slice(0, 4)
                    .map((item) => (
                      <div className="agendaRow" key={String(item.id)}>
                        <time>
                          {item.due_at
                            ? new Date(String(item.due_at)).toLocaleTimeString(
                                [],
                                { hour: "numeric", minute: "2-digit" },
                              )
                            : "OPEN"}
                        </time>
                        <i />
                        <div>
                          <b>{String(item.title)}</b>
                          <small>
                            {String(item.contact_name || "Contact")} · Task
                          </small>
                        </div>
                        <button
                          onClick={() => void completeActivity(String(item.id))}
                        >
                          Complete
                        </button>
                      </div>
                    ))}
                </article>
                <article className="crmPanel crmLaunchpad">
                  <div className="crmPanelHead"><div><small>REVENUE TRUTH</small><h2>Cyncro Attribution</h2></div><button onClick={() => setView("Attribution")}>Open attribution →</button></div>
                  <p>Connect every click, call, form, booking, invoice, and payment to the revenue it created.</p>
                  <div><span>FIRST-PARTY TRACKING</span><span>MULTI-TOUCH ROAS</span><span>OFFLINE CONVERSIONS</span></div>
                </article>
                <article className="crmPanel crmLaunchpad">
                  <div className="crmPanelHead"><div><small>TEAM EXECUTION</small><h2>Cyncro Work</h2></div><button onClick={() => setView("Cyncro Work")}>Open workboard →</button></div>
                  <p>Individual rep queues, shared boards, ownership, deadlines, dependencies, and manager workload in one place.</p>
                  <div><span>CLAIMABLE WORK</span><span>REP QUEUES</span><span>TEAM CAPACITY</span></div>
                </article>
              </div>
            </>
          )}

          {view === "Pipeline" && (
            <CRMPipeline onFlash={flash} isOwner={isOwner} />
          )}
          {view === "Accounts" && (
            <CRMAccounts
              onFlash={flash}
              currentUserName={crmUserName}
              isOwner={isOwner}
            />
          )}
          {view === "Contacts" && (
            <div className="contactWorkspace contactWorkspaceFull">
              <div className="contactList crmPanel contactDirectory">
                <div className="listToolbar">
                  <span>{filteredContacts.length} contacts · {selectedContactIds.size} selected</span>
                  <div>
                    {(currentAccess.role==="OWNER"||Boolean(currentAccess.can_export))&&<button onClick={exportContacts}>↓ Download {selectedContactIds.size ? "selected" : "all"}</button>}
                    {(currentAccess.role==="OWNER"||Boolean(currentAccess.can_create))&&<button onClick={() => setImporting(true)}>↑ Import leads</button>}
                    <button
                      onClick={() =>
                        void Promise.all([loadCRMContacts(), loadCRMOverview()])
                      }
                    >
                      ↻ Refresh data
                    </button>
                    {(currentAccess.role==="OWNER"||Boolean(currentAccess.can_create))&&<button
                      className="crmCreate"
                      onClick={() => setCreating(true)}
                    >
                      ＋ Add contact
                    </button>}
                  </div>
                </div>
                <div className="contactTableHead">
                  <span>SELECT</span>
                  <span>CONTACT</span>
                  <span>BUSINESS</span>
                  <span>ADDRESS</span>
                  <span>WEBSITE</span>
                  <span>PHONE</span>
                  <span>EMAIL</span>
                  <span>SOURCE</span>
                  <span>ACTION</span>
                </div>
                {filteredContacts.map((item) => {
                  const originalIndex = liveContacts.indexOf(item);
                  return (
                    <div
                      className={`contactRow ${selected === originalIndex ? "active" : ""}`}
                      key={item.id || item.email}
                    >
                      <input aria-label={`Select ${item.name}`} type="checkbox" checked={Boolean(item.id && selectedContactIds.has(item.id))} onChange={() => item.id && toggleContact(item.id)} />
                      <span>
                        <i>
                          {item.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")}
                        </i>
                        <div>
                          <b>{item.name}</b>
                          <small>{item.stage}</small>
                        </div>
                      </span>
                      <span><b>{item.company}</b></span>
                      <span>{item.address}</span>
                      <span>{item.website !== "No website" ? <a href={item.website.startsWith("http") ? item.website : `https://${item.website}`} target="_blank">{item.website}</a> : item.website}</span>
                      <a href={item.phone !== "No phone" ? `tel:${item.phone}` : undefined}>{item.phone}</a>
                      <a href={item.email !== "No email" ? `mailto:${item.email}` : undefined}>{item.email}</a>
                      <em>{item.source}</em>
                      <span className="contactRowActions"><button onClick={() => {setSelected(originalIndex);setContactRecordOpen(true)}}>Open</button>{(currentAccess.role==="OWNER"||Boolean(currentAccess.can_delete))&&<button className="dangerText" onClick={() => void deleteContactFromList(item)}>Delete</button>}</span>
                    </div>
                  );
                })}
                {contactsLoaded && !filteredContacts.length && (
                  <div className="noProspects">
                    No live contacts yet. Create one or convert a prospect.
                  </div>
                )}
              </div>
            </div>
          )}
          {view === "Calendar" && (
            <CRMCalendarWorkspace
              onFlash={flash}
              currentUserName={crmUserName}
            />
          )}
          {view === "Conversations" && <CRMConversations onFlash={flash} />}
          {view === "Social Automations" && (
            <CRMSocialAutomations onFlash={flash} />
          )}
          {view === "Journeys" && <CRMJourneys onFlash={flash} />}
          {view === "Automations" && <CRMAutomations onFlash={flash} />}
          {view === "Data Graph" && <CRMDataGraph onFlash={flash} />}
          {view === "Agent Team" && <CRMAgentTeam onFlash={flash} />}
          {view === "Team Access" && <CRMTeamAccess onFlash={flash} onOpenCalendar={() => setView("Calendar")} />}
          {view === "Compensation" && (
            <CRMCompensation onFlash={flash} isOwner={isOwner} />
          )}
          {view === "Invoices" && <CRMInvoices onFlash={flash} onOpenIntegrations={() => setView("Integrations")} />}
          {view === "Contracts" && <CRMContracts onFlash={flash} />}
          {view === "Forms" && <CRMForms onFlash={flash} />}
          {view === "Sales Playbooks" && <CRMSalesPlaybooks onFlash={flash} />}
          {view === "Attribution" && <CRMAttribution onFlash={flash} />}
          {view === "Cyncro Work" && <CRMWork onFlash={flash} currentUserName={crmUserName} />}
          {view === "Integrations" && <CRMIntegrations onFlash={flash} />}
          {view === "Intelligence" && <CRMIntelligence onFlash={flash} />}
        </div>
      </main>

      {creating && (
        <div className="crmModalBack" onClick={() => setCreating(false)}>
          <div
            className="crmModal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="crmModalHead">
              <div>
                <label>CREATE ANYTHING</label>
                <h2>New universal record</h2>
              </div>
              <button onClick={() => setCreating(false)}>×</button>
            </div>
            <div className="recordTypes">
              {["Contact", "Company", "Opportunity", "Task", "Note"].map(
                (item, index) => (
                  <button className={index === 0 ? "active" : ""} key={item}>
                    {item}
                  </button>
                ),
              )}
            </div>
            <div className="crmForm">
              <label>
                Full name
                <input
                  value={contactForm.fullName}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      fullName: event.target.value,
                    })
                  }
                  placeholder="Enter contact name"
                />
              </label>
              <label>
                Company
                <input
                  value={contactForm.company}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      company: event.target.value,
                    })
                  }
                  placeholder="Company or organization"
                />
              </label>
              <label>
                Email
                <input
                  value={contactForm.email}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      email: event.target.value,
                    })
                  }
                  placeholder="name@company.com"
                />
              </label>
              <label>
                Phone
                <input
                  value={contactForm.phone}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      phone: event.target.value,
                    })
                  }
                  placeholder="(000) 000-0000"
                />
              </label>
              <label>
                Source
                <select
                  value={contactForm.source}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      source: event.target.value,
                    })
                  }
                >
                  <option>Booking link</option>
                  <option>Website</option>
                  <option>Referral</option>
                  <option>Manual</option>
                </select>
              </label>
              <label>
                Lifecycle
                <select
                  value={contactForm.lifecycle}
                  onChange={(event) =>
                    setContactForm({
                      ...contactForm,
                      lifecycle: event.target.value,
                    })
                  }
                >
                  <option>Lead</option>
                  <option>Qualified</option>
                  <option>Customer</option>
                </select>
              </label>
            </div>
            <div className="crmModalActions">
              <button onClick={() => setCreating(false)}>Cancel</button>
              <button onClick={() => void createContact()}>
                Create + enrich record
              </button>
            </div>
          </div>
        </div>
      )}
      {importing&&<div className="crmModalBack" onClick={()=>setImporting(false)}><div className="crmModal leadImportModal" onClick={e=>e.stopPropagation()}><div className="crmModalHead"><div><label>BULK LEAD IMPORT</label><h2>Move leads into Cyncro</h2><p>Works with exports from GoHighLevel, HubSpot, Salesforce, Zoho, Pipedrive, ClickFunnels, Monday, and other CRMs.</p></div><button onClick={()=>setImporting(false)}>×</button></div><label className="leadDrop"><input type="file" accept=".csv,text/csv" onChange={e=>e.target.files?.[0]&&void readLeadFile(e.target.files[0])}/><b>Choose a CSV export</b><span>Cyncro automatically maps name, company, address, website, phone, email, source, title, and notes.</span></label>{importRows.length>0&&<><div className="importReview"><header><span>Contact</span><span>Company</span><span>Email</span><span>Phone</span></header>{importRows.slice(0,5).map((row,index)=><div key={index}><span>{row.fullName||`${row.firstName||""} ${row.lastName||""}`}</span><span>{row.company||"—"}</span><span>{row.email||"—"}</span><span>{row.phone||"—"}</span></div>)}</div><p className="importSummary"><b>{importRows.length}</b> records recognized from {importFileName}. Existing emails will be skipped automatically.</p><button className="crmCreate" onClick={()=>void importLeads()}>Import {importRows.length} leads</button></>}</div></div>}
      {contactRecordOpen&&contact&&<div className="crmModalBack contactRecordBack" onClick={()=>setContactRecordOpen(false)}><div className="contactRecordModal" onClick={e=>e.stopPropagation()}><button className="contactRecordClose" onClick={()=>setContactRecordOpen(false)}>×</button><CRMContactDetail contact={contact} onFlash={flash} onUpdated={()=>void Promise.all([loadCRMContacts(),loadCRMOverview()])} onDeleted={()=>{setSelected(0);setContactRecordOpen(false);void Promise.all([loadCRMContacts(),loadCRMOverview()])}} onBook={openCRMCalendar}/></div></div>}
      {aiOpen && (
        <div className="aiDrawer">
          <div className="aiDrawerHead">
            <div>
              <span>✦</span>
              <div>
                <small>CYNCRO INTELLIGENCE</small>
                <b>Business command</b>
              </div>
            </div>
            <button onClick={() => setAiOpen(false)}>×</button>
          </div>
          <div className="aiConversation">
            <div className="aiPrompt">What needs my attention today?</div>
            <div className="aiAnswer">
              <span>✦</span>
              <p>
                You have <b>$62,500</b> in high-intent opportunities. Daniel Kim
                should be contacted first; his payment activity makes him 3.2×
                more likely to close today. I can draft the message, create the
                task, and update the opportunity.
              </p>
            </div>
          </div>
          <div className="aiSuggestions">
            {[
              "Draft Daniel’s follow-up",
              "Show at-risk deals",
              "Build today’s call list",
            ].map((item) => (
              <button onClick={() => flash(`${item} · ready`)} key={item}>
                {item}
              </button>
            ))}
          </div>
          <div className="aiComposer">
            <input placeholder="Ask about any contact, deal, booking, or metric…" />
            <button onClick={() => flash("Command processed")}>↑</button>
          </div>
          <small className="aiPermission">
            Cyncro asks before taking external actions.
          </small>
        </div>
      )}
    </section>
  );
}

function CRMPipeline({
  onFlash,
  isOwner,
}: {
  onFlash: (message: string) => void;
  isOwner: boolean;
}) {
  type Deal = {
    id: string;
    account_id: string;
    account_name: string;
    contact_name?: string;
    name: string;
    stage: string;
    value_cents: number;
    cost_cents?: number;
    source?: string;
    contact_email?: string;
    contact_phone?: string;
    probability: number;
    assigned_rep?: string;
    commission_rate_bps?: number;
    commission_status?: string;
    payment_status?: string;
    collected_cents?: number;
    residual_rate_bps?: number;
    residual_months?: number;
    residual_flat_cents?: number;
    notes?: string;
  };
  type PipelineStage = {
    id: string;
    name: string;
    color: string;
    position: number;
    probability: number;
    is_won: number;
    is_lost: number;
  };
  type Pipeline = {
    id: string;
    name: string;
    description?: string;
    is_default: number;
    stages: PipelineStage[];
  };
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [pipelineDraft, setPipelineDraft] = useState<Pipeline | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [createStage, setCreateStage] = useState<string | null>(null);
  const [newDeal, setNewDeal] = useState({
    company: "",
    contactName: "",
    email: "",
    phone: "",
    source: "Website",
    name: "",
    value: "",
    cost: "",
    probability: "25",
    assignedRep: "",
    commissionRate: "20",
    residualFlat: "25",
  });
  const loadDeals = async (pipelineId = selectedPipelineId) => {
    const response = await fetch(
      `/api/crm/opportunities${pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}&fresh=${Date.now()}` : `?fresh=${Date.now()}`}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      opportunities?: Deal[];
      error?: string;
    };
    if (!response.ok) {
      onFlash(data.error || "Pipeline could not be loaded");
      return;
    }
    setDeals(data.opportunities || []);
  };
  const loadPipelines = async () => {
    const response = await fetch(`/api/crm/pipelines?fresh=${Date.now()}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      pipelines?: Pipeline[];
      error?: string;
    };
    if (!response.ok) {
      onFlash(data.error || "Pipeline settings could not be loaded");
      return;
    }
    const next = data.pipelines || [];
    setPipelines(next);
    const chosen =
      next.find((item) => item.id === selectedPipelineId) ||
      next.find((item) => item.is_default) ||
      next[0];
    if (chosen) {
      setSelectedPipelineId(chosen.id);
      setPipelineDraft(structuredClone(chosen));
      await loadDeals(chosen.id);
    }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void loadPipelines(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const refresh = () => void loadPipelines();
    window.addEventListener("cyncro:data-changed", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("cyncro:data-changed", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const activePipeline = pipelines.find(
    (item) => item.id === selectedPipelineId,
  );
  const stageSettings = [...(activePipeline?.stages || [])].sort(
    (a, b) => a.position - b.position,
  );
  const stages = stageSettings.map((item) => item.name);
  const saveDeal = async () => {
    if (!selectedDeal) return;
    const updates: Record<string, unknown> = {
      name: selectedDeal.name,
      stage: selectedDeal.stage,
      value: selectedDeal.value_cents / 100,
      cost: Number(selectedDeal.cost_cents || 0) / 100,
      source: selectedDeal.source || "MANUAL",
      probability: selectedDeal.probability,
      pipelineId: selectedPipelineId,
      assignedRep: selectedDeal.assigned_rep || "",
      notes: selectedDeal.notes || "",
    };
    if (isOwner)
      Object.assign(updates, {
        commissionRate: Number(selectedDeal.commission_rate_bps || 2000) / 100,
        commissionStatus: selectedDeal.commission_status || "PENDING",
        paymentStatus: selectedDeal.payment_status || "UNPAID",
        collected: Number(selectedDeal.collected_cents || 0) / 100,
        residualFlat: Number(selectedDeal.residual_flat_cents || 2500) / 100,
      });
    const response = await fetch("/api/crm/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selectedDeal.id, updates }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Opportunity update failed");
      return;
    }
    setSelectedDeal(null);
    await loadDeals();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "opportunity", action: "updated" },
      }),
    );
    onFlash("Pipeline card updated everywhere");
  };
  const deleteDeal = async (target: Deal | null = selectedDeal) => {
    if (
      !target ||
      !window.confirm(
        `Delete ${target.name}? This permanently removes the pipeline lead.`,
      )
    )
      return;
    const response = await fetch(
      `/api/crm/opportunities?id=${encodeURIComponent(target.id)}`,
      { method: "DELETE" },
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Pipeline lead could not be deleted");
      return;
    }
    setSelectedDeal(null);
    await loadDeals();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "opportunity", action: "deleted" },
      }),
    );
    onFlash("Pipeline lead deleted everywhere");
  };
  const createOpportunity = async () => {
    if (!createStage) return;
    const accountResponse = await fetch("/api/crm/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDeal.company, source: "CRM" }),
    });
    const accountData = (await accountResponse.json()) as {
      account?: { id: string };
      error?: string;
    };
    if (!accountResponse.ok || !accountData.account) {
      onFlash(accountData.error || "Account could not be created");
      return;
    }
    let primaryContactId: string | null = null;
    let autoOpportunityId: string | null = null;
    if (newDeal.contactName.trim()) {
      const contactResponse = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: accountData.account.id,
          fullName: newDeal.contactName,
          email: newDeal.email,
          phone: newDeal.phone,
          source: newDeal.source,
          assignedRep: newDeal.assignedRep,
        }),
      });
      const contactData = (await contactResponse.json()) as {
        contact?: { id: string };
        opportunityId?: string | null;
        error?: string;
      };
      if (!contactResponse.ok || !contactData.contact) {
        onFlash(contactData.error || "Contact could not be created");
        return;
      }
      primaryContactId = contactData.contact.id;
      autoOpportunityId = contactData.opportunityId || null;
    }
    const opportunityPayload = {
      pipelineId: selectedPipelineId,
      name: newDeal.name || `${newDeal.company} opportunity`,
      stage: createStage,
      value: Number(newDeal.value || 0),
      cost: Number(newDeal.cost || 0),
      probability: Number(newDeal.probability || 10),
      assignedRep: newDeal.assignedRep,
      commissionRate: Number(newDeal.commissionRate || 20),
      residualFlat: Number(newDeal.residualFlat || 25),
      source: newDeal.source,
    };
    const response = await fetch("/api/crm/opportunities", {
      method: autoOpportunityId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        autoOpportunityId
          ? { id: autoOpportunityId, updates: opportunityPayload }
          : {
              accountId: accountData.account.id,
              primaryContactId,
              ...opportunityPayload,
            },
      ),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Opportunity could not be created");
      return;
    }
    setCreateStage(null);
    setNewDeal({
      company: "",
      contactName: "",
      email: "",
      phone: "",
      source: "Website",
      name: "",
      value: "",
      cost: "",
      probability: "25",
      assignedRep: "",
      commissionRate: "20",
      residualFlat: "25",
    });
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "opportunity", action: "created" },
      }),
    );
    await loadDeals();
    onFlash("Opportunity added and synced everywhere");
  };
  const createPipeline = async () => {
    const response = await fetch("/api/crm/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Pipeline ${pipelines.length + 1}` }),
    });
    const data = (await response.json()) as {
      pipeline?: Pipeline;
      error?: string;
    };
    if (!response.ok || !data.pipeline) {
      onFlash(data.error || "Pipeline could not be created");
      return;
    }
    setSelectedPipelineId(data.pipeline.id);
    await loadPipelines();
    setSettingsOpen(true);
    onFlash("New pipeline created — customize it now");
  };
  const savePipeline = async () => {
    if (
      !pipelineDraft ||
      !pipelineDraft.name.trim() ||
      !pipelineDraft.stages.length
    ) {
      onFlash("A pipeline name and at least one stage are required");
      return;
    }
    const response = await fetch("/api/crm/pipelines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: pipelineDraft.id,
        name: pipelineDraft.name,
        description: pipelineDraft.description || "",
        stages: pipelineDraft.stages.map((stage, position) => ({
          ...stage,
          position,
        })),
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Pipeline customization failed");
      return;
    }
    setSettingsOpen(false);
    await loadPipelines();
    onFlash("Pipeline customization saved");
  };
  const editStage = (index: number, updates: Partial<PipelineStage>) =>
    setPipelineDraft((current) =>
      current
        ? {
            ...current,
            stages: current.stages.map((stage, stageIndex) =>
              stageIndex === index ? { ...stage, ...updates } : stage,
            ),
          }
        : current,
    );
  const moveStage = (index: number, direction: -1 | 1) =>
    setPipelineDraft((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.stages.length) return current;
      const stages = [...current.stages];
      [stages[index], stages[target]] = [stages[target], stages[index]];
      return { ...current, stages };
    });
  const money = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  const moveDeal = async (deal: Deal, stage: string) => {
    if (deal.stage === stage) return;
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, stage } : item));
    const response = await fetch("/api/crm/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: deal.id,
        updates: { stage, pipelineId: selectedPipelineId },
      }),
    });
    if (!response.ok) {
      setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, stage: deal.stage } : item));
      const data = (await response.json()) as { error?: string };
      onFlash(data.error || "Lead could not be moved");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "opportunity", action: "moved" },
      }),
    );
    onFlash(`${deal.name} moved to ${stage}`);
  };
  return (
    <>
      <div className="pipelineToolbar">
        <div>
          <small>ACTIVE PIPELINE</small>
          <h2>{activePipeline?.name || "Loading pipeline…"}</h2>
          <p>
            {activePipeline?.description ||
              "Customize every stage to match your sales process."}
          </p>
        </div>
        <div>
          {pipelines.length > 1 && (
            <select
              value={selectedPipelineId}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedPipelineId(id);
                const pipeline = pipelines.find((item) => item.id === id);
                if (pipeline) setPipelineDraft(structuredClone(pipeline));
                void loadDeals(id);
              }}
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => void createPipeline()}>＋ New pipeline</button>
          <button
            className="crmCreate"
            onClick={() => {
              if (activePipeline)
                setPipelineDraft(structuredClone(activePipeline));
              setSettingsOpen(true);
            }}
          >
            Customize pipeline
          </button>
        </div>
      </div>
      <div className="pipelineBoard">
        {stages.map((stage) => {
          const columnDeals = deals.filter((deal) => deal.stage === stage);
          const stageSetting = stageSettings.find(
            (item) => item.name === stage,
          );
          return (
            <section
              key={stage}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain");
                const deal = deals.find((item) => item.id === id);
                if (deal) void moveDeal(deal, stage);
              }}
              style={{ borderTopColor: stageSetting?.color || "#a30e18" }}
            >
              <header>
                <div>
                  <small>{stage}</small>
                  <b>
                    {money(
                      columnDeals.reduce(
                        (sum, deal) => sum + Number(deal.value_cents || 0),
                        0,
                      ),
                    )}
                  </b>
                  <em>{stageSetting?.probability ?? 0}% default</em>
                </div>
                <span>{columnDeals.length}</span>
              </header>
              <div>
                {columnDeals.map((deal) => (
                  <article
                    className="dealCard"
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", deal.id)
                    }
                    key={deal.id}
                  >
                    <div>
                      <i>{deal.account_name.slice(0, 2).toUpperCase()}</i>
                      <span>
                        <b>{deal.name}</b>
                        <small>{deal.account_name}</small>
                        <small>
                          {deal.contact_name || "No contact"}
                          {deal.contact_phone ? ` · ${deal.contact_phone}` : ""}
                        </small>
                      </span>
                    </div>
                    <strong>{money(deal.value_cents)}</strong>
                    <footer>
                      <span>
                        {deal.source || "MANUAL"} · Profit{" "}
                        {money(
                          Math.max(
                            0,
                            Number(deal.value_cents || 0) -
                              Number(deal.cost_cents || 0),
                          ),
                        )}
                      </span>
                      <span className="dealCardActions"><button onClick={() => setSelectedDeal({ ...deal })}>Edit</button><button className="dangerText" onClick={() => void deleteDeal(deal)}>Delete</button></span>
                    </footer>
                  </article>
                ))}
              </div>
              <button className="addDeal" onClick={() => setCreateStage(stage)}>
                ＋ Add opportunity
              </button>
            </section>
          );
        })}
      </div>
      {settingsOpen && pipelineDraft && (
        <div className="modalback" onClick={() => setSettingsOpen(false)}>
          <div
            className="bookingmodal pipelineSettings"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>OWNER PIPELINE CONTROLS</label>
                <h2>Customize pipeline</h2>
              </div>
              <button onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <div className="crmForm">
              <label>
                Pipeline name
                <input
                  value={pipelineDraft.name}
                  onChange={(event) =>
                    setPipelineDraft({
                      ...pipelineDraft,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Description
                <input
                  value={pipelineDraft.description || ""}
                  onChange={(event) =>
                    setPipelineDraft({
                      ...pipelineDraft,
                      description: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="stageEditor">
              <div className="stageEditorHead">
                <b>STAGES</b>
                <button
                  onClick={() =>
                    setPipelineDraft({
                      ...pipelineDraft,
                      stages: [
                        ...pipelineDraft.stages,
                        {
                          id: `new-${crypto.randomUUID()}`,
                          name: "NEW STAGE",
                          color: "#a30e18",
                          position: pipelineDraft.stages.length,
                          probability: 25,
                          is_won: 0,
                          is_lost: 0,
                        },
                      ],
                    })
                  }
                >
                  ＋ Add stage
                </button>
              </div>
              {pipelineDraft.stages.map((stage, index) => (
                <div className="stageEditorRow" key={stage.id}>
                  <input
                    aria-label="Stage color"
                    type="color"
                    value={stage.color}
                    onChange={(event) =>
                      editStage(index, { color: event.target.value })
                    }
                  />
                  <label>
                    Stage name
                    <input
                      value={stage.name}
                      onChange={(event) =>
                        editStage(index, {
                          name: event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label>
                    Probability
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={stage.probability}
                      onChange={(event) =>
                        editStage(index, {
                          probability: Math.max(
                            0,
                            Math.min(100, Number(event.target.value)),
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    disabled={index === 0}
                    onClick={() => moveStage(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    disabled={index === pipelineDraft.stages.length - 1}
                    onClick={() => moveStage(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    className="dangerText"
                    disabled={pipelineDraft.stages.length === 1}
                    onClick={() =>
                      setPipelineDraft({
                        ...pipelineDraft,
                        stages: pipelineDraft.stages.filter(
                          (_, stageIndex) => stageIndex !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="modalactions">
              <button onClick={() => setSettingsOpen(false)}>Cancel</button>
              <button onClick={() => void savePipeline()}>Save pipeline</button>
            </div>
          </div>
        </div>
      )}
      {selectedDeal && (
        <div className="modalback" onClick={() => setSelectedDeal(null)}>
          <div
            className="bookingmodal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>EDIT PIPELINE CARD</label>
                <h2>{selectedDeal.name}</h2>
              </div>
              <button onClick={() => setSelectedDeal(null)}>×</button>
            </div>
            <div className="crmForm">
              <label>
                Opportunity name
                <input
                  value={selectedDeal.name}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      name: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Stage
                <select
                  value={selectedDeal.stage}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      stage: event.target.value,
                    })
                  }
                >
                  {stages.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Deal value
                <input
                  type="number"
                  value={selectedDeal.value_cents / 100}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      value_cents: Number(event.target.value) * 100,
                    })
                  }
                />
              </label>
              <label>
                Estimated cost
                <input
                  type="number"
                  min="0"
                  value={Number(selectedDeal.cost_cents || 0) / 100}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      cost_cents: Number(event.target.value) * 100,
                    })
                  }
                />
              </label>
              <label>
                Lead source
                <input
                  value={selectedDeal.source || ""}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      source: event.target.value,
                    })
                  }
                  placeholder="Website, referral, prospecting…"
                />
              </label>
              <label>
                Estimated profit
                <input
                  disabled
                  value={money(
                    Math.max(
                      0,
                      Number(selectedDeal.value_cents || 0) -
                        Number(selectedDeal.cost_cents || 0),
                    ),
                  )}
                />
              </label>
              <label>
                Probability
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={selectedDeal.probability}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      probability: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Assigned rep
                <input
                  value={selectedDeal.assigned_rep || ""}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      assigned_rep: event.target.value,
                    })
                  }
                />
              </label>
              {isOwner && (
                <>
                  <label>
                    Commission % (20–30)
                    <input
                      type="number"
                      min="20"
                      max="30"
                      value={
                        Number(selectedDeal.commission_rate_bps || 2000) / 100
                      }
                      onChange={(event) =>
                        setSelectedDeal({
                          ...selectedDeal,
                          commission_rate_bps: Number(event.target.value) * 100,
                        })
                      }
                    />
                  </label>
                  <label>
                    Commission status
                    <select
                      value={selectedDeal.commission_status}
                      onChange={(event) =>
                        setSelectedDeal({
                          ...selectedDeal,
                          commission_status: event.target.value,
                        })
                      }
                    >
                      <option>PENDING</option>
                      <option>APPROVED</option>
                      <option>PAID</option>
                      <option>CLAWBACK</option>
                    </select>
                  </label>
                  <label>
                    Payment status
                    <select
                      value={selectedDeal.payment_status || "UNPAID"}
                      onChange={(event) =>
                        setSelectedDeal({
                          ...selectedDeal,
                          payment_status: event.target.value,
                        })
                      }
                    >
                      <option>UNPAID</option>
                      <option>PARTIAL</option>
                      <option>PAID</option>
                      <option>REFUNDED</option>
                    </select>
                  </label>
                  <label>
                    Amount collected
                    <input
                      type="number"
                      min="0"
                      value={Number(selectedDeal.collected_cents || 0) / 100}
                      onChange={(event) =>
                        setSelectedDeal({
                          ...selectedDeal,
                          collected_cents: Number(event.target.value) * 100,
                        })
                      }
                    />
                  </label>
                  <label>
                    Monthly residual ($25–$50)
                    <input
                      type="number"
                      min="25"
                      max="50"
                      value={
                        Number(selectedDeal.residual_flat_cents || 2500) / 100
                      }
                      onChange={(event) =>
                        setSelectedDeal({
                          ...selectedDeal,
                          residual_flat_cents: Number(event.target.value) * 100,
                        })
                      }
                    />
                  </label>
                  <label>
                    Estimated payout
                    <input
                      disabled
                      value={new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(
                        (Number(selectedDeal.collected_cents || 0) / 100) *
                          (Number(selectedDeal.commission_rate_bps || 2000) /
                            10000),
                      )}
                    />
                  </label>
                </>
              )}
              <label>
                Notes
                <textarea
                  value={selectedDeal.notes || ""}
                  onChange={(event) =>
                    setSelectedDeal({
                      ...selectedDeal,
                      notes: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="modalactions">
              <button className="dangerText" onClick={() => void deleteDeal()}>
                Delete lead
              </button>
              <button onClick={() => setSelectedDeal(null)}>Cancel</button>
              <button onClick={() => void saveDeal()}>Save changes</button>
            </div>
          </div>
        </div>
      )}
      {createStage && (
        <div className="modalback" onClick={() => setCreateStage(null)}>
          <div
            className="bookingmodal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>NEW OPPORTUNITY · {createStage}</label>
                <h2>Add pipeline card</h2>
              </div>
              <button onClick={() => setCreateStage(null)}>×</button>
            </div>
            <div className="crmForm">
              <label>
                Company
                <input
                  value={newDeal.company}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, company: event.target.value })
                  }
                />
              </label>
              <label>
                Contact name
                <input
                  value={newDeal.contactName}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, contactName: event.target.value })
                  }
                  placeholder="First and last name"
                />
              </label>
              <label>
                Contact email
                <input
                  type="email"
                  value={newDeal.email}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, email: event.target.value })
                  }
                />
              </label>
              <label>
                Contact phone
                <input
                  value={newDeal.phone}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, phone: event.target.value })
                  }
                />
              </label>
              <label>
                Lead source
                <input
                  value={newDeal.source}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, source: event.target.value })
                  }
                  placeholder="Website, referral, prospecting…"
                />
              </label>
              <label>
                Opportunity name
                <input
                  value={newDeal.name}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, name: event.target.value })
                  }
                />
              </label>
              <label>
                Deal value
                <input
                  type="number"
                  value={newDeal.value}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, value: event.target.value })
                  }
                />
              </label>
              <label>
                Estimated cost
                <input
                  type="number"
                  min="0"
                  value={newDeal.cost}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, cost: event.target.value })
                  }
                />
              </label>
              <label>
                Probability %
                <input
                  type="number"
                  value={newDeal.probability}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, probability: event.target.value })
                  }
                />
              </label>
              <label>
                Assigned rep
                <input
                  value={newDeal.assignedRep}
                  onChange={(event) =>
                    setNewDeal({ ...newDeal, assignedRep: event.target.value })
                  }
                />
              </label>
              {isOwner && (
                <>
                  <label>
                    Commission % (20–30)
                    <input
                      type="number"
                      min="20"
                      max="30"
                      value={newDeal.commissionRate}
                      onChange={(event) =>
                        setNewDeal({
                          ...newDeal,
                          commissionRate: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Monthly residual ($25–$50)
                    <input
                      type="number"
                      min="25"
                      max="50"
                      value={newDeal.residualFlat}
                      onChange={(event) =>
                        setNewDeal({
                          ...newDeal,
                          residualFlat: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
            <div className="modalactions">
              <button onClick={() => setCreateStage(null)}>Cancel</button>
              <button
                disabled={!newDeal.company}
                onClick={() => void createOpportunity()}
              >
                Create opportunity
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CRMContactDetail({
  contact,
  onFlash,
  onUpdated,
  onDeleted,
  onBook,
}: {
  contact: CRMContactCard;
  onFlash: (message: string) => void;
  onUpdated: () => void;
  onDeleted: () => void;
  onBook: () => void;
}) {
  type Activity = {
    id: string;
    activity_type: string;
    title: string;
    details?: string;
    due_at?: string;
    status: string;
    created_at: string;
  };
  const [editing, setEditing] = useState(false);
  const [composer, setComposer] = useState<"NOTE" | "TASK" | null>(null);
  const [activityDraft, setActivityDraft] = useState({
    title: "",
    details: "",
    dueAt: "",
  });
  const [savingActivity, setSavingActivity] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [draft, setDraft] = useState({
    fullName: contact.name,
    company: contact.company,
    address: contact.address === "No address" ? "" : contact.address,
    website: contact.website === "No website" ? "" : contact.website,
    email: contact.email === "No email" ? "" : contact.email,
    phone: contact.phone === "No phone" ? "" : contact.phone,
    lifecycle: contact.stage,
    notes: contact.notes || "",
  });
  useEffect(
    () =>
      setDraft({
        fullName: contact.name,
        company: contact.company,
        address: contact.address === "No address" ? "" : contact.address,
        website: contact.website === "No website" ? "" : contact.website,
        email: contact.email === "No email" ? "" : contact.email,
        phone: contact.phone === "No phone" ? "" : contact.phone,
        lifecycle: contact.stage,
        notes: contact.notes || "",
      }),
    [contact],
  );
  const loadActivities = async () => {
    if (!contact.id) return;
    const response = await fetch(
      `/api/crm/activities?contactId=${encodeURIComponent(contact.id)}`,
    );
    const data = (await response.json()) as { activities?: Activity[] };
    if (response.ok) setActivities(data.activities || []);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void loadActivities(), 0);
    return () => window.clearTimeout(timer);
  }, [contact.id]);
  const logActivity = async (
    activityType: string,
    title: string,
    details = "",
    dueAt = "",
  ) => {
    if (!contact.id) return false;
    const response = await fetch("/api/crm/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: contact.id,
        activityType,
        title,
        details,
        dueAt,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Activity could not be saved");
      return false;
    }
    await loadActivities();
    return true;
  };
  const saveActivity = async () => {
    if (!composer) return;
    const details = activityDraft.details.trim();
    const title =
      activityDraft.title.trim() ||
      (composer === "NOTE" ? details.slice(0, 80) : "");
    if (!title) {
      onFlash(
        composer === "TASK" ? "Add a task title" : "Type your note first",
      );
      return;
    }
    setSavingActivity(true);
    try {
      if (await logActivity(composer, title, details, activityDraft.dueAt)) {
        setComposer(null);
        setActivityDraft({ title: "", details: "", dueAt: "" });
        window.dispatchEvent(
          new CustomEvent("cyncro:data-changed", {
            detail: {
              entity: "activity",
              action: "created",
              contactId: contact.id,
            },
          }),
        );
        onUpdated();
        onFlash(
          composer === "TASK"
            ? "Task saved and added to overview"
            : "Note saved to this contact and overview",
        );
      }
    } finally {
      setSavingActivity(false);
    }
  };
  const saveContact = async () => {
    if (!contact.id) return;
    const response = await fetch("/api/crm/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contact.id, updates: draft }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Contact update failed");
      return;
    }
    await logActivity(
      "CONTACT",
      "CRM contact updated",
      `Lifecycle: ${draft.lifecycle}`,
    );
    setEditing(false);
    onUpdated();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "contact", action: "updated" },
      }),
    );
    onFlash("Contact updated everywhere");
  };
  const deleteContact = async () => {
    if (
      !contact.id ||
      !window.confirm(
        `Delete ${contact.name}? This removes the contact and its notes.`,
      )
    )
      return;
    const response = await fetch(
      `/api/crm/contacts?id=${encodeURIComponent(contact.id)}`,
      { method: "DELETE" },
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Contact could not be deleted");
      return;
    }
    onDeleted();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "contact", action: "deleted" },
      }),
    );
    onFlash("Contact deleted everywhere");
  };
  return (
    <aside className="contactDetail crmPanel">
      <div className="contactHero">
        <i>
          {contact.name
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </i>
        <div>
          <small>UNIFIED CUSTOMER RECORD</small>
          <h2>{contact.name}</h2>
          <p>{contact.company}</p>
        </div>
        <span>{contact.intent} intent</span>
        <button onClick={() => setEditing(!editing)}>
          {editing ? "Close" : "Edit contact"}
        </button>
        <button className="dangerText" onClick={() => void deleteContact()}>
          Delete
        </button>
      </div>
      {editing && (
        <div className="crmForm">
          <label>
            Full name
            <input
              value={draft.fullName}
              onChange={(event) =>
                setDraft({ ...draft, fullName: event.target.value })
              }
            />
          </label>
          <label>
            Business name
            <input value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} />
          </label>
          <label>
            Address
            <input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />
          </label>
          <label>
            Website
            <input value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} />
          </label>
          <label>
            Email
            <input
              value={draft.email}
              onChange={(event) =>
                setDraft({ ...draft, email: event.target.value })
              }
            />
          </label>
          <label>
            Phone
            <input
              value={draft.phone}
              onChange={(event) =>
                setDraft({ ...draft, phone: event.target.value })
              }
            />
          </label>
          <label>
            Lifecycle
            <select
              value={draft.lifecycle}
              onChange={(event) =>
                setDraft({ ...draft, lifecycle: event.target.value })
              }
            >
              <option>LEAD</option>
              <option>QUALIFIED</option>
              <option>CUSTOMER</option>
              <option>INACTIVE</option>
            </select>
          </label>
          <label>
            Notes
            <textarea
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </label>
          <button className="crmCreate" onClick={() => void saveContact()}>
            Save contact
          </button>
        </div>
      )}
      <div className="contactActions">
        <button onClick={() => setComposer("NOTE")}>＋ Note</button>
        <button onClick={() => setComposer("TASK")}>＋ Task</button>
        <button
          disabled={!contact.email || contact.email === "No email"}
          onClick={() => {
            void logActivity("EMAIL", `Email opened for ${contact.name}`);
            window.location.href = `mailto:${contact.email}`;
          }}
        >
          Email
        </button>
        <button
          disabled={!contact.phone || contact.phone === "No phone"}
          onClick={() => {
            void logActivity("SMS", `SMS opened for ${contact.name}`);
            window.location.href = `sms:${contact.phone}`;
          }}
        >
          SMS
        </button>
        <button
          onClick={() => {
            void logActivity("BOOKING", `Booking started for ${contact.name}`);
            onBook();
          }}
        >
          Book appointment
        </button>
      </div>
      {composer && (
        <div className="contactComposer">
          <b>{composer === "TASK" ? "ADD TASK" : "ADD NOTE"}</b>
          {composer === "TASK" && (
            <input
              placeholder="Task title"
              value={activityDraft.title}
              onChange={(event) =>
                setActivityDraft({
                  ...activityDraft,
                  title: event.target.value,
                })
              }
            />
          )}
          <textarea
            autoFocus
            placeholder={
              composer === "TASK" ? "Task details" : "Type your note here…"
            }
            value={activityDraft.details}
            onChange={(event) =>
              setActivityDraft({
                ...activityDraft,
                details: event.target.value,
              })
            }
          />
          {composer === "TASK" && (
            <input
              type="datetime-local"
              value={activityDraft.dueAt}
              onChange={(event) =>
                setActivityDraft({
                  ...activityDraft,
                  dueAt: event.target.value,
                })
              }
            />
          )}
          <div>
            <button disabled={savingActivity} onClick={() => setComposer(null)}>
              Cancel
            </button>
            <button
              disabled={
                savingActivity ||
                (composer === "NOTE"
                  ? !activityDraft.details.trim()
                  : !activityDraft.title.trim())
              }
              className="crmCreate"
              onClick={() => void saveActivity()}
            >
              {savingActivity
                ? "Saving…"
                : composer === "TASK"
                  ? "Save task"
                  : "Save note"}
            </button>
          </div>
        </div>
      )}
      <div className="contactFacts">
        {[
          ["EMAIL", contact.email],
          ["PHONE", contact.phone],
          ["LIFECYCLE", contact.stage],
          ["OPPORTUNITY", contact.value],
          ["SOURCE", contact.source],
          ["OWNER", "Account Owner"],
        ].map((item) => (
          <div key={item[0]}>
            <small>{item[0]}</small>
            <b>{item[1]}</b>
          </div>
        ))}
      </div>
      <div className="contactTimeline">
        <div className="crmPanelHead">
          <div>
            <small>COMPLETE TIMELINE</small>
            <h3>Every interaction</h3>
          </div>
          <button onClick={() => setComposer("NOTE")}>＋ Note</button>
        </div>
        {!activities.length && (
          <div className="emptyTimeline">
            No activity yet. Add a note, task, email, SMS, or booking.
          </div>
        )}
        {activities.map((item) => (
          <div key={item.id}>
            <time>
              {new Date(item.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            <i />
            <span>
              <b>{item.title}</b>
              {item.details && item.details !== item.title && (
                <p>{item.details}</p>
              )}
              <small>
                {item.activity_type}
                {item.due_at
                  ? ` · Due ${new Date(item.due_at).toLocaleString()}`
                  : ""}{" "}
                · {item.status}
              </small>
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function CRMConversations({ onFlash }: { onFlash: (message: string) => void }) {
  const [thread, setThread] = useState(0);
  const threads = [
    [
      "Marcus Reed",
      "Let’s move forward. What do you need from me?",
      "SMS",
      "2m",
    ],
    [
      "Alexandra Lewis",
      "Confirmed—looking forward to tomorrow.",
      "Email",
      "18m",
    ],
    ["Sophia Bennett", "Can we add a second location?", "Instagram", "1h"],
    ["Nia Carter", "A seat opened for the intensive.", "Automation", "2h"],
  ];
  return (
    <div className="conversationWorkspace crmPanel">
      <aside>
        <div className="inboxHead">
          <div>
            <small>UNIFIED INBOX</small>
            <h2>All conversations</h2>
          </div>
          <button onClick={() => onFlash("Inbox filters opened")}>⌁</button>
        </div>
        {threads.map((item, index) => (
          <button
            className={thread === index ? "active" : ""}
            onClick={() => setThread(index)}
            key={item[0]}
          >
            <i>
              {item[0]
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </i>
            <div>
              <b>{item[0]}</b>
              <p>{item[1]}</p>
              <small>{item[2]}</small>
            </div>
            <time>{item[3]}</time>
          </button>
        ))}
      </aside>
      <article>
        <header>
          <div>
            <i>
              {threads[thread][0]
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </i>
            <span>
              <b>{threads[thread][0]}</b>
              <small>Opportunity · Qualified · $12,000</small>
            </span>
          </div>
          <div>
            <button onClick={() => onFlash("Call started")}>Call</button>
            <button onClick={() => onFlash("Contact opened")}>
              Open record
            </button>
          </div>
        </header>
        <div className="messageCanvas">
          <div className="messageDate">TODAY</div>
          <div className="message inbound">
            Hi, I reviewed everything with my team.
          </div>
          <div className="message inbound">{threads[thread][1]}</div>
          <div className="message outbound">
            Absolutely—I’ll prepare the next step and send it over today.
          </div>
        </div>
        <footer>
          <button>＋</button>
          <input placeholder="Reply by SMS…" />
          <button onClick={() => onFlash("Reply sent")}>Send ↑</button>
        </footer>
      </article>
      <aside className="conversationContext">
        <small>CONVERSATION INTELLIGENCE</small>
        <div className="sentiment">
          <span>↗</span>
          <div>
            <b>High buying intent</b>
            <small>Positive sentiment · Decision language detected</small>
          </div>
        </div>
        <h3>Suggested next move</h3>
        <p>
          Send the proposal and payment link, then create a 24-hour follow-up
          task.
        </p>
        <button onClick={() => onFlash("Next move executed")}>
          ✦ Execute next move
        </button>
      </aside>
    </div>
  );
}

function CRMSocialAutomations({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  const [panel, setPanel] = useState("Flow Builder");
  const [selectedFlow, setSelectedFlow] = useState(0);
  const [instagramConnected, setInstagramConnected] = useState(true);
  const [facebookConnected, setFacebookConnected] = useState(true);
  const [published, setPublished] = useState(true);
  const [reply, setReply] = useState(
    "You’re in ✦ I can help you choose the right Cyncro system. What would you like to accomplish?",
  );
  const [customKeyword, setCustomKeyword] = useState("");
  const [extraKeywords, setExtraKeywords] = useState<string[]>([]);
  type SocialFlow = {
    id: string;
    name: string;
    channel: string;
    trigger: string;
    reply: string;
    reach: string;
    leads: string;
    rate: string;
    status: string;
    extraKeywords: string[];
  };
  const [flows, setFlows] = useState<SocialFlow[]>([]);
  const loadFlows = async () => {
    const response = await fetch("/api/crm/social-flows", {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      flows?: Record<string, unknown>[];
      error?: string;
    };
    if (!response.ok) {
      onFlash(data.error || "Social automations could not be loaded");
      return;
    }
    setFlows(
      (data.flows || []).map((row) => {
        const reach = Number(row.reach_count || 0),
          leads = Number(row.lead_count || 0);
        return {
          id: String(row.id),
          name: String(row.name),
          channel: String(row.channel),
          trigger: String(row.trigger_word),
          reply: String(row.reply_text),
          reach: String(reach),
          leads: String(leads),
          rate: reach ? `${((leads / reach) * 100).toFixed(1)}%` : "0%",
          status: String(row.status),
          extraKeywords: (() => {
            try {
              return JSON.parse(String(row.extra_keywords || "[]")) as string[];
            } catch {
              return [];
            }
          })(),
        };
      }),
    );
  };
  useEffect(() => {
    void loadFlows();
    void fetch("/api/integrations/status").then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as {
        connections?: Record<string, boolean>;
      };
      setInstagramConnected(Boolean(data.connections?.meta));
      setFacebookConnected(Boolean(data.connections?.meta));
    });
  }, []);
  const active = flows[selectedFlow] || {
    id: "",
    name: "Loading…",
    channel: "",
    trigger: "",
    reply: "",
    reach: "0",
    leads: "0",
    rate: "0%",
    status: "DRAFT",
    extraKeywords: [],
  };
  const socialTotals = flows.reduce(
    (sum, flow) => ({
      reach: sum.reach + Number(flow.reach || 0),
      leads: sum.leads + Number(flow.leads || 0),
    }),
    { reach: 0, leads: 0 },
  );
  useEffect(() => {
    if (active.id) {
      setPublished(active.status === "LIVE");
      setReply(active.reply);
      setExtraKeywords(active.extraKeywords);
    }
  }, [active.id]);
  const saveFlow = async (updates: Record<string, unknown>) => {
    if (!active.id) return;
    const response = await fetch("/api/crm/social-flows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, ...updates }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      onFlash(data.error || "Flow could not be saved");
      return;
    }
    await loadFlows();
    onFlash("Social automation saved");
  };
  const createFlow = async () => {
    const response = await fetch("/api/crm/social-flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Untitled social automation",
        trigger: "NEW",
      }),
    });
    if (!response.ok) {
      onFlash("Flow could not be created");
      return;
    }
    await loadFlows();
    setSelectedFlow(0);
    onFlash("New social automation created");
  };
  const addKeyword = () => {
    const clean = customKeyword.trim().toUpperCase();
    if (!clean || extraKeywords.includes(clean)) return;
    setExtraKeywords([...extraKeywords, clean]);
    setCustomKeyword("");
    onFlash(`${clean} trigger added`);
    void saveFlow({ extraKeywords: [...extraKeywords, clean] });
  };
  return (
    <div className="socialAutomationWorkspace">
      <section className="socialHero">
        <div>
          <small>SOCIAL REVENUE ENGINE</small>
          <h2>Turn every comment and DM into a customer journey.</h2>
          <p>
            Connect Instagram and Facebook, listen for buying words, respond
            instantly, capture the lead, and move them into Cyncro CRM.
          </p>
          <div className="socialHeroActions">
            <button onClick={() => void createFlow()}>
              ＋ Create automation
            </button>
            <button onClick={() => setPanel("Live Inbox")}>
              Open live inbox →
            </button>
          </div>
        </div>
        <div className="socialPulse">
          <span>LIVE CONVERSION PULSE</span>
          <b>{socialTotals.leads}</b>
          <small>LEADS CAPTURED THIS MONTH</small>
          <div>
            <i style={{ width: "72%" }} />
          </div>
          <em>
            {instagramConnected
              ? "Live channel data connected"
              : "Connect Meta to begin collecting live data"}
          </em>
        </div>
      </section>

      <div className="socialStats">
        {[
          [
            String(socialTotals.reach),
            "AUTOMATED CONVERSATIONS",
            instagramConnected ? "Live" : "Awaiting Meta",
          ],
          [
            socialTotals.reach
              ? `${((socialTotals.leads / socialTotals.reach) * 100).toFixed(1)}%`
              : "0%",
            "LEAD CAPTURE RATE",
            "Live calculation",
          ],
          [
            "—",
            "AVERAGE FIRST RESPONSE",
            instagramConnected ? "Collecting" : "Awaiting Meta",
          ],
          ["$0", "SOCIAL-ATTRIBUTED PIPELINE", "Updates from won deals"],
        ].map((stat) => (
          <article key={stat[1]}>
            <small>{stat[1]}</small>
            <b>{stat[0]}</b>
            <span>{stat[2]}</span>
          </article>
        ))}
      </div>

      <section className="channelConnections crmPanel">
        <div className="crmPanelHead">
          <div>
            <small>CONNECTED CHANNELS</small>
            <h2>Your social front desk</h2>
          </div>
          <button onClick={() => onFlash("Channel settings opened")}>
            Manage permissions
          </button>
        </div>
        <div className="channelGrid">
          <article className={instagramConnected ? "connected" : ""}>
            <span className="instagramGlyph">◎</span>
            <div>
              <b>Instagram Business</b>
              <small>@cyncromedia · DMs, comments, stories, mentions</small>
            </div>
            <em>{instagramConnected ? "● CONNECTED" : "NOT CONNECTED"}</em>
            <button
              onClick={() =>
                onFlash(
                  instagramConnected
                    ? "Instagram connection is active"
                    : "Open Integrations and add Meta credentials",
                )
              }
            >
              {instagramConnected ? "Connected" : "Connect in Integrations"}
            </button>
          </article>
          <article className={facebookConnected ? "connected" : ""}>
            <span className="facebookGlyph">f</span>
            <div>
              <b>Facebook Page</b>
              <small>Cyncro Media · Messenger, comments, ads</small>
            </div>
            <em>{facebookConnected ? "● CONNECTED" : "NOT CONNECTED"}</em>
            <button
              onClick={() =>
                onFlash(
                  facebookConnected
                    ? "Facebook connection is active"
                    : "Open Integrations and add Meta credentials",
                )
              }
            >
              {facebookConnected ? "Connected" : "Connect in Integrations"}
            </button>
          </article>
          <button
            className="channelAdd"
            onClick={() => onFlash("WhatsApp connection ready")}
          >
            <span>＋</span>
            <b>Add WhatsApp</b>
            <small>Bring every conversation into one inbox</small>
          </button>
        </div>
      </section>

      <nav className="socialTabs" aria-label="Social automation workspace">
        {["Flow Builder", "Live Inbox", "Audience", "Analytics"].map((item) => (
          <button
            className={panel === item ? "active" : ""}
            onClick={() => setPanel(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>

      {panel === "Flow Builder" && (
        <div className="socialBuilder">
          <aside className="flowLibrary crmPanel">
            <header>
              <div>
                <small>KEYWORD AUTOMATIONS</small>
                <h2>Live flows</h2>
              </div>
              <button onClick={() => void createFlow()}>＋</button>
            </header>
            {flows.map((flow, index) => (
              <button
                className={selectedFlow === index ? "active" : ""}
                onClick={() => {
                  setSelectedFlow(index);
                  setPublished(flow.status === "LIVE");
                }}
                key={flow.name}
              >
                <i>{flow.trigger.slice(0, 2)}</i>
                <span>
                  <b>{flow.name}</b>
                  <small>{flow.channel}</small>
                </span>
                <em className={flow.status.toLowerCase()}>{flow.status}</em>
              </button>
            ))}
            <button
              className="flowTemplate"
              onClick={() => onFlash("Template library opened")}
            >
              ✦ Browse conversion templates
            </button>
          </aside>

          <main className="flowCanvas crmPanel">
            <header>
              <div>
                <small>EDITING AUTOMATION</small>
                <h2>{active.name}</h2>
                <span>Last edited 2 minutes ago · Autosaved</span>
              </div>
              <div>
                <span
                  className={published ? "publishState live" : "publishState"}
                >
                  ● {published ? "LIVE" : "DRAFT"}
                </span>
                <button
                  onClick={() =>
                    onFlash(
                      instagramConnected
                        ? "Test sent through connected Meta channel"
                        : "Connect Meta before sending a live test",
                    )
                  }
                >
                  Test flow
                </button>
                <button
                  className="publishFlow"
                  onClick={() => {
                    const next = !published;
                    setPublished(next);
                    void saveFlow({
                      status: next ? "LIVE" : "DRAFT",
                      reply,
                      extraKeywords,
                    });
                  }}
                >
                  {published ? "Pause" : "Publish"}
                </button>
              </div>
            </header>
            <div className="flowDesignArea">
              <div className="flowSequence">
                <article className="flowStep triggerStep">
                  <div className="flowStepHead">
                    <span>⚡</span>
                    <div>
                      <small>TRIGGER</small>
                      <b>Customer says a keyword</b>
                    </div>
                    <em>01</em>
                  </div>
                  <p>
                    Listen in DMs, comments, story replies, and ad responses.
                  </p>
                  <div className="keywordEditor">
                    {[active.trigger, "INFO", ...extraKeywords].map((word) => (
                      <button
                        onClick={() => onFlash(`${word} keyword selected`)}
                        key={word}
                      >
                        {word} ×
                      </button>
                    ))}
                    <input
                      value={customKeyword}
                      onChange={(event) => setCustomKeyword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addKeyword();
                      }}
                      placeholder="Add word…"
                    />
                    <button className="addKeyword" onClick={addKeyword}>
                      ＋
                    </button>
                  </div>
                  <label>
                    <input type="checkbox" defaultChecked /> Match close phrases
                    and misspellings with AI
                  </label>
                </article>
                <div className="flowLine">
                  <span>immediately</span>
                </div>
                <article className="flowStep messageStep">
                  <div className="flowStepHead">
                    <span>✦</span>
                    <div>
                      <small>SMART REPLY</small>
                      <b>Send an instant response</b>
                    </div>
                    <em>02</em>
                  </div>
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    onBlur={() => void saveFlow({ reply, extraKeywords })}
                    aria-label="Automatic social reply"
                  />
                  <div className="quickReplies">
                    {["Book a demo", "See pricing", "Ask a question"].map(
                      (item) => (
                        <button
                          onClick={() => onFlash(`${item} reply edited`)}
                          key={item}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button onClick={() => onFlash("Quick reply added")}>
                      ＋
                    </button>
                  </div>
                </article>
                <div className="flowLine">
                  <span>after response</span>
                </div>
                <div className="flowBranch">
                  <article className="flowStep captureStep">
                    <div className="flowStepHead">
                      <span>◎</span>
                      <div>
                        <small>CAPTURE + ENRICH</small>
                        <b>Create CRM contact</b>
                      </div>
                    </div>
                    <p>
                      Name, email, phone, social profile, source, consent, and
                      intent.
                    </p>
                    <button onClick={() => onFlash("Contact mapping opened")}>
                      Edit field mapping →
                    </button>
                  </article>
                  <article className="flowStep actionStep">
                    <div className="flowStepHead">
                      <span>↗</span>
                      <div>
                        <small>CONVERSION ACTION</small>
                        <b>Route the next move</b>
                      </div>
                    </div>
                    <p>
                      Send booking link, payment request, offer, or human
                      handoff.
                    </p>
                    <button onClick={() => onFlash("Conversion action opened")}>
                      Book a strategy call ▾
                    </button>
                  </article>
                </div>
                <button
                  className="addFlowStep"
                  onClick={() => onFlash("Flow step library opened")}
                >
                  ＋ Add condition, message, delay, action, or AI decision
                </button>
              </div>
              <aside className="dmPreview">
                <header>
                  <span>◎</span>
                  <div>
                    <b>@cyncromedia</b>
                    <small>Typically replies instantly</small>
                  </div>
                  <i>•••</i>
                </header>
                <div className="dmMessages">
                  <time>TODAY · 2:14 PM</time>
                  <p className="incoming">{active.trigger}</p>
                  <p className="outgoing">{reply}</p>
                  <div className="previewReplies">
                    <button>Book a demo</button>
                    <button>See pricing</button>
                    <button>Ask a question</button>
                  </div>
                </div>
                <footer>
                  <span>＋</span>
                  <input placeholder="Message…" />
                  <span>♡</span>
                </footer>
              </aside>
            </div>
          </main>
        </div>
      )}

      {panel === "Live Inbox" && (
        <div className="socialInbox crmPanel">
          <aside>
            <div className="socialInboxHead">
              <div>
                <small>UNIFIED SOCIAL INBOX</small>
                <h2>Needs attention</h2>
              </div>
              <span>12 open</span>
            </div>
            {[
              [
                "SL",
                "Sophia Lewis",
                "IG",
                "I want the demo—can I see pricing?",
                "Now",
              ],
              ["MR", "Marcus Reed", "FB", "SYSTEM", "3m"],
              ["NC", "Nia Carter", "IG", "Can someone help me choose?", "9m"],
              ["DK", "Daniel Kim", "FB", "Sent a payment screenshot", "18m"],
            ].map((item, index) => (
              <button className={index === 0 ? "active" : ""} key={item[1]}>
                <i>{item[0]}</i>
                <span>
                  <b>{item[1]}</b>
                  <small>{item[3]}</small>
                </span>
                <em>
                  {item[2]} · {item[4]}
                </em>
              </button>
            ))}
          </aside>
          <article>
            <header>
              <div>
                <b>Sophia Lewis</b>
                <small>Instagram · High buying intent · Contact matched</small>
              </div>
              <button onClick={() => onFlash("Conversation assigned")}>
                Assign ▾
              </button>
            </header>
            <div className="inboxConversation">
              <p className="incoming">DEMO</p>
              <p className="outgoing">
                You’re in ✦ What would you like to accomplish?
              </p>
              <p className="incoming">I want the demo—can I see pricing?</p>
              <div className="aiSocialAssist">
                <span>✦</span>
                <p>
                  <b>Suggested reply</b>Absolutely. I can show you the platform
                  and recommend the best setup based on your goals. Want the
                  private booking link?
                </p>
                <button onClick={() => onFlash("AI reply inserted")}>
                  Use reply
                </button>
              </div>
            </div>
            <footer>
              <button>＋</button>
              <input placeholder="Reply as Cyncro Media…" />
              <button onClick={() => onFlash("Social reply sent")}>
                Send ↑
              </button>
            </footer>
          </article>
          <aside className="socialContactPanel">
            <small>CONTACT INTELLIGENCE</small>
            <span>SL</span>
            <h3>Sophia Lewis</h3>
            <p>@sophialewis · Palm Beach, FL</p>
            <div>
              <small>INTENT SCORE</small>
              <b>92</b>
            </div>
            <div>
              <small>TRIGGER</small>
              <b>DEMO</b>
            </div>
            <div>
              <small>ATTRIBUTION</small>
              <b>Instagram Reel</b>
            </div>
            <button onClick={() => onFlash("CRM record opened")}>
              Open CRM record →
            </button>
          </aside>
        </div>
      )}

      {panel === "Audience" && (
        <div className="socialAudience">
          <section className="crmPanel">
            <div className="crmPanelHead">
              <div>
                <small>SMART AUDIENCES</small>
                <h2>Segments that update themselves</h2>
              </div>
              <button onClick={() => onFlash("Segment builder opened")}>
                ＋ New segment
              </button>
            </div>
            {[
              [
                "High-intent social leads",
                "386 people",
                "Intent above 80 + replied in 14 days",
                "+42",
              ],
              [
                "Pricing requested",
                "172 people",
                "Said PRICE, COST, or PAYMENT",
                "+18",
              ],
              [
                "Booked from Instagram",
                "96 people",
                "Social attribution + confirmed booking",
                "+11",
              ],
              [
                "Needs human follow-up",
                "28 people",
                "AI confidence below threshold",
                "−6",
              ],
            ].map((item) => (
              <button
                className="audienceRow"
                onClick={() => onFlash(`${item[0]} opened`)}
                key={item[0]}
              >
                <span>
                  <b>{item[0]}</b>
                  <small>{item[2]}</small>
                </span>
                <strong>{item[1]}</strong>
                <em>{item[3]} this week</em>
                <i>→</i>
              </button>
            ))}
          </section>
          <aside className="crmPanel">
            <small>AUDIENCE INTELLIGENCE</small>
            <h2>2,418</h2>
            <p>Known social profiles unified with Cyncro contacts.</p>
            <div className="audienceRing">
              <span>
                <b>68%</b>
                <small>reachable</small>
              </span>
            </div>
            <button onClick={() => onFlash("Audience opportunity analyzed")}>
              ✦ Find revenue opportunity
            </button>
          </aside>
        </div>
      )}

      {panel === "Analytics" && (
        <div className="socialAnalytics">
          <section className="crmPanel">
            <div className="crmPanelHead">
              <div>
                <small>CONVERSION ANALYTICS</small>
                <h2>From keyword to revenue</h2>
              </div>
              <button onClick={() => onFlash("Analytics exported")}>
                Export report
              </button>
            </div>
            <div className="socialFunnel">
              {[
                ["REACHED", "8,142", "100%"],
                ["ENGAGED", "2,813", "34.5%"],
                ["CAPTURED", "973", "11.9%"],
                ["BOOKED", "286", "3.5%"],
                ["WON", "$42.8K", "1.2%"],
              ].map((item, index) => (
                <article
                  style={{ width: `${100 - index * 11}%` }}
                  key={item[0]}
                >
                  <small>{item[0]}</small>
                  <b>{item[1]}</b>
                  <span>{item[2]}</span>
                </article>
              ))}
            </div>
          </section>
          <aside className="crmPanel">
            <small>TOP BUYING WORDS</small>
            <h2>Intent leaderboard</h2>
            {[
              ["DEMO", "386 leads"],
              ["PRICE", "172 leads"],
              ["SYSTEM", "128 leads"],
              ["BOOK", "96 leads"],
              ["HELP", "74 leads"],
            ].map((item, index) => (
              <div key={item[0]}>
                <span>{index + 1}</span>
                <b>{item[0]}</b>
                <em>{item[1]}</em>
              </div>
            ))}
            <button onClick={() => onFlash("AI keywords discovered")}>
              ✦ Discover hidden keywords
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function CRMAccounts({
  onFlash,
  currentUserName,
  isOwner,
}: {
  onFlash: (message: string) => void;
  currentUserName: string;
  isOwner: boolean;
}) {
  type Account = {
    id: string;
    name: string;
    domain?: string;
    phone?: string;
    address?: string;
    category?: string;
    status: string;
    account_manager?: string;
    sales_director?: string;
    vp_sales?: string;
    notes?: string;
    contact_count: number;
    opportunity_count: number;
    pipeline_cents: number;
    collected_cents: number;
    estimated_payout_cents?: number;
    monthly_residual_cents?: number;
  };
  type Deal = {
    id: string;
    account_id: string;
    name: string;
    stage: string;
    value_cents: number;
    collected_cents: number;
    assigned_rep?: string;
    commission_rate_bps?: number;
    commission_status?: string;
    payment_status: string;
    residual_flat_cents?: number;
  };
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [accountQuery, setAccountQuery] = useState("");
  const [accountView, setAccountView] = useState<
    "OVERVIEW" | "TEAM" | "NOTES" | "DEALS"
  >("OVERVIEW");
  const [editing, setEditing] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [accountNote, setAccountNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    domain: "",
    phone: "",
    address: "",
    category: "",
    accountManager: "",
    salesDirector: "",
    vpSales: "",
    notes: "",
    status: "ACTIVE",
  });
  const [newAccount, setNewAccount] = useState({
    name: "", domain: "", phone: "", category: "", accountManager: currentUserName,
  });
  const load = async () => {
    const [a, d] = await Promise.all([
      fetch(`/api/crm/accounts?fresh=${Date.now()}`, { cache: "no-store" }),
      fetch(`/api/crm/opportunities?fresh=${Date.now()}`, {
        cache: "no-store",
      }),
    ]);
    const ad = (await a.json()) as { accounts?: Account[]; error?: string };
    const dd = (await d.json()) as { opportunities?: Deal[] };
    if (!a.ok) {
      onFlash(ad.error || "Accounts could not be loaded");
      return;
    }
    setAccounts(ad.accounts || []);
    setDeals(dd.opportunities || []);
    if (!selectedId && ad.accounts?.[0]) setSelectedId(ad.accounts[0].id);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("cyncro:data-changed", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("cyncro:data-changed", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const active = accounts.find((item) => item.id === selectedId);
  const visibleAccounts = accounts.filter((item) =>
    `${item.name} ${item.domain || ""} ${item.category || ""}`
      .toLowerCase()
      .includes(accountQuery.toLowerCase()),
  );
  const accountDeals = deals.filter((deal) => deal.account_id === selectedId);
  const beginEdit = () => {
    if (!active) return;
    setDraft({
      name: active.name,
      domain: active.domain || "",
      phone: active.phone || "",
      address: active.address || "",
      category: active.category || "",
      accountManager: active.account_manager || "",
      salesDirector: active.sales_director || "",
      vpSales: active.vp_sales || "",
      notes: active.notes || "",
      status: active.status,
    });
    setEditing(true);
  };
  const saveAccount = async () => {
    if (!active) return;
    const response = await fetch("/api/crm/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, updates: draft }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Account update failed");
      return;
    }
    setEditing(false);
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "account", action: "updated" },
      }),
    );
    await load();
    onFlash("Account and sales hierarchy saved");
  };
  const createAccount = async () => {
    if (!newAccount.name.trim()) return onFlash("Account name is required");
    const response = await fetch("/api/crm/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAccount),
    });
    const data = (await response.json()) as { account?: Account; error?: string };
    if (!response.ok) return onFlash(data.error || "Account could not be created");
    setCreatingAccount(false);
    setNewAccount({ name: "", domain: "", phone: "", category: "", accountManager: currentUserName });
    if (data.account?.id) setSelectedId(data.account.id);
    await load();
    onFlash("Account created");
  };
  const addAccountNote = async () => {
    if (!active || !accountNote.trim()) {
      onFlash("Type an account note first");
      return;
    }
    setSavingNote(true);
    const stamped = `${new Date().toLocaleString()} · ${currentUserName}\n${accountNote.trim()}`;
    const notes = active.notes ? `${stamped}\n\n${active.notes}` : stamped;
    const response = await fetch("/api/crm/accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, updates: { notes } }),
    });
    const data = (await response.json()) as { error?: string };
    setSavingNote(false);
    if (!response.ok) {
      onFlash(data.error || "Account note could not be saved");
      return;
    }
    setAccountNote("");
    setNoteOpen(false);
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "account", action: "note-created" },
      }),
    );
    await load();
    onFlash("Account note saved and shared");
  };
  const money = (cents = 0) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(cents) / 100);
  const teamNames = Array.from(
    new Set(
      [
        currentUserName,
        ...accounts.flatMap((item) => [
          item.account_manager,
          item.sales_director,
          item.vp_sales,
        ]),
        ...deals.map((deal) => deal.assigned_rep),
      ].filter((name): name is string => Boolean(name)),
    ),
  );
  return (
    <div className="accountWorkspace accountUnifiedCommand crmPanel">
      <section className="accountCommandBar">
        <div><small>ACCOUNT COMMAND</small><h2>{active?.name || "Customer accounts"}</h2></div>
        <label className="accountPickerLabel">
          <span>SELECT ACCOUNT</span>
          <button className="accountPickerTrigger" type="button" onClick={() => setAccountPickerOpen((open) => !open)} aria-expanded={accountPickerOpen}>
            <b>{active?.name || "Choose an account"}</b><i>{accountPickerOpen ? "⌃" : "⌄"}</i>
          </button>
          {accountPickerOpen && <div className="accountPickerMenu">
            <input autoFocus placeholder="Search accounts…" value={accountQuery} onChange={(event) => setAccountQuery(event.target.value)} />
            <div>
              {visibleAccounts.map((item) => <button type="button" className={item.id === selectedId ? "active" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setAccountView("OVERVIEW"); setAccountPickerOpen(false); setAccountQuery(""); }}>
                <span><b>{item.name}</b><small>{item.category || item.domain || "Customer account"}</small></span><em>{item.id === selectedId ? "Selected" : "Open"}</em>
              </button>)}
              {!visibleAccounts.length && <p>No accounts match that search.</p>}
            </div>
          </div>}
        </label>
        <button onClick={() => void load()}>↻ Refresh</button>
        <button className="crmCreate" onClick={() => setCreatingAccount(true)}>＋ New account</button>
      </section>
      {!active && (
        <section className="accountEmptyState">
          <i>◎</i><h3>No customer account selected</h3>
          <p>Create an account or import a prospect to manage contacts, ownership, deals, notes, payments, and commissions in one place.</p>
          <button className="crmCreate" onClick={() => setCreatingAccount(true)}>Create first account</button>
        </section>
      )}
      {active && (
        <section className="accountCommand">
          <div className="accountCommandHead">
            <div>
              <small>SELECTED ACCOUNT</small>
              <h2>{active.name}</h2>
              <p>
                Unified relationship, revenue, engagement, and delivery
                intelligence.
              </p>
            </div>
            <div className="accountCommandControls">
              <button className="crmCreate" onClick={beginEdit}>
                Edit account
              </button>
            </div>
          </div>
          <div className="accountValueGrid">
            {[
              ["SALES SOLD", money(active.pipeline_cents)],
              ["PAYMENTS COLLECTED", money(active.collected_cents)],
              ...(isOwner
                ? [
                    ["ESTIMATED PAYOUT", money(active.estimated_payout_cents)],
                    [
                      "MONTHLY RESIDUAL",
                      money(
                        accountDeals.reduce(
                          (sum, deal) =>
                            sum + Number(deal.residual_flat_cents || 0),
                          0,
                        ),
                      ),
                    ],
                  ]
                : []),
            ].map((item) => (
              <div key={item[0]}>
                <small>{item[0]}</small>
                <b>{item[1]}</b>
              </div>
            ))}
          </div>
          <nav className="accountCommandTabs" aria-label="Account sections">
            {(["OVERVIEW", "TEAM", "NOTES", "DEALS"] as const).map(
              (item) => (
                <button
                  className={accountView === item ? "active" : ""}
                  onClick={() => setAccountView(item)}
                  key={item}
                >
                  {item[0] + item.slice(1).toLowerCase()}
                </button>
              ),
            )}
          </nav>
          {accountView === "OVERVIEW" && (
            <div className="accountOverviewClean">
              {[
                ["CATEGORY", active.category || "Not set"],
                ["WEBSITE", active.domain || "Not set"],
                ["PHONE", active.phone || "Not set"],
                ["ADDRESS", active.address || "Not set"],
                ["ACCOUNT MANAGER", active.account_manager || "Unassigned"],
                ["OPEN DEALS", String(active.opportunity_count || 0)],
              ].map((item) => (
                <div key={item[0]}>
                  <small>{item[0]}</small>
                  <b>{item[1]}</b>
                </div>
              ))}
            </div>
          )}
          {accountView === "TEAM" && <div className="salesHierarchy">
            <div className="crmPanelHead">
              <div>
                <small>SALES OWNERSHIP</small>
                <h3>Account hierarchy</h3>
              </div>
              <button onClick={beginEdit}>Edit assignments</button>
            </div>
            {[
              ["ACCOUNT MANAGER", active.account_manager || "Unassigned"],
              ["SALES DIRECTOR", active.sales_director || "Unassigned"],
              ["VP OF SALES", active.vp_sales || "Unassigned"],
            ].map((person) => (
              <div key={person[0]}>
                <i>{person[1].slice(0, 2).toUpperCase()}</i>
                <span>
                  <b>{person[1]}</b>
                  <small>{person[0]}</small>
                </span>
              </div>
            ))}
          </div>}
          {accountView === "NOTES" && <div className="accountNotes">
            <div className="crmPanelHead">
              <div>
                <small>ACCOUNT NOTES</small>
                <h3>Shared account context</h3>
              </div>
              <button className="crmCreate" onClick={() => setNoteOpen(true)}>
                ＋ Add note
              </button>
            </div>
            {noteOpen && (
              <div className="accountNoteComposer">
                <textarea
                  autoFocus
                  placeholder="Add a shared note for this account…"
                  value={accountNote}
                  onChange={(event) => setAccountNote(event.target.value)}
                />
                <div>
                  <button
                    disabled={savingNote}
                    onClick={() => {
                      setNoteOpen(false);
                      setAccountNote("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="crmCreate"
                    disabled={savingNote || !accountNote.trim()}
                    onClick={() => void addAccountNote()}
                  >
                    {savingNote ? "Saving…" : "Save note"}
                  </button>
                </div>
              </div>
            )}
            <p>
              {active.notes ||
                "No account notes yet. Add the first note so everyone assigned to this account can see it."}
            </p>
          </div>}
          {accountView === "DEALS" && isOwner && (
            <div className="accountDeals">
              <div className="crmPanelHead">
                <div>
                  <small>OWNER ONLY · DEAL COMPENSATION</small>
                  <h3>Sales, payments, commissions & lifetime residuals</h3>
                </div>
              </div>
              {accountDeals.map((deal) => (
                <div className="accountDealRow" key={deal.id}>
                  <span>
                    <b>{deal.name}</b>
                    <small>
                      {deal.stage} · {deal.assigned_rep || "Unassigned rep"}
                    </small>
                  </span>
                  <span>
                    <small>SOLD</small>
                    <b>{money(deal.value_cents)}</b>
                  </span>
                  <span>
                    <small>COLLECTED</small>
                    <b>{money(deal.collected_cents)}</b>
                  </span>
                  <span>
                    <small>COMMISSION</small>
                    <b>{Number(deal.commission_rate_bps || 2000) / 100}%</b>
                  </span>
                  <span>
                    <small>EST. PAYOUT</small>
                    <b>
                      {money(
                        (deal.collected_cents *
                          Number(deal.commission_rate_bps || 2000)) /
                          10000,
                      )}
                    </b>
                  </span>
                  <span>
                    <small>RESIDUAL</small>
                    <b>
                      {money(deal.residual_flat_cents || 2500)}/mo while active
                    </b>
                  </span>
                  <em>{deal.payment_status}</em>
                </div>
              ))}
              {!accountDeals.length && (
                <div className="noProspects">
                  No deals connected to this account yet.
                </div>
              )}
            </div>
          )}
        </section>
      )}
      {editing && active && (
        <div className="modalback" onClick={() => setEditing(false)}>
          <div
            className="bookingmodal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>ACCOUNT CONTROLS</label>
                <h2>Customize {active.name}</h2>
              </div>
              <button onClick={() => setEditing(false)}>×</button>
            </div>
            <datalist id="cyncro-team-names">
              {teamNames.map((name) => (
                <option value={name} key={name} />
              ))}
            </datalist>
            <div className="crmForm">
              <label>
                Account name
                <input
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <label>
                Category
                <input
                  value={draft.category}
                  onChange={(event) =>
                    setDraft({ ...draft, category: event.target.value })
                  }
                />
              </label>
              <label>
                Website
                <input
                  value={draft.domain}
                  onChange={(event) =>
                    setDraft({ ...draft, domain: event.target.value })
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft({ ...draft, phone: event.target.value })
                  }
                />
              </label>
              <label>
                Address
                <input
                  value={draft.address}
                  onChange={(event) =>
                    setDraft({ ...draft, address: event.target.value })
                  }
                />
              </label>
              <label>
                Account Manager
                <div className="assignmentInput">
                  <input
                    list="cyncro-team-names"
                    value={draft.accountManager}
                    onChange={(event) =>
                      setDraft({ ...draft, accountManager: event.target.value })
                    }
                  />
                  <button
                    onClick={() =>
                      setDraft({ ...draft, accountManager: currentUserName })
                    }
                  >
                    Assign me
                  </button>
                </div>
              </label>
              <label>
                Sales Director
                <div className="assignmentInput">
                  <input
                    list="cyncro-team-names"
                    value={draft.salesDirector}
                    onChange={(event) =>
                      setDraft({ ...draft, salesDirector: event.target.value })
                    }
                  />
                  <button
                    onClick={() =>
                      setDraft({ ...draft, salesDirector: currentUserName })
                    }
                  >
                    Assign me
                  </button>
                </div>
              </label>
              <label>
                VP of Sales
                <div className="assignmentInput">
                  <input
                    list="cyncro-team-names"
                    value={draft.vpSales}
                    onChange={(event) =>
                      setDraft({ ...draft, vpSales: event.target.value })
                    }
                  />
                  <button
                    onClick={() =>
                      setDraft({ ...draft, vpSales: currentUserName })
                    }
                  >
                    Assign me
                  </button>
                </div>
              </label>
              <label>
                Account notes
                <textarea
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft({ ...draft, notes: event.target.value })
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({ ...draft, status: event.target.value })
                  }
                >
                  <option>ACTIVE</option>
                  <option>ONBOARDING</option>
                  <option>PAUSED</option>
                  <option>CHURNED</option>
                </select>
              </label>
            </div>
            <div className="modalactions">
              <button onClick={() => setEditing(false)}>Cancel</button>
              <button onClick={() => void saveAccount()}>Save account</button>
            </div>
          </div>
        </div>
      )}
      {creatingAccount && (
        <div className="modalback" onClick={() => setCreatingAccount(false)}>
          <div className="bookingmodal" onClick={(event) => event.stopPropagation()}>
            <div className="modalhead"><div><label>NEW CUSTOMER</label><h2>Create account</h2></div><button onClick={() => setCreatingAccount(false)}>×</button></div>
            <div className="crmForm">
              <label>Account name<input autoFocus value={newAccount.name} onChange={(e) => setNewAccount({...newAccount,name:e.target.value})} /></label>
              <label>Website<input value={newAccount.domain} onChange={(e) => setNewAccount({...newAccount,domain:e.target.value})} /></label>
              <label>Phone<input value={newAccount.phone} onChange={(e) => setNewAccount({...newAccount,phone:e.target.value})} /></label>
              <label>Category<input value={newAccount.category} onChange={(e) => setNewAccount({...newAccount,category:e.target.value})} /></label>
              <label className="wide">Account manager<input value={newAccount.accountManager} onChange={(e) => setNewAccount({...newAccount,accountManager:e.target.value})} /></label>
            </div>
            <button className="modalSave" onClick={() => void createAccount()}>Create account</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CRMJourneys({ onFlash }: { onFlash: (message: string) => void }) {
  const [journey, setJourney] = useState("Client acquisition");
  const journeys = [
    "Client acquisition",
    "Paid event",
    "Customer onboarding",
    "Renewal & expansion",
  ];
  return (
    <div className="journeyWorkspace">
      <aside className="journeyLibrary crmPanel">
        <div>
          <small>JOURNEY ORCHESTRATOR</small>
          <h2>Lifecycle systems</h2>
          <p>Coordinate every customer moment across teams and channels.</p>
        </div>
        {journeys.map((item, index) => (
          <button
            className={journey === item ? "active" : ""}
            onClick={() => setJourney(item)}
            key={item}
          >
            <i>{String(index + 1).padStart(2, "0")}</i>
            <span>
              <b>{item}</b>
              <small>
                {index === 0
                  ? "842 active contacts"
                  : `${(index + 2) * 61} active contacts`}
              </small>
            </span>
            <em>→</em>
          </button>
        ))}
        <button
          className="newJourney"
          onClick={() => onFlash("Journey builder opened")}
        >
          ＋ Create journey
        </button>
      </aside>
      <main className="journeyBuilder crmPanel">
        <header>
          <div>
            <small>LIVE JOURNEY</small>
            <h2>{journey}</h2>
          </div>
          <div>
            <span>● 842 enrolled</span>
            <button onClick={() => onFlash("Journey published")}>
              Publish changes
            </button>
          </div>
        </header>
        <div className="journeyFlowCanvas">
          <div className="journeyLane">
            <small>ENTRY</small>
            <article>
              <i>⚡</i>
              <div>
                <b>Customer signal</b>
                <span>
                  Qualified booking, form, payment, or manual enrollment
                </span>
              </div>
              <em>842</em>
            </article>
          </div>
          <div className="journeyConnector">
            <span>Conditions passed · 78%</span>
          </div>
          <div className="journeyLane">
            <small>INTELLIGENCE</small>
            <div className="journeyBranch">
              <article>
                <i>✦</i>
                <div>
                  <b>Evaluate fit + intent</b>
                  <span>
                    Score profile, behavior, source, value, and timing
                  </span>
                </div>
                <em>AI</em>
              </article>
              <article>
                <i>⌁</i>
                <div>
                  <b>Route ownership</b>
                  <span>
                    Match territory, service, workload, and relationship
                  </span>
                </div>
                <em>3 rules</em>
              </article>
            </div>
          </div>
          <div className="journeyConnector">
            <span>High intent → personal path</span>
          </div>
          <div className="journeyLane">
            <small>ORCHESTRATION</small>
            <div className="journeyBranch three">
              <article>
                <i>✉</i>
                <div>
                  <b>Personalized follow-up</b>
                  <span>Email + SMS</span>
                </div>
                <em>2 min</em>
              </article>
              <article>
                <i>□</i>
                <div>
                  <b>Create next action</b>
                  <span>Task + booking link</span>
                </div>
                <em>Owner</em>
              </article>
              <article>
                <i>$</i>
                <div>
                  <b>Revenue path</b>
                  <span>Offer + payment</span>
                </div>
                <em>Dynamic</em>
              </article>
            </div>
          </div>
          <div className="journeyConnector">
            <span>Wait until outcome or signal</span>
          </div>
          <div className="journeyLane">
            <small>OUTCOME</small>
            <article className="journeyOutcome">
              <i>✓</i>
              <div>
                <b>Lifecycle advanced</b>
                <span>
                  Contact, account, opportunity, forecast, and analytics
                  synchronized
                </span>
              </div>
              <em>31.8%</em>
            </article>
          </div>
          <button
            className="journeyAdd"
            onClick={() => onFlash("Journey step added")}
          >
            ＋ Add decision, action, delay, experiment, or AI agent
          </button>
        </div>
      </main>
    </div>
  );
}

function CRMAutomations({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="automationWorkspace">
      <div className="automationSummary">
        {[
          ["18", "ACTIVE SYSTEMS"],
          ["4,286", "ACTIONS THIS MONTH"],
          ["96.8%", "SUCCESS RATE"],
          ["132 hrs", "TIME RETURNED"],
        ].map((item) => (
          <div key={item[1]}>
            <b>{item[0]}</b>
            <small>{item[1]}</small>
          </div>
        ))}
      </div>
      <div className="automationGrid">
        {[
          [
            "Booking → Opportunity",
            "When a qualified booking is created, enrich the contact, open an opportunity, and assign the correct owner.",
            "1,248 runs",
            "LIVE",
          ],
          [
            "No-show recovery",
            "Send a recovery sequence, reopen availability, and notify the owner when a customer rebooks.",
            "184 runs",
            "LIVE",
          ],
          [
            "High-intent escalation",
            "Detect proposal views, payment activity, and decision language—then create the next best action.",
            "96 runs",
            "LIVE",
          ],
          [
            "Customer onboarding",
            "After payment, create tasks, collect documents, book kickoff, and move the lifecycle stage.",
            "72 runs",
            "LIVE",
          ],
          [
            "Waitlist conversion",
            "Fill cancelled seats automatically and stop the sequence when capacity is restored.",
            "318 runs",
            "LIVE",
          ],
          [
            "Reactivation engine",
            "Identify dormant contacts with buying signals and launch a personalized re-engagement path.",
            "Ready",
            "DRAFT",
          ],
        ].map((item, index) => (
          <article className="crmPanel" key={item[0]}>
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i className={item[3] === "LIVE" ? "on" : ""}>{item[3]}</i>
            </header>
            <h2>{item[0]}</h2>
            <p>{item[1]}</p>
            <footer>
              <small>{item[2]}</small>
              <button onClick={() => onFlash(`${item[0]} opened`)}>
                Open system →
              </button>
            </footer>
          </article>
        ))}
      </div>
      <button
        className="newAutomation"
        onClick={() => onFlash("Automation builder opened")}
      >
        ＋ Build a new operating system
      </button>
    </div>
  );
}
function CRMDataGraph({ onFlash }: { onFlash: (message: string) => void }) {
  const [focus, setFocus] = useState("Alexandra Lewis");
  const nodes = [
    ["Alexandra Lewis", "CONTACT", "graphContact", "50%", "44%"],
    ["Northstar Advisory", "ACCOUNT", "graphAccount", "50%", "12%"],
    ["$18.5K Proposal", "OPPORTUNITY", "graphDeal", "19%", "38%"],
    ["Strategy Session", "BOOKING", "graphBooking", "81%", "38%"],
    ["Account Owner", "OWNER", "graphOwner", "27%", "73%"],
    ["Private Link", "SOURCE", "graphSource", "73%", "73%"],
    ["Payment Intent", "SIGNAL", "graphSignal", "50%", "83%"],
  ];
  return (
    <div className="graphWorkspace">
      <section className="graphCanvas crmPanel">
        <header>
          <div>
            <small>UNIVERSAL RELATIONSHIP GRAPH</small>
            <h2>Every record. Every relationship. One truth.</h2>
          </div>
          <div>
            <button onClick={() => onFlash("Graph filter opened")}>
              Filter objects
            </button>
            <button onClick={() => onFlash("Graph expanded")}>
              Expand network
            </button>
          </div>
        </header>
        <div className="graphStage">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line x1="50" y1="44" x2="50" y2="12" />
            <line x1="50" y1="44" x2="19" y2="38" />
            <line x1="50" y1="44" x2="81" y2="38" />
            <line x1="50" y1="44" x2="27" y2="73" />
            <line x1="50" y1="44" x2="73" y2="73" />
            <line x1="50" y1="44" x2="50" y2="83" />
            <line x1="19" y1="38" x2="27" y2="73" />
            <line x1="81" y1="38" x2="73" y2="73" />
          </svg>
          {nodes.map((node) => (
            <button
              className={`graphNode ${node[2]} ${focus === node[0] ? "active" : ""}`}
              style={{ left: node[3], top: node[4] }}
              onClick={() => setFocus(node[0])}
              key={node[0]}
            >
              <small>{node[1]}</small>
              <b>{node[0]}</b>
              <i>●</i>
            </button>
          ))}
        </div>
        <footer>
          <span>
            <i className="graphContact" /> Contact
          </span>
          <span>
            <i className="graphAccount" /> Account
          </span>
          <span>
            <i className="graphDeal" /> Revenue
          </span>
          <span>
            <i className="graphBooking" /> Booking
          </span>
          <span>
            <i className="graphSignal" /> Signal
          </span>
        </footer>
      </section>
      <aside className="graphInspector crmPanel">
        <small>GRAPH INSPECTOR</small>
        <h2>{focus}</h2>
        <p>Live context assembled across the complete Cyncro object model.</p>
        <div className="graphScore">
          <span>
            <b>94</b>
            <small>INTENT</small>
          </span>
          <span>
            <b>88</b>
            <small>HEALTH</small>
          </span>
          <span>
            <b>76</b>
            <small>FIT</small>
          </span>
        </div>
        {[
          ["Connected records", "18"],
          ["Relationship depth", "4 levels"],
          ["Last signal", "4 min ago"],
          ["Data confidence", "98.7%"],
        ].map((item) => (
          <div className="graphFact" key={item[0]}>
            <span>{item[0]}</span>
            <b>{item[1]}</b>
          </div>
        ))}
        <h3>Ask the graph</h3>
        {[
          "Who influences this deal?",
          "What changed this week?",
          "Show the shortest path to revenue",
        ].map((item) => (
          <button onClick={() => onFlash("Graph answer generated")} key={item}>
            ✦ {item}
          </button>
        ))}
      </aside>
    </div>
  );
}

function CRMAgentTeam({ onFlash }: { onFlash: (message: string) => void }) {
  const agents = [
    [
      "Atlas",
      "Revenue strategist",
      "Prioritizes pipeline, forecasts outcomes, and builds next-best actions.",
      "128 decisions",
      "LIVE",
    ],
    [
      "Nova",
      "Conversation agent",
      "Handles inbound qualification and maintains context across every channel.",
      "84 conversations",
      "LIVE",
    ],
    [
      "Sage",
      "Customer intelligence",
      "Enriches records, maps relationships, and monitors health and intent.",
      "2,418 records",
      "LIVE",
    ],
    [
      "Kronos",
      "Operations agent",
      "Coordinates tasks, bookings, owners, resources, deadlines, and SLAs.",
      "396 actions",
      "LIVE",
    ],
    [
      "Onyx",
      "Governance agent",
      "Monitors permissions, data quality, duplicates, risk, and audit policy.",
      "14 reviews",
      "GUARDED",
    ],
  ];
  return (
    <div className="agentWorkspace">
      <section className="agentHero">
        <div>
          <small>AGENTIC REVENUE OPERATING SYSTEM</small>
          <h2>Your AI team works across the entire customer lifecycle.</h2>
          <p>
            Each agent has a defined role, access boundary, approval policy,
            memory scope, and measurable business outcome.
          </p>
        </div>
        <aside>
          <span>5 agents online</span>
          <b>99.98%</b>
          <small>CONTROLLED EXECUTION RATE</small>
          <button onClick={() => onFlash("Agent orchestration opened")}>
            Open orchestration map →
          </button>
        </aside>
      </section>
      <div className="agentGrid">
        {agents.map((agent, index) => (
          <article className="crmPanel" key={agent[0]}>
            <header>
              <span>{agent[0][0]}</span>
              <div>
                <small>AGENT {String(index + 1).padStart(2, "0")}</small>
                <h3>{agent[0]}</h3>
              </div>
              <i className={agent[4] === "LIVE" ? "live" : "guarded"}>
                {agent[4]}
              </i>
            </header>
            <b>{agent[1]}</b>
            <p>{agent[2]}</p>
            <div className="agentStats">
              <span>
                <small>LAST 30 DAYS</small>
                <b>{agent[3]}</b>
              </span>
              <span>
                <small>AUTHORITY</small>
                <b>
                  {index < 2
                    ? "Approve to send"
                    : index === 4
                      ? "Audit only"
                      : "Internal actions"}
                </b>
              </span>
            </div>
            <footer>
              <button onClick={() => onFlash(`${agent[0]} activity opened`)}>
                View activity
              </button>
              <button onClick={() => onFlash(`${agent[0]} controls opened`)}>
                Permissions
              </button>
            </footer>
          </article>
        ))}
      </div>
      <section className="agentCommand crmPanel">
        <div>
          <small>SHARED MISSION CONTROL</small>
          <h2>Coordinate agents around an outcome—not disconnected tasks.</h2>
        </div>
        <div className="missionFlow">
          <article>
            <span>01</span>
            <b>Observe</b>
            <small>Business event stream</small>
          </article>
          <i>→</i>
          <article>
            <span>02</span>
            <b>Reason</b>
            <small>Shared context + policy</small>
          </article>
          <i>→</i>
          <article>
            <span>03</span>
            <b>Propose</b>
            <small>Plan + predicted impact</small>
          </article>
          <i>→</i>
          <article>
            <span>04</span>
            <b>Approve</b>
            <small>Human or policy gate</small>
          </article>
          <i>→</i>
          <article>
            <span>05</span>
            <b>Execute</b>
            <small>Action + full audit</small>
          </article>
        </div>
        <button onClick={() => onFlash("Mission builder opened")}>
          ＋ Build an agent mission
        </button>
      </section>
    </div>
  );
}

function CRMCompensation({
  onFlash,
  isOwner,
}: {
  onFlash: (message: string) => void;
  isOwner: boolean;
}) {
  type Deal = {
    id: string;
    name: string;
    account_name: string;
    assigned_rep?: string;
    value_cents: number;
    collected_cents?: number;
    payment_status?: string;
    source?: string;
    notes?: string;
    commission_rate_bps?: number;
    commission_status?: string;
  };
  const [deals, setDeals] = useState<Deal[]>([]);
  const [service, setService] = useState<Record<string, string>>({});
  const load = async () => {
    const r = await fetch("/api/crm/opportunities?compensation=1", { cache: "no-store" });
    const d = (await r.json()) as { opportunities?: Deal[]; error?: string };
    if (!r.ok) return onFlash(d.error || "Commissions could not load");
    setDeals(d.opportunities || []);
  };
  useEffect(() => { void load(); }, [isOwner]);
  const rate = (deal: Deal) => {
    if (deal.commission_rate_bps) return deal.commission_rate_bps / 100;
    const kind = service[deal.id] || "AUTOMATION";
    if (kind === "WEBSITE" || kind === "LANDING_PAGE") return 50;
    const value = deal.value_cents / 100;
    return value >= 10000 ? 30 : value >= 5000 ? 25 : 20;
  };
  const payout = (deal: Deal) =>
    Math.round(
      (Number(deal.collected_cents || deal.value_cents) * rate(deal)) / 100,
    );
  const exportCsv = () => {
    const rows = [
      [
        "Employee",
        "Deal",
        "Service",
        "Deal Value",
        "Collected",
        "Rate",
        "Payout",
      ],
      ...deals.map((d) => [
        d.assigned_rep || "Unassigned",
        d.name,
        service[d.id] || "AUTOMATION",
        (d.value_cents / 100).toFixed(2),
        (Number(d.collected_cents || 0) / 100).toFixed(2),
        `${rate(d)}%`,
        (payout(d) / 100).toFixed(2),
      ]),
    ];
    const blob = new Blob(
      [
        rows
          .map((r) =>
            r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `cyncro-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onFlash("Payout report downloaded");
  };
  const updateDeal = async (deal: Deal, updates: Record<string, unknown>) => {
    const response = await fetch("/api/crm/opportunities", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deal.id, updates }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) return onFlash(data.error || "Payout could not be updated");
    await load();
    onFlash("Commission and payout saved");
  };
  return (
    <div className="financeWorkspace">
      <section className="financeHero crmPanel">
        <div>
          <small>{isOwner ? "OWNER COMPENSATION DESK" : "MY COMMISSION SHEET"}</small>
          <h2>{isOwner ? "Calculate and approve every payout." : "Your assigned deals and payouts."}</h2>
          <p>
            Automations scale from 20–30% by deal size. Websites and landing
            pages pay 50% for the first month only.
          </p>
        </div>
        <button onClick={exportCsv}>↓ Download payout data</button>
      </section>
      <section className="crmPanel payoutRules">
        <div>
          <b>20%</b>
          <span>Under $5,000</span>
        </div>
        <div>
          <b>25%</b>
          <span>$5,000–$9,999</span>
        </div>
        <div>
          <b>30%</b>
          <span>$10,000+</span>
        </div>
        <div>
          <b>50%</b>
          <span>Website/landing page · month one</span>
        </div>
      </section>
      <section className="crmPanel payoutLedger">
        <header>
          <span>DEAL / EMPLOYEE</span>
          <span>SERVICE</span>
          <span>COLLECTED</span>
          <span>RATE</span>
          <span>PAYOUT</span>
        </header>
        {deals.map((d) => (
          <div key={d.id}>
            <span>
              <b>{d.name}</b>
              <small>
                {d.assigned_rep || "Unassigned"} · {d.account_name}
              </small>
              {isOwner && (
                <span className="payoutAssignmentFields">
                  <input aria-label="Account manager" defaultValue={d.assigned_rep || ""} placeholder="Account manager" onBlur={(e) => void updateDeal(d, { assignedRep: e.target.value })} />
                  <input aria-label="Lead source" defaultValue={d.source || ""} placeholder="Source" onBlur={(e) => void updateDeal(d, { source: e.target.value })} />
                </span>
              )}
            </span>
            <select
              disabled={!isOwner}
              value={service[d.id] || "AUTOMATION"}
              onChange={(e) => {
                const kind = e.target.value;
                setService({ ...service, [d.id]: kind });
                const automaticRate = kind === "AUTOMATION" ? (d.value_cents >= 1000000 ? 30 : d.value_cents >= 500000 ? 25 : 20) : 50;
                void updateDeal(d, { commissionRate: automaticRate });
              }}
            >
              <option value="AUTOMATION">Automation / recurring</option>
              <option value="WEBSITE">Website · first month</option>
              <option value="LANDING_PAGE">Landing page · first month</option>
            </select>
            {isOwner ? <input aria-label="Amount paid" type="number" min="0" defaultValue={Number(d.collected_cents || 0) / 100} onBlur={(e) => void updateDeal(d, { collected: Number(e.target.value) })} /> : <strong>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(Number(d.collected_cents || 0) / 100)}
            </strong>}
            {isOwner ? <input aria-label="Commission percentage" type="number" min="20" max="50" defaultValue={rate(d)} onBlur={(e) => void updateDeal(d, { commissionRate: Number(e.target.value) })} /> : <em>{rate(d)}%</em>}
            <b>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(payout(d) / 100)}
            </b>
          </div>
        ))}
        {!deals.length && <div className="emptyState">No commissions are assigned to this user yet.</div>}
      </section>
    </div>
  );
}

function CRMInvoices({ onFlash, onOpenIntegrations }: { onFlash: (message: string) => void; onOpenIntegrations: () => void }) {
  type Invoice = {
    id: string;
    invoice_number: string;
    client_name: string;
    client_email: string;
    description: string;
    amount_cents: number;
    due_date?: string;
    status: string;
    stripe_url?: string;
  };
  const [rows, setRows] = useState<Invoice[]>([]),
    [stripeConnected, setStripeConnected] = useState(false),
    [form, setForm] = useState({
      clientName: "",
      clientEmail: "",
      description: "",
      amount: "",
      dueDate: "",
    });
  const load = async () => {
    const r = await fetch("/api/crm/invoices", { cache: "no-store" }),
      d = (await r.json()) as { invoices?: Invoice[]; error?: string };
    if (!r.ok) {
      onFlash(d.error || "Invoices could not load");
      return;
    }
    setRows(d.invoices || []);
  };
  useEffect(() => {
    void load();
    void fetch("/api/integrations/status").then(async (response) => { if (response.ok) { const data = await response.json() as { connections?: Record<string,boolean> }; setStripeConnected(Boolean(data.connections?.stripe)); } });
  }, []);
  const create = async () => {
    const r = await fetch("/api/crm/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
      d = (await r.json()) as { error?: string };
    if (!r.ok) {
      onFlash(d.error || "Invoice could not be created");
      return;
    }
    setForm({
      clientName: "",
      clientEmail: "",
      description: "",
      amount: "",
      dueDate: "",
    });
    await load();
    onFlash("Invoice draft created");
  };
  const action = async (id: string, value: string) => {
    const r = await fetch("/api/crm/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: value }),
      }),
      d = (await r.json()) as { error?: string; url?: string };
    if (!r.ok) {
      onFlash(d.error || "Invoice action failed");
      return;
    }
    if (d.url) window.open(d.url, "_blank");
    await load();
    onFlash(
      value === "SEND" ? "Stripe payment link created" : "Invoice updated",
    );
  };
  return (
    <div className="financeWorkspace">
      <section className="financeHero crmPanel">
        <div>
          <small>INVOICE COMMAND</small>
          <h2>Create, send, and track invoices.</h2>
          <p>
            Drafts save now. Connect Stripe to generate secure payment links.
          </p>
        </div>
        <aside className="merchantConnectCard"><i className={stripeConnected ? "connected" : ""} /><span><b>{stripeConnected ? "Merchant connected" : "Connect your merchant"}</b><small>{stripeConnected ? "Stripe is ready for payment links" : "Add Stripe once, then send invoices immediately"}</small></span><button onClick={onOpenIntegrations}>{stripeConnected ? "Manage Stripe" : "Connect Stripe"}</button></aside>
      </section>
      <section className="crmPanel financeForm">
        <input
          placeholder="Client name"
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
        />
        <input
          type="email"
          placeholder="Client email"
          value={form.clientEmail}
          onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          type="number"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <input
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
        />
        <button onClick={() => void create()}>＋ Create invoice</button>
      </section>
      <section className="crmPanel invoiceLedger">
        {rows.map((row) => (
          <article key={row.id}>
            <span>
              <b>{row.invoice_number}</b>
              <small>
                {row.client_name} · {row.client_email}
              </small>
            </span>
            <p>{row.description}</p>
            <strong>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(row.amount_cents / 100)}
            </strong>
            <em>{row.status}</em>
            <div>
              {row.stripe_url && (
                <a href={row.stripe_url} target="_blank">
                  Payment link
                </a>
              )}
              <button onClick={() => void action(row.id, "SEND")}>Send</button>
              <button onClick={() => void action(row.id, "PAID")}>
                Mark paid
              </button>
              <button onClick={() => void action(row.id, "VOID")}>Void</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function CRMSalesPlaybooks({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  type Playbook = {
    id: string;
    name: string;
    channel: string;
    category: string;
    stage: string;
    subject?: string;
    content: string;
    objection?: string;
    usage_count: number;
    success_count: number;
  };
  const empty = {
    name: "",
    channel: "CALL",
    category: "Discovery",
    stage: "ANY",
    subject: "",
    content: "",
    objection: "",
  };
  const [rows, setRows] = useState<Playbook[]>([]),
    [selected, setSelected] = useState(""),
    [channel, setChannel] = useState("ALL"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState(false),
    [form, setForm] = useState(empty),
    [contact, setContact] = useState({
      first_name: "Alex",
      phone: "",
      email: "",
      rep_name: "Sales Representative",
      company_name: "Cyncro",
      interest: "business systems",
      personalized_reason: "your growth",
      problem_area: "lead follow-up",
      desired_outcome: "a connected sales operation",
      recommended_solution: "Cyncro Core",
      investment: "the approved proposal",
      proposal_link: "[proposal link]",
      booking_link: "[booking link]",
      meeting_length: "30",
      option_one: "Tuesday",
      option_two: "Wednesday",
    });
  const load = async () => {
    const response = await fetch(
        `/api/crm/playbooks?channel=${channel === "ALL" ? "" : channel}&q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      ),
      data = (await response.json()) as {
        playbooks?: Playbook[];
        error?: string;
      };
    if (!response.ok) {
      onFlash(data.error || "Playbooks could not load");
      return;
    }
    setRows(data.playbooks || []);
    if (!selected && data.playbooks?.[0]) setSelected(data.playbooks[0].id);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [channel, query]);
  const active = rows.find((row) => row.id === selected) || rows[0];
  const merge = (value = "") =>
    value.replace(
      /{{([a-z_]+)}}/g,
      (_, key: string) => contact[key as keyof typeof contact] || `{{${key}}}`,
    );
  const save = async () => {
    const method = editing && selected ? "PATCH" : "POST",
      payload = editing && selected ? { ...form, id: selected } : form,
      response = await fetch("/api/crm/playbooks", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) {
      onFlash(data.error || "Playbook could not be saved");
      return;
    }
    setEditing(false);
    setForm(empty);
    if (data.id) setSelected(data.id);
    await load();
    onFlash("Sales playbook saved for the team");
  };
  const useTemplate = async () => {
    if (!active) return;
    await navigator.clipboard?.writeText(
      active.channel === "EMAIL"
        ? `${merge(active.subject || "")}\n\n${merge(active.content)}`
        : merge(active.content),
    );
    await fetch("/api/crm/playbooks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, action: "USE" }),
    });
    await load();
    onFlash(`${active.channel} template personalized and copied`);
  };
  const editActive = () => {
    if (!active) return;
    setForm({
      name: active.name,
      channel: active.channel,
      category: active.category,
      stage: active.stage,
      subject: active.subject || "",
      content: active.content,
      objection: active.objection || "",
    });
    setEditing(true);
  };
  const openChannel = async () => {
    if (!active) return;
    const content = merge(active.content);
    await navigator.clipboard?.writeText(active.channel === "EMAIL" ? `${merge(active.subject || "")}\n\n${content}` : content);
    if (active.channel === "CALL") {
      if (!contact.phone) return onFlash("Add the contact phone number first");
      window.location.href = `tel:${contact.phone}`;
    } else if (active.channel === "SMS") {
      if (!contact.phone) return onFlash("Add the contact phone number first");
      window.location.href = `sms:${contact.phone}?&body=${encodeURIComponent(content)}`;
    } else {
      if (!contact.email) return onFlash("Add the contact email first");
      window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(merge(active.subject || ""))}&body=${encodeURIComponent(content)}`;
    }
    onFlash(`${active.channel} opened with the editable script`);
  };
  return (
    <div className="salesPlaybookWorkspace">
      <section className="playbookHero crmPanel">
        <div>
          <small>CYNCRO SALES COMMAND</small>
          <h2>Give every rep the words, timing, and next move to win.</h2>
          <p>
            Editable call scripts, compliant SMS, conversion emails, objection
            responses, merge fields, team usage, and outcome tracking—inside the
            CRM.
          </p>
        </div>
        <aside>
          <b>{rows.length}</b>
          <span>LIVE PLAYBOOKS</span>
          <button
            onClick={() => {
              setSelected("");
              setForm(empty);
              setEditing(true);
            }}
          >
            ＋ New playbook
          </button>
        </aside>
      </section>
      <section className="playbookMetrics">
        {[
          ["CALL", "Guided conversations"],
          ["SMS", "Fast, consent-aware follow-up"],
          ["EMAIL", "Personalized closing sequences"],
          ["ROI", "Usage + win attribution"],
        ].map((item) => (
          <article className="crmPanel" key={item[0]}>
            <b>{item[0]}</b>
            <span>{item[1]}</span>
          </article>
        ))}
      </section>
      <div className="playbookLayout">
        <aside className="crmPanel playbookLibrary">
          <header>
            <small>TEAM LIBRARY</small>
            <input
              placeholder="Search scripts…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div>
              {["ALL", "CALL", "SMS", "EMAIL"].map((item) => (
                <button
                  className={channel === item ? "active" : ""}
                  onClick={() => setChannel(item)}
                  key={item}
                >
                  {item}
                </button>
              ))}
            </div>
          </header>
          {rows.map((row) => (
            <button
              className={active?.id === row.id ? "active" : ""}
              onClick={() => setSelected(row.id)}
              key={row.id}
            >
              <span>
                <i>{row.channel[0]}</i>
                <b>{row.name}</b>
                <small>
                  {row.category} · {row.stage}
                </small>
              </span>
              <em>{row.usage_count} uses</em>
            </button>
          ))}
        </aside>
        <main className="crmPanel playbookStage">
          {editing ? (
            <>
              <header>
                <div>
                  <small>PLAYBOOK EDITOR</small>
                  <h3>
                    {selected ? "Edit team playbook" : "Create team playbook"}
                  </h3>
                </div>
                <button onClick={() => setEditing(false)}>Close</button>
              </header>
              <div className="playbookForm">
                <input
                  placeholder="Playbook name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <select
                  value={form.channel}
                  onChange={(e) =>
                    setForm({ ...form, channel: e.target.value })
                  }
                >
                  <option>CALL</option>
                  <option>SMS</option>
                  <option>EMAIL</option>
                </select>
                <input
                  placeholder="Category"
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
                <select
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                >
                  {[
                    "ANY",
                    "NEW",
                    "QUALIFIED",
                    "PROPOSAL",
                    "NEGOTIATION",
                    "WON",
                    "LOST",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                {form.channel === "EMAIL" && (
                  <input
                    className="wide"
                    placeholder="Email subject"
                    value={form.subject}
                    onChange={(e) =>
                      setForm({ ...form, subject: e.target.value })
                    }
                  />
                )}
                <textarea
                  className="wide"
                  placeholder="Script or message"
                  value={form.content}
                  onChange={(e) =>
                    setForm({ ...form, content: e.target.value })
                  }
                />
                <textarea
                  className="wide objectionInput"
                  placeholder="Objection guidance / rep coaching"
                  value={form.objection}
                  onChange={(e) =>
                    setForm({ ...form, objection: e.target.value })
                  }
                />
                <button className="wide" onClick={() => void save()}>
                  Save to team library
                </button>
              </div>
            </>
          ) : active ? (
            <>
              <header>
                <div>
                  <small>
                    {active.channel} · {active.category} · {active.stage}
                  </small>
                  <h3>{active.name}</h3>
                </div>
                <div>
                  <button onClick={editActive}>Edit title + content</button>
                  <button
                    className="primary"
                    onClick={() => void useTemplate()}
                  >
                    Personalize + copy
                  </button>
                  <button className="primary" onClick={() => void openChannel()}>
                    {active.channel === "CALL" ? "Start call" : active.channel === "SMS" ? "Open SMS" : "Open email"}
                  </button>
                </div>
              </header>
              {active.channel === "EMAIL" && (
                <div className="playbookSubject">
                  <small>SUBJECT</small>
                  <b>{merge(active.subject || "")}</b>
                </div>
              )}
              <pre className={active.channel === "CALL" ? "teleprompter" : ""}>
                {merge(active.content)}
              </pre>
              {active.objection && (
                <aside className="objectionCoach">
                  <small>REP COACHING</small>
                  <p>{active.objection}</p>
                </aside>
              )}
              <footer>
                <span>
                  <small>USES</small>
                  <b>{active.usage_count}</b>
                </span>
                <span>
                  <small>ATTRIBUTED WINS</small>
                  <b>{active.success_count}</b>
                </span>
                <span>
                  <small>WIN RATE</small>
                  <b>
                    {active.usage_count
                      ? Math.round(
                          (active.success_count / active.usage_count) * 100,
                        )
                      : 0}
                    %
                  </b>
                </span>
                <button
                  onClick={async () => {
                    await fetch("/api/crm/playbooks", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: active.id, action: "WON" }),
                    });
                    await load();
                    onFlash("Win attributed to this playbook");
                  }}
                >
                  Mark won
                </button>
              </footer>
            </>
          ) : (
            <div className="emptyState">Create the first sales playbook.</div>
          )}
        </main>
        <aside className="crmPanel mergePanel">
          <small>LIVE PERSONALIZATION</small>
          <h3>Merge-field preview</h3>
          {Object.entries(contact)
            .slice(0, 9)
            .map(([key, value]) => (
              <label key={key}>
                {key.replaceAll("_", " ")}
                <input
                  value={value}
                  onChange={(event) =>
                    setContact({ ...contact, [key]: event.target.value })
                  }
                />
              </label>
            ))}
          <div>
            <small>AVAILABLE TOKENS</small>
            <code>
              {"{{first_name}} {{rep_name}} {{company_name}} {{booking_link}}"}
            </code>
          </div>
        </aside>
      </div>
      <section className="crmPanel salesSequence">
        <div>
          <small>MAX-SALES WORKFLOW</small>
          <h3>One lead. One coordinated sequence.</h3>
        </div>
        {[
          ["00:00", "SMS", "Immediate personalized response"],
          ["00:02", "CALL", "Guided discovery script"],
          ["+1 DAY", "EMAIL", "Value recap + proof"],
          ["+3 DAYS", "SMS", "Permission-based check-in"],
          ["+7 DAYS", "CALL", "Decision conversation"],
        ].map((step) => (
          <article key={step[0]}>
            <b>{step[0]}</b>
            <i>{step[1]}</i>
            <span>{step[2]}</span>
          </article>
        ))}
      </section>
    </div>
  );
}

function CRMContractsLegacy({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  type Contract = {
    id: string;
    title: string;
    client_name: string;
    client_email: string;
    body: string;
    status: string;
    signing_token: string;
    signer_name?: string;
    signed_at?: string;
  };
  const template =
    "SERVICE AGREEMENT\n\nThis agreement is between Cyncro Media and the client named above. Services, deliverables, payment schedule, ownership, confidentiality, cancellation, and acceptance terms may be edited below before sending.";
  const [rows, setRows] = useState<Contract[]>([]),
    [form, setForm] = useState({
      title: "Service Agreement",
      clientName: "",
      clientEmail: "",
      body: template,
    });
  const load = async () => {
    const r = await fetch("/api/crm/contracts", { cache: "no-store" }),
      d = (await r.json()) as { contracts?: Contract[]; error?: string };
    if (!r.ok) {
      onFlash(d.error || "Contracts could not load");
      return;
    }
    setRows(d.contracts || []);
  };
  useEffect(() => {
    void load();
  }, []);
  const create = async () => {
    const r = await fetch("/api/crm/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
      d = (await r.json()) as { error?: string };
    if (!r.ok) {
      onFlash(d.error || "Contract could not be created");
      return;
    }
    await load();
    onFlash("Editable contract created");
  };
  const copyLink = async (row: Contract) => {
    const url = `${window.location.origin}${window.location.pathname}?contract=${encodeURIComponent(row.signing_token)}#sign`;
    await navigator.clipboard.writeText(url);
    await fetch("/api/crm/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, status: "SENT" }),
    });
    await load();
    onFlash("Secure signature link copied");
  };
  return (
    <div className="financeWorkspace">
      <section className="financeHero crmPanel">
        <div>
          <small>CONTRACT STUDIO</small>
          <h2>Edit, send, and capture signatures.</h2>
          <p>Every signature records the signer name, date, and audit IP.</p>
        </div>
      </section>
      <section className="crmPanel contractEditor">
        <div>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            placeholder="Client name"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          />
          <input
            type="email"
            placeholder="Client email"
            value={form.clientEmail}
            onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
          />
        </div>
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <button onClick={() => void create()}>Save contract draft</button>
      </section>
      <section className="crmPanel contractLedger">
        {rows.map((row) => (
          <article key={row.id}>
            <span>
              <b>{row.title}</b>
              <small>
                {row.client_name} · {row.client_email}
              </small>
            </span>
            <em>{row.status}</em>
            {row.signer_name ? (
              <strong>Signed by {row.signer_name}</strong>
            ) : (
              <button onClick={() => void copyLink(row)}>
                Copy signature link
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function CRMContracts({ onFlash }: { onFlash: (message: string) => void }) {
  type Contract = {
    id: string;
    title: string;
    client_name: string;
    client_email: string;
    body: string;
    status: string;
    expires_at?: string;
    locked_at?: string;
    revoked_at?: string;
    signer_name?: string;
    signed_at?: string;
    owner_signer_name?: string;
    owner_signed_at?: string;
    document_hash?: string;
    reminder_count?: number;
    opportunity_name?: string;
    invoice_number?: string;
  };
  type Signer = {
    id: string;
    signer_name: string;
    signer_email: string;
    signing_order: number;
    signing_token: string;
    status: string;
    signed_at?: string;
  };
  type Detail = {
    contract: Contract;
    signers: Signer[];
    versions: {
      id: string;
      version_number: number;
      document_hash: string;
      created_at: string;
    }[];
    events: {
      id: string;
      event_type: string;
      actor: string;
      details: string;
      created_at: string;
    }[];
    attachments: {
      id: string;
      filename: string;
      size_bytes: number;
      created_at: string;
    }[];
  };
  const templates = {
    SERVICE: {
      title: "Professional Services Agreement",
      body: "PROFESSIONAL SERVICES AGREEMENT\n\nClient: {{client_name}}\nEffective date: {{effective_date}}\n\n1. SERVICES\nCyncro will provide the services and deliverables described in the approved statement of work.\n\n2. FEES AND PAYMENT\nFees, payment milestones, deposits, and recurring charges are stated in the linked invoice or proposal.\n\n3. CLIENT RESPONSIBILITIES\nThe client will provide timely access, approvals, content, credentials, and decisions required for delivery.\n\n4. INTELLECTUAL PROPERTY\nOwnership and license rights for final deliverables transfer only as stated after payment. Cyncro retains pre-existing tools, frameworks, and know-how.\n\n5. CONFIDENTIALITY\nBoth parties will protect non-public business and customer information.\n\n6. TERM, CANCELLATION, AND ACCEPTANCE\nProject timing, cancellation rights, and acceptance requirements are governed by the approved scope.\n\n7. ELECTRONIC SIGNATURES\nThe parties agree to transact and sign electronically.\n\nAttorney review required before production use.",
    },
    NDA: {
      title: "Mutual Confidentiality Agreement",
      body: "MUTUAL CONFIDENTIALITY AGREEMENT\n\nThe parties may exchange confidential business, technical, financial, and customer information solely to evaluate or perform the contemplated relationship. Each party will use reasonable safeguards, limit access to authorized people, and return or destroy protected information when requested. Standard exclusions apply for public, previously known, independently developed, or lawfully received information.\n\nAttorney review required before production use.",
    },
    WEBSITE: {
      title: "Website & Landing Page Agreement",
      body: "WEBSITE AND LANDING PAGE AGREEMENT\n\nClient: {{client_name}}\n\nScope, pages, revisions, integrations, content responsibilities, timeline, payment milestones, launch acceptance, hosting, third-party services, and intellectual-property terms will be defined in the approved statement of work.\n\nAttorney review required before production use.",
    },
    AUTOMATION: {
      title: "AI & Automation Services Agreement",
      body: "AI AND AUTOMATION SERVICES AGREEMENT\n\nClient: {{client_name}}\n\nThis agreement covers configured workflows, integrations, AI-assisted functions, human-approval requirements, usage limits, third-party services, customer data responsibilities, monitoring, maintenance, and change requests. AI outputs require appropriate human review and are not guaranteed to be error-free.\n\nAttorney review required before production use.",
    },
  };
  const [rows, setRows] = useState<Contract[]>([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [mode, setMode] = useState<"LIST" | "CREATE" | "EDIT">("LIST"),
    [templateKey, setTemplateKey] = useState<keyof typeof templates>("SERVICE"),
    [form, setForm] = useState({
      title: templates.SERVICE.title,
      clientName: "",
      clientEmail: "",
      body: templates.SERVICE.body,
      expiresAt: "",
      opportunityId: "",
      invoiceId: "",
      additionalName: "",
      additionalEmail: "",
    }),
    [ownerName, setOwnerName] = useState("Account Owner"),
    [file, setFile] = useState<File | null>(null);
  const load = async () => {
    const response = await fetch("/api/crm/contracts", { cache: "no-store" }),
      data = (await response.json()) as {
        contracts?: Contract[];
        error?: string;
      };
    if (!response.ok) {
      onFlash(data.error || "Contracts could not load");
      return;
    }
    setRows(data.contracts || []);
  };
  const loadDetail = async (id: string) => {
    setSelected(id);
    const response = await fetch(
        `/api/crm/contracts?id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      ),
      data = (await response.json()) as Detail & { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Contract details could not load");
      return;
    }
    setDetail(data);
  };
  useEffect(() => {
    void load();
  }, []);
  const chooseTemplate = (key: keyof typeof templates) => {
    setTemplateKey(key);
    setForm({
      ...form,
      title: templates[key].title,
      body: templates[key].body,
    });
  };
  const create = async () => {
    const body = form.body
        .replaceAll("{{client_name}}", form.clientName || "Client")
        .replaceAll("{{effective_date}}", new Date().toLocaleDateString()),
      signers =
        form.additionalName && form.additionalEmail
          ? [{ name: form.additionalName, email: form.additionalEmail }]
          : [],
      response = await fetch("/api/crm/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, body, templateKey, signers }),
      }),
      data = (await response.json()) as { contract?: Contract; error?: string };
    if (!response.ok) {
      onFlash(data.error || "Contract could not be created");
      return;
    }
    setMode("LIST");
    await load();
    if (data.contract) await loadDetail(data.contract.id);
    onFlash("Versioned contract draft created");
  };
  const saveEdit = async () => {
    if (!detail) return;
    const response = await fetch("/api/crm/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.contract.id,
          title: form.title,
          body: form.body,
          expiresAt: form.expiresAt,
          opportunityId: form.opportunityId,
          invoiceId: form.invoiceId,
        }),
      }),
      data = (await response.json()) as { error?: string; version?: number };
    if (!response.ok) {
      onFlash(data.error || "Contract could not be saved");
      return;
    }
    setMode("LIST");
    await Promise.all([load(), loadDetail(detail.contract.id)]);
    onFlash(`Contract version ${data.version || ""} saved`);
  };
  const action = async (
    actionName: string,
    payload: Record<string, unknown> = {},
  ) => {
    if (!detail) return;
    const response = await fetch("/api/crm/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: detail.contract.id,
          action: actionName,
          ...payload,
        }),
      }),
      data = (await response.json()) as { error?: string; delivery?: string };
    if (!response.ok) {
      onFlash(data.error || "Contract action failed");
      return;
    }
    await Promise.all([load(), loadDetail(detail.contract.id)]);
    onFlash(
      actionName === "SEND" && data.delivery === "CONNECTION_REQUIRED"
        ? "Signing links ready; connect email for automatic delivery"
        : `${actionName.toLowerCase()} completed`,
    );
  };
  const edit = () => {
    if (!detail) return;
    setForm({
      ...form,
      title: detail.contract.title,
      clientName: detail.contract.client_name,
      clientEmail: detail.contract.client_email,
      body: detail.contract.body,
      expiresAt: detail.contract.expires_at?.slice(0, 10) || "",
      opportunityId: "",
      invoiceId: "",
      additionalName: "",
      additionalEmail: "",
    });
    setMode("EDIT");
  };
  const copyLink = async (signer: Signer) => {
    const url = `${window.location.origin}${window.location.pathname}?contract=${encodeURIComponent(signer.signing_token)}#sign`;
    await navigator.clipboard?.writeText(url);
    await action("SEND");
    onFlash(`Secure link copied for ${signer.signer_name}`);
  };
  const upload = async () => {
    if (!detail || !file) return;
    const data = new FormData();
    data.append("contractId", detail.contract.id);
    data.append("file", file);
    const response = await fetch("/api/crm/contracts/attachments", {
        method: "POST",
        body: data,
      }),
      result = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(result.error || "Attachment upload failed");
      return;
    }
    setFile(null);
    await loadDetail(detail.contract.id);
    onFlash("Attachment saved to the contract");
  };
  return (
    <div className="contractStudioV2">
      <section className="contractCommand crmPanel">
        <div>
          <small>CYNCRO CONTRACT STUDIO</small>
          <h2>From approved deal to locked agreement.</h2>
          <p>
            Templates, merge fields, sequential signers, countersignature, PDF
            evidence, attachments, reminders, expiration, audit history, invoice
            linking, and document integrity.
          </p>
        </div>
        <aside>
          <span>
            <b>{rows.filter((row) => row.status === "SIGNED").length}</b>
            <small>COMPLETED</small>
          </span>
          <span>
            <b>
              {
                rows.filter((row) =>
                  ["SENT", "CLIENT_SIGNED"].includes(row.status),
                ).length
              }
            </b>
            <small>IN MOTION</small>
          </span>
          <button
            onClick={() => {
              setMode("CREATE");
              setSelected("");
              setDetail(null);
            }}
          >
            ＋ New contract
          </button>
        </aside>
      </section>
      <div className="contractStatusRail">
        {[
          ["DRAFT", "Prepare + edit"],
          ["SENT", "Sequential signatures"],
          ["CLIENT_SIGNED", "Owner countersign"],
          ["SIGNED", "Locked + auditable"],
        ].map((step) => (
          <div key={step[0]}>
            <i>◆</i>
            <span>
              <b>{step[0]}</b>
              <small>{step[1]}</small>
            </span>
          </div>
        ))}
      </div>
      {mode !== "LIST" ? (
        <section className="crmPanel contractBuilderV2">
          <header>
            <div>
              <small>
                {mode === "EDIT" ? "NEW VERSION" : "CONTRACT BUILDER"}
              </small>
              <h3>
                {mode === "EDIT"
                  ? "Edit saved draft"
                  : "Choose, personalize, and route"}
              </h3>
            </div>
            <button onClick={() => setMode("LIST")}>Close</button>
          </header>
          {mode === "CREATE" && (
            <div className="contractTemplates">
              {(Object.keys(templates) as (keyof typeof templates)[]).map(
                (key) => (
                  <button
                    className={templateKey === key ? "active" : ""}
                    onClick={() => chooseTemplate(key)}
                    key={key}
                  >
                    <b>{templates[key].title}</b>
                    <small>Attorney review required</small>
                  </button>
                ),
              )}
            </div>
          )}
          <div className="contractFormV2">
            <input
              placeholder="Agreement title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              placeholder="Primary signer name"
              disabled={mode === "EDIT"}
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            />
            <input
              type="email"
              placeholder="Primary signer email"
              disabled={mode === "EDIT"}
              value={form.clientEmail}
              onChange={(e) =>
                setForm({ ...form, clientEmail: e.target.value })
              }
            />
            <input
              type="date"
              title="Signing expiration"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
            {mode === "CREATE" && (
              <>
                <input
                  placeholder="Additional signer name (optional)"
                  value={form.additionalName}
                  onChange={(e) =>
                    setForm({ ...form, additionalName: e.target.value })
                  }
                />
                <input
                  type="email"
                  placeholder="Additional signer email (optional)"
                  value={form.additionalEmail}
                  onChange={(e) =>
                    setForm({ ...form, additionalEmail: e.target.value })
                  }
                />
              </>
            )}
            <input
              placeholder="Opportunity ID (optional)"
              value={form.opportunityId}
              onChange={(e) =>
                setForm({ ...form, opportunityId: e.target.value })
              }
            />
            <input
              placeholder="Invoice ID (optional)"
              value={form.invoiceId}
              onChange={(e) => setForm({ ...form, invoiceId: e.target.value })}
            />
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
            <div className="contractLegalNotice">
              Template content is operational scaffolding, not legal advice.
              Have licensed counsel approve production templates.
            </div>
            <button
              onClick={() => void (mode === "EDIT" ? saveEdit() : create())}
            >
              {mode === "EDIT" ? "Save new version" : "Create versioned draft"}
            </button>
          </div>
        </section>
      ) : (
        <>
        <label className="contractRecordPicker">
          <span>OPEN AGREEMENT</span>
          <select value={selected} onChange={(event) => void loadDetail(event.target.value)}>
            <option value="">Choose a customer contract…</option>
            {rows.map((row) => <option key={row.id} value={row.id}>{row.client_name} — {row.title} ({row.status})</option>)}
          </select>
        </label>
        <div className="contractStudioGrid contractStudioUnified">
          <aside className="crmPanel contractListV2">
            <header>
              <small>AGREEMENT LEDGER</small>
              <b>{rows.length} contracts</b>
            </header>
            {rows.map((row) => (
              <button
                className={selected === row.id ? "active" : ""}
                onClick={() => void loadDetail(row.id)}
                key={row.id}
              >
                <span>
                  <b>{row.title}</b>
                  <small>
                    {row.client_name} · {row.client_email}
                  </small>
                </span>
                <em className={row.status.toLowerCase()}>{row.status}</em>
                <i>{row.locked_at ? "🔒" : "→"}</i>
              </button>
            ))}
            {!rows.length && (
              <div className="emptyState">Create your first agreement.</div>
            )}
          </aside>
          <main className="crmPanel contractDetailV2">
            {detail ? (
              <>
                <header>
                  <div>
                    <small>
                      {detail.contract.status} · {detail.versions.length}{" "}
                      VERSION{detail.versions.length === 1 ? "" : "S"}
                    </small>
                    <h3>{detail.contract.title}</h3>
                    <p>
                      {detail.contract.client_name} ·{" "}
                      {detail.contract.client_email}
                    </p>
                  </div>
                  <div>
                    <button
                      disabled={Boolean(detail.contract.locked_at)}
                      onClick={edit}
                    >
                      Edit
                    </button>
                    <a href={`/api/crm/contracts/pdf?id=${detail.contract.id}`}>
                      ↓ PDF
                    </a>
                  </div>
                </header>
                <div className="contractDocumentPreview">
                  <pre>{detail.contract.body}</pre>
                  <footer>
                    <span>SHA-256</span>
                    <code>
                      {detail.contract.document_hash || "Generated when saved"}
                    </code>
                  </footer>
                </div>
                <section className="signerRouting">
                  <div className="detailTitle">
                    <small>SIGNING ORDER</small>
                    <b>Sequential routing</b>
                  </div>
                  {detail.signers.map((signer) => (
                    <article key={signer.id}>
                      <i>{signer.signing_order}</i>
                      <span>
                        <b>{signer.signer_name}</b>
                        <small>{signer.signer_email}</small>
                      </span>
                      <em>{signer.status}</em>
                      {signer.status !== "SIGNED" && (
                        <button onClick={() => void copyLink(signer)}>
                          Copy link
                        </button>
                      )}
                    </article>
                  ))}
                  <article className="ownerSigner">
                    <i>✓</i>
                    <span>
                      <b>Owner countersignature</b>
                      <small>
                        {detail.contract.owner_signer_name ||
                          "Required after clients sign"}
                      </small>
                    </span>
                    <em>
                      {detail.contract.owner_signed_at ? "SIGNED" : "PENDING"}
                    </em>
                  </article>
                </section>
                <div className="contractActions">
                  <button onClick={() => void action("SEND")}>
                    Send to customer now
                  </button>
                  <button onClick={() => void action("REMIND")}>
                    Send reminder ({detail.contract.reminder_count || 0})
                  </button>
                  <input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                  />
                  <button
                    disabled={
                      !detail.contract.signed_at ||
                      Boolean(detail.contract.owner_signed_at)
                    }
                    onClick={() =>
                      void action("COUNTERSIGN", { signerName: ownerName })
                    }
                  >
                    Countersign + lock
                  </button>
                  <button
                    className="danger"
                    disabled={Boolean(detail.contract.locked_at)}
                    onClick={() => void action("REVOKE")}
                  >
                    Revoke links
                  </button>
                </div>
                <section className="contractAttachments">
                  <div>
                    <small>ATTACHMENTS + EXHIBITS</small>
                    <input
                      type="file"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <button disabled={!file} onClick={() => void upload()}>
                      Upload
                    </button>
                  </div>
                  {detail.attachments.map((item) => (
                    <span key={item.id}>
                      <b>{item.filename}</b>
                      <small>{Math.ceil(item.size_bytes / 1024)} KB</small>
                    </span>
                  ))}
                </section>
                <section className="auditTimeline">
                  <div className="detailTitle">
                    <small>IMMUTABLE ACTIVITY</small>
                    <b>Audit trail</b>
                  </div>
                  {detail.events.slice(0, 8).map((item) => (
                    <article key={item.id}>
                      <i>◆</i>
                      <span>
                        <b>{item.event_type.replaceAll("_", " ")}</b>
                        <small>
                          {item.actor} ·{" "}
                          {new Date(item.created_at).toLocaleString()}
                        </small>
                        <p>{item.details}</p>
                      </span>
                    </article>
                  ))}
                </section>
              </>
            ) : (
              <div className="contractEmpty">
                <i>✎</i>
                <h3>Select an agreement</h3>
                <p>
                  Review signatures, versions, attachments, linked revenue, and
                  every audit event.
                </p>
              </div>
            )}
          </main>
        </div>
        </>
      )}
    </div>
  );
}

type AttributionRow = { id:string; source:string; channel:string; campaign?:string; event_type:string; event_value_cents:number; occurred_at:string; contact_name?:string; landing_page?:string };
type SpendRow = { id:string; platform:string; campaign:string; spend_cents:number; clicks:number; impressions:number };
type PrintCampaign={id:string;name:string;code:string;destination_url:string;distribution_count:number;scans:number;conversions:number;revenue_cents:number};
type AttributionReport={id:string;name:string;dimensions:string;metrics:string;date_range:string};
function CRMAttribution({ onFlash }: { onFlash:(message:string)=>void }) {
  const [touches,setTouches]=useState<AttributionRow[]>([]),[spend,setSpend]=useState<SpendRow[]>([]),[printCampaigns,setPrintCampaigns]=useState<PrintCampaign[]>([]),[reports,setReports]=useState<AttributionReport[]>([]),[model,setModel]=useState("LAST_TOUCH"),[lookback,setLookback]=useState(90),[setup,setSetup]=useState(false),[adding,setAdding]=useState<"conversion"|"spend"|"print"|"report"|null>(null);
  const load=async()=>{const response=await fetch("/api/crm/attribution",{cache:"no-store"});if(!response.ok)return onFlash("Attribution could not load");const data=await response.json() as {touchpoints?:AttributionRow[];spend?:SpendRow[];printCampaigns?:PrintCampaign[];reports?:AttributionReport[];settings?:{model?:string;lookback_days?:number}};setTouches(data.touchpoints||[]);setSpend(data.spend||[]);setPrintCampaigns(data.printCampaigns||[]);setReports(data.reports||[]);setModel(data.settings?.model||"LAST_TOUCH");setLookback(Number(data.settings?.lookback_days||90))};
  useEffect(()=>{void load()},[]);
  const revenue=touches.reduce((sum,item)=>sum+Number(item.event_value_cents||0),0),cost=spend.reduce((sum,item)=>sum+Number(item.spend_cents||0),0),conversions=touches.filter(item=>Number(item.event_value_cents)>0||item.event_type==="PURCHASE").length;
  const sources=Object.values(touches.reduce<Record<string,{name:string,revenue:number,touches:number,conversions:number}>>((acc,item)=>{const key=item.source||"Direct";acc[key]??={name:key,revenue:0,touches:0,conversions:0};acc[key].touches++;acc[key].revenue+=Number(item.event_value_cents||0);if(Number(item.event_value_cents)>0)acc[key].conversions++;return acc},{})).sort((a,b)=>b.revenue-a.revenue);
  const saveModel=async(next:string)=>{setModel(next);await fetch("/api/crm/attribution",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:next,lookbackDays:lookback,currency:"USD"})});onFlash("Attribution model saved")};
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));const body=adding==="spend"?{kind:"SPEND",platform:values.platform,campaign:values.campaign,spend:values.spend,clicks:values.clicks,impressions:values.impressions,periodStart:values.periodStart,periodEnd:values.periodEnd}:adding==="print"?{kind:"PRINT",name:values.name,code:values.code,destinationUrl:values.destinationUrl,distributionCount:values.distributionCount}:adding==="report"?{kind:"REPORT",name:values.name,dimensions:[values.dimension],metrics:[values.metric],dateRange:values.dateRange}:{kind:"TOUCH",source:values.source,channel:values.channel,eventType:"OFFLINE_CONVERSION",value:values.value,campaign:values.campaign};const response=await fetch("/api/crm/attribution",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!response.ok)return onFlash("Record could not be saved");setAdding(null);await load();onFlash("Attribution record saved")};
  const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(cents/100);
  return <section className="attributionOS">
    <div className="attributionHero"><div><label>CYNCRO ATTRIBUTION · ENTERPRISE</label><h2>Know exactly what creates revenue.</h2><p>Every paid, organic, social, print, call, page, form, booking, subscription, and payment touchpoint in one first-party truth layer.</p></div><div className="attributionActions"><button onClick={()=>setAdding("conversion")}>＋ Conversion</button><button onClick={()=>setAdding("spend")}>＋ Spend</button><button onClick={()=>setAdding("print")}>＋ Print campaign</button><button onClick={()=>setAdding("report")}>＋ Report</button><button onClick={()=>setSetup(!setup)}>API + tracking</button></div></div>
    <div className="attributionFeatureNav">{["Executive","Creative","Journeys","LTV + Forecast","Print","Organic + Social","Reports","Connections","Support"].map(name=><button key={name} onClick={()=>document.getElementById(`attr-${name.replaceAll(" ","-").replace("+","").toLowerCase()}`)?.scrollIntoView({behavior:"smooth",block:"start"})}>{name}</button>)}</div>
    <div className="attributionControls"><label>Attribution model<select value={model} onChange={e=>void saveModel(e.target.value)}><option value="FIRST_TOUCH">First touch</option><option value="LAST_TOUCH">Last touch</option><option value="LINEAR">Linear</option><option value="TIME_DECAY">Time decay</option><option value="POSITION_BASED">Position based</option><option value="CUSTOM">Custom weighted model</option></select></label><label>Conversion window<select value={lookback} onChange={e=>setLookback(Number(e.target.value))}><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option></select></label><button onClick={()=>onFlash("Custom model rules opened")}>Edit custom rules</button><span>● First-party collection active</span></div>
    <div className="attributionMetrics" id="attr-executive"><article><small>ATTRIBUTED REVENUE</small><b>{money(revenue)}</b><span>{conversions} conversions</span></article><article><small>TRACKED SPEND</small><b>{money(cost)}</b><span>{spend.length} campaign rows</span></article><article><small>BLENDED ROAS</small><b>{cost?`${(revenue/cost).toFixed(2)}×`:"—"}</b><span>Revenue ÷ ad spend</span></article><article><small>TOUCHPOINTS</small><b>{touches.length}</b><span>Across the full journey</span></article></div>
    {setup&&<div className="trackingSetup crmPanel"><div><small>WEBSITE TRACKING ENDPOINT</small><h3>Connect Framer, forms, calls, and checkout events</h3><p>Send page views, leads, booked calls, qualified opportunities, and purchases to this endpoint. UTM fields and click IDs stay attached through conversion.</p></div><code>POST {typeof window!=="undefined"?window.location.origin:""}/api/attribution/track</code><button onClick={()=>{void navigator.clipboard.writeText(`${window.location.origin}/api/attribution/track`);onFlash("Tracking endpoint copied")}}>Copy endpoint</button></div>}
    <div className="attributionGrid" id="attr-journeys"><article className="crmPanel"><div className="crmPanelHead"><div><small>SOURCE PERFORMANCE</small><h2>Revenue by source</h2></div></div><div className="sourceTable"><header><span>Source</span><span>Touches</span><span>Conversions</span><span>Revenue</span></header>{sources.length?sources.map(row=><div key={row.name}><b>{row.name}</b><span>{row.touches}</span><span>{row.conversions}</span><strong>{money(row.revenue)}</strong></div>):<p>No source data yet. Install tracking or add a conversion.</p>}</div></article><article className="crmPanel journeyStream"><div className="crmPanelHead"><div><small>FULL CUSTOMER JOURNEY</small><h2>Every touch before and after conversion</h2></div></div>{touches.slice(0,8).map(item=><div key={item.id}><i>{item.event_type.slice(0,2)}</i><span><b>{item.contact_name||item.source}</b><small>{item.channel} · {item.campaign||item.landing_page||"Direct journey"}</small></span><strong>{item.event_value_cents?money(item.event_value_cents):new Date(item.occurred_at).toLocaleDateString()}</strong></div>)}{!touches.length&&<p>No journey events recorded yet.</p>}</article></div>
    <div className="connectorRail">{["Meta Ads","Google Ads","TikTok Ads","Stripe","Call tracking","Framer"].map(name=><button key={name} onClick={()=>onFlash(`${name} is connection-ready in Integrations`)}><span>{name}</span><small>READY TO CONNECT</small></button>)}</div>
    <div className="attributionEnterpriseGrid" id="attr-creative"><article className="crmPanel"><small>IN-DEPTH CREATIVE REPORTING</small><h2>Creative intelligence</h2><p>Compare hooks, formats, placements, audiences, spend, CTR, conversion rate, CAC, revenue, ROAS, and attributed LTV.</p><div className="creativeRows">{spend.slice(0,6).map(row=><div key={row.id}><span><b>{row.campaign}</b><small>{row.platform} · Creative group</small></span><span>{row.impressions?`${(row.clicks/row.impressions*100).toFixed(2)}%`:"—"}<small>CTR</small></span><span>{row.clicks?money(Math.round(row.spend_cents/row.clicks)):"—"}<small>CPC</small></span><strong>{row.spend_cents?`${(sources.reduce((s,r)=>s+r.revenue,0)/Math.max(1,cost)).toFixed(2)}×`:"—"}<small>ROAS</small></strong></div>)}{!spend.length&&<p>Connect ad accounts or import spend to unlock creative comparisons.</p>}</div></article><article className="crmPanel aiOptimizer"><small>AI AD OPTIMIZATION</small><h2>Next best budget moves</h2>{[cost&&revenue/cost<2?"Reduce spend on campaigns below 2× blended ROAS.":"Protect the strongest revenue-producing campaigns.","Increase budget only after conversion quality and attributed LTV hold.","Refresh creatives with declining click-through or rising acquisition cost.","Send qualified and funded outcomes back to ad platforms as offline conversions."].map((text,index)=><div key={text}><span>0{index+1}</span><p>{text}</p><button onClick={()=>onFlash("Recommendation queued for approval")}>Review</button></div>)}</article></div>
    <section className="crmPanel ltvForecast" id="attr-ltv--forecast"><div className="crmPanelHead"><div><small>ATTRIBUTED LTV · SUBSCRIPTIONS · FORECASTING</small><h2>Revenue beyond the first purchase</h2></div></div><div><article><small>CURRENT ATTRIBUTED LTV</small><b>{money(revenue)}</b><span>All captured customer value</span></article><article><small>SUBSCRIPTION REVENUE</small><b>{money(touches.filter(t=>t.event_type.includes("SUBSCRIPTION")).reduce((s,t)=>s+t.event_value_cents,0))}</b><span>Renewals and recurring payments</span></article><article><small>90-DAY FORECAST</small><b>{money(Math.round(revenue*1.22))}</b><span>Directional forecast from current signal</span></article><article><small>FORECAST CONFIDENCE</small><b>{touches.length>40?"HIGH":touches.length>10?"MEDIUM":"LEARNING"}</b><span>Improves as data accumulates</span></article></div></section>
    <div className="attributionEnterpriseGrid"><article className="crmPanel" id="attr-print"><div className="crmPanelHead"><div><small>FULL PRINT TRACKING</small><h2>Mail, flyers, billboards, and QR</h2></div><button onClick={()=>setAdding("print")}>Create campaign</button></div><div className="printRows">{printCampaigns.map(c=><div key={c.id}><span><b>{c.name}</b><small>Code {c.code} · {c.destination_url}</small></span><span>{c.distribution_count}<small>Distributed</small></span><span>{c.scans}<small>Scans</small></span><span>{c.conversions}<small>Conversions</small></span><strong>{money(c.revenue_cents)}</strong></div>)}{!printCampaigns.length&&<p>Create a trackable code for any offline placement.</p>}</div></article><article className="crmPanel" id="attr-organic--social"><small>ORGANIC + SOCIAL TRACKING</small><h2>Revenue without paid clicks</h2><div className="organicChannels">{["Instagram organic","Facebook organic","TikTok organic","LinkedIn","YouTube","Email","Referral","Direct","Podcast","Events"].map(name=><span key={name}><i>●</i>{name}<small>{sources.find(s=>s.name.toLowerCase().includes(name.split(" ")[0].toLowerCase()))?"Tracking":"Ready"}</small></span>)}</div></article></div>
    <section className="crmPanel reportCenter" id="attr-reports"><div className="crmPanelHead"><div><small>UNLIMITED REPORTS</small><h2>Custom reporting studio</h2></div><button onClick={()=>setAdding("report")}>＋ Build report</button></div><div>{reports.map(report=><button key={report.id} onClick={()=>onFlash(`${report.name} opened`)}><span><b>{report.name}</b><small>{report.date_range} · Custom dimensions and metrics</small></span><em>OPEN →</em></button>)}{!reports.length&&<p>No saved reports yet. Build as many as your team needs.</p>}</div></section>
    <section className="crmPanel allPlatforms" id="attr-connections"><div className="crmPanelHead"><div><small>ALL AD PLATFORMS + ALL INTEGRATIONS</small><h2>Universal connection layer</h2></div></div><div>{["Meta Ads","Google Ads","YouTube","TikTok Ads","LinkedIn Ads","Microsoft Ads","Pinterest Ads","Snapchat Ads","X Ads","Reddit Ads","Amazon Ads","Stripe","Shopify","WooCommerce","Framer","Webflow","CallRail","Twilio","HubSpot","GoHighLevel","ClickFunnels","Zapier","Make","n8n","Custom webhook"].map(name=><button key={name} onClick={()=>onFlash(`${name} connection setup opened`)}><b>{name}</b><small>CONNECT</small></button>)}</div></section>
    <div className="attributionEnterpriseGrid"><article className="crmPanel apiControl"><small>FULL API ACCESS</small><h2>Own the data layer</h2><p>Ingest server, browser, CRM, call, checkout, subscription, and offline events. Export touchpoints, journeys, spend, reports, LTV, and forecasts.</p><code>POST /api/attribution/track</code><code>GET /api/crm/attribution</code><button onClick={()=>setSetup(true)}>Open API setup</button></article><article className="crmPanel supportDesk" id="attr-support"><small>1-TO-1 SUPPORT + DATA ANALYST</small><h2>Your attribution command desk</h2><p>Dedicated onboarding checklist, tracking audit, data-quality review, custom model setup, and analyst requests live beside the reporting system.</p>{["Implementation manager","Dedicated data analyst","Tracking audit","Custom report request"].map(item=><button key={item} onClick={()=>onFlash(`${item} request created`)}><span>{item}</span><em>REQUEST →</em></button>)}</article></div>
    {adding&&<div className="crmModalBack" onClick={()=>setAdding(null)}><form className="crmModal miniDataForm" onSubmit={submit} onClick={e=>e.stopPropagation()}><div className="crmModalHead"><div><label>ATTRIBUTION INPUT</label><h2>{adding==="spend"?"Import campaign spend":adding==="print"?"Create print campaign":adding==="report"?"Build custom report":"Record offline conversion"}</h2></div><button type="button" onClick={()=>setAdding(null)}>×</button></div>{adding==="spend"?<><input name="platform" placeholder="Platform (Meta, Google…)" required/><input name="campaign" placeholder="Campaign name" required/><input name="spend" type="number" step=".01" placeholder="Spend ($)" required/><input name="clicks" type="number" placeholder="Clicks"/><input name="impressions" type="number" placeholder="Impressions"/><input name="periodStart" type="date" required/><input name="periodEnd" type="date" required/></>:adding==="print"?<><input name="name" placeholder="Print campaign name" required/><input name="code" placeholder="Tracking code (optional)"/><input name="destinationUrl" type="url" placeholder="Destination URL" required/><input name="distributionCount" type="number" placeholder="Pieces distributed"/></>:adding==="report"?<><input name="name" placeholder="Report title" required/><select name="dimension"><option>Source</option><option>Campaign</option><option>Creative</option><option>Customer</option><option>Landing page</option><option>Channel</option></select><select name="metric"><option>Revenue</option><option>ROAS</option><option>LTV</option><option>CAC</option><option>Conversions</option><option>Subscriptions</option></select><select name="dateRange"><option value="30D">Last 30 days</option><option value="90D">Last 90 days</option><option value="YTD">Year to date</option><option value="ALL">All time</option></select></>:<><input name="source" placeholder="Source" required/><input name="channel" placeholder="Channel" required/><input name="campaign" placeholder="Campaign"/><input name="value" type="number" step=".01" placeholder="Revenue ($)" required/></>}<button className="crmCreate" type="submit">Save record</button></form></div>}
  </section>
}

type WorkTask={id:string;title:string;details?:string;status:string;priority:string;assignee?:string;reporter?:string;due_at?:string;contact_name?:string;account_name?:string;opportunity_name?:string;subtask_count?:number;completed_subtasks?:number;estimated_minutes:number};
function CRMWork({onFlash,currentUserName}:{onFlash:(message:string)=>void;currentUserName:string}){
  const [tasks,setTasks]=useState<WorkTask[]>([]),[mode,setMode]=useState<"board"|"mine"|"workload">("board"),[creating,setCreating]=useState(false),[selected,setSelected]=useState<WorkTask|null>(null),[assigneeFilter,setAssigneeFilter]=useState("ALL");
  const load=async()=>{const r=await fetch("/api/crm/tasks",{cache:"no-store"});if(!r.ok)return onFlash("Tasks could not load");const d=await r.json() as {tasks?:WorkTask[]};setTasks(d.tasks||[])};useEffect(()=>{void load()},[]);
  const update=async(id:string,data:Record<string,unknown>)=>{await fetch("/api/crm/tasks",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,...data})});await load()};
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch("/api/crm/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f)});if(!r.ok)return onFlash("Task could not be created");setCreating(false);await load();onFlash("Task assigned")};
  const people=Array.from(new Set(tasks.map(t=>t.assignee).filter(Boolean))) as string[],visible=tasks.filter(t=>(mode!=="mine"||t.assignee===currentUserName)&&(assigneeFilter==="ALL"||t.assignee===assigneeFilter));
  const statuses=["BACKLOG","TODO","IN_PROGRESS","WAITING","DONE"];
  return <section className="workOS"><div className="workHero"><div><label>CYNCRO WORK</label><h2>Every rep knows the next move.</h2><p>Individual work queues, claimable tasks, team execution, dependencies, customer context, and manager visibility.</p></div><button className="crmCreate" onClick={()=>setCreating(true)}>＋ Assign work</button></div><div className="workToolbar"><div><button className={mode==="board"?"active":""} onClick={()=>setMode("board")}>Team board</button><button className={mode==="mine"?"active":""} onClick={()=>setMode("mine")}>My work</button><button className={mode==="workload"?"active":""} onClick={()=>setMode("workload")}>Workload</button></div><select value={assigneeFilter} onChange={e=>setAssigneeFilter(e.target.value)}><option value="ALL">All team members</option>{people.map(p=><option key={p}>{p}</option>)}</select><span>{visible.filter(t=>t.status!=="DONE").length} open · {visible.filter(t=>t.priority==="URGENT").length} urgent</span></div>
  {mode==="workload"?<div className="workloadGrid">{[...people,"Unassigned"].map(person=>{const rows=tasks.filter(t=>(t.assignee||"Unassigned")===person&&t.status!=="DONE"),minutes=rows.reduce((s,t)=>s+Number(t.estimated_minutes||0),0);return <article className="crmPanel" key={person}><small>TEAM CAPACITY</small><h3>{person}</h3><b>{rows.length} open tasks</b><div><i style={{width:`${Math.min(100,minutes/24)}%`}}/></div><span>{Math.round(minutes/60*10)/10} estimated hours</span></article>})}</div>:<div className="workBoard">{statuses.map(status=><section key={status}><header><b>{status.replaceAll("_"," ")}</b><span>{visible.filter(t=>t.status===status).length}</span></header>{visible.filter(t=>t.status===status).map(task=><article key={task.id} onClick={()=>setSelected(task)}><div><em className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</em>{!task.assignee&&<button onClick={e=>{e.stopPropagation();void update(task.id,{assignee:currentUserName})}}>Claim</button>}</div><h3>{task.title}</h3><p>{task.details||task.contact_name||task.account_name||"Team assignment"}</p><footer><span>{task.assignee||"Unassigned"}</span><time>{task.due_at?new Date(task.due_at).toLocaleDateString():"No due date"}</time></footer><select value={task.status} onClick={e=>e.stopPropagation()} onChange={e=>void update(task.id,{status:e.target.value})}>{statuses.map(s=><option value={s} key={s}>{s.replaceAll("_"," ")}</option>)}</select></article>)}</section>)}</div>}
  {creating&&<div className="crmModalBack" onClick={()=>setCreating(false)}><form className="crmModal miniDataForm" onSubmit={submit} onClick={e=>e.stopPropagation()}><div className="crmModalHead"><div><label>NEW WORK ITEM</label><h2>Assign a revenue task</h2></div><button type="button" onClick={()=>setCreating(false)}>×</button></div><input name="title" placeholder="Task title" required/><textarea name="details" placeholder="Details, definition of done, customer context…"/><div className="formTwo"><select name="priority"><option>MEDIUM</option><option>LOW</option><option>HIGH</option><option>URGENT</option></select><input name="assignee" placeholder="Assign to (name)"/></div><div className="formTwo"><input name="dueAt" type="datetime-local"/><input name="estimatedMinutes" type="number" defaultValue="30" min="0"/></div><input name="recurrence" placeholder="Recurrence (optional, e.g. weekly)"/><button className="crmCreate" type="submit">Create task</button></form></div>}
  {selected&&<div className="crmModalBack" onClick={()=>setSelected(null)}><div className="crmModal workInspector" onClick={e=>e.stopPropagation()}><div className="crmModalHead"><div><label>{selected.priority} PRIORITY</label><h2>{selected.title}</h2></div><button onClick={()=>setSelected(null)}>×</button></div><p>{selected.details||"No task details yet."}</p><div className="workDetailGrid"><label>Owner<input defaultValue={selected.assignee||""} onBlur={e=>void update(selected.id,{assignee:e.target.value})}/></label><label>Due<input type="datetime-local" defaultValue={selected.due_at?.slice(0,16)||""} onBlur={e=>void update(selected.id,{dueAt:e.target.value})}/></label><span>Customer<b>{selected.contact_name||selected.account_name||"Not linked"}</b></span><span>Deal<b>{selected.opportunity_name||"Not linked"}</b></span></div><form onSubmit={e=>{e.preventDefault();const input=e.currentTarget.elements.namedItem("subtask") as HTMLInputElement;void update(selected.id,{action:"SUBTASK",title:input.value});input.value=""}}><input name="subtask" placeholder="Add subtask" required/><button>Add</button></form><form onSubmit={e=>{e.preventDefault();const input=e.currentTarget.elements.namedItem("comment") as HTMLInputElement;void update(selected.id,{action:"COMMENT",body:input.value});input.value=""}}><input name="comment" placeholder="Add manager note or update" required/><button>Comment</button></form><button className="dangerText" onClick={async()=>{if(!confirm("Delete this task?"))return;await fetch(`/api/crm/tasks?id=${selected.id}`,{method:"DELETE"});setSelected(null);await load();onFlash("Task deleted")}}>Delete task</button></div></div>}
  </section>
}

function CRMIntegrations({ onFlash }: { onFlash: (message: string) => void }) {
  type Status = {
    connections: Record<string, boolean>;
    eventTypes: {
      id: string;
      name: string;
      duration_minutes: number;
      bookingUrl: string;
    }[];
    framerWebhookUrl: string;
  };
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/integrations/status");
      const data = (await response.json()) as Status & { error?: string };
      setLoading(false);
      if (!response.ok) {
        onFlash(data.error || "Connections could not be loaded");
        return;
      }
      setStatus(data);
    })();
  }, []);
  const copy = async (value: string, label: string) => {
    await navigator.clipboard?.writeText(value);
    onFlash(`${label} copied`);
  };
  const connectGoogle = () => {
    window.location.href = "/api/integrations/google-calendar/connect";
  };
  const connections = [
    [
      "meta",
      "Instagram + Facebook",
      "DMs, comments, leads, attribution",
      "META_APP_ID · META_APP_SECRET · META_PAGE_ACCESS_TOKEN",
    ],
    [
      "twilio",
      "SMS + calling",
      "Shared numbers, outbound SMS, call routing",
      "TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_PHONE_NUMBER",
    ],
    [
      "resend",
      "Transactional email",
      "Booking confirmations and CRM email",
      "RESEND_API_KEY · EMAIL_FROM",
    ],
    [
      "googleCalendar",
      "Google Calendar",
      "Two-way calendar authorization",
      "GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET",
    ],
    [
      "framer",
      "Framer landing pages",
      "Send every form lead into Cyncro",
      "FRAMER_WEBHOOK_SECRET",
    ],
    [
      "stripe",
      "Stripe payments",
      "Invoice payment links and payment status",
      "STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET",
    ],
  ];
  return (
    <div className="integrationsWorkspace">
      <section className="integrationHero crmPanel">
        <div>
          <small>CONNECTION CENTER</small>
          <h2>Connect once. Run everything from Cyncro.</h2>
          <p>
            Your CRM, calendars, landing pages, email, SMS, and social channels
            share the same contacts, ownership, permissions, and analytics.
          </p>
        </div>
        <span>
          {Object.values(status?.connections || {}).filter(Boolean).length} /{" "}
          {connections.length}
          <small>CONNECTED</small>
        </span>
      </section>
      <section className="crmPanel googleConnectPanel">
        <div>
          <small>GOOGLE CALENDAR · DIRECT CONNECTION</small>
          <h2>Put every Cyncro appointment on your Google Calendar.</h2>
          <p>
            Authorize your Google account once. New bookings, reschedules, and
            cancellations will sync to the connected calendar automatically.
          </p>
          <ol>
            <li>Add the Google Client ID and Secret in Cyncro hosting settings.</li>
            <li>Add this authorized redirect URI in Google Cloud:</li>
            <li><code>{typeof window === "undefined" ? "/api/integrations/google-calendar/callback" : `${window.location.origin}/api/integrations/google-calendar/callback`}</code></li>
            <li>Return here and click Connect Google Calendar.</li>
          </ol>
        </div>
        <button className="googleConnectButton" onClick={connectGoogle}>
          {status?.connections.googleCalendar ? "Connect Google Calendar" : "Set up Google Calendar"}
        </button>
      </section>
      <div className="integrationGrid">
        {connections.map(([key, name, description, needed]) => (
          <article className="crmPanel" key={key}>
            <div className="integrationStatus">
              <i className={status?.connections[key] ? "connected" : ""} />
              <span>
                {status?.connections[key] ? "CONNECTED" : "CONNECTION REQUIRED"}
              </span>
            </div>
            <h3>{name}</h3>
            <p>{description}</p>
            <small>REQUIRED</small>
            <code>{needed}</code>
            <button
              onClick={() =>
                onFlash(
                  status?.connections[key]
                    ? `${name} settings ready`
                    : `Add the required connection values to activate ${name}`,
                )
              }
            >
              {status?.connections[key]
                ? "Manage connection"
                : "Connection instructions"}
            </button>
          </article>
        ))}
      </div>
      <section className="crmPanel integrationSection">
        <div className="crmPanelHead">
          <div>
            <small>FRAMER → CYNCRO</small>
            <h2>Landing-page lead connection</h2>
          </div>
        </div>
        <p>
          Send Framer form submissions to this secure Cyncro endpoint. Matching
          contacts update instead of duplicating.
        </p>
        <div className="copyField">
          <code>{status?.framerWebhookUrl || "Loading…"}</code>
          <button
            disabled={!status}
            onClick={() =>
              status && void copy(status.framerWebhookUrl, "Framer webhook URL")
            }
          >
            Copy webhook URL
          </button>
        </div>
        <ol>
          <li>
            Create a form in Framer with name, email, phone, company, and
            message fields.
          </li>
          <li>
            Post the form JSON to the webhook URL and include{" "}
            <code>x-cyncro-secret</code>.
          </li>
          <li>The lead appears in Contacts immediately with source FRAMER.</li>
        </ol>
      </section>
      <section className="crmPanel integrationSection">
        <div className="crmPanelHead">
          <div>
            <small>PUBLIC BOOKING LINKS</small>
            <h2>Calendar links ready to share or embed</h2>
          </div>
        </div>
        {loading && <p>Loading event links…</p>}
        {status?.eventTypes.map((event) => (
          <div className="bookingLinkRow" key={event.id}>
            <span>
              <b>{event.name}</b>
              <small>{event.duration_minutes} minute default</small>
            </span>
            <code>{event.bookingUrl}</code>
            <button
              onClick={() => void copy(event.bookingUrl, `${event.name} link`)}
            >
              Copy link
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function CRMTeamAccess({ onFlash, onOpenCalendar }: { onFlash: (message: string) => void; onOpenCalendar: () => void }) {
  type Member = {
    email: string;
    display_name: string;
    role: string;
    crm_access: number;
    calendar_access: number;
    prospecting_access: number;
    manage_users: number;
    can_create:number;can_edit:number;can_delete:number;can_export:number;
    compensation_access:number;invoice_access:number;contract_access:number;attribution_access:number;work_access:number;
    active: number;
    google_calendar_email?: string;
  };
  const [members, setMembers] = useState<Member[]>([]);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [editingEmail, setEditingEmail] = useState("");
  const [form, setForm] = useState({
    email: "",
    displayName: "",
    role: "MEMBER",
    crmAccess: true,
    calendarAccess: false,
    prospectingAccess: false,
    manageUsers: false,
    canCreate:true,canEdit:true,canDelete:false,canExport:false,
    compensationAccess:false,invoiceAccess:false,contractAccess:false,attributionAccess:false,workAccess:true,
    active: true,
  });
  const load = async () => {
    const response = await fetch("/api/access");
    const data = (await response.json()) as {
      members?: Member[];
      member?: Member;
      error?: string;
    };
    if (!response.ok) {
      onFlash(data.error || "Permissions could not be loaded");
      return;
    }
    setAllowed(Boolean(data.member?.manage_users));
    setCurrentMember(data.member || null);
    setMembers(data.members?.length ? data.members : data.member ? [data.member] : []);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const save = async (next = form) => {
    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      onFlash(data.error || "Access could not be saved");
      return;
    }
    setForm({
      email: "",
      displayName: "",
      role: "MEMBER",
      crmAccess: true,
      calendarAccess: false,
      prospectingAccess: false,
      manageUsers: false,
      canCreate:true,canEdit:true,canDelete:false,canExport:false,compensationAccess:false,invoiceAccess:false,contractAccess:false,attributionAccess:false,workAccess:true,
      active: true,
    });
    setEditingEmail("");
    await load();
    onFlash("Team access updated");
  };
  const removeMember = async (member: Member) => {
    if (!window.confirm(`Delete ${member.display_name} from the team?`)) return;
    const response = await fetch(`/api/access?email=${encodeURIComponent(member.email)}`, { method: "DELETE" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) return onFlash(data.error || "Team member could not be deleted");
    await load();
    onFlash("Team member deleted");
  };
  if (!allowed)
    return (
      <div className="crmPanel teamAccess">
        <h2>Team access</h2>
        <p>Only the workspace owner can manage user permissions.</p>
      </div>
    );
  return (
    <div className="teamAccess">
      <section className="crmPanel">
        <div className="crmPanelHead">
          <div>
            <small>OWNER CONTROLS</small>
            <h2>{editingEmail ? "Update team member" : "Add a team member"}</h2>
          </div>
        </div>
        {currentMember && (
          <div className="ownerAccessSummary">
            <span><small>YOUR ACCESS</small><b>{currentMember.display_name}</b></span>
            <span>{currentMember.role} · CRM · Calendar · Prospecting · User management</span>
          </div>
        )}
        <div className="secureAccessNote"><span>SECURE TEAM SIGN-IN</span><div><b>Invite by verified email</b><p>Add the exact email each teammate will use. They sign in privately, and Cyncro applies the permissions you choose below. Passwords are never visible to the owner or stored in readable form.</p></div><button onClick={()=>onFlash("Add the teammate, then send them the Cyncro sign-in link")}>Access steps</button></div>
        <div className="crmForm">
          <label>
            Name
            <input
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
            />
          </label>
          <label>
            Login email
            <input
              type="email"
              disabled={Boolean(editingEmail)}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="MEMBER">Team member</option>
              <option value="ACCOUNT_MANAGER">Account manager</option>
              <option value="SALES_DIRECTOR">Sales director</option>
              <option value="VP_SALES">VP of sales</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </label>
        </div>
        <div className="permissionChecks">
          {[
            ["crmAccess", "CRM"],
            ["calendarAccess", "Calendar"],
            ["prospectingAccess", "Prospecting"],
            ["manageUsers", "Manage users"],
          ].map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof typeof form])}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="permissionMatrix"><div><b>Action controls</b><small>Choose exactly what this person can do inside records.</small></div>{[["canCreate","Create records"],["canEdit","Edit records"],["canDelete","Delete records"],["canExport","Export data"]].map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(form[key as keyof typeof form])} onChange={e=>setForm({...form,[key]:e.target.checked})}/><span>{label}</span></label>)}</div>
        <div className="permissionMatrix"><div><b>Sensitive workspaces</b><small>Keep financial and executive data owner-only unless granted.</small></div>{[["compensationAccess","Compensation"],["invoiceAccess","Invoices"],["contractAccess","Contracts"],["attributionAccess","Attribution"],["workAccess","Cyncro Work"]].map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean(form[key as keyof typeof form])} onChange={e=>setForm({...form,[key]:e.target.checked})}/><span>{label}</span></label>)}</div>
        <button className="crmCreate" onClick={() => void save()}>
          {editingEmail ? "Update team access" : "Save team access"}
        </button>
        {editingEmail && <button onClick={() => { setEditingEmail(""); setForm({ email:"", displayName:"", role:"MEMBER", crmAccess:true, calendarAccess:false, prospectingAccess:false, manageUsers:false, active:true,canCreate:true,canEdit:true,canDelete:false,canExport:false,compensationAccess:false,invoiceAccess:false,contractAccess:false,attributionAccess:false,workAccess:true }); }}>Cancel edit</button>}
      </section>
      <section className="crmPanel">
        <div className="crmPanelHead">
          <div>
            <small>ACTIVE USERS</small>
            <h2>Who can access what</h2>
          </div>
        </div>
        {members.map((member) => (
          <div className="memberAccessRow" key={member.email}>
            <span>
              <b>{member.display_name}</b>
              <small>
                {member.email} · {member.role}
              </small>
            </span>
            <span>
              {member.crm_access ? "CRM " : ""}
              {member.calendar_access ? "Calendar " : ""}
              {member.prospecting_access ? "Prospecting" : ""}
              <small>{member.google_calendar_email ? `Google: ${member.google_calendar_email}` : "Google Calendar not connected"}</small>
            </span>
            <div className="memberAccessActions">
              <button onClick={() => { setEditingEmail(member.email); setForm({ email:member.email, displayName:member.display_name, role:member.role, crmAccess:Boolean(member.crm_access), calendarAccess:Boolean(member.calendar_access), prospectingAccess:Boolean(member.prospecting_access), manageUsers:Boolean(member.manage_users), active:Boolean(member.active),canCreate:Boolean(member.can_create),canEdit:Boolean(member.can_edit),canDelete:Boolean(member.can_delete),canExport:Boolean(member.can_export),compensationAccess:Boolean(member.compensation_access),invoiceAccess:Boolean(member.invoice_access),contractAccess:Boolean(member.contract_access),attributionAccess:Boolean(member.attribution_access),workAccess:Boolean(member.work_access) }); }}>Edit permissions</button>
              {member.email === currentMember?.email ? <button onClick={() => { window.location.href="/api/integrations/google-calendar/connect"; }}>Connect my Google</button> : <button onClick={() => onFlash(`${member.display_name} must sign in and click Connect my Google Calendar`)}>Calendar setup</button>}
              <button onClick={onOpenCalendar}>Open calendar</button>
            </div>
            <button
              className="dangerText"
              disabled={member.role === "OWNER"}
              onClick={() => void removeMember(member)}
            >
              Delete user
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

function CRMIntelligence({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="intelligenceWorkspace">
      <section className="intelligenceHero">
        <div>
          <span>✦ CYNCRO INTELLIGENCE</span>
          <h2>
            Ask your entire business.
            <br />
            Act from one answer.
          </h2>
          <p>
            Reason across contacts, bookings, conversations, revenue, payments,
            tasks, and attribution—then execute with permission.
          </p>
          <div>
            <button onClick={() => onFlash("Revenue analysis ready")}>
              Why did revenue change?
            </button>
            <button onClick={() => onFlash("At-risk deals identified")}>
              Which deals are at risk?
            </button>
            <button onClick={() => onFlash("Growth plan generated")}>
              Build my growth plan
            </button>
          </div>
        </div>
        <aside>
          <small>LIVE BUSINESS MODEL</small>
          {[
            ["Customer graph", "2,418 entities"],
            ["Revenue context", "$284K analyzed"],
            ["Behavior signals", "12,806 events"],
            ["Connected actions", "34 capabilities"],
          ].map((item) => (
            <div key={item[0]}>
              <span>{item[0]}</span>
              <b>{item[1]}</b>
              <i>●</i>
            </div>
          ))}
        </aside>
      </section>
      <div className="intelligenceCards">
        {[
          [
            "NEXT-BEST ACTION",
            "Prioritize the seven contacts most likely to close this week.",
            "+$54K influenced",
          ],
          [
            "PIPELINE RISK",
            "Two opportunities show declining engagement and need intervention.",
            "$9.5K protected",
          ],
          [
            "CAPACITY SIGNAL",
            "Friday’s intensive can release two held seats to the waitlist.",
            "+$1,994 potential",
          ],
          [
            "ATTRIBUTION INSIGHT",
            "Private booking links convert 2.7× better than paid traffic.",
            "Shift budget",
          ],
        ].map((item) => (
          <article className="crmPanel" key={item[0]}>
            <small>{item[0]}</small>
            <h3>{item[1]}</h3>
            <b>{item[2]}</b>
            <button onClick={() => onFlash("Insight opened")}>
              Inspect reasoning →
            </button>
          </article>
        ))}
      </div>
      <section className="enterpriseLayer crmPanel">
        <div className="enterpriseLayerHead">
          <div>
            <small>ENTERPRISE CONTROL LAYER</small>
            <h2>Salesforce depth. Cyncro speed.</h2>
            <p>
              Model any business without forcing it into rigid CRM objects or
              requiring a team of administrators.
            </p>
          </div>
          <span>Architecture ready</span>
        </div>
        <div className="enterpriseGrid">
          {[
            [
              "Universal objects",
              "Create any record, field, relationship, or lifecycle.",
            ],
            [
              "Relationship graph",
              "See people, companies, deals, bookings, payments, and influence.",
            ],
            [
              "Permission intelligence",
              "Role, team, field, action, and AI-level controls.",
            ],
            [
              "Multi-pipeline engine",
              "Run sales, service, recruiting, partnerships, and fulfillment.",
            ],
            [
              "Open orchestration",
              "APIs, webhooks, event streams, imports, exports, and data sync.",
            ],
            [
              "Audit + governance",
              "Full history, approvals, ownership, deduplication, and data quality.",
            ],
          ].map((item, index) => (
            <article key={item[0]}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <b>{item[0]}</b>
                <p>{item[1]}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const primeAgents = [
  [
    "EON",
    "Executive intelligence",
    "Turns company-wide signals into a clear daily decision brief.",
    "6 priorities",
  ],
  [
    "NOVA",
    "Sales acquisition",
    "Qualifies demand, drafts follow-up, and advances the next best action.",
    "18 leads",
  ],
  [
    "ATLAS",
    "Operations",
    "Finds delivery risk, assigns owners, and protects service levels.",
    "4 workflows",
  ],
  [
    "VYRA",
    "Marketing intelligence",
    "Connects campaign spend to pipeline, revenue, and creative insight.",
    "9 campaigns",
  ],
  [
    "ONYX",
    "Analytics",
    "Explains performance shifts and surfaces anomalies before they become losses.",
    "12 insights",
  ],
  [
    "KRONOS",
    "Scheduling",
    "Optimizes capacity, routing, waitlists, and conflict-free calendars.",
    "31 bookings",
  ],
  [
    "SAGE",
    "Knowledge engine",
    "Answers from approved company policy, playbooks, and customer history.",
    "842 sources",
  ],
  [
    "VEGA",
    "Customer success",
    "Detects churn risk and launches personal retention moments.",
    "7 accounts",
  ],
  [
    "APEX",
    "Lead intelligence",
    "Scores intent, urgency, fit, and predicted lifetime value.",
    "94 scored",
  ],
  [
    "ORBIT",
    "Workflow control",
    "Orchestrates cross-module automations with approvals and audit trails.",
    "22 runs",
  ],
  [
    "TITAN",
    "Revenue operations",
    "Forecasts revenue and reveals conversion, margin, and leakage.",
    "$418K forecast",
  ],
  [
    "LUX",
    "Brand + creative",
    "Creates on-brand campaigns, offers, and premium customer messaging.",
    "5 concepts",
  ],
];

function CyncroMessagesComingSoon() {
  const agents = [
    {
      name: "Nova",
      role: "AI Receptionist",
      number: "Miami local · reserved",
      state: "Ready for configuration",
      color: "N",
    },
    {
      name: "Sales Director",
      role: "Human Agent",
      number: "Dedicated line · planned",
      state: "Owner workspace",
      color: "D",
    },
    {
      name: "Setter AI",
      role: "Follow-up Agent",
      number: "Shared campaign pool",
      state: "Approval required",
      color: "S",
    },
    {
      name: "Support Team",
      role: "Shared Inbox",
      number: "Toll-free · planned",
      state: "Round-robin routing",
      color: "C",
    },
  ];
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState(
    "Private preview only · messaging transport is not active",
  );
  const selected = agents[active];
  return (
    <section className="messagesPreview">
      <div className="messagesComingBar">
        <span>COMING SOON</span>
        <b>Cyncro Messages is in private development.</b>
        <p>
          No real numbers are purchased and no messages can be sent from this
          preview.
        </p>
      </div>
      <header>
        <div>
          <small>CYNCRO MESSAGES · OWN THE CONVERSATION</small>
          <h1>
            One inbox.
            <br />
            <em>Every agent. Every number.</em>
          </h1>
          <p>
            Create human and AI agents, assign dedicated or shared numbers,
            route conversations with full CRM context, and turn every reply into
            the next best action.
          </p>
        </div>
        <aside>
          <small>PLATFORM STATUS</small>
          <b>Architecture ready</b>
          <span>Messaging transport　Not connected</span>
          <span>Number provisioning　Preview</span>
          <span>Compliance engine　Designed</span>
        </aside>
      </header>
      <nav>
        {[
          "Unified Inbox",
          "Agents",
          "Numbers",
          "Routing",
          "Automations",
          "Compliance",
        ].map((item, index) => (
          <button
            className={index === 0 ? "active" : ""}
            onClick={() =>
              setNotice(
                `${item} workspace is designed and will activate when Cyncro Messages enters beta.`,
              )
            }
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="messagesWorkspace">
        <aside>
          <div>
            <small>AGENTS + INBOXES</small>
            <button
              onClick={() =>
                setNotice(
                  "Agent creation is coming soon. No account was created.",
                )
              }
            >
              ＋ Add agent
            </button>
          </div>
          {agents.map((agent, index) => (
            <button
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              key={agent.name}
            >
              <i>{agent.color}</i>
              <span>
                <b>{agent.name}</b>
                <small>{agent.role}</small>
              </span>
              <em>{index < 2 ? "●" : "○"}</em>
            </button>
          ))}
        </aside>
        <main>
          <div className="messagesThreadHead">
            <div>
              <i>{selected.color}</i>
              <span>
                <b>{selected.name}</b>
                <small>
                  {selected.role} · {selected.number}
                </small>
              </span>
            </div>
            <button
              onClick={() =>
                setNotice(
                  "Real messaging will activate during the controlled beta.",
                )
              }
            >
              Start conversation
            </button>
          </div>
          <div className="messagesThread">
            <div className="inbound">
              <small>CONTACT · 10:24 AM</small>
              <p>Hi, I’d like to learn more and book a call for next week.</p>
            </div>
            <div className="outbound">
              <small>{selected.name.toUpperCase()} · DRAFT PREVIEW</small>
              <p>
                Absolutely. I can help with that. Would Tuesday morning or
                Wednesday afternoon work better?
              </p>
              <span>CRM contact matched · booking availability checked</span>
            </div>
            <div className="agentAction">
              <i>✦</i>
              <span>
                <b>Cyncro recommends</b>
                <small>
                  Offer two protected calendar slots and move the opportunity to
                  Contacted after reply.
                </small>
              </span>
              <button
                onClick={() =>
                  setNotice("AI actions remain approval-only until launch.")
                }
              >
                Review
              </button>
            </div>
          </div>
          <div className="messageComposer">
            <button
              onClick={() =>
                setNotice("Attachments will be available in beta.")
              }
            >
              ＋
            </button>
            <input
              readOnly
              value="Messaging is disabled in this coming-soon preview"
            />
            <button
              onClick={() => setNotice("Preview only — no message was sent.")}
            >
              Send
            </button>
          </div>
        </main>
        <aside className="messageContext">
          <small>LIVE CRM CONTEXT</small>
          <h3>Prospect record</h3>
          <div>
            <span>
              Stage<b>NEW LEAD</b>
            </span>
            <span>
              Owner<b>{selected.name}</b>
            </span>
            <span>
              Last signal<b>Booking intent</b>
            </span>
            <span>
              Consent<b>Required before send</b>
            </span>
          </div>
          <small>NUMBER ROUTING</small>
          <h3>{selected.number}</h3>
          <p>{selected.state}</p>
          <button
            onClick={() =>
              setNotice(
                "Number selection will open when carrier inventory is connected.",
              )
            }
          >
            Preview number setup
          </button>
        </aside>
      </div>
      <div className="messagesCapabilities">
        {[
          [
            "01",
            "BRING YOUR TEAM",
            "Human reps, managers, shared inboxes, permissions, reassignment, and owner visibility.",
          ],
          [
            "02",
            "CREATE AI AGENTS",
            "Receptionist, setter, support, collections, and custom agents with human handoff.",
          ],
          [
            "03",
            "CHOOSE NUMBERS",
            "Local, toll-free, ported, dedicated, shared, campaign, and location-based numbers.",
          ],
          [
            "04",
            "CONTROL EVERY SEND",
            "Consent, STOP handling, quiet hours, limits, approvals, logs, and suppression lists.",
          ],
          [
            "05",
            "CONNECT REVENUE",
            "CRM records, calendars, pipelines, attribution, payments, and performance analytics.",
          ],
          [
            "06",
            "BUILD ON CYNCRO",
            "A branded API and webhook layer customers experience entirely as Cyncro.",
          ],
        ].map((item) => (
          <article key={item[0]}>
            <span>{item[0]}</span>
            <b>{item[1]}</b>
            <p>{item[2]}</p>
          </article>
        ))}
      </div>
      <div className="messagesNotice">● {notice}</div>
    </section>
  );
}

function CyncroPrime() {
  const [active, setActive] = useState(0);
  const [command, setCommand] = useState(
    "Find this week's revenue leaks and launch the safest recovery plan.",
  );
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("System ready · 12 agents connected");
  const runPrime = () => {
    setRunning(true);
    setMessage(
      "Cyncro Prime is assigning the mission across EON, ONYX, TITAN, and ORBIT…",
    );
    window.setTimeout(() => {
      setRunning(false);
      setMessage(
        "Mission prepared · 4 actions ready for approval · projected recovery $28,400",
      );
    }, 900);
  };
  return (
    <section className="intelligenceShell">
      <div className="intelligenceHero">
        <div>
          <p className="eyebrow">CYNCRO PRIME · AI OPERATING SYSTEM</p>
          <h1>
            One command.
            <br />
            <em>Your entire company moves.</em>
          </h1>
          <p>
            Prime coordinates specialist agents across revenue, customers,
            operations, scheduling, marketing, and execution—while keeping every
            consequential action under human approval.
          </p>
        </div>
        <div className="primeStatus">
          <span className="liveOrb">●</span>
          <small>ORCHESTRATOR STATUS</small>
          <strong>All systems aligned</strong>
          <div>
            <b>12</b>
            <span>Agents online</span>
          </div>
          <div>
            <b>98.7%</b>
            <span>Automation health</span>
          </div>
          <div>
            <b>2.4s</b>
            <span>Decision latency</span>
          </div>
        </div>
      </div>
      <div className="commandDeck">
        <div>
          <span>ASK CYNCRO PRIME</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            aria-label="Command for Cyncro Prime"
          />
        </div>
        <button onClick={runPrime} disabled={running || !command.trim()}>
          {running ? "Coordinating…" : "Run mission →"}
        </button>
      </div>
      <div className={`primeMessage ${running ? "running" : ""}`}>
        <i>✦</i>
        {message}
      </div>
      <div className="primeWorkspace">
        <div className="agentGrid">
          {primeAgents.map((agent, index) => (
            <button
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              key={agent[0]}
            >
              <span>{agent[0].slice(0, 1)}</span>
              <div>
                <b>{agent[0]}</b>
                <small>{agent[1]}</small>
              </div>
              <em>{agent[3]}</em>
            </button>
          ))}
        </div>
        <aside className="agentDetail">
          <small>SPECIALIST AGENT</small>
          <div className="agentMonogram">{primeAgents[active][0]}</div>
          <h2>{primeAgents[active][1]}</h2>
          <p>{primeAgents[active][2]}</p>
          <div className="agentFacts">
            <span>
              Permission mode <b>Approval required</b>
            </span>
            <span>
              Current workload <b>{primeAgents[active][3]}</b>
            </span>
            <span>
              Connected context <b>Live + governed</b>
            </span>
          </div>
          <button
            onClick={() =>
              setMessage(
                `${primeAgents[active][0]} opened · context and current assignments loaded`,
              )
            }
          >
            Open agent workspace →
          </button>
        </aside>
      </div>
      <div className="primeFlow">
        <article>
          <small>01 · UNDERSTAND</small>
          <b>Reads the whole business</b>
          <p>
            Unified context from CRM, calendars, conversations, operations,
            finance, and campaigns.
          </p>
        </article>
        <article>
          <small>02 · DECIDE</small>
          <b>Builds a coordinated plan</b>
          <p>
            Routes each task to the right specialist and forecasts impact before
            execution.
          </p>
        </article>
        <article>
          <small>03 · CONTROL</small>
          <b>You approve the moments that matter</b>
          <p>
            Guardrails, permissions, logs, rollback, and accountable human
            review are built in.
          </p>
        </article>
      </div>
    </section>
  );
}

const matchups = [
  {
    game: "New York @ Boston",
    league: "NBA",
    time: "7:30 PM",
    market: "BOS -4.5",
    edge: 6.8,
    confidence: 74,
    move: "-3.5 → -4.5",
    signal: "Model edge",
  },
  {
    game: "Dallas @ Phoenix",
    league: "NBA",
    time: "9:00 PM",
    market: "O 228.5",
    edge: 4.2,
    confidence: 67,
    move: "226.5 → 228.5",
    signal: "Pace signal",
  },
  {
    game: "Miami @ Buffalo",
    league: "NFL",
    time: "8:20 PM",
    market: "BUF -2.5",
    edge: 2.1,
    confidence: 58,
    move: "-2 → -2.5",
    signal: "Watchlist",
  },
];

function CyncroSports() {
  const [active, setActive] = useState(0);
  const [bankroll, setBankroll] = useState(5000);
  const [risk, setRisk] = useState("Balanced");
  const [run, setRun] = useState(0);
  const [notice, setNotice] = useState(
    "Models refreshed · 18 market inputs checked",
  );
  const game = matchups[active];
  const unitPct =
    risk === "Conservative" ? 0.005 : risk === "Aggressive" ? 0.02 : 0.01;
  const unit = Math.round(bankroll * unitPct);
  return (
    <section className="intelligenceShell sportsShell">
      <div className="sportsHero">
        <div>
          <p className="eyebrow">CYNCRO SPORTS · EDGE INTELLIGENCE</p>
          <h1>
            Sharper analysis.
            <br />
            <em>Disciplined decisions.</em>
          </h1>
          <p>
            Compare markets, understand line movement, pressure-test model
            signals, and protect bankroll exposure from one controlled
            workspace.
          </p>
          <div className="sportsActions">
            <button
              onClick={() => {
                setRun(run + 1);
                setNotice(
                  `Analysis #${run + 1} complete · no material injury conflicts detected`,
                );
              }}
            >
              Run fresh analysis →
            </button>
            <button
              onClick={() =>
                setNotice(
                  "Alert saved · you’ll be notified if the edge crosses 7%",
                )
              }
            >
              Create edge alert
            </button>
          </div>
        </div>
        <div className="edgeGauge">
          <small>TOP VERIFIED EDGE</small>
          <strong>{game.edge}%</strong>
          <span>{game.market}</span>
          <div>
            <i style={{ width: `${game.confidence}%` }} />
          </div>
          <b>{game.confidence}% model confidence</b>
        </div>
      </div>
      <div className="sportsTicker">
        <span>● DATA HEALTHY</span>
        <b>Odds comparison</b>
        <b>Line movement</b>
        <b>Injuries</b>
        <b>Weather</b>
        <b>Rest + travel</b>
        <b>Public exposure</b>
      </div>
      <div className="sportsLayout">
        <div className="matchupBoard">
          <div className="sectionTitle">
            <div>
              <small>MARKET BOARD</small>
              <h2>Tonight’s monitored edges</h2>
            </div>
            <span>Updated 14 sec ago</span>
          </div>
          {matchups.map((m, index) => (
            <button
              className={active === index ? "active" : ""}
              onClick={() => setActive(index)}
              key={m.game}
            >
              <span className="leagueTag">{m.league}</span>
              <div>
                <b>{m.game}</b>
                <small>
                  {m.time} · {m.signal}
                </small>
              </div>
              <div>
                <strong>{m.market}</strong>
                <small>{m.move}</small>
              </div>
              <em>+{m.edge}%</em>
            </button>
          ))}
          <div className="modelDrivers">
            <small>WHY THE MODEL SEES IT</small>
            <div>
              <span>Recent efficiency differential</span>
              <b>+2.8</b>
            </div>
            <div>
              <span>Rest and travel adjustment</span>
              <b>+1.4</b>
            </div>
            <div>
              <span>Availability / injury impact</span>
              <b>+1.7</b>
            </div>
            <div>
              <span>Market price penalty</span>
              <b>-0.9</b>
            </div>
          </div>
        </div>
        <aside className="riskDesk">
          <small>BANKROLL CONTROL</small>
          <h2>Risk before picks.</h2>
          <label>
            Tracked bankroll
            <input
              type="number"
              min="100"
              value={bankroll}
              onChange={(e) =>
                setBankroll(Math.max(100, Number(e.target.value) || 100))
              }
            />
          </label>
          <label>
            Risk profile
            <select value={risk} onChange={(e) => setRisk(e.target.value)}>
              <option>Conservative</option>
              <option>Balanced</option>
              <option>Aggressive</option>
            </select>
          </label>
          <div className="unitCard">
            <span>Recommended unit</span>
            <strong>${unit.toLocaleString()}</strong>
            <small>{(unitPct * 100).toFixed(1)}% of tracked bankroll</small>
          </div>
          <div className="exposureList">
            <span>
              Open exposure <b>2.0 units</b>
            </span>
            <span>
              Daily loss limit <b>3.0 units</b>
            </span>
            <span>
              Correlation warning <b>Clear</b>
            </span>
          </div>
          <button
            onClick={() =>
              setNotice(
                `${game.market} added to journal as a tracked decision · no wager placed`,
              )
            }
          >
            Add to decision journal
          </button>
        </aside>
      </div>
      <div className="sportsStats">
        <article>
          <small>DECISION JOURNAL</small>
          <b>142</b>
          <span>Tracked positions</span>
        </article>
        <article>
          <small>CLV</small>
          <b>+2.7%</b>
          <span>Average closing-line value</span>
        </article>
        <article>
          <small>MODEL ACCURACY</small>
          <b>61.8%</b>
          <span>Last 90 evaluated signals</span>
        </article>
        <article>
          <small>MAX DRAWDOWN</small>
          <b>-4.3u</b>
          <span>Within configured guardrail</span>
        </article>
      </div>
      <div className="sportsNotice">
        <span>✦</span>
        <b>{notice}</b>
        <p>
          Analysis tools only. No outcome is guaranteed and this demo never
          places wagers. Use only where legal, at the required age, and within
          firm personal limits.
        </p>
      </div>
    </section>
  );
}

function CRMCalendarWorkspace({
  onFlash,
  currentUserName,
}: {
  onFlash: (message: string) => void;
  currentUserName: string;
}) {
  return (
    <div className="crmEmbeddedCalendar">
      <div className="calendarAccessBar">
        <div>
          <small>CYNCRO UNIVERSAL CALENDAR</small>
          <h2>Schedule, configure, publish.</h2>
          <p>
            Three simple steps. Advanced controls only appear when you need
            them.
          </p>
        </div>
      </div>
      <div className="calendarSimpleSteps">
        <button
          onClick={() =>
            document
              .getElementById("calendar-bookings")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <i>1</i>
          <span>
            <b>Manage schedule</b>
            <small>View, reschedule, confirm, or cancel bookings.</small>
          </span>
        </button>
        <button
          onClick={() =>
            document
              .getElementById("calendar-event-settings")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <i>2</i>
          <span>
            <b>Create event types</b>
            <small>Choose duration, location, capacity, and price.</small>
          </span>
        </button>
        <button
          onClick={() =>
            document
              .getElementById("calendar-event-settings")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <i>3</i>
          <span>
            <b>Set availability & publish</b>
            <small>
              Control time slots, reminders, routing, and booking links.
            </small>
          </span>
        </button>
      </div>
      <div id="calendar-bookings">
        <Admin
          currentUserName={currentUserName}
          onCreate={() =>
            document
              .getElementById("calendar-event-settings")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        />
      </div>
      <div id="calendar-event-settings" className="calendarSettingsSection">
        <div className="calendarSectionTitle">
          <small>EVENT TYPES · AVAILABILITY · LINKS · SETTINGS</small>
          <h2>Calendar configuration</h2>
          <p>
            Create and customize the booking experience without leaving this
            page.
          </p>
        </div>
        <SimpleEventManager onFlash={onFlash} />
      </div>
    </div>
  );
}

function SimpleEventManager({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  type EventType = {
    id: string;
    name: string;
    slug: string;
    description?: string;
    duration_minutes: number;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    capacity: number;
    location_modes: string;
    video_platforms: string;
    host_name?: string;
  };
  const empty = {
    id: "",
    name: "",
    slug: "",
    description: "",
    hostName: "",
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    capacity: 1,
    locationModes: ["VIDEO"],
    videoPlatforms: ["GOOGLE_MEET", "ZOOM", "FACETIME"],
    startTime: "09:00",
    endTime: "17:00",
    timezone: "America/New_York",
  };
  const [events, setEvents] = useState<EventType[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const response = await fetch("/api/calendar/event-types");
    const data = (await response.json()) as {
      eventTypes?: EventType[];
      error?: string;
    };
    if (!response.ok) {
      onFlash(data.error || "Event types could not be loaded");
      return;
    }
    setEvents(data.eventTypes || []);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const selectEvent = (item: EventType) =>
    setForm({
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description || "",
      hostName: item.host_name || "",
      durationMinutes: item.duration_minutes,
      bufferBeforeMinutes: item.buffer_before_minutes,
      bufferAfterMinutes: item.buffer_after_minutes,
      capacity: item.capacity,
      locationModes: JSON.parse(item.location_modes || "[]"),
      videoPlatforms: JSON.parse(item.video_platforms || "[]"),
      startTime: "09:00",
      endTime: "17:00",
      timezone: "America/New_York",
    });
  const toggle = (key: "locationModes" | "videoPlatforms", value: string) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      onFlash("Event name and booking link are required");
      return;
    }
    setSaving(true);
    const method = form.id ? "PATCH" : "POST";
    const payload = form.id ? { id: form.id, ...form } : form;
    const response = await fetch("/api/calendar/event-types", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as {
      id?: string;
      eventType?: EventType;
      error?: string;
    };
    if (!response.ok) {
      setSaving(false);
      onFlash(data.error || "Event could not be saved");
      return;
    }
    const eventId = form.id || data.id || "";
    const availability = await fetch("/api/calendar/availability", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId: eventId,
        timezone: form.timezone,
        rules: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startTime: form.startTime,
          endTime: form.endTime,
        })),
      }),
    });
    setSaving(false);
    if (!availability.ok) {
      const result = (await availability.json()) as { error?: string };
      onFlash(result.error || "Availability could not be saved");
      return;
    }
    await load();
    setForm((current) => ({ ...current, id: eventId }));
    onFlash("Event, availability, and booking link saved");
  };
  const archive = async () => {
    if (!form.id) return;
    const response = await fetch("/api/calendar/event-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: form.id, active: false }),
    });
    if (response.ok) {
      setForm(empty);
      await load();
      onFlash("Event type archived");
    }
  };
  const bookingUrl =
    typeof window === "undefined"
      ? "/#book"
      : `${window.location.origin}/?event=${encodeURIComponent(form.slug)}#book`;
  return (
    <div className="simpleEventManager">
      <aside>
        <div>
          <b>EVENT TYPES</b>
          <button onClick={() => setForm(empty)}>＋ New</button>
        </div>
        {events.map((item) => (
          <button
            className={form.id === item.id ? "active" : ""}
            onClick={() => selectEvent(item)}
            key={item.id}
          >
            <b>{item.name}</b>
            <small>
              {item.duration_minutes} min · Capacity {item.capacity}
            </small>
          </button>
        ))}
        {!events.length && <p>No event types yet.</p>}
      </aside>
      <section>
        <div className="simpleEventHead">
          <div>
            <small>{form.id ? "EDIT EVENT" : "NEW EVENT"}</small>
            <h3>{form.name || "Create an event type"}</h3>
          </div>
          <div>
            {form.id && (
              <button className="danger" onClick={() => void archive()}>
                Archive
              </button>
            )}
            <button
              className="crmCreate"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save & publish"}
            </button>
          </div>
        </div>
        <div className="simpleEventGrid">
          <label>
            Event name
            <input
              value={form.name}
              onChange={(event) =>
                setForm({
                  ...form,
                  name: event.target.value,
                  slug: form.id
                    ? form.slug
                    : event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, ""),
                })
              }
            />
          </label>
          <label>
            Booking link name
            <input
              value={form.slug}
              onChange={(event) =>
                setForm({
                  ...form,
                  slug: event.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, ""),
                })
              }
            />
          </label>
          <label>
            Assigned manager / host
            <input
              value={form.hostName}
              placeholder="Manager name or email"
              onChange={(event) =>
                setForm({ ...form, hostName: event.target.value })
              }
            />
          </label>
          <label className="wide">
            Description
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
            />
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min="5"
              value={form.durationMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  durationMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Capacity
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(event) =>
                setForm({ ...form, capacity: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Buffer before
            <input
              type="number"
              min="0"
              value={form.bufferBeforeMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  bufferBeforeMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Buffer after
            <input
              type="number"
              min="0"
              value={form.bufferAfterMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  bufferAfterMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            Available from
            <input
              type="time"
              value={form.startTime}
              onChange={(event) =>
                setForm({ ...form, startTime: event.target.value })
              }
            />
          </label>
          <label>
            Available until
            <input
              type="time"
              value={form.endTime}
              onChange={(event) =>
                setForm({ ...form, endTime: event.target.value })
              }
            />
          </label>
          <label className="wide">
            Meeting options
            <div className="simpleChecks">
              {[
                ["VIDEO", "Video"],
                ["PHONE", "Phone"],
                ["IN_PERSON", "In person"],
              ].map(([value, label]) => (
                <button
                  className={form.locationModes.includes(value) ? "active" : ""}
                  onClick={() => toggle("locationModes", value)}
                  key={value}
                >
                  ✓ {label}
                </button>
              ))}
            </div>
          </label>
          <label className="wide">
            Video platforms
            <div className="simpleChecks">
              {[
                ["GOOGLE_MEET", "Google Meet"],
                ["ZOOM", "Zoom"],
                ["FACETIME", "FaceTime"],
              ].map(([value, label]) => (
                <button
                  className={
                    form.videoPlatforms.includes(value) ? "active" : ""
                  }
                  onClick={() => toggle("videoPlatforms", value)}
                  key={value}
                >
                  ✓ {label}
                </button>
              ))}
            </div>
          </label>
          <label className="wide">
            Published booking page
            <div className="bookingLinkBox">
              <input readOnly value={bookingUrl} />
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(bookingUrl);
                  onFlash("Booking link copied");
                }}
              >
                Copy link
              </button>
            </div>
          </label>
        </div>
      </section>
    </div>
  );
}

function Admin({
  onCreate,
  currentUserName = "Platform Owner",
}: {
  onCreate: () => void;
  currentUserName?: string;
}) {
  type Booking = {
    id: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    starts_at: string;
    ends_at: string;
    event_name: string;
    event_type_id: string;
    contact_id?: string;
    assigned_to?: string;
    location_mode: string;
    meeting_address?: string;
    video_platform?: string;
    status: string;
    notes?: string;
  };
  type EventOption = { id: string; name: string; duration_minutes: number };
  type ContactOption = {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [rows, setRows] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [calendarView, setCalendarView] = useState<"LIST" | "MONTH" | "WEEK">(
    "WEEK",
  );
  const [focusDate, setFocusDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [showMine, setShowMine] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [eventOptions, setEventOptions] = useState<EventOption[]>([]);
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [manual, setManual] = useState({
    eventTypeId: "",
    contactId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    startsAt: "",
    locationMode: "VIDEO",
    meetingAddress: "",
    videoPlatform: "GOOGLE_MEET",
    notes: "",
    assignedTo: currentUserName,
  });
  const [notifications, setNotifications] = useState<
    {
      id: string;
      title: string;
      body?: string;
      read_at?: string;
      created_at: string;
    }[]
  >([]);
  const [calendarFeed, setCalendarFeed] = useState("");
  useEffect(() => {
    void fetch("/api/calendar/connections").then(async (response) => {
      const data = (await response.json()) as { feedUrl?: string };
      if (response.ok && data.feedUrl) setCalendarFeed(data.feedUrl);
    });
  }, []);
  const connectCalendar = async () => {
    const response = await fetch("/api/calendar/connections", {
      method: "POST",
    });
    const data = (await response.json()) as {
      feedUrl?: string;
      error?: string;
    };
    if (!response.ok || !data.feedUrl) {
      setNotice(data.error || "Calendar connection could not be created");
      return;
    }
    setCalendarFeed(data.feedUrl);
    await navigator.clipboard?.writeText(data.feedUrl);
    setNotice(
      "Private calendar subscription copied. Add it to Google, Outlook, or Apple Calendar once; future bookings update automatically.",
    );
  };
  const loadBookings = async () => {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);
    const response = await fetch(
      `/api/calendar/bookings?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    );
    const data = (await response.json()) as {
      bookings?: Booking[];
      error?: string;
    };
    if (!response.ok) {
      setNotice(data.error || "Bookings could not be loaded");
      return;
    }
    setRows(data.bookings || []);
    setLoaded(true);
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void loadBookings(), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const loadCalendarData = async () => {
    const [e, c, n] = await Promise.all([
      fetch("/api/calendar/event-types"),
      fetch("/api/crm/contacts"),
      fetch(
        `/api/notifications?recipient=${encodeURIComponent(currentUserName)}`,
      ),
    ]);
    if (e.ok)
      setEventOptions(
        ((await e.json()) as { eventTypes?: EventOption[] }).eventTypes || [],
      );
    if (c.ok)
      setContactOptions(
        ((await c.json()) as { contacts?: ContactOption[] }).contacts || [],
      );
    if (n.ok)
      setNotifications(
        ((await n.json()) as { notifications?: typeof notifications })
          .notifications || [],
      );
  };
  useEffect(() => {
    const timer = window.setTimeout(() => void loadCalendarData(), 0);
    return () => window.clearTimeout(timer);
  }, [currentUserName]);
  useEffect(() => {
    const open = () => {
      const next = new Date();
      next.setDate(next.getDate() + 1);
      next.setHours(10, 0, 0, 0);
      setManual((current) => ({
        ...current,
        eventTypeId: current.eventTypeId || eventOptions[0]?.id || "",
        startsAt: next.toISOString().slice(0, 16),
        assignedTo: currentUserName,
      }));
      setManualOpen(true);
    };
    window.addEventListener("cyncro:open-new-appointment", open);
    return () =>
      window.removeEventListener("cyncro:open-new-appointment", open);
  }, [eventOptions, currentUserName]);
  useEffect(() => {
    const refresh = () => {
      void loadBookings();
      void loadCalendarData();
    };
    window.addEventListener("cyncro:data-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("cyncro:data-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [currentUserName]);
  const updateBooking = async (
    booking: Booking,
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    const response = await fetch("/api/calendar/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: booking.id, action, ...extra }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(data.error || "Booking update failed");
      return;
    }
    setSelectedBooking(null);
    setRescheduleAt("");
    await loadBookings();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "booking", action: action.toLowerCase() },
      }),
    );
    setNotice(`Booking ${action.toLowerCase()} successful`);
  };
  const upcoming = rows.filter(
    (booking) =>
      booking.status !== "CANCELLED" &&
      new Date(booking.starts_at) >= new Date(),
  );
  const confirmed = rows.filter(
    (booking) =>
      booking.status === "CONFIRMED" || booking.status === "RESCHEDULED",
  ).length;
  const visibleRows = rows.filter(
    (booking) =>
      !showMine ||
      !booking.assigned_to ||
      booking.assigned_to === currentUserName,
  );
  const createManualBooking = async () => {
    const response = await fetch("/api/calendar/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...manual,
        startsAt: new Date(manual.startsAt).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setNotice(data.error || "Booking could not be created");
      return;
    }
    setManualOpen(false);
    setManual({
      ...manual,
      eventTypeId: "",
      contactId: "",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      startsAt: "",
      notes: "",
    });
    await loadBookings();
    window.dispatchEvent(
      new CustomEvent("cyncro:data-changed", {
        detail: { entity: "booking", action: "created" },
      }),
    );
    setNotice("Appointment created and synced everywhere");
  };
  const chooseContact = (id: string) => {
    const contact = contactOptions.find((item) => item.id === id);
    setManual({
      ...manual,
      contactId: id,
      customerName: contact?.full_name || "",
      customerEmail: contact?.email || "",
      customerPhone: contact?.phone || "",
    });
  };
  return (
    <section className="admin">
      <div className="adminhead">
        <div>
          <label>UNIVERSAL CALENDAR</label>
          <h1>Booking management</h1>
          <p>
            Availability, resources, contacts, and scheduling controls in one
            place.
          </p>
        </div>
        <button onClick={onCreate}>+ Create event</button>
      </div>
      <div className="stats">
        {[
          ["UPCOMING BOOKINGS", String(upcoming.length)],
          ["CONFIRMED", String(confirmed)],
          [
            "COMPLETED",
            String(
              rows.filter((booking) => booking.status === "COMPLETED").length,
            ),
          ],
          [
            "CANCELLED",
            String(
              rows.filter((booking) => booking.status === "CANCELLED").length,
            ),
          ],
        ].map((x) => (
          <div key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <p>Live backend status</p>
          </div>
        ))}
      </div>
      <div className="calendarCommandBar">
        <div>
          {(["LIST", "WEEK", "MONTH"] as const).map((item) => (
            <button
              className={calendarView === item ? "active" : ""}
              onClick={() => setCalendarView(item)}
              key={item}
            >
              {item[0] + item.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <label className="calendarDatePicker">
          Calendar date
          <input
            aria-label="Calendar date"
            type="date"
            value={focusDate}
            onChange={(event) => setFocusDate(event.target.value)}
          />
        </label>
        <button
          onClick={() => setFocusDate(new Date().toISOString().slice(0, 10))}
        >
          Today
        </button>
        <label>
          <input
            type="checkbox"
            checked={showMine}
            onChange={(event) => setShowMine(event.target.checked)}
          />{" "}
          My appointments
        </label>
        <button
          className="crmCreate"
          onClick={() => {
            const next = new Date();
            next.setDate(next.getDate() + 1);
            next.setHours(10, 0, 0, 0);
            setManual({ ...manual, startsAt: next.toISOString().slice(0, 16) });
            setManualOpen(true);
          }}
        >
          ＋ Book appointment
        </button>
      </div>
      <div className="externalCalendarBar">
        <div>
          <small>GOOGLE CALENDAR CONNECTION</small>
          <b>
            {calendarFeed
              ? "Calendar subscription is ready"
              : "Connect Google Calendar directly"}
          </b>
          <span>
            Use direct Google authorization for automatic event sync, or copy a
            private subscription link for Outlook and Apple Calendar.
          </span>
        </div>
        <div>
          <button onClick={() => { window.location.href = "/api/integrations/google-calendar/connect"; }}>
            Connect Google Calendar
          </button>
          <button onClick={() => void connectCalendar()}>
            {calendarFeed ? "Copy subscription link" : "Create subscription link"}
          </button>
        </div>
      </div>
      {calendarView !== "LIST" && (
        <div className={`roleCalendar ${calendarView.toLowerCase()}`}>
          <div className="roleCalendarHead">
            <b>
              {calendarView === "MONTH"
                ? new Date(`${focusDate}T12:00:00`).toLocaleDateString(
                    undefined,
                    { month: "long", year: "numeric" },
                  )
                : `Week of ${new Date(`${focusDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </b>
            <span>
              {currentUserName} · {visibleRows.length} appointments
            </span>
          </div>
          <div className="roleCalendarGrid">
            {Array.from(
              { length: calendarView === "MONTH" ? 35 : 7 },
              (_, index) => {
                const date = new Date(`${focusDate}T12:00:00`);
                if (calendarView === "MONTH") {
                  date.setDate(1);
                  date.setDate(index - date.getDay() + 1);
                } else date.setDate(date.getDate() - date.getDay() + index);
                const dayRows = visibleRows.filter(
                  (row) =>
                    new Date(row.starts_at).toDateString() ===
                    date.toDateString(),
                );
                return (
                  <div key={index}>
                    <time>
                      {date.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    {dayRows.map((row) => (
                      <button
                        key={row.id}
                        onClick={() => setSelectedBooking(row)}
                      >
                        <b>
                          {new Date(row.starts_at).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </b>
                        <span>{row.customer_name}</span>
                        <small>{row.event_name}</small>
                      </button>
                    ))}
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
      <div
        className={`table ${calendarView !== "LIST" ? "compactBookingList" : ""}`}
      >
        <div className="crmPanelHead">
          <div>
            <small>APPOINTMENTS</small>
            <h3>
              {calendarView === "LIST" ? "All bookings" : "Upcoming details"}
            </h3>
          </div>
          <button onClick={() => void loadBookings()}>Refresh</button>
        </div>
        {visibleRows.map((booking) => (
          <div className="tr" key={booking.id}>
            <span>
              <b>
                {new Date(booking.starts_at).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </b>
            </span>
            <span>
              <b>{booking.customer_name}</b>
              <small>
                {booking.customer_email}
                <br />
                {booking.customer_phone || "No phone"}
              </small>
            </span>
            <span>
              <b>{booking.event_name}</b>
            </span>
            <span>
              <b>{booking.location_mode.replace("_", " ")}</b>
              <small>
                {booking.video_platform || booking.meeting_address || ""}
              </small>
            </span>
            <span>
              <b>{booking.status}</b>
            </span>
            <button onClick={() => setSelectedBooking(booking)}>•••</button>
          </div>
        ))}
        {loaded && !visibleRows.length && (
          <div className="noProspects">
            No appointments in this view. Create one manually or publish a
            booking link.
          </div>
        )}
      </div>
      {notifications.some((item) => !item.read_at) && (
        <div className="calendarNotifications">
          <b>NOTIFICATIONS</b>
          {notifications
            .filter((item) => !item.read_at)
            .slice(0, 3)
            .map((item) => (
              <button
                key={item.id}
                onClick={async () => {
                  await fetch("/api/notifications", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: item.id }),
                  });
                  setNotifications((current) =>
                    current.map((note) =>
                      note.id === item.id
                        ? { ...note, read_at: new Date().toISOString() }
                        : note,
                    ),
                  );
                }}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </span>
                <em>Mark read</em>
              </button>
            ))}
        </div>
      )}
      {notice && <div className="prospectingAlert success">{notice}</div>}
      <footer className="features">
        ◆ Double-booking protection　◆ Weighted host routing　◆ Resource
        locking　◆ Automated reminders　◆ Calendar sync ready
      </footer>
      {selectedBooking && (
        <div className="modalback" onClick={() => setSelectedBooking(null)}>
          <div
            className="bookingmodal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>BOOKING CONTROL</label>
                <h2>{selectedBooking.customer_name}</h2>
              </div>
              <button onClick={() => setSelectedBooking(null)}>×</button>
            </div>
            <div className="bookingfacts">
              <div>
                <small>DATE & TIME</small>
                <b>{new Date(selectedBooking.starts_at).toLocaleString()}</b>
              </div>
              <div>
                <small>EVENT</small>
                <b>{selectedBooking.event_name}</b>
              </div>
              <div>
                <small>LOCATION</small>
                <b>
                  {selectedBooking.location_mode.replace("_", " ")}{" "}
                  {selectedBooking.video_platform ||
                    selectedBooking.meeting_address ||
                    ""}
                </b>
              </div>
              <div>
                <small>STATUS</small>
                <b>{selectedBooking.status}</b>
              </div>
              <div>
                <small>ASSIGNED TO</small>
                <b>{selectedBooking.assigned_to || "Unassigned"}</b>
              </div>
            </div>
            <label>
              New date and time
              <input
                type="datetime-local"
                value={rescheduleAt}
                onChange={(event) => setRescheduleAt(event.target.value)}
              />
            </label>
            <label>
              Assign appointment
              <input
                value={selectedBooking.assigned_to || ""}
                onChange={(event) =>
                  setSelectedBooking({
                    ...selectedBooking,
                    assigned_to: event.target.value,
                  })
                }
              />
            </label>
            <div className="modalactions">
              <button
                disabled={!rescheduleAt}
                onClick={() =>
                  void updateBooking(selectedBooking, "RESCHEDULE", {
                    startsAt: new Date(rescheduleAt).toISOString(),
                  })
                }
              >
                Reschedule
              </button>
              <button
                onClick={() =>
                  void updateBooking(selectedBooking, "UPDATE", {
                    status: "CONFIRMED",
                    assignedTo: selectedBooking.assigned_to,
                  })
                }
              >
                Confirm
              </button>
              <button
                onClick={() =>
                  void updateBooking(selectedBooking, "UPDATE", {
                    status: "COMPLETED",
                  })
                }
              >
                Mark completed
              </button>
              <button
                className="danger"
                onClick={() => void updateBooking(selectedBooking, "CANCEL")}
              >
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}
      {manualOpen && (
        <div className="modalback" onClick={() => setManualOpen(false)}>
          <div
            className="bookingmodal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>MANUAL BOOKING</label>
                <h2>Create appointment</h2>
              </div>
              <button onClick={() => setManualOpen(false)}>×</button>
            </div>
            <div className="crmForm">
              <label>
                Event type
                <select
                  value={manual.eventTypeId}
                  onChange={(event) =>
                    setManual({ ...manual, eventTypeId: event.target.value })
                  }
                >
                  <option value="">Select event</option>
                  {eventOptions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} · {item.duration_minutes} min
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CRM contact
                <select
                  value={manual.contactId}
                  onChange={(event) => chooseContact(event.target.value)}
                >
                  <option value="">Select or enter manually</option>
                  {contactOptions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Customer name
                <input
                  value={manual.customerName}
                  onChange={(event) =>
                    setManual({ ...manual, customerName: event.target.value })
                  }
                />
              </label>
              <label>
                Email
                <input
                  value={manual.customerEmail}
                  onChange={(event) =>
                    setManual({ ...manual, customerEmail: event.target.value })
                  }
                />
              </label>
              <label>
                Phone
                <input
                  value={manual.customerPhone}
                  onChange={(event) =>
                    setManual({ ...manual, customerPhone: event.target.value })
                  }
                />
              </label>
              <label>
                Date and time
                <input
                  type="datetime-local"
                  value={manual.startsAt}
                  onChange={(event) =>
                    setManual({ ...manual, startsAt: event.target.value })
                  }
                />
              </label>
              <label>
                Assigned to
                <input
                  value={manual.assignedTo}
                  onChange={(event) =>
                    setManual({ ...manual, assignedTo: event.target.value })
                  }
                />
              </label>
              <label>
                Meeting type
                <select
                  value={manual.locationMode}
                  onChange={(event) =>
                    setManual({ ...manual, locationMode: event.target.value })
                  }
                >
                  <option value="VIDEO">Video</option>
                  <option value="PHONE">Phone</option>
                  <option value="IN_PERSON">In person</option>
                </select>
              </label>
              {manual.locationMode === "VIDEO" && (
                <label>
                  Video platform
                  <select
                    value={manual.videoPlatform}
                    onChange={(event) =>
                      setManual({
                        ...manual,
                        videoPlatform: event.target.value,
                      })
                    }
                  >
                    <option value="GOOGLE_MEET">Google Meet</option>
                    <option value="ZOOM">Zoom</option>
                    <option value="FACETIME">FaceTime</option>
                  </select>
                </label>
              )}
              {manual.locationMode === "IN_PERSON" && (
                <label>
                  Meeting address
                  <input
                    value={manual.meetingAddress}
                    onChange={(event) =>
                      setManual({
                        ...manual,
                        meetingAddress: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              <label>
                Notes
                <textarea
                  value={manual.notes}
                  onChange={(event) =>
                    setManual({ ...manual, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modalactions">
              <button onClick={() => setManualOpen(false)}>Cancel</button>
              <button
                disabled={
                  !manual.eventTypeId ||
                  !manual.customerName ||
                  !manual.customerEmail ||
                  !manual.startsAt
                }
                onClick={() => void createManualBooking()}
              >
                Create appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
