export type JsonRecord = Record<string, unknown>;
export type Quality = "REAL" | "UNAVAILABLE" | "STALE" | "PARTIAL" | "ESTIMATED" | "ERROR";
export type MetricValue = { value: number | string | boolean | null; quality: Quality; unit?: string | null; as_of?: string | null; source?: string; verified?: boolean; stale?: boolean; reason?: string | null };
export type Envelope<T extends JsonRecord = JsonRecord> = { meta: { as_of: string; timezone: string; environment: string; execution_mode: string; cutover_at: string | null; source: string; verified: boolean; api_version: string }; data: T };
export type DashboardEndpoint = "overview" | "trades" | "infrastructure" | "session" | "externalDeals" | "externalSummary";
export type DashboardSection = {
  data: Envelope | null;
  loading: boolean;
  error: string | null;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
};
export type DashboardSections = Record<DashboardEndpoint, DashboardSection>;
export type DashboardSnapshot = {
  overview: Envelope | null;
  trades: Envelope | null;
  infrastructure: Envelope | null;
  session: Envelope | null;
  externalDeals: Envelope | null;
  externalSummary: Envelope | null;
  sections: DashboardSections;
  receivedAt: number;
};
export type DashboardQuery = { range: "today" | "yesterday" | "3d" | "7d" | "30d" | "custom"; from?: string; to?: string; page: number; pageSize: number };
export const PRODUCTION_DATA_SOURCE = "/live/dashboard/v1/" as const;
export class AuthenticationRequiredError extends Error {}
export class DashboardRequestError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

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
const endpointError = (reason: unknown): string => reason instanceof Error ? reason.message : "בקשת Dashboard נכשלה";
const previousSection = (previous: DashboardSnapshot | null, endpoint: DashboardEndpoint): DashboardSection => previous?.sections[endpoint] ?? { data: previous?.[endpoint] ?? null, loading: false, error: null, lastSuccessAt: previous?.receivedAt ?? null, lastAttemptAt: null };

export async function fetchDashboardSnapshot(query: DashboardQuery, signal: AbortSignal, previous: DashboardSnapshot | null = null): Promise<DashboardSnapshot> {
  const root = PRODUCTION_DATA_SOURCE;
  const attemptedAt = Date.now();
  const endpoints: Array<[DashboardEndpoint, Promise<Envelope>]> = [
    ["overview", get(`${root}overview?${params(query)}`, signal)],
    ["trades", get(`${root}trades?${params(query, true)}`, signal)],
    ["infrastructure", get(`${root}infrastructure`, signal)],
    ["session", get(`${root}session`, signal)],
    ["externalDeals", get(`${root}external/deals?${params(query, true)}`, signal)],
    ["externalSummary", get(`${root}external/summary?${params(query)}`, signal)],
  ];
  const results = await Promise.allSettled(endpoints.map(([, request]) => request));
  const authFailure = results.find(result => result.status === "rejected" && result.reason instanceof AuthenticationRequiredError);
  if (authFailure?.status === "rejected") throw authFailure.reason;

  const sections = {} as DashboardSections;
  endpoints.forEach(([endpoint], index) => {
    const result = results[index];
    const prior = previousSection(previous, endpoint);
    sections[endpoint] = result.status === "fulfilled"
      ? { data: result.value, loading: false, error: null, lastSuccessAt: attemptedAt, lastAttemptAt: attemptedAt }
      : { ...prior, loading: false, error: endpointError(result.reason), lastAttemptAt: attemptedAt };
  });
  const successes = Object.values(sections).map(section => section.lastSuccessAt).filter((value): value is number => value !== null);
  return {
    overview: sections.overview.data,
    trades: sections.trades.data,
    infrastructure: sections.infrastructure.data,
    session: sections.session.data,
    externalDeals: sections.externalDeals.data,
    externalSummary: sections.externalSummary.data,
    sections,
    receivedAt: successes.length ? Math.max(...successes) : previous?.receivedAt ?? attemptedAt,
  };
}

export async function fetchExportRecipients(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${PRODUCTION_DATA_SOURCE}external/export/recipients`, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
  if (response.status === 401 || response.status === 403) throw new AuthenticationRequiredError("נדרשת התחברות מחדש");
  if (!response.ok) throw new DashboardRequestError("שליפת נמענים נכשלה", response.status);
  const body = await response.json().catch(() => null);
  const list = objectValue(objectValue(body).data).recipients;
  return Array.isArray(list) ? list.map(value => String(value)) : [];
}

export async function requestTradeExport(recipient: string, csrfToken: string): Promise<void> {
  const response = await fetch(`${PRODUCTION_DATA_SOURCE}external/export`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-Live-CSRF-Token": csrfToken },
    body: JSON.stringify({ recipient }),
  });
  if (response.status === 401 || response.status === 403) throw new AuthenticationRequiredError("נדרשת התחברות מחדש");
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DashboardRequestError(textValue(objectValue(objectValue(body).error).message) || `בקשת הייצוא נכשלה (${response.status})`, response.status);
  }
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
