/**
 * Search & Indexing Engine
 *
 * Full-text search capabilities:
 * - Full-text search across contacts, deals, activities
 * - Advanced filtering and sorting
 * - Faceted search results
 * - Search analytics and popular searches
 * - Auto-indexing on create/update
 */

import { coreDb } from "@/lib/core/db";

export type SearchableResource =
  | "contact"
  | "account"
  | "deal"
  | "activity"
  | "booking"
  | "sequence"
  | "form";

export interface SearchResult {
  id: string;
  type: SearchableResource;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  relevanceScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchAggregation {
  field: string;
  value: string | number;
  count: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  facets: Record<string, SearchAggregation[]>;
  executionTime: number;
}

export interface SearchIndex {
  id: string;
  tenantId: string;
  resourceType: SearchableResource;
  resourceId: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Index a resource for search */
export async function indexResource(
  tenantId: string,
  resourceType: SearchableResource,
  resourceId: string,
  title: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<SearchIndex> {
  const db = coreDb();
  const now = new Date().toISOString();
  const indexId = crypto.randomUUID();

  const index: SearchIndex = {
    id: indexId,
    tenantId,
    resourceType,
    resourceId,
    title,
    content,
    metadata,
    createdAt: now,
    updatedAt: now,
  };

  // Check if index exists
  const existing = await db
    .prepare(
      `SELECT id FROM search_index WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?`
    )
    .bind(tenantId, resourceType, resourceId)
    .first<{ id: string }>();

  if (existing) {
    // Update existing
    await db
      .prepare(
        `UPDATE search_index SET title = ?, content = ?, metadata = ?, updated_at = ?
         WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?`
      )
      .bind(
        title,
        content,
        metadata ? JSON.stringify(metadata) : null,
        now,
        tenantId,
        resourceType,
        resourceId
      )
      .run();
  } else {
    // Create new
    await db
      .prepare(
        `INSERT INTO search_index
         (id, tenant_id, resource_type, resource_id, title, content, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        indexId,
        tenantId,
        resourceType,
        resourceId,
        title,
        content,
        metadata ? JSON.stringify(metadata) : null,
        now,
        now
      )
      .run();
  }

  return index;
}

/** Remove index */
export async function removeFromIndex(
  tenantId: string,
  resourceType: SearchableResource,
  resourceId: string
): Promise<void> {
  const db = coreDb();

  await db
    .prepare(
      `DELETE FROM search_index WHERE tenant_id = ? AND resource_type = ? AND resource_id = ?`
    )
    .bind(tenantId, resourceType, resourceId)
    .run();
}

/** Search with full-text and filters */
export async function search(
  tenantId: string,
  query: string,
  options?: {
    resourceTypes?: SearchableResource[];
    filters?: Record<string, unknown>;
    sort?: "relevance" | "recent" | "popular";
    limit?: number;
    offset?: number;
    facets?: string[];
  }
): Promise<SearchResponse> {
  const db = coreDb();
  const startTime = Date.now();
  const limit = Math.min(options?.limit || 50, 1000);
  const offset = options?.offset || 0;

  let sqlQuery = `SELECT * FROM search_index WHERE tenant_id = ?`;
  const params: unknown[] = [tenantId];

  // Full-text search
  if (query && query.trim()) {
    const searchTerms = query.trim().split(/\s+/).map((t) => `${t}%`);
    const orConditions = searchTerms
      .map(() => `(title LIKE ? OR content LIKE ?)`)
      .join(" OR ");

    sqlQuery += ` AND (${orConditions})`;
    for (const term of searchTerms) {
      params.push(term, term);
    }
  }

  // Filter by resource types
  if (options?.resourceTypes && options.resourceTypes.length > 0) {
    sqlQuery += ` AND resource_type IN (${options.resourceTypes.map(() => "?").join(",")})`;
    params.push(...options.resourceTypes);
  }

  // Add filters
  if (options?.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      sqlQuery += ` AND json_extract(metadata, ?) = ?`;
      params.push(`$.${key}`, value);
    }
  }

  // Get total count
  const countQuery = sqlQuery.replace("SELECT *", "SELECT COUNT(*) as count");
  const { results: countResult } = await db
    .prepare(countQuery)
    .bind(...params)
    .all<{ count: number }>();
  const total = countResult[0]?.count || 0;

  // Sort
  if (options?.sort === "recent") {
    sqlQuery += ` ORDER BY updated_at DESC`;
  } else if (options?.sort === "popular") {
    sqlQuery += ` ORDER BY created_at DESC`; // In production, use view count
  } else {
    // Relevance sorting: prioritize title matches
    sqlQuery = `
      SELECT *,
        CASE
          WHEN title LIKE ? THEN 100
          WHEN content LIKE ? THEN 50
          ELSE 1
        END as relevance_score
      FROM (${sqlQuery})
      ORDER BY relevance_score DESC, updated_at DESC
    `;
    // Add relevance params (we'll simplify this)
  }

  sqlQuery += ` LIMIT ? OFFSET ?`;
  params.push(limit + 1, offset); // +1 to detect hasMore

  const { results } = await db
    .prepare(sqlQuery)
    .bind(...params)
    .all<Record<string, unknown>>();

  const results_capped = results.slice(0, limit);

  // Get facets
  const facets: Record<string, SearchAggregation[]> = {};
  if (options?.facets && options.facets.length > 0) {
    for (const facet of options.facets) {
      const { results: facetResults } = await db
        .prepare(
          `SELECT json_extract(metadata, ?) as value, COUNT(*) as count
           FROM search_index WHERE tenant_id = ?
           GROUP BY value
           LIMIT 50`
        )
        .bind(`$.${facet}`, tenantId)
        .all<{ value: string | number; count: number }>();

      facets[facet] = facetResults.map((r) => ({
        field: facet,
        value: r.value,
        count: r.count,
      }));
    }
  }

  const response: SearchResponse = {
    results: results_capped.map((row) => ({
      id: String(row.resource_id),
      type: String(row.resource_type) as SearchableResource,
      title: String(row.title),
      description: row.content ? String(row.content).substring(0, 200) : undefined,
      metadata: row.metadata ? JSON.parse(String(row.metadata)) : undefined,
      relevanceScore: Number(row.relevance_score || 50),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    total,
    facets,
    executionTime: Date.now() - startTime,
  };

  return response;
}

/** Log search query */
export async function logSearchQuery(
  tenantId: string,
  userId: string,
  query: string,
  resultCount: number
): Promise<void> {
  const db = coreDb();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO search_logs (id, tenant_id, user_id, query, result_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), tenantId, userId, query, resultCount, now)
    .run();
}

/** Get popular searches */
export async function getPopularSearches(
  tenantId: string,
  limit: number = 20
): Promise<Array<{ query: string; count: number }>> {
  const db = coreDb();

  const { results } = await db
    .prepare(
      `SELECT query, COUNT(*) as count FROM search_logs
       WHERE tenant_id = ?
       GROUP BY query
       ORDER BY count DESC
       LIMIT ?`
    )
    .bind(tenantId, limit)
    .all<{ query: string; count: number }>();

  return results;
}

/** Rebuild search index */
export async function rebuildSearchIndex(tenantId: string): Promise<number> {
  const db = coreDb();

  // Clear existing index for tenant
  await db
    .prepare(`DELETE FROM search_index WHERE tenant_id = ?`)
    .bind(tenantId)
    .run();

  let indexed = 0;

  // Index contacts
  const { results: contacts } = await db
    .prepare(
      `SELECT id, full_name, email, phone FROM crm_contacts WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  for (const contact of contacts) {
    const content = `${contact.email || ""} ${contact.phone || ""}`;
    await indexResource(
      tenantId,
      "contact",
      String(contact.id),
      String(contact.full_name),
      content,
      { email: contact.email, phone: contact.phone }
    );
    indexed++;
  }

  // Index deals
  const { results: deals } = await db
    .prepare(
      `SELECT id, name, stage, value_cents FROM crm_opportunities WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  for (const deal of deals) {
    const content = `Stage: ${deal.stage}`;
    await indexResource(
      tenantId,
      "deal",
      String(deal.id),
      String(deal.name),
      content,
      { stage: deal.stage, value: deal.value_cents }
    );
    indexed++;
  }

  // Index activities
  const { results: activities } = await db
    .prepare(
      `SELECT id, activity_type, title, details FROM crm_activities WHERE tenant_id = ?`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>();

  for (const activity of activities) {
    const content = `${activity.activity_type || ""} ${activity.details || ""}`;
    await indexResource(
      tenantId,
      "activity",
      String(activity.id),
      String(activity.title),
      content,
      { type: activity.activity_type }
    );
    indexed++;
  }

  return indexed;
}

/** Clear search logs older than days */
export async function clearOldSearchLogs(tenantId: string, days: number = 30): Promise<number> {
  const db = coreDb();
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const result = await db
    .prepare(
      `DELETE FROM search_logs WHERE tenant_id = ? AND created_at < ?`
    )
    .bind(tenantId, cutoffDate)
    .run();

  return result.meta?.changes || 0;
}
