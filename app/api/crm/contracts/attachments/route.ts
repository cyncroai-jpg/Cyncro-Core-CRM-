import { env } from "cloudflare:workers";
import {
  cleanText,
  coreDb,
  ensureCoreSchema,
} from "@/lib/core/db";
import { requireTenantAction } from "@/lib/core/tenantAuth";
export async function POST(request: Request) {
  await ensureCoreSchema();
  const tenant = await requireTenantAction(request, "edit");
  if (tenant instanceof Response) return tenant;
  const data = await request.formData(),
    file = data.get("file"),
    contractId = cleanText(data.get("contractId"), 80);
  if (!(file instanceof File) || !contractId)
    return Response.json(
      { error: "Contract and file are required." },
      { status: 400 },
    );
  const owned = await coreDb().prepare("SELECT id FROM crm_contracts WHERE id=? AND tenant_id=?").bind(contractId, tenant.tenantId).first();
  if (!owned) return Response.json({ error: "Contract not found." }, { status: 404 });
  if (file.size > 10_000_000)
    return Response.json(
      { error: "Attachments must be 10MB or smaller." },
      { status: 400 },
    );
  const bucket = (
    env as unknown as {
      BUCKET?: {
        put: (
          key: string,
          value: ArrayBuffer,
          options?: unknown,
        ) => Promise<unknown>;
      };
    }
  ).BUCKET;
  if (!bucket)
    return Response.json(
      { error: "Document storage connection is required." },
      { status: 503 },
    );
  const id = crypto.randomUUID(),
    objectKey = `contracts/${contractId}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  await bucket.put(objectKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  await coreDb()
    .prepare(
      "INSERT INTO crm_contract_attachments (id,contract_id,filename,content_type,object_key,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      contractId,
      file.name,
      file.type || "application/octet-stream",
      objectKey,
      file.size,
      tenant.email,
      new Date().toISOString(),
    )
    .run();
  return Response.json({ saved: true, id });
}
