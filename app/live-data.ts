export type JsonRecord = Record<string, unknown>;
export type Quality = "REAL" | "UNAVAILABLE" | "STALE" | "PARTIAL" | "ESTIMATED" | "ERROR";
export type MetricValue = { value: number | string | boolean | null; quality: Quality; unit?: string | null; as_of?: string | null; source?: string; verified?: boolean; stale?: boolean; reason?: string | null };
export type Envelope<T extends JsonRecord = JsonRecord> = { meta: { as_of: string; timezone: string; environment: string; execution_mode: string; cutover_at: string | null; source: string; verified: boolean; api_version: string }; data: T };
export type DashboardSnapshot = {
  overview: Envelope;
  timeseries: Envelope;
  trades: Envelope;
  infrastructure: Envelope;
  session: Envelope;
  receivedAt: number;
};
export type DashboardQuery = { range: "today" | "yesterday" | "3d" | "7d" | "30d" | "custom"; from?: string; to?: string; page: number; pageSize: number };
export const PRODUCTION_DATA_SOURCE = "/live/dashboard/v1/" as const;
export class AuthenticationRequiredError extends Error {}
export class DashboardRequestError extends Error { constructor(message: string, public status: number) { super(message); } }

const params = (query: DashboardQuery, includePage = false) => {
  const value = new URLSearchParams({ range: query.range });
  if (query.range === "custom" && query.from && query.to) { value.set("from_date", query.from); value.set("to_date", query.to); }
  if (includePage) { value.set("page", String(query.page)); value.set("page_size", String(query.pageSize)); }
  return value.toString();
};
async function get<T extends JsonRecord>(path: string, signal: AbortSignal): Promise<Envelope<T>> {
  const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
  if (response.status === 401 || response.status === 403) throw new AuthenticationRequiredError("נדרשת התחברות מחדש");
  let body: unknown = null;
  try { body = await response.json(); } catch { /* stable generic message below */ }
  if (!response.ok) {
    const error = objectValue(objectValue(body).error);
    throw new DashboardRequestError(textValue(error.message) || `בקשת Dashboard נכשלה (${response.status})`, response.status);
  }
  return body as Envelope<T>;
}
export async function fetchDashboardSnapshot(query: DashboardQuery, signal: AbortSignal): Promise<DashboardSnapshot> {
  const root = PRODUCTION_DATA_SOURCE;
  const [overview, timeseries, trades, infrastructure, session] = await Promise.all([
    get(`${root}overview?${params(query)}`, signal),
    get(`${root}pnl/timeseries?${params(query)}`, signal),
    get(`${root}trades?${params(query, true)}`, signal),
    get(`${root}infrastructure`, signal),
    get(`${root}session`, signal),
  ]);
  return { overview, timeseries, trades, infrastructure, session, receivedAt: Date.now() };
}
export async function logout(csrfToken: string): Promise<void> {
  const response = await fetch("/live/logout", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "X-Live-CSRF-Token": csrfToken } });
  if (!response.ok) throw new DashboardRequestError("ההתנתקות נכשלה", response.status);
}
export const objectValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
export const arrayValue = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.map(objectValue) : [];
export const textValue = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
export const numberValue = (value: unknown): number | null => { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
export const boolValue = (value: unknown): boolean => value === true || value === 1 || String(value).toLowerCase() === "true";
export const qualityValue = (value: unknown): Quality => ["REAL", "UNAVAILABLE", "STALE", "PARTIAL", "ESTIMATED", "ERROR"].includes(textValue(value)) ? textValue(value) as Quality : "UNAVAILABLE";
export const metricValue = (value: unknown): MetricValue => { const row = objectValue(value); return { value: row.value as MetricValue["value"] ?? null, quality: qualityValue(row.quality), unit: textValue(row.unit) || null, as_of: textValue(row.as_of) || null, source: textValue(row.source), verified: boolValue(row.verified), stale: boolValue(row.stale), reason: textValue(row.reason) || null }; };
