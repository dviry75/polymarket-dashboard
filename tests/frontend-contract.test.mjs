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
  assert.match(page, /אין עסקאות מאומתות/);
  assert.match(page, /פוזיציות פתוחות/);
  assert.match(page, /PARTIAL/);
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
  assert.match(page, /עמוד \{query\.page\}/);
  assert.match(page, /setTimeout\(\(\) => active\?\.abort\(\), 8000\)/);
  assert.match(page, /ה־session אינו בתוקף/);
});
