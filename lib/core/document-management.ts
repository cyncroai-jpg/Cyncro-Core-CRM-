/**
 * Document Management & File Storage (Phase 44)
 *
 * Manage files and documents:
 * - Document upload and storage
 * - Version control for documents
 * - File permissions and sharing
 * - Document templates
 * - Integration with deals and contacts
 * - File preview and metadata extraction
 * - Soft delete and archival
 * - Storage quota management
 */

import { coreDb } from "@/lib/core/db";
import crypto from "crypto";

export type FileType =
  | "DOCUMENT"
  | "IMAGE"
  | "VIDEO"
  | "SPREADSHEET"
  | "PRESENTATION"
  | "ARCHIVE"
  | "OTHER";

export type FileStatus = "ACTIVE" | "ARCHIVED" | "DELETED";

export type SharingPermission = "VIEW" | "EDIT" | "DOWNLOAD" | "SHARE";

export interface Document {
  id: string;
  tenantId: string;
  name: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileType: FileType;
  url?: string;
  storageProvider: "LOCAL" | "S3" | "AZURE";
  storagePath: string;
  description?: string;
  tags?: string[];
  entityType?: string; // "CONTACT", "DEAL", "ACCOUNT", etc.
  entityId?: string;
  uploadedBy: string;
  status: FileStatus;
  version: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  tenantId: string;
  documentId: string;
  version: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  uploadedBy: string;
  changeNotes?: string;
  createdAt: string;
}

export interface DocumentSharing {
  id: string;
  tenantId: string;
  documentId: string;
  sharedWith: string; // Email or user ID
  permission: SharingPermission;
  sharedBy: string;
  expiresAt?: string;
  createdAt: string;
}

export interface DocumentTemplate {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  category: string;
  fileType: FileType;
  storagePath: string;
  variables?: string[]; // Template variables like {{CLIENT_NAME}}
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageQuota {
  tenantId: string;
  totalAllowedMB: number;
  usedMB: number;
  remainingMB: number;
  fileCount: number;
  maxFileCount?: number;
  lastUpdated: string;
}

/**
 * Create a document record
 */
export async function createDocument(
  tenantId: string,
  name: string,
  fileName: string,
  mimeType: string,
  fileSize: number,
  fileType: FileType,
  storagePath: string,
  uploadedBy: string,
  entityType?: string,
  entityId?: string,
  description?: string,
  tags?: string[]
): Promise<Document> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const document: Document = {
    id,
    tenantId,
    name,
    fileName,
    mimeType,
    fileSize,
    fileType,
    storageProvider: "LOCAL",
    storagePath,
    description,
    tags,
    entityType,
    entityId,
    uploadedBy,
    status: "ACTIVE",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO documents
       (id, tenant_id, name, file_name, mime_type, file_size, file_type, storage_provider, storage_path,
        description, tags, entity_type, entity_id, uploaded_by, status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'LOCAL', ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      fileName,
      mimeType,
      fileSize,
      fileType,
      storagePath,
      description || null,
      tags ? JSON.stringify(tags) : null,
      entityType || null,
      entityId || null,
      uploadedBy,
      now,
      now
    )
    .run();

  return document;
}

/**
 * Get document by ID
 */
export async function getDocument(tenantId: string, documentId: string): Promise<Document | null> {
  const db = coreDb();

  const row = await db
    .prepare(`SELECT * FROM documents WHERE tenant_id = ? AND id = ? AND status != 'DELETED'`)
    .bind(tenantId, documentId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    fileType: String(row.file_type) as FileType,
    storageProvider: String(row.storage_provider) as "LOCAL" | "S3" | "AZURE",
    storagePath: String(row.storage_path),
    description: row.description ? String(row.description) : undefined,
    tags: row.tags ? JSON.parse(String(row.tags)) : undefined,
    entityType: row.entity_type ? String(row.entity_type) : undefined,
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    uploadedBy: String(row.uploaded_by),
    status: String(row.status) as FileStatus,
    version: Number(row.version),
    checksum: row.checksum ? String(row.checksum) : undefined,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * List documents for tenant or entity
 */
export async function listDocuments(
  tenantId: string,
  entityType?: string,
  entityId?: string
): Promise<Document[]> {
  const db = coreDb();

  let query = `SELECT * FROM documents WHERE tenant_id = ? AND status != 'DELETED'`;
  const params: unknown[] = [tenantId];

  if (entityType) {
    query += ` AND entity_type = ?`;
    params.push(entityType);
  }

  if (entityId) {
    query += ` AND entity_id = ?`;
    params.push(entityId);
  }

  query += ` ORDER BY created_at DESC`;

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    fileType: String(row.file_type) as FileType,
    storageProvider: String(row.storage_provider) as "LOCAL" | "S3" | "AZURE",
    storagePath: String(row.storage_path),
    description: row.description ? String(row.description) : undefined,
    tags: row.tags ? JSON.parse(String(row.tags)) : undefined,
    entityType: row.entity_type ? String(row.entity_type) : undefined,
    entityId: row.entity_id ? String(row.entity_id) : undefined,
    uploadedBy: String(row.uploaded_by),
    status: String(row.status) as FileStatus,
    version: Number(row.version),
    checksum: row.checksum ? String(row.checksum) : undefined,
    metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Create a new version of a document
 */
export async function createDocumentVersion(
  tenantId: string,
  documentId: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  storagePath: string,
  uploadedBy: string,
  changeNotes?: string
): Promise<DocumentVersion> {
  const db = coreDb();

  // Get current document to increment version
  const doc = await getDocument(tenantId, documentId);
  if (!doc) {
    throw new Error("Document not found");
  }

  const versionId = crypto.randomUUID();
  const newVersion = doc.version + 1;
  const now = new Date().toISOString();

  // Create version record
  const version: DocumentVersion = {
    id: versionId,
    tenantId,
    documentId,
    version: newVersion,
    fileName,
    fileSize,
    mimeType,
    storagePath,
    uploadedBy,
    changeNotes,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO document_versions
       (id, tenant_id, document_id, version, file_name, file_size, mime_type, storage_path, uploaded_by, change_notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      versionId,
      tenantId,
      documentId,
      newVersion,
      fileName,
      fileSize,
      mimeType,
      storagePath,
      uploadedBy,
      changeNotes || null,
      now
    )
    .run();

  // Update document version and timestamps
  await db
    .prepare(
      `UPDATE documents
       SET version = ?, file_name = ?, file_size = ?, mime_type = ?, storage_path = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`
    )
    .bind(newVersion, fileName, fileSize, mimeType, storagePath, now, documentId, tenantId)
    .run();

  return version;
}

/**
 * Share document with user
 */
export async function shareDocument(
  tenantId: string,
  documentId: string,
  sharedWith: string,
  permission: SharingPermission,
  sharedBy: string,
  expiresAt?: string
): Promise<DocumentSharing> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const sharing: DocumentSharing = {
    id,
    tenantId,
    documentId,
    sharedWith,
    permission,
    sharedBy,
    expiresAt,
    createdAt: now,
  };

  await db
    .prepare(
      `INSERT INTO document_sharing
       (id, tenant_id, document_id, shared_with, permission, shared_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, tenantId, documentId, sharedWith, permission, sharedBy, expiresAt || null, now)
    .run();

  return sharing;
}

/**
 * Get document sharing permissions
 */
export async function getDocumentSharingPerms(
  tenantId: string,
  documentId: string
): Promise<DocumentSharing[]> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT * FROM document_sharing
       WHERE tenant_id = ? AND document_id = ?
       ORDER BY created_at DESC`
    )
    .bind(tenantId, documentId)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    documentId: String(row.document_id),
    sharedWith: String(row.shared_with),
    permission: String(row.permission) as SharingPermission,
    sharedBy: String(row.shared_by),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    createdAt: String(row.created_at),
  }));
}

/**
 * Soft delete a document
 */
export async function deleteDocument(tenantId: string, documentId: string): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE documents SET status = 'DELETED', updated_at = ? WHERE tenant_id = ? AND id = ?`
    )
    .bind(now, tenantId, documentId)
    .run();
}

/**
 * Archive a document
 */
export async function archiveDocument(tenantId: string, documentId: string): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE documents SET status = 'ARCHIVED', updated_at = ? WHERE tenant_id = ? AND id = ?`
    )
    .bind(now, tenantId, documentId)
    .run();
}

