// End-to-end team flow against the local dev server.
const BASE = "http://127.0.0.1:5177";
const stamp = Date.now();
let failures = 0;
const check = (ok, label, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${extra ? " · " + extra : ""}`); if (!ok) failures++; };

async function api(path, init = {}, cookie = "") {
  const res = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(init.headers || {}) }, redirect: "manual" });
  let body = null; try { body = await res.json(); } catch { body = null; }
  const sc = res.headers.get("set-cookie") || "";
  return { res, body, cookie: sc.startsWith("cyncro_session=") ? sc.split(";")[0] : "" };
}

// 1) Owner signs up a company
const owner = await api("/api/tenants/signup", { method: "POST", body: JSON.stringify({ tenantName: `Team Co ${stamp}`, displayName: "Owner One", email: `owner+${stamp}@example.com`, password: "OwnerPass123!" }) });
check(owner.res.status === 201 && owner.cookie, "owner signup", String(owner.res.status));
const oc = owner.cookie;

// 2) Owner creates a contact and a prospect
const contact = await api("/api/crm/contacts", { method: "POST", body: JSON.stringify({ fullName: "Shared Contact", email: `shared+${stamp}@example.com`, phone: "(305) 555-0100" }) }, oc);
check(contact.res.status < 300, "owner creates contact", String(contact.res.status) + " " + JSON.stringify(contact.body).slice(0, 100));
const prospect = await api("/api/prospecting/prospects", { method: "POST", body: JSON.stringify({ businessName: "Shared Prospect LLC", category: "Med spa", address: "1 Main St, Miami, FL", phone: "(305) 555-0101", lat: 25.76, lng: -80.19 }) }, oc);
check(prospect.res.status < 300, "owner creates prospect", String(prospect.res.status));

// 3) Owner opens Team access (this is what the Team screen loads) and adds a teammate with limited perms
const access = await api("/api/access", {}, oc);
check(access.res.status === 200 && access.body?.member?.manage_users, "owner can manage team", String(access.res.status) + " " + JSON.stringify(access.body?.member || access.body).slice(0, 120));
const mateEmail = `mate+${stamp}@example.com`;
const add = await api("/api/access", { method: "POST", body: JSON.stringify({ email: mateEmail, displayName: "Mate Two", role: "MEMBER", crmAccess: true, calendarAccess: true, prospectingAccess: true, canCreate: true, canEdit: true, canDelete: false, canExport: false }) }, oc);
check(add.res.status === 200, "owner saves teammate access", String(add.res.status));
const inv = await api("/api/auth/invite", { method: "POST", body: JSON.stringify({ email: mateEmail, displayName: "Mate Two" }) }, oc);
check(inv.res.status === 200 && inv.body?.inviteUrl, "owner gets invite link", `emailSent=${inv.body?.emailSent}`);
const token = new URL(inv.body.inviteUrl).searchParams.get("invite");

// 4) Teammate validates + accepts the invite
const validate = await api(`/api/auth/invite?token=${token}`);
check(validate.res.status === 200 && validate.body?.email === mateEmail, "invite token validates");
const accept = await api("/api/auth/invite", { method: "PATCH", body: JSON.stringify({ token, password: "MatePass123!" }) });
check(accept.res.status === 200 && accept.cookie, "teammate accepts invite", String(accept.res.status));
const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: mateEmail, password: "MatePass123!" }) });
check(login.res.status === 200 && login.cookie, "teammate can log in");
const mc = login.cookie;

// 5) Teammate sees the OWNER's data (same company), not an empty workspace
const mateContacts = await api("/api/crm/contacts", {}, mc);
const list = mateContacts.body?.contacts || mateContacts.body?.items || mateContacts.body?.results || [];
check(Array.isArray(list) && list.some((c) => String(c.email || "").includes(`shared+${stamp}`)), "teammate sees owner's contact", `count=${list.length} status=${mateContacts.res.status}`);
const mateProspects = await api("/api/prospecting/prospects", {}, mc);
const plist = mateProspects.body?.prospects || [];
check(plist.some((p) => p.businessName === "Shared Prospect LLC" || p.business_name === "Shared Prospect LLC"), "teammate sees owner's prospect", `count=${plist.length} status=${mateProspects.res.status}`);
const mateTenants = await api("/api/tenants", {}, mc);
check((mateTenants.body?.tenants || []).length === 1 && mateTenants.body.tenants[0].name === `Team Co ${stamp}`, "teammate belongs to exactly the owner's company", JSON.stringify(mateTenants.body?.tenants?.map((t) => [t.name, t.role])));

// 6) Teammate can create but cannot delete (no delete permission)
const mateCreate = await api("/api/crm/contacts", { method: "POST", body: JSON.stringify({ fullName: "Mate Made", email: `matemade+${stamp}@example.com` }) }, mc);
check(mateCreate.res.status < 300, "teammate can create a contact", String(mateCreate.res.status));
const targetId = list[0]?.id;
const mateDelete = await api(`/api/crm/contacts?id=${encodeURIComponent(targetId)}`, { method: "DELETE" }, mc);
check(mateDelete.res.status === 403, "teammate cannot delete (403)", String(mateDelete.res.status));

// 7) Owner's team list shows only this company's people, with the teammate active
const teamList = await api("/api/access", {}, oc);
const emails = (teamList.body?.members || []).map((m) => m.email);
check(emails.includes(mateEmail) && emails.every((e) => e.includes(`${stamp}`)), "team list is scoped to this company", JSON.stringify(emails));

// 8) Calendar: owner creates event type, teammate can see it
const et = await api("/api/calendar/event-types", { method: "POST", body: JSON.stringify({ name: "Team Consult", slug: "team-consult", durationMinutes: 30, duration: 30, duration_minutes: 30 }) }, oc);
check(et.res.status < 300, "owner creates calendar event type", String(et.res.status) + " " + JSON.stringify(et.body).slice(0, 80));
const mateEt = await api("/api/calendar/event-types", {}, mc);
const ets = mateEt.body?.eventTypes || mateEt.body?.items || [];
check(ets.some((e) => e.name === "Team Consult"), "teammate sees the shared calendar event type", `count=${ets.length} status=${mateEt.res.status}`);

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASS");
process.exit(failures ? 1 : 0);
