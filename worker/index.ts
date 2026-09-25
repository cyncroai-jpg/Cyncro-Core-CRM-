/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { runReminders } from "../app/api/cron/reminders/route";
import { resumeGrowthAutomations } from "../lib/growth/automationEngine";
import { processDueEnrollments, runAutomationScans } from "../lib/automations/engine";
import { ensureCoreSchema } from "../lib/core/db";
import { isPlatformOwner } from "../lib/core/tenantAuth";

// Visitor-facing growth endpoints (pixel, links, form posts) stay public; everything else in the legacy suite is platform-owner only.
const GROWTH_PUBLIC = new Set(["/api/growth/track", "/api/growth/submit", "/api/growth/go", "/api/growth/experiments/track"]);

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  // Cloudflare Cron Trigger — fires every 30 minutes
  // Configure in Cloudflare dashboard: Workers → your-worker → Triggers → Cron Triggers
  // Cron expression: */30 * * * *
  async scheduled(_event: unknown, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runReminders().then((r) => console.info("scheduled.reminders.done", r)),
    );
    ctx.waitUntil(
      resumeGrowthAutomations().then((r) => console.info("scheduled.growth_automations.done", r)),
    );
    ctx.waitUntil(
      processDueEnrollments().then((r) => console.info("scheduled.automations.done", r)),
    );
    ctx.waitUntil(
      runAutomationScans().then((r) => console.info("scheduled.automation_scans.done", r)),
    );
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if ((url.pathname === "/growth" || url.pathname.startsWith("/growth/") || url.pathname.startsWith("/api/growth")) && !GROWTH_PUBLIC.has(url.pathname)) {
      await ensureCoreSchema();
      if (!(await isPlatformOwner(request))) {
        if (url.pathname.startsWith("/api/")) return Response.json({ error: "This area is limited to the platform owner." }, { status: 403 });
        return Response.redirect(new URL("/#crm/growth", request.url).toString(), 302);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
