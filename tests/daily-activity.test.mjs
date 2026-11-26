import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dayLabel, groupDealsByDay, lastDayKeys, localDayKey } from "../app/daily-activity.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("days are Jerusalem calendar days, newest first, no gaps across DST", () => {
  // 21:59Z on 25/11 is still 25/11 in Jerusalem (UTC+2); 22:00Z is 26/11.
  assert.equal(localDayKey(Date.parse("2026-11-25T21:59:59Z")), "2026-11-25");
  assert.equal(localDayKey(Date.parse("2026-11-25T22:00:00Z")), "2026-11-26");
  assert.deepEqual(lastDayKeys(Date.parse("2026-11-26T10:00:00Z")),
    ["2026-11-26", "2026-11-25", "2026-11-24", "2026-11-23", "2026-11-22", "2026-11-21", "2026-11-20"]);
  // Israel leaves DST on 2026-10-25: still 7 distinct consecutive days.
  assert.deepEqual(lastDayKeys(Date.parse("2026-10-27T10:00:00Z")),
    ["2026-10-27", "2026-10-26", "2026-10-25", "2026-10-24", "2026-10-23", "2026-10-22", "2026-10-21"]);
  assert.match(dayLabel("2026-11-26"), /26/);
});

test("deals go to the local day of their first action; others are left out", () => {
  const rows = [
    { seq: 1, first_action_at: "2026-11-26T08:00:00+00:00" },
    { seq: 2, first_action_at: "2026-11-25T22:30:00+00:00" }, // 00:30 on 26/11 local
    { seq: 3, first_action_at: "2026-11-25T21:30:00+00:00" }, // 23:30 on 25/11 local
    { seq: 4, first_action_at: "2026-11-19T12:00:00+00:00" }, // 8 days ago
    { seq: 5, first_action_at: "" },
  ];
  const buckets = groupDealsByDay(rows, Date.parse("2026-11-26T10:00:00Z"));
  assert.equal(buckets.length, 7);
  assert.deepEqual(buckets[0].rows.map(row => row.seq), [1, 2]);
  assert.deepEqual(buckets[1].rows.map(row => row.seq), [3]);
  assert.equal(buckets.flatMap(bucket => bucket.rows).length, 3);
});

test("daily widget sits under the deal table, uses its own 7d data, ignores table filters", () => {
  const table = page.indexOf("<h2>היסטוריית עסקאות</h2>");
  const daily = page.indexOf("<DailyActivity ");
  const health = page.indexOf("<h2>בריאות ותשתית</h2>");
  assert.ok(table > 0 && daily > table && daily < health);
  assert.match(page, /fetchExternalDeals\("7d"/);
  assert.match(page, /groupDealsByDay\(rows, now\)/);
  assert.doesNotMatch(page, /<DailyActivity [^>]*filteredDeals/);
  for (const header of ["תזרים", "עסקאות", "תזרים חיובי", "תזרים שלילי", "טוקן ניצח", "טוקן הפסיד", "אחוז חיובי", "תזרים חיובי ממוצע", "תזרים שלילי ממוצע", "יחס תזרים", "עמלות"]) {
    assert.match(page, new RegExp(`<th>${header}</th>`));
  }
});
