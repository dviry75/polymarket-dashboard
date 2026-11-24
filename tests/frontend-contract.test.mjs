import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const data = readFileSync(new URL("../app/live-data.ts", import.meta.url), "utf8");

const qualities = ["REAL", "UNAVAILABLE", "STALE", "PARTIAL", "ESTIMATED", "ERROR"];

test("production has one v1 data source and no mock fallback", () => {
  assert.match(data, /\/live\/dashboard\/v1\//);
  assert.doesNotMatch(page + data, /mock-data|fetchLiveSnapshot|\/live\/strategy\/status/i);
});

test("all explicit quality and lifecycle states are rendered", () => {
  for (const quality of qualities) assert.match(page + data, new RegExp(quality));
  for (const state of ["loading", "error", "auth", "ready"]) assert.match(page, new RegExp(`"${state}"`));
  assert.match(page, /אין רשומות Polymarket/);
  assert.match(page, /היסטוריית עסקאות/);
  assert.match(page, /quality-\$\{quality\.toLowerCase\(\)\}/);
  assert.match(page, /quality === "STALE"/);
});

test("polling is non-overlapping, abortable and slower when hidden", () => {
  assert.match(page, /if \(stopped \|\| active\) return/);
  assert.match(page, /AbortController/);
  assert.match(page, /document\.hidden \? 60000 : 10000/);
  assert.match(page, /visibilitychange/);
});

test("dashboard data requests are GET-only and commands remain disabled", () => {
  assert.match(data, /method: "GET"/);
  assert.doesNotMatch(data, /method: "PUT"|method: "PATCH"|method: "DELETE"/);
  assert.ok((page.match(/<button disabled/g) || []).length >= 6);
  assert.match(page, /אין Command API/);
});

test("filters, custom dates, pagination, timeout and auth expiry UI exist", () => {
  for (const value of ["today", "yesterday", "3d", "7d", "custom"]) assert.match(page, new RegExp(`value="${value}"`));
  assert.match(page, /type="date"/);
  assert.match(page, /עמוד \{clampedTablePage\}/);
  assert.match(page, /setTimeout\(\(\) => active\?\.abort\(\), 8000\)/);
  assert.match(page, /ה־session אינו בתוקף/);
});

test("deal table: BTC-entry filters and market-outcome column", () => {
  assert.match(page, /<th>תוצאת שוק<\/th>/);
  assert.match(page, /marketOutcomeCell\(row\)/);
  assert.match(page, /row\.market_outcome/);
  assert.match(page, /result === "won" \? "positive" : result === "lost" \? "negative"/);
  assert.match(page, /inRange\(btcEntryMove\(row\), filters\.btcEntryMin, filters\.btcEntryMax\)/);
  assert.match(page, /inRange\(btcEntryForUs\(row\), filters\.btcForUsMin, filters\.btcForUsMax\)/);
  assert.match(page, /label="BTC בכניסה \$"/);
});

test("trading-activity numbers follow the deal-table filters", () => {
  assert.match(page, /const shownSummary = summaryFiltered \? summarizeDeals\(filteredDeals\) : summary/);
  assert.match(page, /money\(shownSummary\.total_cash_flow_usd\)/);
  assert.doesNotMatch(page, /money\(summary\.total_cash_flow_usd\)/);
  assert.match(page, /win_rate_percent: decided \? wins \/ decided \* 100 : null/);
});
