import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant, requireTenantAction } from "@/lib/core/tenantAuth";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    const db=coreDb(); let rows=(await db.prepare("SELECT * FROM crm_social_flows WHERE tenant_id=? ORDER BY updated_at DESC").bind(tenant.tenantId).all()).results;
    if (!rows.length) {
      const now=new Date().toISOString(); const id=crypto.randomUUID();
      await db.prepare("INSERT INTO crm_social_flows (id,name,channel,trigger_word,reply_text,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,'DRAFT',?,?,?,?)")
        .bind(id,"New lead response","Instagram + Facebook","DEMO","Thanks for reaching out. What would you like help with?",tenant.email,tenant.tenantId,now,now).run();
      rows=(await db.prepare("SELECT * FROM crm_social_flows WHERE tenant_id=? ORDER BY updated_at DESC").bind(tenant.tenantId).all()).results;
    }
    return Response.json({flows:rows});
  } catch(error){console.error("social_flows.list_failed",error);return Response.json({error:"Unable to load social flows."},{status:500});}
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "create");
    if (tenant instanceof Response) return tenant;
    const body=await request.json() as Record<string,unknown>; const name=cleanText(body.name,160)||"Untitled automation"; const trigger=cleanText(body.trigger,60).toUpperCase()||"NEW"; const now=new Date().toISOString(); const id=crypto.randomUUID();
    await coreDb().prepare("INSERT INTO crm_social_flows (id,name,channel,trigger_word,reply_text,status,created_by,tenant_id,created_at,updated_at) VALUES (?,?,?,?,?,'DRAFT',?,?,?,?)")
      .bind(id,name,cleanText(body.channel,100)||"Instagram + Facebook",trigger,cleanText(body.reply,2000)||"Thanks for reaching out. How can we help?",tenant.email,tenant.tenantId,now,now).run();
    return Response.json({flow:await coreDb().prepare("SELECT * FROM crm_social_flows WHERE id=?").bind(id).first()},{status:201});
  } catch(error){console.error("social_flows.create_failed",error);return Response.json({error:"Unable to create social flow."},{status:500});}
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenantAction(request, "edit");
    if (tenant instanceof Response) return tenant;
    const body=await request.json() as Record<string,unknown>; const id=cleanText(body.id,80); if(!id)return Response.json({error:"Flow id is required."},{status:400});
    const owned = await coreDb().prepare("SELECT id FROM crm_social_flows WHERE id=? AND tenant_id=?").bind(id, tenant.tenantId).first();
    if (!owned) return Response.json({error:"Flow not found."},{status:404});
    const fields:string[]=[];const values:unknown[]=[];const add=(column:string,value:unknown)=>{fields.push(`${column}=?`);values.push(value)};
    if(body.name!==undefined)add("name",cleanText(body.name,160)); if(body.trigger!==undefined)add("trigger_word",cleanText(body.trigger,60).toUpperCase());
    if(body.reply!==undefined)add("reply_text",cleanText(body.reply,2000)); if(body.status!==undefined)add("status",cleanText(body.status,20).toUpperCase());
    if(Array.isArray(body.extraKeywords))add("extra_keywords",JSON.stringify(body.extraKeywords.map((x)=>cleanText(x,60).toUpperCase()).filter(Boolean)));
    add("updated_at",new Date().toISOString());values.push(id);await coreDb().prepare(`UPDATE crm_social_flows SET ${fields.join(",")} WHERE id=?`).bind(...values).run();
    return Response.json({flow:await coreDb().prepare("SELECT * FROM crm_social_flows WHERE id=?").bind(id).first()});
  }catch(error){console.error("social_flows.update_failed",error);return Response.json({error:"Unable to save social flow."},{status:500});}
}
