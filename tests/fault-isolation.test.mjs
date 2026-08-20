import assert from "node:assert/strict";
import test from "node:test";
import { AuthenticationRequiredError, fetchDashboardSnapshot } from "../app/live-data.ts";

const query = { range: "today", page: 1, pageSize: 25 };
const envelope = (endpoint, version) => ({
  meta: { as_of: new Date().toISOString(), timezone: "Asia/Jerusalem", environment: "LIVE", execution_mode: "REAL_TRADING", cutover_at: "2026-08-12T17:19:24Z", source: endpoint, verified: true, api_version: "v1" },
  data: { endpoint, version },
});

const endpointFor = (url) => url.includes("pnl/timeseries") ? "timeseries" : url.includes("overview") ? "overview" : url.includes("trades") ? "trades" : url.includes("infrastructure") ? "infrastructure" : "session";
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("overview failure preserves its last-known-good while trades and infrastructure refresh", async () => {
  let version = 1;
  globalThis.fetch = async (input) => response(envelope(endpointFor(String(input)), version));
  const first = await fetchDashboardSnapshot(query, new AbortController().signal);
  await new Promise(resolve => setTimeout(resolve, 2));

  version = 2;
  globalThis.fetch = async (input) => {
    const endpoint = endpointFor(String(input));
    return endpoint === "overview"
      ? response({ error: { message: "injected overview failure" } }, 500)
      : response(envelope(endpoint, version));
  };
  const second = await fetchDashboardSnapshot(query, new AbortController().signal, first);

  assert.equal(second.overview, first.overview);
  assert.match(second.sections.overview.error, /injected overview failure/);
  assert.equal(second.sections.overview.lastSuccessAt, first.sections.overview.lastSuccessAt);
  assert.equal(second.trades.data.version, 2);
  assert.equal(second.infrastructure.data.version, 2);
  assert.equal(second.sections.trades.error, null);
  assert.ok(second.sections.trades.lastSuccessAt > first.sections.trades.lastSuccessAt);
});

test("authentication failure remains a global blocking error", async () => {
  globalThis.fetch = async (input) => endpointFor(String(input)) === "session"
    ? response({ error: { message: "expired" } }, 401)
    : response(envelope(endpointFor(String(input)), 1));
  await assert.rejects(
    fetchDashboardSnapshot(query, new AbortController().signal),
    AuthenticationRequiredError,
  );
});