/**
 * Create document template
 */
export async function createDocumentTemplate(
  tenantId: string,
  name: string,
  category: string,
  fileType: FileType,
  storagePath: string,
  createdBy: string,
  description?: string,
  variables?: string[]
): Promise<DocumentTemplate> {
  const db = coreDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const template: DocumentTemplate = {
    id,
    tenantId,
    name,
    description,
    category,
    fileType,
    storagePath,
    variables,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  await db
    .prepare(
      `INSERT INTO document_templates
       (id, tenant_id, name, description, category, file_type, storage_path, variables, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      name,
      description || null,
      category,
      fileType,
      storagePath,
      variables ? JSON.stringify(variables) : null,
      createdBy,
      now,
      now
    )
    .run();

  return template;
}

/**
 * Get document templates
 */
export async function getDocumentTemplates(
  tenantId: string,
  category?: string
): Promise<DocumentTemplate[]> {
  const db = coreDb();

  let query = `SELECT * FROM document_templates WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  query += ` ORDER BY name`;

  const { results } = await db
    .prepare(query)
    .bind(...params)
    .all<Record<string, unknown>>();

  return results.map((row) => ({
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    category: String(row.category),
    fileType: String(row.file_type) as FileType,
    storagePath: String(row.storage_path),
    variables: row.variables ? JSON.parse(String(row.variables)) : undefined,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

/**
 * Calculate storage quota usage
 */
export async function getStorageQuota(tenantId: string): Promise<StorageQuota> {
  const db = coreDb();

  // Get total file size and count
  const { results: stats } = await db
    .prepare(
      `SELECT
        COUNT(*) as fileCount,
        SUM(file_size) as totalSize
       FROM documents
       WHERE tenant_id = ? AND status != 'DELETED'`
    )
    .bind(tenantId)
    .all<{ fileCount: number; totalSize: number }>();

  const usedBytes = stats[0]?.totalSize || 0;
  const fileCount = stats[0]?.fileCount || 0;
  const usedMB = Math.round(usedBytes / 1024 / 1024);

  // Default quota: 10GB per tenant
  const totalAllowedMB = 10240;
  const remainingMB = Math.max(totalAllowedMB - usedMB, 0);

  return {
    tenantId,
    totalAllowedMB,
    usedMB,
    remainingMB,
    fileCount,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Check if upload would exceed quota
 */
export async function canUploadFile(
  tenantId: string,
  fileSizeMB: number
): Promise<{ allowed: boolean; reason?: string }> {
  const quota = await getStorageQuota(tenantId);

  if (fileSizeMB > quota.remainingMB) {
    return {
      allowed: false,
      reason: `File size (${fileSizeMB}MB) exceeds remaining quota (${quota.remainingMB}MB)`,
    };
  }

  // Max file size: 500MB per file
  if (fileSizeMB > 500) {
    return {
      allowed: false,
      reason: "File size exceeds maximum allowed (500MB)",
    };
  }

  return { allowed: true };
}
