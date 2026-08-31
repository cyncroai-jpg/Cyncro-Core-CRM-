import { cleanText, coreDb, ensureCoreSchema, hasModuleAccess, requestUser } from "@/lib/core/db";

const statuses = new Set(["BACKLOG","TODO","IN_PROGRESS","WAITING","DONE"]), priorities = new Set(["LOW","MEDIUM","HIGH","URGENT"]);
export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const result = await coreDb().prepare(`SELECT t.*,c.full_name contact_name,a.name account_name,o.name opportunity_name,
      (SELECT COUNT(*) FROM work_subtasks s WHERE s.task_id=t.id) subtask_count,
      (SELECT COUNT(*) FROM work_subtasks s WHERE s.task_id=t.id AND s.completed=1) completed_subtasks
      FROM work_tasks t LEFT JOIN crm_contacts c ON c.id=t.contact_id LEFT JOIN crm_accounts a ON a.id=t.account_id
      LEFT JOIN crm_opportunities o ON o.id=t.opportunity_id ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,t.due_at,t.created_at DESC`).all();
    return Response.json({ tasks: result.results });
  } catch (error) { console.error("tasks.list_failed", error); return Response.json({ error: "Unable to load tasks." }, { status: 500 }); }
}
export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, title = cleanText(body.title, 200), now = new Date().toISOString();
    if (!title) return Response.json({ error: "Task title is required." }, { status: 400 });
    const status = cleanText(body.status, 30).toUpperCase(), priority = cleanText(body.priority, 20).toUpperCase();
    const id = crypto.randomUUID();
    await coreDb().prepare(`INSERT INTO work_tasks (id,title,details,status,priority,assignee,reporter,contact_id,opportunity_id,account_id,due_at,start_at,estimated_minutes,recurrence,dependency_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,title,cleanText(body.details,4000)||null,statuses.has(status)?status:"TODO",priorities.has(priority)?priority:"MEDIUM",
      cleanText(body.assignee,160)||null,requestUser(request),cleanText(body.contactId,80)||null,cleanText(body.opportunityId,80)||null,cleanText(body.accountId,80)||null,
      cleanText(body.dueAt,40)||null,cleanText(body.startAt,40)||null,Math.max(0,Number(body.estimatedMinutes||30)),cleanText(body.recurrence,80)||null,cleanText(body.dependencyId,80)||null,now,now).run();
    return Response.json({ id }, { status: 201 });
  } catch (error) { console.error("tasks.create_failed", error); return Response.json({ error: "Unable to create task." }, { status: 500 }); }
}
export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    if (!(await hasModuleAccess(request, "crm"))) return Response.json({ error: "CRM access required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>, id=cleanText(body.id,80), action=cleanText(body.action,30).toUpperCase(), now=new Date().toISOString(), db=coreDb();
    if (!id) return Response.json({error:"Task id is required."},{status:400});
    if(action==="SUBTASK") { const title=cleanText(body.title,200); if(!title) return Response.json({error:"Subtask title required."},{status:400}); await db.prepare("INSERT INTO work_subtasks (id,task_id,title,created_at,updated_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,title,now,now).run(); return Response.json({saved:true}); }
    if(action==="COMMENT") { const text=cleanText(body.body,2000); if(!text) return Response.json({error:"Comment required."},{status:400}); await db.prepare("INSERT INTO work_comments (id,task_id,author,body,created_at) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(),id,requestUser(request),text,now).run(); return Response.json({saved:true}); }
    const fields:string[]=[], values:unknown[]=[]; const add=(key:string,value:unknown)=>{fields.push(`${key}=?`);values.push(value)};
    if(body.title!==undefined)add("title",cleanText(body.title,200)); if(body.details!==undefined)add("details",cleanText(body.details,4000)||null);
    if(body.status!==undefined){const s=cleanText(body.status,30).toUpperCase();if(statuses.has(s)){add("status",s);add("completed_at",s==="DONE"?now:null)}}
    if(body.priority!==undefined){const p=cleanText(body.priority,20).toUpperCase();if(priorities.has(p))add("priority",p)}
    if(body.assignee!==undefined)add("assignee",cleanText(body.assignee,160)||null); if(body.dueAt!==undefined)add("due_at",cleanText(body.dueAt,40)||null);
    add("updated_at",now); values.push(id); await db.prepare(`UPDATE work_tasks SET ${fields.join(",")} WHERE id=?`).bind(...values).run(); return Response.json({saved:true});
  } catch(error){console.error("tasks.update_failed",error);return Response.json({error:"Unable to update task."},{status:500})}
}
export async function DELETE(request: Request) {
  try { await ensureCoreSchema(); if (!(await hasModuleAccess(request,"crm"))) return Response.json({error:"CRM access required."},{status:403}); const id=cleanText(new URL(request.url).searchParams.get("id"),80); if(!id)return Response.json({error:"Task id required."},{status:400}); const db=coreDb(); await db.batch([db.prepare("DELETE FROM work_comments WHERE task_id=?").bind(id),db.prepare("DELETE FROM work_subtasks WHERE task_id=?").bind(id),db.prepare("DELETE FROM work_tasks WHERE id=?").bind(id)]); return Response.json({deleted:true}); }
  catch(error){console.error("tasks.delete_failed",error);return Response.json({error:"Unable to delete task."},{status:500})}
}
