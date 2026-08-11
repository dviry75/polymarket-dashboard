export type JsonRecord = Record<string, unknown>;
export type LiveSnapshot = { health: JsonRecord; strategy: JsonRecord | null; markets: JsonRecord[]; logs: JsonRecord[]; receivedAt: number };
export class AuthenticationRequiredError extends Error {}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal });
  if (response.status === 401 || response.status === 403) throw new AuthenticationRequiredError("נדרשת התחברות לממשק ה-LIVE");
  if (!response.ok) throw new Error(`GET ${path} failed (${response.status})`);
  return response.json() as Promise<T>;
}
export async function fetchLiveSnapshot(signal: AbortSignal): Promise<LiveSnapshot> {
  const [health, strategy] = await Promise.all([
    getJson<JsonRecord>("/live/health", signal),
    getJson<JsonRecord>("/live/strategy/status", signal),
  ]);
  return { health, strategy, markets: [], logs: [], receivedAt: Date.now() };
}
export const objectValue = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
export const textValue = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
export const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
};
export const boolValue = (value: unknown): boolean => value === true || value === 1 || String(value).toLowerCase() === "true";
export function parseEventStart(eventId: unknown): number | null {
  const match = textValue(eventId).match(/btc-updown-5m-(\d{10})/);
  return match ? Number(match[1]) * 1000 : null;
}
export function freshnessLabel(iso: unknown, now = Date.now()): string {
  const timestamp = Date.parse(textValue(iso)); if (!Number.isFinite(timestamp)) return "לא זמין";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 2) return "עכשיו"; if (seconds < 60) return `לפני ${seconds} שנ׳`;
  return `לפני ${Math.floor(seconds / 60)} דק׳`;
}
