import { cleanText, coreDb, ensureCoreSchema } from "@/lib/core/db";

type StageInput = { id?: string; name?: string; color?: string; position?: number; probability?: number; isWon?: boolean; isLost?: boolean; is_won?: number; is_lost?: number };

async function ensureDefaultPipeline() {
  const db = coreDb();
  let pipeline = await db.prepare("SELECT * FROM crm_pipelines WHERE active = 1 ORDER BY is_default DESC, created_at LIMIT 1").first<Record<string, unknown>>();
  if (pipeline) return pipeline;
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare("INSERT INTO crm_pipelines (id, name, description, is_default, active, created_at, updated_at) VALUES (?, 'Sales Pipeline', 'Primary revenue pipeline', 1, 1, ?, ?)")
    .bind(id, now, now).run();
  const defaults = [
    ["NEW LEAD", "#6B7280", 10, 0, 0], ["QUALIFIED", "#8B5CF6", 25, 0, 0], ["DISCOVERY", "#3B82F6", 40, 0, 0],
    ["PROPOSAL", "#F59E0B", 65, 0, 0], ["NEGOTIATION", "#EF4444", 85, 0, 0], ["CLOSED WON", "#10B981", 100, 1, 0], ["CLOSED LOST", "#374151", 0, 0, 1],
  ];
  await db.batch(defaults.map((stage, position) => db.prepare(`INSERT INTO crm_pipeline_stages
    (id, pipeline_id, name, color, position, probability, is_won, is_lost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), id, stage[0], stage[1], position, stage[2], stage[3], stage[4], now, now)));
  await db.prepare("UPDATE crm_opportunities SET pipeline_id = ? WHERE pipeline_id IS NULL").bind(id).run();
  pipeline = await db.prepare("SELECT * FROM crm_pipelines WHERE id = ?").bind(id).first<Record<string, unknown>>();
  return pipeline;
}

export async function GET() {
  try {
    await ensureCoreSchema(); await ensureDefaultPipeline();
    const db = coreDb();
    const { results: pipelines } = await db.prepare("SELECT * FROM crm_pipelines WHERE active = 1 ORDER BY is_default DESC, created_at").all<Record<string, unknown>>();
    const { results: stages } = await db.prepare("SELECT * FROM crm_pipeline_stages ORDER BY pipeline_id, position").all<Record<string, unknown>>();
    return Response.json({ pipelines: pipelines.map((pipeline) => ({ ...pipeline, stages: stages.filter((stage) => stage.pipeline_id === pipeline.id) })) });
  } catch (error) {
    console.error("crm.pipelines.list_failed", error);
    return Response.json({ error: "Unable to load pipeline settings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>; const name = cleanText(body.name, 120);
    if (!name) return Response.json({ error: "Pipeline name is required." }, { status: 400 });
    const id = crypto.randomUUID(); const now = new Date().toISOString(); const db = coreDb();
    await db.prepare("INSERT INTO crm_pipelines (id, name, description, is_default, active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)")
      .bind(id, name, cleanText(body.description, 500) || null, now, now).run();
    const stages = Array.isArray(body.stages) && body.stages.length ? body.stages as StageInput[] : [{ name: "NEW LEAD", color: "#6B7280", probability: 10 }, { name: "CLOSED WON", color: "#10B981", probability: 100, isWon: true }, { name: "CLOSED LOST", color: "#374151", probability: 0, isLost: true }];
    await db.batch(stages.map((stage, position) => db.prepare(`INSERT INTO crm_pipeline_stages
      (id, pipeline_id, name, color, position, probability, is_won, is_lost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), id, cleanText(stage.name, 80).toUpperCase(), cleanText(stage.color, 20) || "#B51F38", position,
        Math.min(100, Math.max(0, Number(stage.probability || 0))), stage.isWon ? 1 : 0, stage.isLost ? 1 : 0, now, now)));
    const pipeline = await db.prepare("SELECT * FROM crm_pipelines WHERE id = ?").bind(id).first<Record<string, unknown>>();
    const { results: savedStages } = await db.prepare("SELECT * FROM crm_pipeline_stages WHERE pipeline_id = ? ORDER BY position").bind(id).all<Record<string, unknown>>();
    return Response.json({ pipeline: { ...pipeline, stages: savedStages } }, { status: 201 });
  } catch (error) {
    console.error("crm.pipelines.create_failed", error);
    return Response.json({ error: "Unable to create pipeline." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const body = (await request.json()) as Record<string, unknown>; const id = cleanText(body.id, 80); const name = cleanText(body.name, 120);
    const stages = Array.isArray(body.stages) ? body.stages as StageInput[] : [];
    if (!id || !name || !stages.length) return Response.json({ error: "Pipeline name and at least one stage are required." }, { status: 400 });
    const db = coreDb(); const now = new Date().toISOString();
    const { results: existingStages } = await db.prepare("SELECT * FROM crm_pipeline_stages WHERE pipeline_id = ?").bind(id).all<Record<string, unknown>>();
    const incomingIds = new Set(stages.map((stage) => stage.id).filter(Boolean));
    const fallbackName = cleanText(stages[0].name, 80).toUpperCase();
    const statements = [db.prepare("UPDATE crm_pipelines SET name = ?, description = ?, updated_at = ? WHERE id = ?")
      .bind(name, cleanText(body.description, 500) || null, now, id)];
    for (const oldStage of existingStages) {
      const replacement = stages.find((stage) => stage.id === oldStage.id);
      if (replacement) {
        const newName = cleanText(replacement.name, 80).toUpperCase();
        if (newName !== oldStage.name) statements.push(db.prepare("UPDATE crm_opportunities SET stage = ? WHERE pipeline_id = ? AND stage = ?").bind(newName, id, oldStage.name));
      } else if (!incomingIds.has(String(oldStage.id))) {
        statements.push(db.prepare("UPDATE crm_opportunities SET stage = ? WHERE pipeline_id = ? AND stage = ?").bind(fallbackName, id, oldStage.name));
        statements.push(db.prepare("DELETE FROM crm_pipeline_stages WHERE id = ?").bind(oldStage.id));
      }
    }
    stages.forEach((stage, position) => {
      const stageName = cleanText(stage.name, 80).toUpperCase(); const color = cleanText(stage.color, 20) || "#B51F38";
      const probability = Math.min(100, Math.max(0, Number(stage.probability || 0)));
      if (stage.id && existingStages.some((existing) => existing.id === stage.id)) statements.push(db.prepare(`UPDATE crm_pipeline_stages
        SET name = ?, color = ?, position = ?, probability = ?, is_won = ?, is_lost = ?, updated_at = ? WHERE id = ?`)
        .bind(stageName, color, position, probability, stage.isWon || stage.is_won ? 1 : 0, stage.isLost || stage.is_lost ? 1 : 0, now, stage.id));
      else statements.push(db.prepare(`INSERT INTO crm_pipeline_stages
        (id, pipeline_id, name, color, position, probability, is_won, is_lost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), id, stageName, color, position, probability, stage.isWon || stage.is_won ? 1 : 0, stage.isLost || stage.is_lost ? 1 : 0, now, now));
    });
    await db.batch(statements);
    return Response.json({ saved: true });
  } catch (error) {
    console.error("crm.pipelines.update_failed", error);
    return Response.json({ error: "Unable to update pipeline settings." }, { status: 500 });
  }
}
