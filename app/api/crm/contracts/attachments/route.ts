import { env } from "cloudflare:workers";
import {
  cleanText,
  coreDb,
  ensureCoreSchema,
  hasModuleAccess,
  requestUser,
} from "@/lib/core/db";
export async function POST(request: Request) {
  await ensureCoreSchema();
  if (!(await hasModuleAccess(request, "crm")))
    return Response.json({ error: "CRM access required." }, { status: 403 });
  const data = await request.formData(),
    file = data.get("file"),
    contractId = cleanText(data.get("contractId"), 80);
  if (!(file instanceof File) || !contractId)
    return Response.json(
      { error: "Contract and file are required." },
      { status: 400 },
    );
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
      requestUser(request),
      new Date().toISOString(),
    )
    .run();
  return Response.json({ saved: true, id });
}
