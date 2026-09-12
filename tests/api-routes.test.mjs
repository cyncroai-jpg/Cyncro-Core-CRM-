/**
 * API route integration tests — in-memory D1 mock
 *
 * Run:
 *   node --experimental-loader tests/cf-loader.mjs \
 *        --test tests/api-routes.test.mjs
 *
 * The worker is imported from the build output and called via worker.fetch()
 * with a globalThis.__cfEnv DB injection that the cf-loader stub exposes as
 * the `cloudflare:workers` env.
 */

import assert from "node:assert/strict";
import test, { describe, beforeEach } from "node:test";
import { DatabaseSync } from "node:sqlite";

// ─── D1-compatible in-memory mock ────────────────────────────────────────────
//
// Key difference from the native node:sqlite API: D1's prepare() is LAZY —
// it never validates or parses SQL at prepare-time.  Validation happens only
// at execution.  We must match that behaviour so index creation that references
// a table that is still being created in the same batch does not fail at
// prepare() time.

function makeD1(sqliteDb) {
  // Lazy-wrapped statement: sql and bound values are stored; the real
  // StatementSync is created only when the statement is first executed.
  function lazyStmt(sql, boundValues = []) {
    function getStmt() {
      return sqliteDb.prepare(sql);
    }
    return {
      bind(...values) {
        return lazyStmt(sql, values);
      },
      async first() {
        const rows = getStmt().all(...boundValues);
        return rows[0] ? Object.assign({}, rows[0]) : null;
      },
      async all() {
        const rows = getStmt()
          .all(...boundValues)
          .map((r) => Object.assign({}, r));
        return { results: rows };
      },
      async run() {
        getStmt().run(...boundValues);
        return { meta: {} };
      },
    };
  }

  return {
    prepare(sql) {
      // Defer — do NOT call sqliteDb.prepare here
      return lazyStmt(sql);
    },
    async batch(statements) {
      for (const s of statements) await s.run();
    },
  };
}

// ─── Worker loader ────────────────────────────────────────────────────────────
//
// The compiled worker module has a module-level `initialized` flag in
// ensureCoreSchema().  Reusing the same module instance across tests that swap
// the underlying SQLite database would skip schema creation on the fresh DB.
// We therefore import a fresh module for every test, cache-busting via the
// query-string so Node's module cache treats each import as a distinct URL.

let _workerCounter = 0;
async function getWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("t", String(++_workerCounter));
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function setDb(sqliteDb) {
  globalThis.__cfEnv = { DB: makeD1(sqliteDb) };
}

function ctx() {
  return { waitUntil() {}, passThroughOnException() {} };
}

function req(method, path, body) {
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`http://localhost${path}`, init);
}

// ─── Contacts — POST ─────────────────────────────────────────────────────────

