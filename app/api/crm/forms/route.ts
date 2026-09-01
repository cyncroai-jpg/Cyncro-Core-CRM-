import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, normalizeEmail, requestUser } from "@/lib/core/db";

const safeFields = (value: unknown) => Array.isArray(value) ? value.slice(0, 60).map((raw) => {
  const x = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const type = cleanText(x.type, 30).toUpperCase();
  return { id: cleanText(x.id, 80) || crypto.randomUUID(), label: cleanText(x.label, 220) || "Untitled question", type: ["SHORT","LONG","EMAIL","PHONE","NUMBER","DATE","SELECT","CHECKBOX","FILE"].includes(type) ? type : "SHORT", required: Boolean(x.required), options: Array.isArray(x.options) ? x.options.slice(0, 30).map((o) => cleanText(o, 120)).filter(Boolean) : [] };
}) : [];

export async function GET(request: Request) {
  try {
    await ensureCoreSchema(); const url = new URL(request.url), token = cleanText(url.searchParams.get("token"), 100), id = cleanText(url.searchParams.get("id"), 80);
    if (token) {
      const form = await coreDb().prepare("SELECT id,title,description,fields_json,requires_signature,status,public_token FROM crm_forms WHERE public_token=? AND status='PUBLISHED'").bind(token).first();
      return form ? Response.json({ form }) : Response.json({ error: "This form is unavailable." }, { status: 404 });
    }
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    if (id) {
      const form = await coreDb().prepare("SELECT * FROM crm_forms WHERE id=?").bind(id).first();
      const submissions = await coreDb().prepare("SELECT s.*, (SELECT COUNT(*) FROM crm_form_files f WHERE f.submission_id=s.id) file_count FROM crm_form_submissions s WHERE form_id=? ORDER BY submitted_at DESC").bind(id).all();
      return Response.json({ form, submissions: submissions.results });
    }
    const rows = await coreDb().prepare("SELECT f.*, (SELECT COUNT(*) FROM crm_form_submissions s WHERE s.form_id=f.id) submission_count FROM crm_forms f ORDER BY updated_at DESC").all();
    return Response.json({ forms: rows.results });
  } catch (error) { console.error("forms.list_failed", error); return Response.json({ error: "Unable to load forms." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema(); if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const b = await request.json() as Record<string, unknown>, title = cleanText(b.title, 180); if (!title) return Response.json({ error: "Form title is required." }, { status: 400 });
    const id=crypto.randomUUID(), token=crypto.randomUUID().replaceAll("-", ""), now=new Date().toISOString();
    await coreDb().prepare("INSERT INTO crm_forms (id,title,description,status,public_token,fields_json,requires_signature,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(id,title,cleanText(b.description,1200)||null,cleanText(b.status,20)||"DRAFT",token,JSON.stringify(safeFields(b.fields)),b.requiresSignature?1:0,requestUser(request),now,now).run();
    return Response.json({ id, token }, { status: 201 });
  } catch (error) { console.error("forms.create_failed", error); return Response.json({ error: "Unable to create form." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema(); const b = await request.json() as Record<string, unknown>, token=cleanText(b.token,100);
    if (token && b.action === "SUBMIT") {
      const form = await coreDb().prepare("SELECT * FROM crm_forms WHERE public_token=? AND status='PUBLISHED'").bind(token).first<Record<string, unknown>>();
      if (!form) return Response.json({ error: "This form is unavailable." }, { status: 404 });
      const name=cleanText(b.respondentName,160), email=normalizeEmail(b.respondentEmail), signature=cleanText(b.signatureName,160);
      if (!name || !email || (Number(form.requires_signature)===1 && !signature)) return Response.json({ error: "Name, valid email, and required signature must be completed." }, { status: 400 });
      const id=crypto.randomUUID(), now=new Date().toISOString(), ip=request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")||"recorded";
      let contact=await coreDb().prepare("SELECT id FROM crm_contacts WHERE lower(email)=?").bind(email).first<{id:string}>();
      await coreDb().prepare("INSERT INTO crm_form_submissions (id,form_id,contact_id,respondent_name,respondent_email,answers_json,signature_name,consent_text,signer_ip,status,submitted_at) VALUES (?,?,?,?,?,?,?,?,?,'SUBMITTED',?)")
        .bind(id,form.id,contact?.id||null,name,email,JSON.stringify(b.answers||{}),signature||null,signature?"I adopt my typed name as my electronic signature and confirm these responses are accurate.":null,ip,now).run();
      if (contact) await coreDb().prepare("INSERT INTO crm_activities (id,contact_id,activity_type,title,details,status,created_by,created_at,updated_at) VALUES (?,?, 'FORM','Questionnaire submitted',?,'COMPLETED',?,?,?)").bind(crypto.randomUUID(),contact.id,String(form.title),email,now,now).run();
      return Response.json({ submitted:true, submissionId:id });
    }
    if (!(await hasModuleAccess(request,"crm"))) return Response.json({ error:"CRM access required." },{status:403});
    const id=cleanText(b.id,80); if(!id) return Response.json({error:"Form id is required."},{status:400});
    await coreDb().prepare("UPDATE crm_forms SET title=?,description=?,status=?,fields_json=?,requires_signature=?,updated_at=? WHERE id=?")
      .bind(cleanText(b.title,180),cleanText(b.description,1200)||null,cleanText(b.status,20)||"DRAFT",JSON.stringify(safeFields(b.fields)),b.requiresSignature?1:0,new Date().toISOString(),id).run();
    return Response.json({saved:true});
  } catch(error){console.error("forms.update_failed",error);return Response.json({error:"Unable to save form."},{status:500});}
}

export async function DELETE(request: Request) {
  try { await ensureCoreSchema(); if (!(await hasModuleAccess(request,"crm"))) return Response.json({error:"CRM access required."},{status:403}); const id=cleanText(new URL(request.url).searchParams.get("id"),80); if(!id)return Response.json({error:"Form id required."},{status:400});
    const subs=await coreDb().prepare("SELECT id FROM crm_form_submissions WHERE form_id=?").bind(id).all<{id:string}>();
    await coreDb().batch([...(subs.results||[]).map(s=>coreDb().prepare("DELETE FROM crm_form_files WHERE submission_id=?").bind(s.id)),coreDb().prepare("DELETE FROM crm_form_submissions WHERE form_id=?").bind(id),coreDb().prepare("DELETE FROM crm_forms WHERE id=?").bind(id)]); return Response.json({deleted:true});
  } catch(error){console.error("forms.delete_failed",error);return Response.json({error:"Unable to delete form."},{status:500});}
}
