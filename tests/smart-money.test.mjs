/**
 * Smart Money integration tests — drives the built worker with an in-memory
 * D1 and a stubbed global fetch that serves SEC EDGAR, OpenFIGI and quote
 * fixtures, so the full sync → score → screen → live pipeline is exercised.
 *
 * Run (after `npm run build`):
 *   node --experimental-loader tests/cf-loader.mjs --test tests/smart-money.test.mjs
 */

import assert from "node:assert/strict";
import test, { describe, before } from "node:test";
import { DatabaseSync } from "node:sqlite";

function makeD1(sqliteDb) {
  function lazyStmt(sql, boundValues = []) {
    const getStmt = () => sqliteDb.prepare(sql);
    return {
      bind: (...values) => lazyStmt(sql, values),
      async first() {
        const rows = getStmt().all(...boundValues);
        return rows[0] ? Object.assign({}, rows[0]) : null;
      },
      async all() {
        return { results: getStmt().all(...boundValues).map((r) => Object.assign({}, r)) };
      },
      async run() {
        getStmt().run(...boundValues);
        return { meta: {} };
      },
    };
  }
  return {
    prepare: (sql) => lazyStmt(sql),
    async batch(statements) {
      for (const s of statements) await s.run();
    },
  };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BUFFETT = "0001067983";
const ACKMAN = "0001336528";
const BURRY = "0001649339";

const CUSIP = { AAPL: "037833100", KO: "191216100", GOOGL: "02079K305", OXY: "674599105" };

function infoTable(rows) {
  const body = rows
    .map(
      (r) => `<ns1:infoTable>
      <ns1:nameOfIssuer>${r.name}</ns1:nameOfIssuer>
      <ns1:titleOfClass>COM</ns1:titleOfClass>
      <ns1:cusip>${r.cusip}</ns1:cusip>
      <ns1:value>${r.value}</ns1:value>
      <ns1:shrsOrPrnAmt><ns1:sshPrnamt>${r.shares}</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
      ${r.putCall ? `<ns1:putCall>${r.putCall}</ns1:putCall>` : ""}
      <ns1:investmentDiscretion>SOLE</ns1:investmentDiscretion>
    </ns1:infoTable>`,
    )
    .join("\n");
  return `<?xml version="1.0"?><ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">${body}</ns1:informationTable>`;
}

const filings = {
  [BUFFETT]: {
    name: "BERKSHIRE HATHAWAY INC",
    list: [
      {
        acc: "0000950123-26-000200",
        period: "2026-06-30",
        filed: "2026-08-14",
        rows: [
          { name: "APPLE INC", cusip: CUSIP.AAPL, value: 10_000_000, shares: 50_000 },
          // Two managers reporting the same CUSIP must be summed.
          { name: "COCA COLA CO", cusip: CUSIP.KO, value: 5_000_000, shares: 100_000 },
          { name: "COCA COLA CO", cusip: CUSIP.KO, value: 4_000_000, shares: 66_000 },
          // Options are not ownership and must be ignored.
          { name: "COCA COLA CO", cusip: CUSIP.KO, value: 99_000_000, shares: 1_000_000, putCall: "Put" },
        ],
      },
      {
        acc: "0000950123-26-000100",
        period: "2026-03-31",
        filed: "2026-05-15",
        rows: [
          { name: "APPLE INC", cusip: CUSIP.AAPL, value: 12_000_000, shares: 60_000 },
          { name: "COCA COLA CO", cusip: CUSIP.KO, value: 10_000_000, shares: 166_000 },
          { name: "OCCIDENTAL PETE CORP", cusip: CUSIP.OXY, value: 3_000_000, shares: 50_000 },
        ],
      },
    ],
  },
  [ACKMAN]: {
    name: "Pershing Square Capital Management, L.P.",
    list: [
      {
        acc: "0001172661-26-000200",
        period: "2026-06-30",
        filed: "2026-08-13",
        rows: [
          { name: "APPLE INC", cusip: CUSIP.AAPL, value: 2_000_000, shares: 10_000 },
          { name: "ALPHABET INC", cusip: CUSIP.GOOGL, value: 8_000_000, shares: 40_000 },
        ],
      },
      {
        acc: "0001172661-26-000100",
        period: "2026-03-31",
        filed: "2026-05-14",
        rows: [{ name: "ALPHABET INC", cusip: CUSIP.GOOGL, value: 6_000_000, shares: 40_000 }],
      },
    ],
  },
  [BURRY]: {
    name: "Scion Asset Management, LLC",
    list: [
      {
        acc: "0001649339-26-000050",
        period: "2026-06-30",
        filed: "2026-08-12",
        rows: [{ name: "APPLE INC", cusip: CUSIP.AAPL, value: 1_000_000, shares: 5_000 }],
      },
    ],
  },
};

function submissionsJson(cik) {
  const f = filings[cik];
  return {
    name: f.name,
    filings: {
      recent: {
        // A 10-K style noise row first proves form filtering.
        accessionNumber: ["0000000000-26-999999", ...f.list.map((x) => x.acc)],
        form: ["SC 13G", ...f.list.map(() => "13F-HR")],
        filingDate: ["2026-09-01", ...f.list.map((x) => x.filed)],
        reportDate: ["", ...f.list.map((x) => x.period)],
      },
    },
  };
}

const FORM4_FOLDER = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000077";
const form4Atom = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>4 - Apple Inc. (0000320193) (Issuer)</title>
<link rel="alternate" type="text/html" href="${FORM4_FOLDER}/0000320193-26-000077-index.htm"/>
<updated>${new Date().toISOString()}</updated>
<id>urn:tag:sec.gov,2008:accession-number=0000320193-26-000077</id>
</entry>
<entry>
<title>4 - Cook Timothy D (0001214156) (Reporting)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1214156/000032019326000077/0000320193-26-000077-index.htm"/>
<updated>${new Date().toISOString()}</updated>
<id>urn:tag:sec.gov,2008:accession-number=0000320193-26-000077</id>
</entry>
</feed>`;

const form4Xml = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>0000320193</issuerCik><issuerName>Apple Inc.</issuerName><issuerTradingSymbol>AAPL</issuerTradingSymbol></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>0001214156</rptOwnerCik><rptOwnerName>Cook Timothy D</rptOwnerName></reportingOwnerId>
    <reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-01</value></transactionDate>
      <transactionCoding><transactionFormType>4</transactionFormType><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>10000</value></transactionShares>
        <transactionPricePerShare><value>180.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-10-01</value></transactionDate>
      <transactionCoding><transactionCode>S</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>5000</value></transactionShares>
        <transactionPricePerShare><value>181.00</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const figi = { [CUSIP.AAPL]: "AAPL", [CUSIP.KO]: "KO", [CUSIP.GOOGL]: "GOOGL" };

const calls = [];
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function fakeFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  calls.push(url);
  const u = new URL(url);
  if (u.hostname === "data.sec.gov") {
    const cik = (u.pathname.match(/CIK(\d{10})\.json/) || [])[1];
    return filings[cik] ? json(submissionsJson(cik)) : new Response("not found", { status: 404 });
  }
  if (u.hostname === "www.sec.gov" && u.pathname === "/files/company_tickers.json") {
    return json({
      0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      1: { cik_str: 797468, ticker: "OXY", title: "OCCIDENTAL PETROLEUM CORP /DE/" },
    });
  }
  if (u.hostname === "www.sec.gov" && u.pathname === "/cgi-bin/browse-edgar") {
    const type = u.searchParams.get("type");
    if (type === "4") return new Response(form4Atom, { headers: { "content-type": "application/atom+xml" } });
    return new Response(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>`);
  }
  if (u.hostname === "www.sec.gov" && u.pathname.startsWith("/Archives/edgar/data/")) {
    const folderUrl = url.replace(/\/[^/]*$/, "");
    if (u.pathname.endsWith("/index.json")) {
      if (folderUrl.endsWith("000032019326000077")) return json({ directory: { item: [{ name: "xslF345X05", type: "dir" }, { name: "form4.xml", size: 3000 }] } });
      return json({ directory: { item: [{ name: "primary_doc.xml", size: 2000 }, { name: "infotable.xml", size: 9000 }, { name: "0000950123-26-000200.txt" }] } });
    }
    if (u.pathname.endsWith("/form4.xml")) return new Response(form4Xml);
    if (u.pathname.endsWith("/infotable.xml")) {
      const accNoDashes = u.pathname.split("/").slice(-2)[0];
      for (const f of Object.values(filings)) {
        const hit = f.list.find((x) => x.acc.replace(/-/g, "") === accNoDashes);
        if (hit) return new Response(infoTable(hit.rows));
      }
    }
    return new Response("missing", { status: 404 });
  }
  if (u.hostname === "api.openfigi.com") {
    const jobs = JSON.parse(init.body);
    return json(jobs.map((job) => (figi[job.idValue] ? { data: [{ ticker: figi[job.idValue], name: "X", exchCode: "US", marketSector: "Equity" }] } : { warning: "No identifier found." })));
  }
  if (u.hostname === "stooq.com") {
    return new Response("Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-10-05,22:00:00,182,185,179,180,100000\nKO.US,2026-10-05,22:00:00,60,61,59,61,100\n");
  }
  if (u.hostname === "localhost") throw new Error(`unexpected loopback fetch ${url}`);
  return new Response("blocked in tests", { status: 599 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
function req(method, path, body) {
  const init = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`http://localhost${path}`, init);
}

describe("Smart Money radar", async () => {
  let worker;
  const realFetch = globalThis.fetch;
  const call = async (method, path, body) => {
    globalThis.fetch = fakeFetch;
    try {
      return await worker.fetch(req(method, path, body), {}, ctx());
    } finally {
      globalThis.fetch = realFetch;
    }
  };

  before(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    globalThis.__cfEnv = { DB: makeD1(new DatabaseSync(":memory:")) };
    const url = new URL("../dist/server/index.js", import.meta.url);
    url.searchParams.set("t", "smart-money");
    worker = (await import(url.href)).default;
  });

  await test("seeds the billionaire roster before any sync", async () => {
    const res = await call("GET", "/api/smart-money");
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.investors.length >= 20, "curated investors are seeded");
    assert.ok(data.investors.some((i) => i.cik === BUFFETT && i.name === "Warren Buffett"));
    assert.equal(data.companies.length, 0);
    assert.equal(data.stats.investorsSynced, 0);
  });

  await test("syncs 13F filings from EDGAR", async () => {
    for (const cik of [BUFFETT, ACKMAN, BURRY]) {
      const res = await call("POST", "/api/smart-money/sync", { cik });
      assert.equal(res.status, 200, `sync ${cik}`);
      const body = await res.json();
      assert.equal(body.changed, true);
      assert.equal(body.period, "2026-06-30");
    }
    const again = await (await call("POST", "/api/smart-money/sync", { cik: BUFFETT })).json();
    assert.equal(again.changed, false, "unchanged accession is a no-op");
  });

  await test("rejects bad sync input and records upstream errors", async () => {
    assert.equal((await call("POST", "/api/smart-money/sync", { cik: "abc" })).status, 400);
    const missing = await call("POST", "/api/smart-money/sync", { cik: "0001350694" });
    assert.equal(missing.status, 404);
    const data = await (await call("GET", "/api/smart-money")).json();
    assert.match(data.investors.find((i) => i.cik === "0001350694").last_error, /SEC request failed \(404\)/);
  });

  await test("aggregates consensus, changes and ticker mapping precisely", async () => {
    const data = await (await call("GET", "/api/smart-money")).json();
    assert.equal(data.stats.investorsSynced, 3);
    const aapl = data.companies.find((c) => c.ticker === "AAPL");
    assert.ok(aapl, "AAPL mapped via OpenFIGI");
    assert.equal(aapl.holderCount, 3);
    assert.equal(aapl.totalValue, 13_000_000);
    const byInvestor = Object.fromEntries(aapl.holders.map((h) => [h.investor, h]));
    assert.equal(byInvestor["Warren Buffett"].change, "TRIMMED");
    assert.ok(Math.abs(byInvestor["Warren Buffett"].deltaPct - -1 / 6) < 1e-9);
    assert.equal(byInvestor["Bill Ackman"].change, "NEW");
    assert.equal(byInvestor["Michael Burry"].change, "HELD", "no prior filing means not flagged NEW");
    assert.equal(aapl.smartPrice, 200);
    assert.equal(data.companies[0].ticker, "AAPL", "3-holder consensus ranks first");

    const ko = data.companies.find((c) => c.ticker === "KO");
    assert.equal(ko.totalValue, 9_000_000, "multi-manager rows summed, put option ignored");
    assert.equal(ko.holders[0].change, "HELD");

    assert.ok(!data.companies.some((c) => c.ticker === "OXY"), "fully exited names drop out of the default screen");
    const exiting = await (await call("GET", "/api/smart-money?activity=exiting")).json();
    const oxy = exiting.companies.find((c) => c.cusip === CUSIP.OXY);
    assert.equal(oxy.ticker, "OXY", "name-matched fallback when OpenFIGI misses");
    assert.equal(oxy.exitCount, 1);
  });

  await test("custom screens filter by investors, holders and activity", async () => {
    const all = await (await call("GET", `/api/smart-money?investors=${BUFFETT},${ACKMAN}&match=all`)).json();
    assert.deepEqual(all.companies.map((c) => c.ticker), ["AAPL"]);
    const fresh = await (await call("GET", "/api/smart-money?activity=new")).json();
    assert.deepEqual(fresh.companies.map((c) => c.ticker), ["AAPL"]);
    const consensus = await (await call("GET", "/api/smart-money?minHolders=3")).json();
    assert.equal(consensus.total, 1);
    const conviction = await (await call("GET", "/api/smart-money?minWeight=90")).json();
    assert.deepEqual(conviction.companies.map((c) => c.ticker), ["AAPL"], "Burry's 100% AAPL position");
  });

  await test("live pulse captures insider buys and quotes", async () => {
    const res = await call("GET", "/api/smart-money/live?since=0");
    assert.equal(res.status, 200);
    const live = await res.json();
    assert.equal(live.refresh.ran, true);
    assert.deepEqual(live.refresh.errors, []);
    assert.equal(live.insiders.length, 1, "only the P purchase is kept, de-duplicated across feed rows");
    assert.equal(live.insiders[0].value_usd, 1_800_000);
    assert.match(live.insiders[0].role, /Chief Executive Officer/);
    assert.ok(live.events.some((e) => e.kind === "INSIDER" && e.ticker === "AAPL"));

    const throttled = await (await call("GET", "/api/smart-money/live")).json();
    assert.equal(throttled.refresh.ran, false, "upstream refresh is throttled");

    const data = await (await call("GET", "/api/smart-money")).json();
    const aapl = data.companies.find((c) => c.ticker === "AAPL");
    assert.equal(aapl.insiderBuys30d, 1);
    assert.equal(aapl.price, 180);
    assert.ok(Math.abs(aapl.vsSmartPct - -0.1) < 1e-9);
    assert.ok(aapl.badges.includes("DISCOUNT") && aapl.badges.includes("INSIDER BUY") && aapl.badges.includes("NEW BUY"));
    assert.ok(aapl.score > 50 && aapl.score <= 100);
  });

  await test("company and investor detail endpoints", async () => {
    const company = await (await call("GET", "/api/smart-money/company?ticker=AAPL")).json();
    assert.equal(company.company.holderCount, 3);
    assert.equal(company.insiders.length, 1);
    assert.equal((await call("GET", "/api/smart-money/company?ticker=ZZZZ")).status, 404);

    const portfolio = await (await call("GET", `/api/smart-money/investors?cik=${BUFFETT}`)).json();
    assert.equal(portfolio.investor.name, "Warren Buffett");
    assert.deepEqual(portfolio.positions.map((p) => p.change), ["TRIMMED", "HELD", "EXITED"]);
  });

  await test("AI analyst answers from live data in local mode", async () => {
    const res = await call("POST", "/api/smart-money/ask", { messages: [{ role: "user", content: "Which stocks do at least 3 billionaires own?" }] });
    assert.equal(res.status, 200);
    const reply = await res.json();
    assert.equal(reply.engine, "local");
    assert.ok(reply.tickers.includes("AAPL"));
    assert.equal(reply.filters.minHolders, 3);
    const empty = await call("POST", "/api/smart-money/ask", { messages: [] });
    assert.equal(empty.status, 400);
  });

  await test("saved screens and custom investor management", async () => {
    const saved = await call("POST", "/api/smart-money/screens", { name: "Consensus", filters: { minHolders: 3, sort: "holders", bogus: "x" } });
    assert.equal(saved.status, 201);
    const list = await (await call("GET", "/api/smart-money/screens")).json();
    assert.equal(list.screens[0].filters.minHolders, 3);
    assert.equal(list.screens[0].filters.bogus, undefined);
    await call("DELETE", `/api/smart-money/screens?id=${list.screens[0].id}`);
    assert.equal((await (await call("GET", "/api/smart-money/screens")).json()).screens.length, 0);

    assert.equal((await call("POST", "/api/smart-money/investors", { cik: "" })).status, 400);
    assert.equal((await call("POST", "/api/smart-money/investors", { cik: BUFFETT })).status, 409);
    assert.equal((await call("DELETE", `/api/smart-money/investors?cik=${BUFFETT}`)).status, 400, "curated investors stay");
    const added = await call("POST", "/api/smart-money/investors", { cik: "123456", name: "Test Office" });
    assert.equal(added.status, 201);
    assert.ok((await added.json()).syncError, "unknown filer reports its sync failure");
    assert.equal((await call("DELETE", "/api/smart-money/investors?cik=123456")).status, 200);
  });
});
