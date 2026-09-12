/**
 * Node.js ESM loader that stubs `cloudflare:*` modules so the compiled
 * Cloudflare Worker bundle can be imported in plain Node.js.
 *
 * The stub exports a mutable `env` via a global symbol so tests can inject
 * bindings (DB, etc.) before each request.
 *
 * Usage:
 *   node --experimental-loader ./tests/cf-loader.mjs --test tests/api-routes.test.mjs
 */

// Use a unique URL key so the resolve+load hooks pair correctly
const WORKERS_STUB_URL = "data:text/javascript;charset=utf-8,__cf_workers_stub__";
const SOCKETS_STUB_URL = "data:text/javascript;charset=utf-8,__cf_sockets_stub__";

const WORKERS_STUB_SRC = `
// Mutable backing store accessed by tests via globalThis.__cfEnv
if (!globalThis.__cfEnv) globalThis.__cfEnv = {};
export const env = new Proxy({}, {
  get(_t, prop) { return globalThis.__cfEnv[prop]; },
  set(_t, prop, val) { globalThis.__cfEnv[prop] = val; return true; },
  has(_t, prop) { return prop in globalThis.__cfEnv; },
});
export const DurableObject = class {};
export const WorkerEntrypoint = class {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
};
export const RpcStub = class {};
export const RpcTarget = class {};
`;

const SOCKETS_STUB_SRC = `
export function connect() {
  throw new Error("cloudflare:sockets is not available in the test environment");
}
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return { shortCircuit: true, url: WORKERS_STUB_URL, format: "module" };
  }
  if (specifier === "cloudflare:sockets") {
    return { shortCircuit: true, url: SOCKETS_STUB_URL, format: "module" };
  }
  if (specifier.startsWith("cloudflare:")) {
    // Generic stub for any other cloudflare: built-ins
    const stubUrl = `data:text/javascript;charset=utf-8,// stub ${encodeURIComponent(specifier)}`;
    return { shortCircuit: true, url: stubUrl, format: "module" };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === WORKERS_STUB_URL) {
    return { shortCircuit: true, format: "module", source: WORKERS_STUB_SRC };
  }
  if (url === SOCKETS_STUB_URL) {
    return { shortCircuit: true, format: "module", source: SOCKETS_STUB_SRC };
  }
  // Generic cloudflare: stub (empty module)
  if (url.startsWith("data:text/javascript;charset=utf-8,// stub ")) {
    return { shortCircuit: true, format: "module", source: "// empty stub\n" };
  }
  return nextLoad(url, context);
}
