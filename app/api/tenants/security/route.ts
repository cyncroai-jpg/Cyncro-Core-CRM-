/** Company security overview for owners/admins: who has two-factor, the require-2FA switch, recent sign-in locks. */
import { coreDb, ensureCoreSchema } from "@/lib/core/db";
import { requireTenant } from "@/lib/core/tenantAuth";
import { companySettings, parseSettings } from "@/lib/core/companySettings";

export async function GET(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER" && tenant.role !== "ADMIN") return Response.json({ error: "Owners and admins only." }, { status: 403 });
    const db = coreDb();
    const { results: members } = await db.prepare("SELECT tm.email, tm.display_name, tm.role, COALESCE(t.enabled,0) AS two_factor, (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id=tm.user_id AND s.expires_at>?) AS sessions, (SELECT MAX(COALESCE(s.last_seen_at, s.created_at)) FROM auth_sessions s WHERE s.user_id=tm.user_id) AS last_active FROM tenant_members tm LEFT JOIN auth_totp t ON t.user_id=tm.user_id WHERE tm.tenant_id=? AND tm.active=1 ORDER BY tm.role, tm.display_name").bind(new Date().toISOString(), tenant.tenantId).all();
    const { results: locks } = await db.prepare("SELECT key, failures, locked_until, updated_at FROM auth_attempts WHERE locked_until>? AND key IN (" + (members.length ? members.map(() => "?").join(",") : "''") + ")").bind(new Date().toISOString(), ...members.map((m) => `login:${String((m as { email: string }).email).toLowerCase()}`)).all();
    const settings = await companySettings(tenant.tenantId);
    return Response.json({ members, locks, require2fa: settings.require2fa, protections: { lockout: "5 failed sign-ins lock the account for 15 minutes", rateLimits: "sign-in, reset, signup and public forms are throttled per address", headers: "nosniff, HSTS, frame protection, referrer policy", passwords: "PBKDF2-SHA256, 100,000 rounds, salted", sessions: "server-side, HttpOnly, 30-day expiry, revocable" } });
  } catch (error) { console.error("tenant.security.get_failed", error); return Response.json({ error: "Unable to load security." }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    await ensureCoreSchema();
    const tenant = await requireTenant(request);
    if (tenant instanceof Response) return tenant;
    if (tenant.role !== "OWNER") return Response.json({ error: "Only an owner can change this." }, { status: 403 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const current = await companySettings(tenant.tenantId);
    const next = parseSettings({ ...current, require2fa: Boolean(body.require2fa) });
    await coreDb().prepare("UPDATE tenants SET settings_json=?, updated_at=? WHERE id=?").bind(JSON.stringify(next), new Date().toISOString(), tenant.tenantId).run();
    return Response.json({ require2fa: next.require2fa });
  } catch (error) { console.error("tenant.security.patch_failed", error); return Response.json({ error: "Unable to save." }, { status: 500 }); }
}
