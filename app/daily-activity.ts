// "פעילות לפי יום": the last N calendar days in Asia/Jerusalem, each with the
// deals whose first action fell on that local day. Pure functions (no React)
// so the day boundaries can be checked on their own.

export const DAILY_TZ = "Asia/Jerusalem";
export const DAILY_DAYS = 7;

export type DayBucket<T> = { key: string; label: string; rows: T[] };

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const labelFormat = new Intl.DateTimeFormat("he-IL", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" });

// "YYYY-MM-DD" of an instant, as a calendar day in Jerusalem.
export const localDayKey = (stamp: number): string => dayFormat.format(new Date(stamp));

// The last `days` local days, newest first. Steps on calendar dates (not on
// 24h), so a DST change never skips or repeats a day.
export const lastDayKeys = (nowMs: number, days = DAILY_DAYS): string[] => {
  const [y, m, d] = localDayKey(nowMs).split("-").map(Number);
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
};

export const dayLabel = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  return labelFormat.format(new Date(Date.UTC(y, m - 1, d)));
};

// Buckets newest first; a deal goes to the local day of its first action.
// Deals outside the days (or without a time) are left out of every bucket.
export const groupDealsByDay = <T extends Record<string, unknown>>(rows: T[], nowMs: number, days = DAILY_DAYS): DayBucket<T>[] => {
  const buckets = lastDayKeys(nowMs, days).map(key => ({ key, label: dayLabel(key), rows: [] as T[] }));
  const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
  for (const row of rows) {
    const stamp = Date.parse(String(row.first_action_at ?? ""));
    if (!Number.isFinite(stamp)) continue;
    byKey.get(localDayKey(stamp))?.rows.push(row);
  }
  return buckets;
};
