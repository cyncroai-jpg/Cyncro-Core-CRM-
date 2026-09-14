/**
 * Search & Indexing API
 *
 * GET /api/search — full-text search with filters and facets
 * POST /api/search/index — rebuild search index
 * GET /api/search/popular — get popular searches
 */

import {
  cleanText,
  ensureCoreSchema,
  getTenantContext,
} from "@/lib/core/db";
import {
  search,
  logSearchQuery,
  getPopularSearches,
  rebuildSearchIndex,
  SearchableResource,
} from "@/lib/core/search";
import { logAuditAction } from "@/lib/core/audit";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3]; // /api/search/[section]

    if (section === "popular") {
      // GET /api/search/popular - get popular searches
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
      const searches = await getPopularSearches(tenant.tenantId, limit);

      return Response.json({ searches });
    }

    // GET /api/search - full-text search
    const query = cleanText(url.searchParams.get("q") || "", 500);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 1000);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
    const sort = (url.searchParams.get("sort") as "relevance" | "recent" | "popular") || "relevance";

    // Parse resource types
    const resourceTypes = url.searchParams.get("types")?.split(",") as SearchableResource[] | undefined;

    // Parse filters from query string (e.g., ?stage=won&status=active)
    const filters: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (!["q", "limit", "offset", "sort", "types", "facets"].includes(key)) {
        filters[key] = value;
      }
    }

    // Parse facets (e.g., ?facets=stage,status)
    const facets = url.searchParams.get("facets")?.split(",") || [];

    const result = await search(tenant.tenantId, query, {
      resourceTypes,
      filters,
      sort,
      limit,
      offset,
      facets,
    });

    // Log search query for analytics
    if (query.trim()) {
      await logSearchQuery(tenant.tenantId, tenant.userId, query, result.total);
    }

    return Response.json({
      results: result.results,
      total: result.total,
      facets: result.facets,
      executionTime: result.executionTime,
      hasMore: result.results.length + offset < result.total,
    });
  } catch (error) {
    console.error("search.get.failed", error);
    return Response.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await getTenantContext(request);
    if (!tenant) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Only OWNER and ADMIN can rebuild index
    if (!["OWNER", "ADMIN"].includes(tenant.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const section = url.pathname.split("/")[3];

    if (section === "index") {
      // POST /api/search/index - rebuild search index
      const indexed = await rebuildSearchIndex(tenant.tenantId);

      await logAuditAction(
        tenant.tenantId,
        tenant.userId,
        tenant.email,
        "UPDATE",
        "search_index",
        "rebuild",
        {
          resourceName: "Search index rebuild",
          status: "SUCCESS",
          indexed,
        }
      );

      return Response.json({
        success: true,
        message: `Rebuilt search index with ${indexed} documents`,
        indexed,
      });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("search.post.failed", error);
    return Response.json(
      { error: "Unable to rebuild search index" },
      { status: 500 }
    );
  }
}