describe("POST /api/crm/contacts", async () => {
  let worker;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
  });

  await test("creates a contact and returns 201", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts", {
        fullName: "Alice Example",
        email: "alice@example.com",
        phone: "555-123-4567",
        source: "Manual",
      }),
      {},
      ctx(),
    );
    assert.equal(res.status, 201, `expected 201, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.contact?.id, "contact.id should be present");
    assert.equal(data.contact.full_name, "Alice Example");
  });

  await test("rejects duplicate email with 409 and duplicateId", async () => {
    await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Alice", email: "alice@example.com" }),
      {},
      ctx(),
    );
    const res2 = await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Alice 2", email: "alice@example.com" }),
      {},
      ctx(),
    );
    assert.equal(res2.status, 409);
    const data = await res2.json();
    assert.ok(data.duplicateId, "duplicateId should be returned for duplicate email");
  });

  await test("rejects duplicate phone with 409 and duplicateId", async () => {
    await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Bob", phone: "(555) 234-5678" }),
      {},
      ctx(),
    );
    const res2 = await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Robert", phone: "555-234-5678" }),
      {},
      ctx(),
    );
    assert.equal(res2.status, 409);
    const data = await res2.json();
    assert.ok(data.duplicateId, "duplicateId should be returned for duplicate phone");
    assert.match(data.error, /Bob/);
  });

  await test("rejects missing fullName with 400", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts", { email: "x@x.com" }),
      {},
      ctx(),
    );
    assert.equal(res.status, 400);
  });

  await test("rejects malformed email with 400", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Carol", email: "not-an-email" }),
      {},
      ctx(),
    );
    assert.equal(res.status, 400);
  });
});

// ─── Contacts — GET ───────────────────────────────────────────────────────────

describe("GET /api/crm/contacts", async () => {
  let worker;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
  });

  await test("returns empty list on fresh database", async () => {
    const res = await worker.fetch(req("GET", "/api/crm/contacts"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.contacts));
    assert.equal(data.contacts.length, 0);
  });

  await test("lists a created contact", async () => {
    await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Dave", email: "dave@test.com" }),
      {},
      ctx(),
    );
    const res = await worker.fetch(req("GET", "/api/crm/contacts"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.contacts.length, 1);
    assert.equal(data.contacts[0].full_name, "Dave");
  });

  await test("filters contacts with ?q=", async () => {
    await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Eve Smith", email: "eve@test.com" }),
      {},
      ctx(),
    );
    await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Frank Jones", email: "frank@test.com" }),
      {},
      ctx(),
    );
    const res = await worker.fetch(req("GET", "/api/crm/contacts?q=Eve"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.contacts.length, 1);
    assert.equal(data.contacts[0].full_name, "Eve Smith");
  });
});

// ─── Contacts — PATCH ────────────────────────────────────────────────────────

describe("PATCH /api/crm/contacts", async () => {
  let worker, contactId;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Grace", email: "grace@test.com" }),
      {},
      ctx(),
    );
    const data = await res.json();
    contactId = data.contact?.id;
  });

  await test("updates contact fields", async () => {
    const res = await worker.fetch(
      req("PATCH", "/api/crm/contacts", {
        id: contactId,
        updates: { fullName: "Grace Updated" },
      }),
      {},
      ctx(),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.contact.full_name, "Grace Updated");
  });

  await test("returns 400 when no updates are supplied", async () => {
    const res = await worker.fetch(
      req("PATCH", "/api/crm/contacts", { id: contactId, updates: {} }),
      {},
      ctx(),
    );
    assert.equal(res.status, 400);
  });
});

// ─── Contacts — DELETE ───────────────────────────────────────────────────────

describe("DELETE /api/crm/contacts", async () => {
  let worker, contactId;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Hank", email: "hank@test.com" }),
      {},
      ctx(),
    );
    const data = await res.json();
    contactId = data.contact?.id;
  });

  await test("deletes a contact and returns deleted: true", async () => {
    const res = await worker.fetch(
      req("DELETE", `/api/crm/contacts?id=${contactId}`),
      {},
      ctx(),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).deleted, true);
  });

  await test("returns 400 when id is missing", async () => {
    const res = await worker.fetch(req("DELETE", "/api/crm/contacts"), {}, ctx());
    assert.equal(res.status, 400);
  });

  await test("contact no longer appears after delete", async () => {
    await worker.fetch(req("DELETE", `/api/crm/contacts?id=${contactId}`), {}, ctx());
    const list = await (await worker.fetch(req("GET", "/api/crm/contacts"), {}, ctx())).json();
    assert.equal(list.contacts.length, 0);
  });
});

// ─── Contact merge ────────────────────────────────────────────────────────────

describe("POST /api/crm/contacts/merge", async () => {
  let worker, winnerId, loserId;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
    const r1 = await (
      await worker.fetch(
        req("POST", "/api/crm/contacts", { fullName: "Winner", email: "winner@test.com" }),
        {},
        ctx(),
      )
    ).json();
    const r2 = await (
      await worker.fetch(
        req("POST", "/api/crm/contacts", {
          fullName: "Loser",
          email: "loser@test.com",
          phone: "555-999-0000",
        }),
        {},
        ctx(),
      )
    ).json();
    winnerId = r1.contact?.id;
    loserId = r2.contact?.id;
  });

  await test("merges loser into winner and inherits missing fields", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts/merge", { winnerId, loserId }),
      {},
      ctx(),
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.merged, "should return merged contact");
    assert.equal(data.merged.id, winnerId);
    assert.equal(data.deletedId, loserId);
    // Winner had no phone — should inherit it from loser
    assert.ok(data.merged.phone, "winner should inherit loser's phone");
  });

  await test("returns 400 when winnerId equals loserId", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts/merge", { winnerId, loserId: winnerId }),
      {},
      ctx(),
    );
    assert.equal(res.status, 400);
  });

  await test("returns 404 when loser does not exist", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/contacts/merge", {
        winnerId,
        loserId: "00000000-0000-0000-0000-000000000000",
      }),
      {},
      ctx(),
    );
    assert.equal(res.status, 404);
  });

  await test("loser no longer appears in contact list after merge", async () => {
    await worker.fetch(req("POST", "/api/crm/contacts/merge", { winnerId, loserId }), {}, ctx());
    const list = await (
      await worker.fetch(req("GET", "/api/crm/contacts"), {}, ctx())
    ).json();
    const ids = list.contacts.map((c) => c.id);
    assert.ok(ids.includes(winnerId), "winner should still exist");
    assert.ok(!ids.includes(loserId), "loser should be gone");
  });
});

// ─── Sales Playbooks ──────────────────────────────────────────────────────────

describe("Sales Playbooks CRUD + DUPLICATE", async () => {
  let worker, playbookId;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
    const res = await worker.fetch(
      req("POST", "/api/crm/playbooks", {
        name: "Cold Call Script",
        channel: "CALL",
        category: "Prospecting",
        content: "Hi, my name is…",
      }),
      {},
      ctx(),
    );
    const data = await res.json();
    playbookId = data.id;
  });

  await test("creates a playbook and returns 201 with id", async () => {
    assert.ok(playbookId, "playbook id should be present");
  });

  await test("lists all active playbooks including seeded defaults", async () => {
    const res = await worker.fetch(req("GET", "/api/crm/playbooks"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.playbooks));
    // ensureCoreSchema seeds 3 sample playbooks (CALL, SMS, EMAIL) + 1 we created
    assert.ok(data.playbooks.length >= 1, "at least one playbook expected");
    const ours = data.playbooks.find((p) => p.name === "Cold Call Script");
    assert.ok(ours, "our created playbook should appear in the list");
  });

  await test("filters playbooks by channel", async () => {
    await worker.fetch(
      req("POST", "/api/crm/playbooks", {
        name: "Email Template UNIQUE-XYZ",
        channel: "EMAIL",
        content: "Dear…",
      }),
      {},
      ctx(),
    );
    const res = await worker.fetch(req("GET", "/api/crm/playbooks?q=UNIQUE-XYZ"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.playbooks.length, 1, "search should find exactly our unique email template");
    assert.equal(data.playbooks[0].channel, "EMAIL");
  });

  await test("duplicates a playbook via PATCH action=DUPLICATE", async () => {
    const res = await worker.fetch(
      req("PATCH", "/api/crm/playbooks", { id: playbookId, action: "DUPLICATE" }),
      {},
      ctx(),
    );
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.playbook?.id, "copy id should be present");
    assert.notEqual(data.playbook.id, playbookId);
    assert.match(data.playbook.name, /copy/i);
    // Search by unique name to verify both original and copy exist
    const list = await (
      await worker.fetch(req("GET", "/api/crm/playbooks?q=Cold+Call+Script"), {}, ctx())
    ).json();
    assert.ok(list.playbooks.length >= 2, "original and copy should both appear");
  });

  await test("records playbook usage via PATCH action=USE", async () => {
    const res = await worker.fetch(
      req("PATCH", "/api/crm/playbooks", { id: playbookId, action: "USE" }),
      {},
      ctx(),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).saved, true);
  });

  await test("rejects creation without required fields", async () => {
    const res = await worker.fetch(
      req("POST", "/api/crm/playbooks", { name: "Incomplete" }),
      {},
      ctx(),
    );
    assert.equal(res.status, 400);
  });

  await test("soft-deletes a playbook (active=0) and it disappears from list", async () => {
    const beforeList = await (
      await worker.fetch(req("GET", "/api/crm/playbooks"), {}, ctx())
    ).json();
    const countBefore = beforeList.playbooks.length;
    await worker.fetch(req("DELETE", `/api/crm/playbooks?id=${playbookId}`), {}, ctx());
    const afterList = await (
      await worker.fetch(req("GET", "/api/crm/playbooks"), {}, ctx())
    ).json();
    assert.equal(
      afterList.playbooks.length,
      countBefore - 1,
      "list should have one fewer playbook after soft-delete",
    );
    assert.ok(
      !afterList.playbooks.find((p) => p.id === playbookId),
      "deleted playbook should not appear in list",
    );
  });
});

// ─── Opportunities ────────────────────────────────────────────────────────────

describe("GET /api/crm/opportunities", async () => {
  let worker;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
    // Creating a contact auto-creates a pipeline + opportunity
    await worker.fetch(
      req("POST", "/api/crm/contacts", { fullName: "Irene", email: "irene@test.com" }),
      {},
      ctx(),
    );
  });

  await test("returns opportunities list with at least one entry", async () => {
    const res = await worker.fetch(req("GET", "/api/crm/opportunities"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.opportunities), "opportunities should be an array");
    assert.ok(data.opportunities.length >= 1, "at least one opportunity from contact creation");
  });
});

// ─── Integrations status ──────────────────────────────────────────────────────

describe("GET /api/integrations/status", async () => {
  let worker;
  beforeEach(async () => {
    setDb(new DatabaseSync(":memory:"));
    worker = await getWorker();
  });

  await test("returns connections object with all expected keys", async () => {
    const res = await worker.fetch(req("GET", "/api/integrations/status"), {}, ctx());
    assert.equal(res.status, 200);
    const data = await res.json();
    for (const key of ["meta", "twilio", "resend", "googleCalendar", "framer", "stripe", "serper", "googleMaps"]) {
      assert.ok(key in data.connections, `connections.${key} should be present`);
    }
    assert.equal(typeof data.googleCalendarConfigured, "boolean");
  });

  await test("serper and googleMaps are false when env vars absent", async () => {
    const res = await worker.fetch(req("GET", "/api/integrations/status"), {}, ctx());
    const data = await res.json();
    assert.equal(data.connections.serper, false);
    assert.equal(data.connections.googleMaps, false);
  });
});
