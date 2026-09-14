/**
 * Document Management API
 *
 * GET /api/documents — list documents
 * POST /api/documents — upload document
 * GET /api/documents/:id — get document details
 * DELETE /api/documents/:id — soft delete document
 * POST /api/documents/:id/versions — create new version
 * POST /api/documents/:id/share — share document
 * GET /api/documents/quota — get storage quota
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  createDocument,
  getDocument,
  listDocuments,
  createDocumentVersion,
  shareDocument,
  deleteDocument,
  archiveDocument,
  getDocumentSharingPerms,
  getStorageQuota,
  canUploadFile,
  getDocumentTemplates,
  type FileType,
  type SharingPermission,
} from "@/lib/core/document-management";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const documentId = pathParts[3];
    const section = pathParts[4];

    if (documentId === "quota") {
      // GET /api/documents/quota - get storage quota
      const quota = await getStorageQuota(tenant.tenantId);
      return Response.json({ quota });
    }

    if (documentId === "templates") {
      // GET /api/documents/templates - list document templates
      const category = url.searchParams.get("category") || undefined;
      const templates = await getDocumentTemplates(tenant.tenantId, category);
      return Response.json({ templates });
    }

    if (documentId && section === "share") {
      // GET /api/documents/:id/share - get sharing permissions
      const sharing = await getDocumentSharingPerms(tenant.tenantId, documentId);
      return Response.json({ sharing });
    }

    if (documentId && !section) {
      // GET /api/documents/:id - get document details
      const doc = await getDocument(tenant.tenantId, documentId);
      if (!doc) {
        return Response.json({ error: "Document not found" }, { status: 404 });
      }
      return Response.json({ document: doc });
    }

    // GET /api/documents - list documents
    const entityType = url.searchParams.get("entityType") || undefined;
    const entityId = url.searchParams.get("entityId") || undefined;
    const documents = await listDocuments(tenant.tenantId, entityType || undefined, entityId || undefined);

    return Response.json({ documents, total: documents.length });
  } catch (error) {
    console.error("documents.get.failed", error);
    return Response.json(
      { error: "Unable to fetch documents" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const documentId = pathParts[3];
    const action = pathParts[4];

    // Handle multipart form data for file uploads
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;

      if (action === "share" && documentId) {
        // POST /api/documents/:id/share - share document
        const sharedWith = cleanText(String(body.sharedWith || ""), 100);
        const permission = String(body.permission || "VIEW") as SharingPermission;
        const expiresAt = body.expiresAt ? String(body.expiresAt) : undefined;

        if (!sharedWith) {
          return Response.json(
            { error: "sharedWith is required" },
            { status: 400 }
          );
        }

        const sharing = await shareDocument(
          tenant.tenantId,
          documentId,
          sharedWith,
          permission,
          tenant.email,
          expiresAt
        );

        await logAuditAction(
          tenant.tenantId,
          tenant.userId,
          tenant.email,
          "SHARE",
          "document",
          documentId,
          {
            resourceName: `Document Shared: ${sharedWith}`,
            status: "SUCCESS",
            permission,
          }
        );

        return Response.json({ sharing }, { status: 201 });
      }

      if (documentId === "versions" || action === "versions") {
        // POST /api/documents/:id/versions - create new version
        const docId = documentId === "versions" ? pathParts[3] : documentId;
        const fileName = cleanText(String(body.fileName || ""), 200);
        const fileSize = Number(body.fileSize || 0);
        const mimeType = cleanText(String(body.mimeType || ""), 100);
        const storagePath = cleanText(String(body.storagePath || ""), 500);
        const changeNotes = body.changeNotes ? cleanText(String(body.changeNotes), 500) : undefined;

        if (!fileName || !storagePath) {
          return Response.json(
            { error: "fileName and storagePath are required" },
            { status: 400 }
          );
        }

        // Check quota
        const canUpload = await canUploadFile(tenant.tenantId, Math.ceil(fileSize / 1024 / 1024));
        if (!canUpload.allowed) {
          return Response.json(
            { error: canUpload.reason || "Cannot upload file" },
            { status: 413 }
          );
        }

        const version = await createDocumentVersion(
          tenant.tenantId,
          docId,
          fileName,
          fileSize,
          mimeType,
          storagePath,
          tenant.email,
          changeNotes
        );

        await logAuditAction(
          tenant.tenantId,
          tenant.userId,
          tenant.email,
          "CREATE",
          "document_version",
          version.id,
          {
            resourceName: `Version ${version.version}`,
            status: "SUCCESS",
            documentId: docId,
          }
        );

        return Response.json({ version }, { status: 201 });
      }

      // POST /api/documents - create document (metadata only)
      const name = cleanText(String(body.name || ""), 200);
      const fileName = cleanText(String(body.fileName || ""), 200);
      const mimeType = cleanText(String(body.mimeType || ""), 100);
      const fileSize = Number(body.fileSize || 0);
      const fileType = (String(body.fileType || "DOCUMENT") as FileType) || "DOCUMENT";
      const storagePath = cleanText(String(body.storagePath || ""), 500);
      const description = body.description ? cleanText(String(body.description), 500) : undefined;
      const tags = Array.isArray(body.tags)
        ? body.tags.map((t) => cleanText(String(t), 50))
        : undefined;
      const entityType = body.entityType ? cleanText(String(body.entityType), 50) : undefined;
      const entityId = body.entityId ? cleanText(String(body.entityId), 50) : undefined;

      if (!name || !fileName || !storagePath) {
        return Response.json(
          { error: "name, fileName, and storagePath are required" },
          { status: 400 }
        );
      }

      // Check quota
      const canUpload = await canUploadFile(tenant.tenantId, Math.ceil(fileSize / 1024 / 1024));
      if (!canUpload.allowed) {
        return Response.json(
          { error: canUpload.reason || "Cannot upload file" },
          { status: 413 }
        );
      }

      const document = await createDocument(
        tenant.tenantId,
        name,
        fileName,
        mimeType,
        fileSize,
        fileType,
        storagePath,
        tenant.email,
        entityType,
        entityId,
        description,
        tags
      );

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "CREATE",
        "document",
        document.id,
        {
          resourceName: `Document: ${name}`,
          status: "SUCCESS",
          fileSize,
          fileType,
        }
      );

      return Response.json({ document }, { status: 201 });
    }

    return Response.json({ error: "Invalid content type" }, { status: 400 });
  } catch (error) {
    console.error("documents.post.failed", error);
    return Response.json(
      { error: "Unable to create document" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const documentId = url.pathname.split("/")[3];
    const action = url.searchParams.get("action");

    if (!documentId) {
      return Response.json({ error: "documentId is required" }, { status: 400 });
    }

    const doc = await getDocument(tenant.tenantId, documentId);
    if (!doc) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    if (action === "archive") {
      // Archive document
      await archiveDocument(tenant.tenantId, documentId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "ARCHIVE",
        "document",
        documentId,
        {
          resourceName: `Document: ${doc.name}`,
          status: "SUCCESS",
        }
      );

      return Response.json({ archived: true });
    }

    // Soft delete
    await deleteDocument(tenant.tenantId, documentId);

    await logAuditAction(
      tenant.tenantId,
      tenant.userId,
      tenant.email,
      "DELETE",
      "document",
      documentId,
      {
        resourceName: `Document: ${doc.name}`,
        status: "SUCCESS",
      }
    );

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("documents.delete.failed", error);
    return Response.json(
      { error: "Unable to delete document" },
      { status: 500 }
    );
  }
}
